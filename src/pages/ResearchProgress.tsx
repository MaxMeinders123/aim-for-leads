import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, Zap, Check, Loader2, AlertCircle, Cloud, ChevronDown, ChevronUp } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAppStore, Campaign, Company, CompanyResearchResult, PeopleResearchResult, Contact } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { toast } from 'sonner';
import { ResearchCompanyCard } from '@/components/research/ResearchCompanyCard';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

const RESEARCH_STATE_KEY_PREFIX = 'research_progress_';

// Call webhook via edge function proxy to avoid CORS
// Uses AbortController with extended timeout for long-running AI research
const callWebhookProxy = async (webhookUrl: string, payload: any) => {
  // 20 minute timeout for the fetch call itself
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200000); // 20 min
  
  try {
    // Use the logged-in user's session JWT when available; fall back to the public key.
    // (The gateway may reject requests without apikey/authorization before the function runs.)
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/research-proxy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Required by the gateway
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          // Prefer user session token; anon/public key is a valid JWT for some configs
          'Authorization': `Bearer ${accessToken ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ webhookUrl, payload }),
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Request failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out (20 min limit)');
    }
    throw error;
  }
};

// Helper function to parse multi-line/comma-separated text into arrays
const parseToArray = (text?: string): string[] => {
  if (!text) return [];
  return text
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
};

// Build the structured payload for company research
const buildCompanyPayload = (campaign: Campaign | null, company: Company, userId: string) => ({
  user_id: userId,
  company_domain: company.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || company.name.toLowerCase().replace(/\s+/g, ''),
  campaign: {
    campaignName: campaign?.name || '',
    product: campaign?.product || '',
    productCategory: campaign?.product_category || '',
    primaryAngle: campaign?.primary_angle || '',
    secondaryAngle: campaign?.secondary_angle || '',
    targetRegion: campaign?.target_region || '',
    painPoints: parseToArray(campaign?.pain_points),
    targetPersonas: parseToArray(campaign?.personas),
    targetTitles: parseToArray(campaign?.job_titles),
    targetVerticals: parseToArray(campaign?.target_verticals),
    techFocus: campaign?.technical_focus || '',
  },
  company: {
    name: company.name,
    website: company.website || '',
    linkedin: company.linkedin_url || '',
  },
});

// Build the structured payload for people research (includes company research results)
const buildPeoplePayload = (
  campaign: Campaign | null,
  company: Company,
  companyResearchResult: CompanyResearchResult | null,
  userId: string,
  companyResearchId?: string
) => ({
  user_id: userId,
  company_domain: company.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || company.name.toLowerCase().replace(/\s+/g, ''),
  company_research_id: companyResearchId, // UUID linking to company_research table
  campaign: {
    campaignName: campaign?.name || '',
    product: campaign?.product || '',
    productCategory: campaign?.product_category || '',
    primaryAngle: campaign?.primary_angle || '',
    secondaryAngle: campaign?.secondary_angle || '',
    targetRegion: campaign?.target_region || '',
    painPoints: parseToArray(campaign?.pain_points),
    targetPersonas: parseToArray(campaign?.personas),
    targetTitles: parseToArray(campaign?.job_titles),
    targetVerticals: parseToArray(campaign?.target_verticals),
    techFocus: campaign?.technical_focus || '',
  },
  company: {
    name: company.name,
    website: company.website || '',
    linkedin: company.linkedin_url || '',
  },
  // Include company research results for context
  companyResearch: companyResearchResult ? {
    status: companyResearchResult.company_status || companyResearchResult.status,
    acquiredBy: companyResearchResult.acquiredBy,
    effectiveDate: companyResearchResult.effectiveDate,
    cloudPreference: companyResearchResult.cloud_preference,
  } : null,
  qualify: true,
});

// Parse the AI response text to extract JSON
const parseAIResponse = (responseData: any): any => {
  try {
    // Handle the nested structure from n8n with output_text content
    if (responseData?.output?.[0]?.content?.[0]?.text) {
      let text = responseData.output[0].content[0].text;
      
      // Strip markdown code blocks if present (```json ... ```)
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        text = jsonMatch[1].trim();
      }
      
      // Try parsing the text directly (it might be JSON without markdown wrapping)
      try {
        return JSON.parse(text);
      } catch {
        // If parsing fails, return the text as-is for debugging
        console.warn('Could not parse nested text as JSON:', text.substring(0, 200));
        return null;
      }
    }
    
    // Handle array response (first element) - common n8n wrapper
    if (Array.isArray(responseData) && responseData.length > 0) {
      // Check if first element has output structure
      if (responseData[0]?.output) {
        return parseAIResponse(responseData[0]);
      }
      // Some n8n responses return array of results directly
      return parseAIResponse(responseData[0]);
    }
    
    // Direct JSON response with the expected fields (status, contacts, company_status)
    if (typeof responseData === 'object' && responseData !== null) {
      if (responseData.status || responseData.company_status || responseData.contacts) {
        return responseData;
      }
    }
    
    // Try parsing as string (raw JSON string response)
    if (typeof responseData === 'string') {
      // Strip markdown code blocks if present
      const jsonMatch = responseData.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      return JSON.parse(responseData);
    }
    
    console.warn('Unknown response format:', responseData);
    return responseData;
  } catch (e) {
    console.error('Failed to parse AI response:', e, responseData);
    return null;
  }
};

const researchSteps = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'people', label: 'People', icon: Users },
];

// Push researched contacts to the main contacts list
const pushProspectsToContacts = async (
  companyId: string,
  companyName: string,
  userId: string,
  selectedCampaignId: string | undefined,
  companiesProgress: any[],
  addContacts: (contacts: Contact[]) => void
) => {
  try {
    // Find the company's research data
    const companyProgress = companiesProgress.find(p => p.companyId === companyId);
    if (!companyProgress || !companyProgress.company_research_id) {
      toast.error('Company research data not found');
      return;
    }

    // Fetch prospects from the database
    const { data: prospects, error } = await supabase
      .from('prospect_research')
      .select('*')
      .eq('company_research_id', companyProgress.company_research_id)
      .eq('user_id', userId);

    if (error) throw error;

    if (!prospects || prospects.length === 0) {
      toast.info('No prospects found for this company');
      return;
    }

    // Transform prospects to Contact format
    const newContacts: Contact[] = prospects.map(p => ({
      id: p.id,
      campaign_id: selectedCampaignId || '',
      company_id: companyId,
      company_name: companyName,
      name: `${p.first_name} ${p.last_name}`.trim(),
      title: p.job_title || undefined,
      email: p.email || undefined,
      phone: p.phone || undefined,
      linkedin_url: p.linkedin_url || undefined,
      priority: (p.priority || 'low') as 'high' | 'medium' | 'low',
      selected: false,
    }));

    // Add to contacts store
    addContacts(newContacts);

    toast.success(`Added ${newContacts.length} contacts from ${companyName}`);
  } catch (error: any) {
    console.error('Error pushing prospects to contacts:', error);
    toast.error(`Failed to push contacts: ${error.message}`);
  }
};

export default function ResearchProgress() {
  const navigate = useNavigate();
  const {
    researchProgress,
    setResearchProgress,
    updateCompanyProgress,
    companies,
    selectedCampaign,
    integrations,
    user,
    addContacts,
  } = useAppStore();

  const {
    isRunning,
    currentCompanyIndex,
    totalCompanies,
    currentStep,
    companiesProgress,
  } = researchProgress;

  const isProcessingRef = useRef(false);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  const progressPercentage = totalCompanies > 0
    ? Math.round(((companiesProgress.filter(c => c.step === 'complete').length) / totalCompanies) * 100)
    : 0;

  const toggleExpanded = (companyId: string) => {
    setExpandedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  // Push researched contacts from a company to the main contacts list
  const handlePushToContacts = useCallback(async (companyId: string, companyName: string) => {
    await pushProspectsToContacts(
      companyId,
      companyName,
      user?.id || '',
      selectedCampaign?.id,
      companiesProgress,
      addContacts
    );
  }, [user?.id, selectedCampaign?.id, companiesProgress, addContacts]);

  // Retry a specific step for a company
  const retryStep = useCallback(async (companyId: string, stepToRetry: 'company' | 'people' | 'clay') => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return;

    const payload = buildCompanyPayload(selectedCampaign, company, user?.id || '');
    
    // Expand the company card to show progress
    setExpandedCompanies(prev => new Set(prev).add(companyId));

    if (stepToRetry === 'company') {
      updateCompanyProgress(companyId, { step: 'company', error: undefined });
      
      try {
        console.log(`[Retry] Company research for ${company.name}`);
        const data = await callWebhookProxy(integrations.company_research_webhook_url!, payload);
        
        const parsedData = data ? parseAIResponse(data) as CompanyResearchResult : null;
        updateCompanyProgress(companyId, { step: 'people', companyData: parsedData || undefined });
        toast.success(`Company research complete for ${company.name}`);
      } catch (error: any) {
        updateCompanyProgress(companyId, { step: 'error', error: error.message });
        toast.error(`Failed: ${error.message}`);
      }
    }

    if (stepToRetry === 'people') {
      // Get existing company data and research ID from progress
      const existingProgress = companiesProgress.find(p => p.companyId === companyId);
      const companyData = existingProgress?.companyData || null;
      const companyResearchId = existingProgress?.company_research_id;

      if (!companyResearchId) {
        toast.error('Missing company_research_id. Please retry company research first.');
        return;
      }

      // Build people payload with company research results and ID
      const peoplePayload = buildPeoplePayload(selectedCampaign, company, companyData, user?.id || '', companyResearchId);

      updateCompanyProgress(companyId, { step: 'people', error: undefined });

      try {
        console.log(`[Retry] People research for ${company.name} with company_research_id: ${companyResearchId}`);
        const data = await callWebhookProxy(integrations.people_research_webhook_url!, peoplePayload);

        const parsedData = data ? parseAIResponse(data) as PeopleResearchResult : null;
        updateCompanyProgress(companyId, { step: 'complete', peopleData: parsedData || undefined });
        toast.success(`People research complete for ${company.name}`);
      } catch (error: any) {
        updateCompanyProgress(companyId, { step: 'error', error: error.message });
        toast.error(`Failed: ${error.message}`);
      }
    }

  }, [companies, selectedCampaign, integrations, updateCompanyProgress, companiesProgress, user]);

  // Process companies sequentially: Company Research → People Research
  const processCompanies = useCallback(async () => {
    if (isProcessingRef.current || !isRunning) return;
    isProcessingRef.current = true;

    const selectedCompanies = companies.filter(c => c.selected);

    for (let i = 0; i < selectedCompanies.length; i++) {
      const company = selectedCompanies[i];
      const payload = buildCompanyPayload(selectedCampaign, company, user?.id || '');

      console.log(`[Research] Starting company ${i + 1}/${selectedCompanies.length}: ${company.name}`);

      setResearchProgress({
        currentCompanyIndex: i,
        currentCompany: company.name,
      });

      // ========== STEP 1: Company Research ==========
      console.log(`[Research] Step 1: Company research for ${company.name}`);
      setResearchProgress({ currentStep: 'company' });
      updateCompanyProgress(company.id, { step: 'company' });

      let companyResearchSuccess = false;
      let parsedCompanyData: CompanyResearchResult | null = null;

      try {
        console.log(`[Research] Sending company webhook request via proxy...`);
        const companyData = await callWebhookProxy(integrations.company_research_webhook_url!, payload);
        console.log(`[Research] Company response received:`, companyData);

        // Check if n8n is using async mode (responds immediately with "processing")
        if (companyData?.status === 'processing') {
          console.log(`[Research] Company research started in async mode for ${company.name}`);
          toast.info(`Research started for ${company.name}. Results will appear shortly via realtime updates.`);
          updateCompanyProgress(company.id, {
            step: 'company',
            error: undefined,
          });
          // Skip to next company - will complete via realtime subscription when Supabase receives data
          continue;
        }

        parsedCompanyData = companyData ? parseAIResponse(companyData) as CompanyResearchResult : null;
        console.log(`[Research] Company data parsed:`, parsedCompanyData ? 'success' : 'null');

        // Check if the AI returned an error status - but Acquired/Renamed/Not_Found are valid research results
        if (parsedCompanyData?.status === 'error' && !parsedCompanyData?.company_status) {
          // Only treat as error if there's no company_status (real error, not just acquired/renamed)
          console.error(`[Research] AI returned error for ${company.name}`);
          updateCompanyProgress(company.id, {
            step: 'error',
            error: 'Research failed - unable to gather company information',
          });
          toast.error(`Research failed for ${company.name}`);
          continue; // Skip to next company
        }

        // For Acquired, Renamed, Bankrupt, or Not_Found companies, we still have valid data
        // Show a special toast to inform the user
        if (parsedCompanyData?.company_status === 'Acquired' && parsedCompanyData.acquiredBy) {
          toast.info(`${company.name} has been acquired by ${parsedCompanyData.acquiredBy}`);
        } else if (parsedCompanyData?.company_status === 'Renamed' && parsedCompanyData.acquiredBy) {
          toast.info(`${company.name} has been renamed to ${parsedCompanyData.acquiredBy}`);
        } else if (parsedCompanyData?.company_status === 'Bankrupt') {
          toast.warning(`${company.name} is no longer operating (Bankrupt)`);
        } else if (parsedCompanyData?.company_status === 'Not_Found') {
          toast.warning(`${company.name} could not be found or verified`);
        }

        // Update state with company data BEFORE moving to people step
        updateCompanyProgress(company.id, {
          step: 'people',
          companyData: parsedCompanyData || undefined,
        });

        // Auto-expand current company to show results
        setExpandedCompanies(prev => new Set(prev).add(company.id));

        companyResearchSuccess = true;
        console.log(`[Research] Company research complete for ${company.name}, proceeding to people research`);

      } catch (error: any) {
        console.error('[Research] Company research error:', error);
        updateCompanyProgress(company.id, {
          step: 'error',
          error: error.message,
        });
        continue; // Skip to next company - don't proceed to people research
      }

      // ========== STEP 2: People Research (Auto-triggered by Backend) ==========
      // NOTE: Prospect research is now automatically triggered by the Supabase edge function
      // after company research completes. No need to call the webhook from frontend.
      // The realtime subscriptions below will detect when prospect data arrives and update the UI.

      console.log(`[Research] Company research complete for ${company.name}`);
      console.log(`[Research] Prospect research will be triggered automatically by backend`);

      // Mark as awaiting prospect research (will be updated by realtime subscription)
      updateCompanyProgress(company.id, {
        step: 'people',
        companyData: parsedCompanyData || undefined,
      });
    }

    // All done
    console.log(`[Research] All companies completed`);
    setResearchProgress({ isRunning: false });
    isProcessingRef.current = false;
    toast.success('Research complete!');
    
  }, [isRunning, companies, selectedCampaign, integrations, setResearchProgress, updateCompanyProgress, user]);

  // Start processing when component mounts
  useEffect(() => {
    if (isRunning && !isProcessingRef.current) {
      processCompanies();
    }
  }, [isRunning, processCompanies]);

  // Subscribe to realtime contact inserts to detect async callback completions
  useEffect(() => {
    if (!selectedCampaign?.id) return;

    const channel: RealtimeChannel = supabase
      .channel('contacts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contacts',
          filter: `campaign_id=eq.${selectedCampaign.id}`,
        },
        (payload) => {
          console.log('[Realtime] New contact inserted:', payload.new);
          const newContact = payload.new as { company_id?: string; name?: string };

          if (newContact.company_id) {
            // Find the company progress and update it to complete
            const progress = companiesProgress.find(
              (p) => p.companyId === newContact.company_id && p.step === 'awaiting_callback'
            );

            if (progress) {
              console.log(`[Realtime] Marking ${progress.companyName} as complete`);
              updateCompanyProgress(newContact.company_id, { step: 'complete' });
              toast.success(`People research complete for ${progress.companyName}`);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedCampaign?.id, companiesProgress, updateCompanyProgress]);

  // Subscribe to company_research and prospect_research for async mode
  useEffect(() => {
    if (!user?.id) return;

    const companyChannel: RealtimeChannel = supabase
      .channel('company-research-async')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'company_research',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[Realtime] Company research completed:', payload.new);
          const newRecord = payload.new as { id: string; company_domain: string; raw_data: any; status: string };

          // Find the matching company by domain
          const matchingCompany = companies.find(c => {
            const domain = c.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || c.name.toLowerCase().replace(/\s+/g, '');
            return domain === newRecord.company_domain;
          });

          if (matchingCompany && newRecord.status === 'completed') {
            console.log(`[Realtime] Company research done for ${matchingCompany.name}, ID: ${newRecord.id}`);
            const companyData = newRecord.raw_data;

            updateCompanyProgress(matchingCompany.id, {
              step: 'people',
              companyData: companyData || undefined,
              company_research_id: newRecord.id, // Store the UUID for prospect research
            });

            toast.success(`Company research complete for ${matchingCompany.name}`);
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Company research subscription:', status);
      });

    const prospectChannel: RealtimeChannel = supabase
      .channel('prospect-research-async')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'prospect_research',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          console.log('[Realtime] Prospect research completed:', payload.new);
          const newRecord = payload.new as { company_research_id: string };

          // Find the matching company by looking up the company_research record
          const { data: companyResearch } = await supabase
            .from('company_research')
            .select('company_domain')
            .eq('id', newRecord.company_research_id)
            .single();

          if (companyResearch) {
            const matchingCompany = companies.find(c => {
              const domain = c.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || c.name.toLowerCase().replace(/\s+/g, '');
              return domain === companyResearch.company_domain;
            });

            if (matchingCompany) {
              console.log(`[Realtime] Prospect received for ${matchingCompany.name}, fetching all prospects...`);

              // Fetch all prospects for this company research
              const { data: prospects } = await supabase
                .from('prospect_research')
                .select('*')
                .eq('company_research_id', newRecord.company_research_id)
                .order('created_at', { ascending: false });

              if (prospects && prospects.length > 0) {
                console.log(`[Realtime] Found ${prospects.length} prospects for ${matchingCompany.name}`);

                // Convert database prospects to ResearchContact format
                const contacts = prospects.map(p => ({
                  first_name: p.first_name || '',
                  last_name: p.last_name || '',
                  job_title: p.job_title || '',
                  title: p.job_title || '',
                  pitch_type: p.pitch_type || '',
                  linkedin: p.linkedin_url || '',
                  priority: (p.priority || 'Medium') as 'High' | 'Medium' | 'Low',
                  priority_reason: p.priority_reason || '',
                }));

                updateCompanyProgress(matchingCompany.id, {
                  step: 'complete',
                  peopleData: {
                    status: 'completed',
                    company: matchingCompany.name,
                    contacts,
                  },
                });
                toast.success(`Prospect research complete for ${matchingCompany.name}`);
              }
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Prospect research subscription:', status);
      });

    return () => {
      supabase.removeChannel(companyChannel);
      supabase.removeChannel(prospectChannel);
    };
  }, [user?.id, companies, updateCompanyProgress]);

  // Persist research progress to localStorage
  useEffect(() => {
    const RESEARCH_STATE_KEY = `research_progress_${selectedCampaign?.id}`;
    localStorage.setItem(RESEARCH_STATE_KEY, JSON.stringify(researchProgress));
  }, [researchProgress, selectedCampaign?.id]);

  // Load existing prospects from database when component mounts or when companies have research IDs
  useEffect(() => {
    const loadExistingProspects = async () => {
      if (!user?.id || companiesProgress.length === 0) return;

      for (const progress of companiesProgress) {
        // Skip if already has people data
        if (progress.peopleData?.contacts && progress.peopleData.contacts.length > 0) {
          continue;
        }

        // Skip if no company_research_id
        if (!progress.company_research_id) {
          continue;
        }

        try {
          const { data: prospects } = await supabase
            .from('prospect_research')
            .select('*')
            .eq('company_research_id', progress.company_research_id)
            .order('created_at', { ascending: false });

          if (prospects && prospects.length > 0) {
            // Convert database prospects to ResearchContact format
            const contacts = prospects.map(p => ({
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
              peopleData: {
                status: 'completed',
                company: progress.companyName,
                contacts,
              },
            });
          }
        } catch (error) {
          console.error(`Failed to load prospects for ${progress.companyName}:`, error);
        }
      }
    };

    loadExistingProspects();
  }, [user?.id, updateCompanyProgress, companiesProgress]);

  const handleStop = () => {
    setResearchProgress({ isRunning: false });
    isProcessingRef.current = false;
    navigate('/company-preview');
  };

  const handleViewResults = () => {
    navigate('/results');
  };

  const getStepStatus = (stepId: string, companyStep: string) => {
    const steps = ['company', 'people', 'complete'];
    const currentIndex = steps.indexOf(companyStep);
    const stepIndex = steps.indexOf(stepId);

    if (companyStep === 'error') return 'error';
    if (companyStep === 'complete') return 'completed';
    if (companyStep === 'awaiting_callback') {
      // People step is "in progress" (waiting for callback)
      if (stepId === 'company') return 'completed';
      if (stepId === 'people') return 'current';
      return 'pending';
    }
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title={isRunning ? "Researching..." : "Research Complete"}
          subtitle={`${companiesProgress.filter(c => c.step === 'complete').length} of ${totalCompanies} companies`}
          actions={
            isRunning ? (
              <Button variant="outline" onClick={handleStop} className="rounded-lg">
                Stop
              </Button>
            ) : (
              <Button onClick={handleViewResults} className="rounded-lg">
                View Results
              </Button>
            )
          }
        />

        <div className="flex-1 overflow-auto px-6 py-6">
          {/* Progress Bar */}
          <div className="mb-8 max-w-3xl">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Progress</span>
              <span>{progressPercentage}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {/* Step Legend */}
          <div className="flex gap-4 mb-6 max-w-3xl">
            {researchSteps.map((step, index) => (
              <div key={step.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </div>
                <step.icon className="w-4 h-4" />
                <span>{step.label}</span>
              </div>
            ))}
          </div>

          {/* Companies Progress */}
          <div className="space-y-3 max-w-3xl">
            {companiesProgress.map((companyProgress) => (
              <ResearchCompanyCard
                key={companyProgress.companyId}
                companyProgress={companyProgress}
                isExpanded={expandedCompanies.has(companyProgress.companyId)}
                onToggleExpand={() => toggleExpanded(companyProgress.companyId)}
                getStepStatus={getStepStatus}
                onRetryStep={retryStep}
                onPushToContacts={handlePushToContacts}
              />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
