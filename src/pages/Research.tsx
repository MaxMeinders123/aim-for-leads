import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Check, AlertCircle, ChevronDown, ChevronUp, ExternalLink, RotateCcw, Upload, Building2, Users, Cloud, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore, type Campaign, type Company, type CompanyResearchResult, type PeopleResearchResult, type CompanyResearchProgress, type ResearchContact, type Contact, type UserIntegrations } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { WEBHOOKS, COMPANY_STATUSES } from '@/lib/constants';
import { callResearchProxy, buildCompanyResearchPayload, buildProspectResearchPayload, parseAIResponse, fetchUserIntegrations, getResolvedWebhookUrl } from '@/services/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { RealtimeChannel } from '@supabase/supabase-js';

export default function Research() {
  const navigate = useNavigate();
  const { campaignId } = useParams<{ campaignId: string }>();
  const {
    researchProgress,
    setResearchProgress,
    updateCompanyProgress,
    companies,
    selectedCampaign,
    user,
    campaigns,
    setSelectedCampaign,
  } = useAppStore();

  const { isRunning, totalCompanies, companiesProgress } = researchProgress;
  const isProcessingRef = useRef(false);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [userWebhooks, setUserWebhooks] = useState<Partial<UserIntegrations>>({});

  // Load user webhook configuration
  useEffect(() => {
    const loadWebhooks = async () => {
      if (!user?.id) return;
      try {
        const integrations = await fetchUserIntegrations(user.id);
        setUserWebhooks(integrations);
      } catch {
        // Use defaults on error
      }
    };
    loadWebhooks();
  }, [user?.id]);
  // Set selected campaign from URL
  useEffect(() => {
    if (campaignId && campaigns.length > 0 && !selectedCampaign) {
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (campaign) setSelectedCampaign(campaign);
    }
  }, [campaignId, campaigns, selectedCampaign, setSelectedCampaign]);

  const completedCount = companiesProgress.filter((c) => c.step === 'complete').length;
  const progressPercentage = totalCompanies > 0 ? Math.round((completedCount / totalCompanies) * 100) : 0;

  const toggleExpanded = (companyId: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  // Retry a step for a company
  const retryStep = useCallback(
    async (companyId: string, stepToRetry: 'company' | 'people') => {
      const company = companies.find((c) => c.id === companyId);
      if (!company || !user) return;

      setExpandedCompanies((prev) => new Set(prev).add(companyId));

      if (stepToRetry === 'company') {
        updateCompanyProgress(companyId, { step: 'company', error: undefined });
        try {
          const payload = buildCompanyResearchPayload(selectedCampaign, company, user.id);
          const webhookUrl = getResolvedWebhookUrl('company_research', userWebhooks);
          const data = await callResearchProxy(webhookUrl, payload);
          const parsed = data ? (parseAIResponse(data) as CompanyResearchResult) : null;
          updateCompanyProgress(companyId, { step: 'people', companyData: parsed || undefined });
          toast.success(`Company research complete for ${company.name}`);
        } catch (err: unknown) {
          updateCompanyProgress(companyId, { step: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
          toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      if (stepToRetry === 'people') {
        const existing = companiesProgress.find((p) => p.companyId === companyId);
        if (!existing?.company_research_id) {
          toast.error('Missing company research ID. Retry company research first.');
          return;
        }
        updateCompanyProgress(companyId, { step: 'people', error: undefined });
        try {
          const payload = buildProspectResearchPayload(
            selectedCampaign,
            company,
            existing.companyData,
            user.id,
            existing.company_research_id,
          );
          const webhookUrl = getResolvedWebhookUrl('people_research', userWebhooks);
          const data = await callResearchProxy(webhookUrl, payload);

          // n8n uses backgroundMode on the AI node, so the webhook may respond
          // before contacts are ready. Check if the response has actual contacts.
          const parsed = data ? (parseAIResponse(data) as PeopleResearchResult) : null;
          const hasContacts = parsed?.contacts && Array.isArray(parsed.contacts) && parsed.contacts.length > 0;

          if (hasContacts) {
            updateCompanyProgress(companyId, { step: 'complete', peopleData: parsed || undefined });
            toast.success(`Prospect research complete for ${company.name}`);
          } else {
            // No contacts in response - n8n is processing in the background.
            // Results will arrive via realtime subscription on prospect_research table.
            updateCompanyProgress(companyId, { step: 'awaiting_callback' });
            toast.info(`Prospect research started for ${company.name}. Results will appear automatically.`);
          }
        } catch (err: unknown) {
          updateCompanyProgress(companyId, { step: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
          toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    },
    [companies, selectedCampaign, user, companiesProgress, updateCompanyProgress, userWebhooks],
  );

  // Handle "Research MegaCorp Instead" for acquired-inactive companies
  const handleResearchAcquirer = useCallback(
    (companyId: string, acquirerName: string) => {
      updateCompanyProgress(companyId, {
        step: 'company',
        companyData: undefined,
        peopleData: undefined,
        error: undefined,
      });
      // Override company name display
      const progress = companiesProgress.find((p) => p.companyId === companyId);
      if (progress) {
        updateCompanyProgress(companyId, {
          companyName: acquirerName,
        } as Partial<CompanyResearchProgress>);
      }
      toast.info(`Switching research to ${acquirerName}`);
      retryStep(companyId, 'company');
    },
    [companiesProgress, updateCompanyProgress, retryStep],
  );

  // Sequential company processing
  const processCompanies = useCallback(async () => {
    if (isProcessingRef.current || !isRunning) return;
    isProcessingRef.current = true;

    const selectedCompanies = companies.filter((c) => c.selected);

    for (let i = 0; i < selectedCompanies.length; i++) {
      const company = selectedCompanies[i];
      const payload = buildCompanyResearchPayload(selectedCampaign, company, user?.id || '');

      setResearchProgress({ currentCompanyIndex: i, currentCompany: company.name, currentStep: 'company' });
      updateCompanyProgress(company.id, { step: 'company' });

      try {
        const webhookUrl = getResolvedWebhookUrl('company_research', userWebhooks);
        const response = await callResearchProxy(webhookUrl, payload);

        if (response?.status === 'processing') {
          // n8n is processing async (backgroundMode)
          updateCompanyProgress(company.id, { step: 'awaiting_callback' });
          setExpandedCompanies((prev) => new Set(prev).add(company.id));
          toast.info(`Research started for ${company.name}. Results will appear via realtime updates.`);
          continue;
        }

        // n8n processed synchronously: the response is the edge function callback result
        // (not the actual company data). The edge function auto-triggers prospect research.
        // Actual company data arrives via realtime subscription from company_research table.
        if (response?.received === true && response?.company_research_id) {
          updateCompanyProgress(company.id, {
            step: 'awaiting_callback',
            company_research_id: response.company_research_id,
          });
          setExpandedCompanies((prev) => new Set(prev).add(company.id));
          continue;
        }

        // Direct AI response (rare - only if n8n returns raw data)
        const parsed = response ? (parseAIResponse(response) as CompanyResearchResult) : null;

        if (parsed?.status === 'error' && !parsed?.company_status) {
          updateCompanyProgress(company.id, { step: 'error', error: 'Research failed' });
          toast.error(`Research failed for ${company.name}`);
          continue;
        }

        // Show status toasts
        if (parsed?.company_status === COMPANY_STATUSES.ACQUIRED && parsed.acquiredBy) {
          toast.info(`${company.name} was acquired by ${parsed.acquiredBy}`);
        } else if (parsed?.company_status === COMPANY_STATUSES.BANKRUPT) {
          toast.warning(`${company.name} is no longer operating (Bankrupt)`);
        } else if (parsed?.company_status === COMPANY_STATUSES.NOT_FOUND) {
          toast.warning(`${company.name} could not be verified`);
        }

        updateCompanyProgress(company.id, { step: 'people', companyData: parsed || undefined });
        setExpandedCompanies((prev) => new Set(prev).add(company.id));
      } catch (err: unknown) {
        updateCompanyProgress(company.id, { step: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
        continue;
      }
    }

    setResearchProgress({ isRunning: false });
    isProcessingRef.current = false;
    toast.success('Research complete!');
  }, [isRunning, companies, selectedCampaign, user, setResearchProgress, updateCompanyProgress, userWebhooks]);

  useEffect(() => {
    if (isRunning && !isProcessingRef.current) processCompanies();
  }, [isRunning, processCompanies]);

  // Realtime: company_research inserts
  useEffect(() => {
    if (!user?.id) return;

    const companyChannel: RealtimeChannel = supabase
      .channel('company-research-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'company_research', filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const rec = payload.new as { id: string; company_domain: string; raw_data: unknown; status: string; company_status: string | null };
          const match = companies.find((c) => {
            const domain = c.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || c.name.toLowerCase().replace(/\s+/g, '');
            return domain === rec.company_domain;
          });
          if (match && rec.status === 'completed') {
            const companyData = rec.raw_data as CompanyResearchResult | null;
            updateCompanyProgress(match.id, {
              step: 'people',
              companyData: companyData || undefined,
              company_research_id: rec.id,
            });
            toast.success(`Company research complete for ${match.name}`);

            // Frontend fallback: auto-trigger prospect research.
            // The server-side auto-trigger in receive-company-results can be unreliable
            // (edge function timeouts, network issues), so also trigger from the frontend.
            const cs = rec.company_status || companyData?.company_status;
            const stillOperates = companyData && 'stillOperatesIndependently' in companyData 
              ? companyData.stillOperatesIndependently === true 
              : false;
            const shouldTrigger =
              cs === COMPANY_STATUSES.OPERATING ||
              (cs === COMPANY_STATUSES.ACQUIRED && stillOperates) ||
              cs === COMPANY_STATUSES.RENAMED;

            if (shouldTrigger) {
              try {
                const prospectPayload = buildProspectResearchPayload(
                  selectedCampaign,
                  match,
                  companyData,
                  user.id,
                  rec.id,
                );
                const webhookUrl = getResolvedWebhookUrl('people_research', userWebhooks);
                callResearchProxy(webhookUrl, prospectPayload).catch(() => {});
              } catch {
                // Server-side trigger may still succeed; don't show error
              }
            }
          }
        },
      )
      .subscribe();

    const prospectChannel: RealtimeChannel = supabase
      .channel('prospect-research-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'prospect_research', filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const rec = payload.new as { company_research_id: string };
          const { data: cr } = await supabase
            .from('company_research')
            .select('company_domain')
            .eq('id', rec.company_research_id)
            .single();
          if (!cr) return;

          const match = companies.find((c) => {
            const domain = c.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || c.name.toLowerCase().replace(/\s+/g, '');
            return domain === cr.company_domain;
          });
          if (!match) return;

          const { data: prospects } = await supabase
            .from('prospect_research')
            .select('*')
            .eq('company_research_id', rec.company_research_id)
            .order('created_at', { ascending: false });

          if (prospects && prospects.length > 0) {
            const contacts: ResearchContact[] = prospects.map((p) => ({
              first_name: p.first_name || '',
              last_name: p.last_name || '',
              job_title: p.job_title || '',
              title: p.job_title || '',
              pitch_type: p.pitch_type || '',
              linkedin: p.linkedin_url || '',
              priority: (p.priority || 'Medium') as 'High' | 'Medium' | 'Low',
              priority_reason: p.priority_reason || '',
            }));
            updateCompanyProgress(match.id, {
              step: 'complete',
              peopleData: { status: 'completed', company: match.name, contacts },
            });
            toast.success(`Prospect research complete for ${match.name}`);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(companyChannel);
      supabase.removeChannel(prospectChannel);
    };
  }, [user?.id, companies, updateCompanyProgress, selectedCampaign, userWebhooks]);

  // Load existing prospects on mount
  useEffect(() => {
    const loadExisting = async () => {
      if (!user?.id || companiesProgress.length === 0) return;
      for (const progress of companiesProgress) {
        if (progress.peopleData?.contacts?.length) continue;
        if (!progress.company_research_id) continue;
        try {
          const { data: prospects } = await supabase
            .from('prospect_research')
            .select('*')
            .eq('company_research_id', progress.company_research_id)
            .order('created_at', { ascending: false });
          if (prospects?.length) {
            const contacts: ResearchContact[] = prospects.map((p) => ({
              first_name: p.first_name || '',
              last_name: p.last_name || '',
              job_title: p.job_title || '',
              title: p.job_title || '',
              pitch_type: p.pitch_type || '',
              linkedin: p.linkedin_url || '',
              priority: (p.priority || 'Medium') as 'High' | 'Medium' | 'Low',
              priority_reason: p.priority_reason || '',
            }));
            updateCompanyProgress(progress.companyId, {
              step: progress.step === 'people' ? 'complete' : progress.step,
              peopleData: { status: 'completed', company: progress.companyName, contacts },
            });
          }
        } catch { /* ignore */ }
      }
    };
    loadExisting();
  }, [user?.id, updateCompanyProgress, companiesProgress]);

  // Persist to localStorage
  useEffect(() => {
    if (campaignId) {
      localStorage.setItem(`research_progress_${campaignId}`, JSON.stringify(researchProgress));
    }
  }, [researchProgress, campaignId]);

  const getStatusColor = (step: string) => {
    if (step === 'error') return 'border-destructive bg-destructive/5';
    if (step === 'complete') return 'border-green-500 bg-green-50 dark:bg-green-950/20';
    return 'border-primary bg-primary/5';
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getCompanyStatusBadge = (data: CompanyResearchResult | undefined) => {
    if (!data?.company_status) return null;
    const colors: Record<string, string> = {
      Operating: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      Acquired: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      Renamed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      Bankrupt: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      Not_Found: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
    };
    return <Badge className={cn('text-xs', colors[data.company_status])}>{data.company_status.replace('_', ' ')}</Badge>;
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title={isRunning ? 'Researching...' : 'Research Complete'}
          subtitle={`${completedCount} of ${totalCompanies} companies${selectedCampaign ? ` - ${selectedCampaign.name}` : ''}`}
          backTo={campaignId ? `/companies/${campaignId}` : '/campaigns'}
          actions={
            <div className="flex items-center gap-2">
              {isRunning && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setResearchProgress({ isRunning: false });
                    isProcessingRef.current = false;
                  }}
                >
                  Stop Research
                </Button>
              )}
              <Button variant={isRunning ? 'outline' : 'default'} onClick={() => navigate(`/contacts/${campaignId}`)}>
                <Users className="w-4 h-4 mr-2" />
                View Contacts
              </Button>
            </div>
          }
        />

        <div className="flex-1 overflow-auto p-6">
          {/* Progress Bar */}
          <div className="mb-8 max-w-3xl">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Progress</span>
              <span>{progressPercentage}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {/* Company Cards */}
          <div className="space-y-3 max-w-3xl">
            {companiesProgress.map((cp) => {
              const isExpanded = expandedCompanies.has(cp.companyId);
              const isLoading = cp.step === 'company' || cp.step === 'people' || cp.step === 'awaiting_callback';
              const isBankrupt = cp.companyData?.company_status === COMPANY_STATUSES.BANKRUPT;
              const isAcquiredInactive =
                cp.companyData?.company_status === COMPANY_STATUSES.ACQUIRED && cp.companyData?.acquiredBy;

              return (
                <div key={cp.companyId} className={cn('rounded-xl border-2 transition-all shadow-sm', getStatusColor(cp.step))}>
                  {/* Header */}
                  <button
                    onClick={() => toggleExpanded(cp.companyId)}
                    className="w-full p-5 flex items-center justify-between text-left hover:bg-muted/30 transition-colors rounded-xl"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {cp.step === 'error' ? (
                        <div className="shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                          <AlertCircle className="w-5 h-5 text-destructive" />
                        </div>
                      ) : cp.step === 'complete' ? (
                        <div className="shrink-0 w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                          <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                      ) : (
                        <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-lg truncate">{cp.companyName}</span>
                          {getCompanyStatusBadge(cp.companyData)}
                        </div>
                        {isLoading && (
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse" />
                            {cp.step === 'company' ? 'Checking company status...' : 'Finding prospects...'}
                          </p>
                        )}
                        {cp.step === 'complete' && !isExpanded && cp.peopleData?.contacts && (
                          <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                            {cp.peopleData.contacts.length} prospect{cp.peopleData.contacts.length !== 1 ? 's' : ''} found
                          </p>
                        )}
                        {isBankrupt && (
                          <p className="text-sm text-destructive font-medium">Research stopped - company is bankrupt</p>
                        )}
                        {isAcquiredInactive && !cp.peopleData && (
                          <p className="text-sm text-yellow-600 dark:text-yellow-400">
                            Acquired by {cp.companyData?.acquiredBy}
                          </p>
                        )}
                        {cp.error && <p className="text-sm text-destructive mt-1">{cp.error}</p>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-6 pb-6 space-y-6 border-t border-border/50 pt-6 bg-muted/20">
                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2">
                        {isAcquiredInactive && !cp.peopleData && cp.companyData?.acquiredBy && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResearchAcquirer(cp.companyId, cp.companyData!.acquiredBy!);
                            }}
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Research {cp.companyData.acquiredBy} Instead
                          </Button>
                        )}
                        {!isLoading && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => retryStep(cp.companyId, 'company')}>
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Re-Research Company
                            </Button>
                            {cp.companyData && (
                              <Button variant="outline" size="sm" onClick={() => retryStep(cp.companyId, 'people')}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Re-Research Prospects
                              </Button>
                            )}
                          </>
                        )}
                        {/* Manual failsafe: trigger prospect research when stuck in awaiting state */}
                        {(cp.step === 'people' || cp.step === 'awaiting_callback') && cp.companyData && !cp.peopleData?.contacts?.length && (
                          <Button 
                            size="sm" 
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              retryStep(cp.companyId, 'people');
                            }}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Manually Trigger Prospect Research
                          </Button>
                        )}
                      </div>

                      {/* Company data skeleton */}
                      {cp.step === 'company' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-primary" />
                            <span className="font-medium flex items-center gap-2">
                              Researching company <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            </span>
                          </div>
                          <div className="bg-background rounded-xl p-4 border space-y-3">
                            <Skeleton className="h-5 w-40" />
                            <Skeleton className="h-5 w-56" />
                            <Skeleton className="h-5 w-48" />
                          </div>
                        </div>
                      )}

                      {/* Company data */}
                      {cp.companyData && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-primary" />
                            <span className="font-medium">Company Information</span>
                            <Check className="w-4 h-4 text-green-500 ml-auto" />
                          </div>
                          <div className="bg-background rounded-xl p-4 border space-y-3">
                            {cp.companyData.company_status && (
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground min-w-[100px]">Status</span>
                                <div className="flex items-center gap-2">
                                  {getCompanyStatusBadge(cp.companyData)}
                                  {cp.companyData.acquiredBy && (
                                    <span className="text-sm">
                                      by <strong>{cp.companyData.acquiredBy}</strong>
                                      {cp.companyData.effectiveDate && (
                                        <span className="text-muted-foreground ml-1">({cp.companyData.effectiveDate})</span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            {cp.companyData.cloud_preference && (
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground min-w-[100px]">Cloud</span>
                                <div className="flex items-center gap-2">
                                  <Cloud className="w-4 h-4 text-primary" />
                                  <span className="font-medium text-sm">{cp.companyData.cloud_preference.provider}</span>
                                  <Badge variant="outline" className="text-xs">{cp.companyData.cloud_preference.confidence}%</Badge>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* People data skeleton */}
                      {(cp.step === 'people' || cp.step === 'awaiting_callback') && !cp.peopleData && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-primary" />
                            <span className="font-medium flex items-center gap-2">
                              Finding contacts <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            </span>
                          </div>
                          <div className="grid gap-3">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="bg-background rounded-xl p-4 border space-y-3">
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-4 w-full" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Prospect results */}
                      {cp.peopleData?.contacts && cp.peopleData.contacts.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
                            <span className="font-medium">
                              {cp.peopleData.contacts.length} Contact{cp.peopleData.contacts.length !== 1 ? 's' : ''} Found
                            </span>
                            <Check className="w-4 h-4 text-green-500 ml-auto" />
                          </div>
                          <div className="grid gap-3">
                            {cp.peopleData.contacts.map((contact, idx) => (
                              <div key={idx} className="bg-background rounded-xl p-4 border shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                      <span className="font-semibold">
                                        {contact.first_name} {contact.last_name}
                                      </span>
                                      <Badge className={cn('text-xs', getPriorityColor(contact.priority))}>
                                        {contact.priority}
                                      </Badge>
                                      {contact.pitch_type && (
                                        <Badge variant="secondary" className="text-xs">{contact.pitch_type}</Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground font-medium mb-1">{contact.job_title}</p>
                                    {contact.priority_reason && (
                                      <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg line-clamp-2">
                                        {contact.priority_reason}
                                      </p>
                                    )}
                                  </div>
                                  {contact.linkedin && (
                                    <a
                                      href={contact.linkedin.startsWith('http') ? contact.linkedin : `https://${contact.linkedin}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 p-2 rounded-lg hover:bg-primary/10 transition-colors"
                                    >
                                      <ExternalLink className="w-5 h-5 text-primary" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {companiesProgress.length === 0 && (
              <div className="text-center py-16">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No research in progress</h3>
                <p className="text-muted-foreground mb-4">Select companies and start research from the companies page.</p>
                <Button onClick={() => navigate(campaignId ? `/companies/${campaignId}` : '/campaigns')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Companies
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom action bar */}
        {completedCount > 0 && !isRunning && (
          <div className="px-6 py-4 border-t bg-background">
            <div className="flex items-center justify-between max-w-3xl">
              <Button variant="outline" onClick={() => navigate(campaignId ? `/companies/${campaignId}` : '/campaigns')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Companies
              </Button>
              <Button onClick={() => navigate(`/contacts/${campaignId}`)}>
                View All Contacts
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
