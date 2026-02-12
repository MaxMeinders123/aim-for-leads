import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Database,
  FileText,
  Upload,
  Loader2,
  Building2,
  Globe,
  Linkedin,
  Check,
  CheckCircle,
  Rocket,
  Plus,
  Users,
  Trash2,
  ChevronDown,
  Info,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ResearchedCompanyCard } from '@/components/research/ResearchedCompanyCard';
import { useAppStore, type Company, type CompanyResearchProgress } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchCompanies,
  addManualCompany,
  importSalesforceCompanies,
  deleteMultipleCompanies,
  callResearchProxy,
  buildCompanyResearchPayload,
} from '@/services/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { normalizeCompanyDomain } from '@/lib/domainUtils';
import { companySchema, sanitizeInput, sanitizeUrl } from '@/lib/validation';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { PageErrorBoundary } from '@/components/ErrorBoundary';

interface ResearchedCompany {
  id: string;
  company_domain: string;
  company_name: string | null;
  company_status: string | null;
  acquired_by: string | null;
  cloud_provider: string | null;
  cloud_confidence: number | null;
  status: string;
}

interface Prospect {
  id: string;
  company_research_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  priority: string | null;
  priority_reason: string | null;
  pitch_type: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  salesforce_url: string | null;
  sent_to_clay: boolean;
}

function CompaniesPage() {
  const navigate = useNavigate();
  const { campaignId } = useParams<{ campaignId: string }>();
  const {
    companies,
    setCompanies,
    toggleCompanySelection,
    campaigns,
    setSelectedCampaign,
    selectedCampaign,
    setResearchProgress,
    user,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState('salesforce');
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [salesforceCampaignId, setSalesforceCampaignId] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Manual entry form
  const [manualName, setManualName] = useState('');
  const [manualWebsite, setManualWebsite] = useState('');
  const [manualLinkedin, setManualLinkedin] = useState('');
  
  // Track completed research domains to filter them out
  const [completedDomains, setCompletedDomains] = useState<Set<string>>(new Set());
  const [researchedCompanies, setResearchedCompanies] = useState<ResearchedCompany[]>([]);
  const [prospectsMap, setProspectsMap] = useState<Record<string, Prospect[]>>({});
  const [showResearched, setShowResearched] = useState(true);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reResearchingId, setReResearchingId] = useState<string | null>(null);
  const [showOnboardingGuide, setShowOnboardingGuide] = useState(false);

  // Set selected campaign from URL
  useEffect(() => {
    if (campaignId && campaigns.length > 0) {
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (campaign) setSelectedCampaign(campaign);
    }
  }, [campaignId, campaigns, setSelectedCampaign]);


  useEffect(() => {
    if (!user?.id) return;
    const key = `afl_onboarding_seen_${user.id}`;
    const alreadySeen = localStorage.getItem(key);
    if (!alreadySeen) {
      setShowOnboardingGuide(true);
    }
  }, [user?.id]);

  const closeOnboardingGuide = () => {
    if (user?.id) {
      localStorage.setItem(`afl_onboarding_seen_${user.id}`, 'true');
    }
    setShowOnboardingGuide(false);
  };

  const loadCompanies = useCallback(async () => {
    if (!campaignId) return;
    setIsLoadingCompanies(true);
    try {
      const data = await fetchCompanies(campaignId);
      setCompanies(
        data.map((c) => ({
          id: c.id,
          campaign_id: c.campaign_id,
          name: c.name,
          website: c.website ?? undefined,
          linkedin_url: c.linkedin_url ?? undefined,
          salesforce_account_id: c.salesforce_account_id ?? undefined,
          salesforce_campaign_id: c.salesforce_campaign_id ?? undefined,
          selected: true,
        })),
      );
    } catch {
      toast.error('Failed to load companies');
    } finally {
      setIsLoadingCompanies(false);
    }
  }, [campaignId, setCompanies]);

  const loadCompletedResearch = useCallback(async () => {
    if (!campaignId || !user?.id) return;
    try {
      // Fetch company_research records for this campaign with full details
      const { data, error } = await supabase
        .from('company_research')
        .select('id, company_domain, company_name, company_status, acquired_by, cloud_provider, cloud_confidence, status')
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Deduplicate by company_domain, keeping the most recent record per domain
      const allRecords = data || [];
      const domainMap = new Map<string, ResearchedCompany>();
      // Sort by created_at desc so first seen = newest
      const sorted = [...allRecords].sort((a, b) => b.id.localeCompare(a.id));
      for (const record of sorted) {
        const domain = record.company_domain.toLowerCase();
        if (!domainMap.has(domain)) {
          domainMap.set(domain, record);
        }
      }
      const dedupedCompanies = Array.from(domainMap.values());
      
      // Set researched companies for display (deduplicated)
      setResearchedCompanies(dedupedCompanies);
      
      // Set domains for filtering (any researched domain, not just completed)
      const domains = new Set(dedupedCompanies.map(r => r.company_domain.toLowerCase()));
      setCompletedDomains(domains);

      // Load prospects for all researched companies
      if (data && data.length > 0) {
        const companyResearchIds = data.map(c => c.id);
        const { data: prospects, error: prospectsError } = await supabase
          .from('prospect_research')
          .select('*')
          .in('company_research_id', companyResearchIds);
        
        if (!prospectsError && prospects) {
          const grouped: Record<string, Prospect[]> = {};
          prospects.forEach(p => {
            if (!grouped[p.company_research_id]) {
              grouped[p.company_research_id] = [];
            }
            grouped[p.company_research_id].push(p);
          });
          setProspectsMap(grouped);
        }
      }
    } catch (err) {
      console.error('Failed to load completed research:', err);
    }
  }, [campaignId, user?.id]);

  // Load companies and filter out completed research
  useEffect(() => {
    if (!campaignId) return;
    loadCompanies();
    loadCompletedResearch();
  }, [campaignId, loadCompanies, loadCompletedResearch]);

  // Realtime subscription for company_research updates (using new hook with proper cleanup)
  useRealtimeSubscription('companies-research-insert', {
    table: 'company_research',
    event: 'INSERT',
    filter: user?.id ? `user_id=eq.${user.id}` : undefined,
    callback: () => loadCompletedResearch(),
    debounceMs: 500,
  });

  useRealtimeSubscription('companies-research-update', {
    table: 'company_research',
    event: 'UPDATE',
    filter: user?.id ? `user_id=eq.${user.id}` : undefined,
    callback: () => loadCompletedResearch(),
    debounceMs: 500,
  });

  useRealtimeSubscription('companies-prospect-insert', {
    table: 'prospect_research',
    event: 'INSERT',
    filter: user?.id ? `user_id=eq.${user.id}` : undefined,
    callback: () => loadCompletedResearch(),
    debounceMs: 500,
  });

  const handleSalesforceImport = async () => {
    if (!salesforceCampaignId.trim()) {
      toast.error('Please enter a Salesforce Campaign ID');
      return;
    }
    if (!campaignId || !user?.id) return;

    setIsImporting(true);
    try {
      const data = await importSalesforceCompanies(user.id, campaignId, salesforceCampaignId.trim());
      if (data.imported_count === 0 && data.skipped_duplicates > 0) {
        toast.info(`All ${data.skipped_duplicates} companies are already imported`);
      } else if (data.skipped_duplicates > 0) {
        toast.success(`Imported ${data.imported_count} companies (${data.skipped_duplicates} already existed)`);
      } else {
        toast.success(`Imported ${data.imported_count} companies from Salesforce`);
      }
      setSalesforceCampaignId('');
      await loadCompanies();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to import from Salesforce');
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddManual = async () => {
    if (!campaignId || !user?.id) return;

    // Sanitize inputs
    const name = sanitizeInput(manualName.trim());
    const website = sanitizeUrl(manualWebsite.trim()) || undefined;
    const linkedin_url = sanitizeUrl(manualLinkedin.trim()) || undefined;

    // Validate using schema
    const validation = companySchema.safeParse({
      name,
      website,
      linkedin_url,
    });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    setIsAddingManual(true);
    try {
      const newCompany = await addManualCompany(user.id, campaignId, {
        name,
        website,
        linkedin_url,
      });

      setCompanies([
        ...companies,
        {
          id: newCompany.id,
          campaign_id: newCompany.campaign_id,
          name: newCompany.name,
          website: newCompany.website ?? undefined,
          linkedin_url: newCompany.linkedin_url ?? undefined,
          selected: true,
        },
      ]);

      setManualName('');
      setManualWebsite('');
      setManualLinkedin('');
      toast.success(`Added ${newCompany.name}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add company');
    } finally {
      setIsAddingManual(false);
    }
  };

  const handleStartResearch = () => {
    const selected = pendingCompanies.filter((c) => c.selected);
    if (selected.length === 0) {
      toast.error('Please select at least one company');
      return;
    }

    const companiesProgress: CompanyResearchProgress[] = selected.map((company) => ({
      companyId: company.id,
      companyName: company.name,
      step: 'company' as const,
    }));

    setResearchProgress({
      isRunning: true,
      currentCompanyIndex: 0,
      totalCompanies: selected.length,
      currentCompany: selected[0]?.name || '',
      currentStep: 'company',
      companiesProgress,
    });

    navigate(`/research/${campaignId}`);
  };

  const toggleCompanySelectionScoped = (companyId: string, scopedIds: Set<string>) => {
    toggleCompanySelection(companyId);

    const selectedAfterToggle = companies
      .filter((c) => scopedIds.has(c.id))
      .filter((c) => (c.id === companyId ? !c.selected : c.selected)).length;

    if (selectedAfterToggle === 0) {
      toast.info('No companies selected in this tab');
    }
  };

  const handleDeleteSelected = async () => {
    const selectedIds = pendingCompanies.filter(c => c.selected).map(c => c.id);
    if (selectedIds.length === 0) {
      toast.error('Please select companies to delete');
      return;
    }

    setIsDeleting(true);
    try {
      await deleteMultipleCompanies(selectedIds);
      setCompanies(companies.filter(c => !selectedIds.includes(c.id)));
      toast.success(`Deleted ${selectedIds.length} ${selectedIds.length === 1 ? 'company' : 'companies'}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete companies');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter out companies that have completed research (using centralized domain normalization)
  const pendingCompanies = companies.filter((c) => {
    const domain = normalizeCompanyDomain(c.website, c.name);
    return !domain || !completedDomains.has(domain.toLowerCase());
  });

  const selectedCount = pendingCompanies.filter((c) => c.selected).length;
  const completedCount = researchedCompanies.length;

  // Split companies by source for tab display
  const salesforceCompanies = pendingCompanies.filter((c) => c.salesforce_account_id);
  const manualCompanies = pendingCompanies.filter((c) => !c.salesforce_account_id);

  // Handle re-research of a company
  const handleReResearch = async (companyResearchId: string) => {
    if (!user?.id || !selectedCampaign) return;
    
    const researchedCompany = researchedCompanies.find(c => c.id === companyResearchId);
    if (!researchedCompany) return;

    setReResearchingId(companyResearchId);
    
    try {
      // Webhook URL resolved server-side by research-proxy
      // Build a minimal company object for the payload
      const companyForPayload: Company = {
        id: companyResearchId,
        campaign_id: campaignId || '',
        name: researchedCompany.company_name || researchedCompany.company_domain,
        website: researchedCompany.company_domain,
      };

      const payload = buildCompanyResearchPayload(selectedCampaign, companyForPayload, user.id);
      
      // Trigger the research
      await callResearchProxy('company_research', payload);
      
      toast.success(`Re-research started for ${researchedCompany.company_name || researchedCompany.company_domain}`);
      
      // Reload the data after a short delay
      setTimeout(() => {
        loadCompletedResearch();
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to start re-research');
    } finally {
      setReResearchingId(null);
    }
  };

  // Render researched companies section
  const renderResearchedCompanies = () => {
    if (researchedCompanies.length === 0) return null;

    return (
      <Collapsible open={showResearched} onOpenChange={setShowResearched} className="mt-6">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
          <ChevronDown className={cn("w-4 h-4 transition-transform", showResearched && "rotate-180")} />
          <CheckCircle className="w-4 h-4 text-primary" />
          <span>Researched Companies ({researchedCompanies.length})</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3">
          {researchedCompanies.map((company) => (
            <ResearchedCompanyCard
              key={company.id}
              company={company}
              prospects={prospectsMap[company.id] || []}
              onReResearch={handleReResearch}
              onProspectsUpdated={loadCompletedResearch}
              isReResearching={reResearchingId === company.id}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderCompanyTable = (companyList: Company[]) => {
    const scopedIds = new Set(companyList.map((c) => c.id));
    const scopedSelectedCount = companyList.filter((c) => c.selected).length;
    if (isLoadingCompanies) {
      return (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      );
    }

    if (companyList.length === 0) {
      return (
        <div className="text-center py-12 border rounded-lg border-dashed bg-muted/30">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No companies yet</p>
        </div>
      );
    }

    return (
      <div className="border rounded-lg overflow-hidden">
        {/* Select All */}
        <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 border-b">
          <Checkbox
            checked={companyList.length > 0 && companyList.every((c) => c.selected)}
            onCheckedChange={(checked) => {
              setCompanies(
                companies.map((company) =>
                  scopedIds.has(company.id) ? { ...company, selected: !!checked } : company,
                ),
              );
            }}
          />
          <span className="text-sm font-medium text-muted-foreground flex-1">
            {scopedSelectedCount} of {companyList.length} selected
          </span>
          {companyList.some((c) => c.selected) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1" />
              )}
              Delete Selected
            </Button>
          )}
        </div>

        {/* Rows */}
        <div className="divide-y">
          {companyList.map((company) => (
            <div
              key={company.id}
              onClick={() => toggleCompanySelectionScoped(company.id, scopedIds)}
              className={cn(
                'flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-colors',
                company.selected ? 'bg-primary/5' : 'hover:bg-muted/30',
              )}
            >
              <Checkbox
                checked={company.selected}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => toggleCompanySelectionScoped(company.id, scopedIds)}
              />

              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{company.name}</p>
              </div>

              <div className="flex items-center gap-4 shrink-0 text-sm">
                {company.website ? (
                  <a
                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {company.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </a>
                ) : (
                  <span className="text-muted-foreground">&mdash;</span>
                )}

                {company.linkedin_url ? (
                  <a
                    href={company.linkedin_url.startsWith('http') ? company.linkedin_url : `https://${company.linkedin_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[#0A66C2] hover:underline flex items-center gap-1"
                  >
                    <Linkedin className="w-3.5 h-3.5" />
                    LinkedIn
                  </a>
                ) : (
                  <span className="text-muted-foreground">&mdash;</span>
                )}

                {company.salesforce_account_id && (
                  <Badge variant="outline" className="text-xs shrink-0">SF</Badge>
                )}
              </div>

              {company.selected && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title={selectedCampaign?.name || 'Companies'}
          subtitle={selectedCampaign?.product || undefined}
          backTo="/campaigns"
          actions={
            <Button
              variant="outline"
              onClick={() => navigate(`/contacts/${campaignId}`)}
            >
              <Users className="w-4 h-4 mr-2" />
              View Contacts
            </Button>
          }
        />

        <div className="flex-1 overflow-auto p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-4xl">
            <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
              <TabsTrigger value="salesforce" className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                Salesforce Import
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Manual Entry
              </TabsTrigger>
            </TabsList>

            {/* Salesforce Import Tab */}
            <TabsContent value="salesforce" className="space-y-6">
              <div className="p-5 rounded-xl border bg-card space-y-4">
                <div className="rounded-lg border border-blue-200/60 bg-blue-50/70 dark:bg-blue-950/20 dark:border-blue-900/50 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-blue-800 dark:text-blue-200">
                    <Info className="w-4 h-4" />
                    Quick reminder before import
                  </div>
                  <p className="mt-1 text-blue-900/90 dark:text-blue-100/90">
                    In Salesforce, set Prospecting Status to <strong>Target Account</strong> first. Then copy the Campaign ID from the URL (starts with <strong>701...</strong>).
                    This tool is in beta, so a manual check before sending to Clay is strongly recommended.
                  </p>
                </div>
                <div>
                  <Label htmlFor="sfCampaignId" className="text-base font-medium">
                    Import from Salesforce
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    We'll import all accounts with "target account" prospecting status from this campaign.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    id="sfCampaignId"
                    value={salesforceCampaignId}
                    onChange={(e) => setSalesforceCampaignId(e.target.value)}
                    placeholder="Salesforce Campaign ID (e.g. 701xyz789)"
                    className="h-11 flex-1"
                  />
                  <Button
                    onClick={handleSalesforceImport}
                    disabled={isImporting || !salesforceCampaignId.trim()}
                    className="h-11 px-6"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Import Companies
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Find this ID in your Salesforce Campaign URL: /lightning/r/Campaign/<strong>701...</strong>/view
                </p>
              </div>

              {renderCompanyTable(salesforceCompanies.length > 0 ? salesforceCompanies : pendingCompanies)}
              
              {renderResearchedCompanies()}
            </TabsContent>

            {/* Manual Entry Tab */}
            <TabsContent value="manual" className="space-y-6">
              <div className="p-5 rounded-xl border bg-card space-y-4">
                <Label className="text-base font-medium">Add Company Manually</Label>
                <div className="grid gap-3">
                  <Input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Company Name *"
                    className="h-11"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      value={manualWebsite}
                      onChange={(e) => setManualWebsite(e.target.value)}
                      placeholder="Website (optional)"
                      className="h-11"
                    />
                    <Input
                      value={manualLinkedin}
                      onChange={(e) => setManualLinkedin(e.target.value)}
                      placeholder="LinkedIn URL (optional)"
                      className="h-11"
                    />
                  </div>
                  <Button
                    onClick={handleAddManual}
                    disabled={isAddingManual || !manualName.trim()}
                    className="w-full h-11"
                  >
                    {isAddingManual ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Add Company
                  </Button>
                </div>
              </div>

              {renderCompanyTable(manualCompanies.length > 0 ? manualCompanies : pendingCompanies)}
              
              {renderResearchedCompanies()}
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer with Start Research */}
        {pendingCompanies.length > 0 && (
          <div className="px-6 py-4 border-t border-border bg-background">
            <div className="flex items-center justify-between max-w-4xl">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4" />
                <span>{selectedCount} companies selected</span>
              </div>
              <Button
                onClick={handleStartResearch}
                disabled={selectedCount === 0}
                size="lg"
                className="bg-primary hover:bg-primary/90"
              >
                <Rocket className="w-5 h-5 mr-2" />
                Start Research ({selectedCount})
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showOnboardingGuide} onOpenChange={(open) => !open && closeOnboardingGuide()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Welcome — quick setup guide (beta)</DialogTitle>
            <DialogDescription>
              Honest note: this workflow is useful, but not perfect yet. Please do a quick manual review before sending prospects to Clay.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p><strong>1) In Salesforce:</strong> open your campaign and set Prospecting Status to <strong>Target Account</strong>.</p>
            <p><strong>2) Copy Campaign ID:</strong> from the URL, use the ID that looks like <strong>701...</strong>.</p>
            <p><strong>3) Import & Research:</strong> paste the ID here, import companies, select them, and press <strong>Start Research</strong>.</p>
            <p><strong>4) Before Clay:</strong> we recommend a fast manual check. Clay feedback will show whether a prospect was added to Salesforce or flagged as duplicate.</p>
            <div className="pt-2">
              <Button onClick={closeOnboardingGuide} className="w-full">Got it, let’s start</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}

// Wrap with error boundary to prevent crashes
export default function Companies() {
  return (
    <PageErrorBoundary>
      <CompaniesPage />
    </PageErrorBoundary>
  );
}
