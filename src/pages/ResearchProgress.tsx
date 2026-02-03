import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, Zap, Check, Loader2, AlertCircle, Cloud, ChevronDown, ChevronUp } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAppStore, Campaign, Company, CompanyResearchResult, PeopleResearchResult } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { toast } from 'sonner';
import { ResearchCompanyCard } from '@/components/research/ResearchCompanyCard';
import { supabase } from '@/integrations/supabase/client';

// Call webhook via edge function proxy to avoid CORS
// Uses AbortController with extended timeout for long-running AI research
const callWebhookProxy = async (webhookUrl: string, payload: any) => {
  // 20 minute timeout for the fetch call itself
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200000); // 20 min
  
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/research-proxy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
const buildCompanyPayload = (campaign: Campaign | null, company: Company) => ({
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
  companyResearchResult: CompanyResearchResult | null
) => ({
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

export default function ResearchProgress() {
  const navigate = useNavigate();
  const {
    researchProgress,
    setResearchProgress,
    updateCompanyProgress,
    companies,
    selectedCampaign,
    integrations,
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

  // Retry a specific step for a company
  const retryStep = useCallback(async (companyId: string, stepToRetry: 'company' | 'people' | 'clay') => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return;

    const payload = buildCompanyPayload(selectedCampaign, company);
    
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
      // Get existing company data from progress
      const existingProgress = companiesProgress.find(p => p.companyId === companyId);
      const companyData = existingProgress?.companyData || null;
      
      // Build people payload with company research results
      const peoplePayload = buildPeoplePayload(selectedCampaign, company, companyData);
      
      updateCompanyProgress(companyId, { step: 'people', error: undefined });
      
      try {
        console.log(`[Retry] People research for ${company.name}`);
        const data = await callWebhookProxy(integrations.people_research_webhook_url!, peoplePayload);
        
        const parsedData = data ? parseAIResponse(data) as PeopleResearchResult : null;
        updateCompanyProgress(companyId, { step: 'complete', peopleData: parsedData || undefined });
        toast.success(`People research complete for ${company.name}`);
      } catch (error: any) {
        updateCompanyProgress(companyId, { step: 'error', error: error.message });
        toast.error(`Failed: ${error.message}`);
      }
    }

  }, [companies, selectedCampaign, integrations, updateCompanyProgress, companiesProgress]);

  // Process companies sequentially: Company Research → People Research
  const processCompanies = useCallback(async () => {
    if (isProcessingRef.current || !isRunning) return;
    isProcessingRef.current = true;

    const selectedCompanies = companies.filter(c => c.selected);

    for (let i = 0; i < selectedCompanies.length; i++) {
      const company = selectedCompanies[i];
      const payload = buildCompanyPayload(selectedCampaign, company);

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
        console.log(`[Research] Company response received`);
        
        parsedCompanyData = companyData ? parseAIResponse(companyData) as CompanyResearchResult : null;
        console.log(`[Research] Company data parsed:`, parsedCompanyData ? 'success' : 'null');
        
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

      // Only proceed to people research if company research succeeded
      if (!companyResearchSuccess) {
        console.log(`[Research] Company research failed, skipping people research for ${company.name}`);
        continue;
      }

      // ========== STEP 2: People Research ==========
      console.log(`[Research] Step 2: People research for ${company.name}`);
      setResearchProgress({ currentStep: 'people' });
      
      // Build people payload with company research results included
      const peoplePayload = buildPeoplePayload(selectedCampaign, company, parsedCompanyData);
      console.log(`[Research] People payload includes company research:`, !!parsedCompanyData);
      
      try {
        console.log(`[Research] Sending people webhook request via proxy...`);
        const peopleData = await callWebhookProxy(integrations.people_research_webhook_url!, peoplePayload);
        console.log(`[Research] People response received`);
        
        const parsedPeopleData = peopleData ? parseAIResponse(peopleData) as PeopleResearchResult : null;
        console.log(`[Research] People data parsed:`, parsedPeopleData ? 'success' : 'null');
        
        updateCompanyProgress(company.id, { 
          step: 'complete',
          peopleData: parsedPeopleData || undefined,
        });
        
        console.log(`[Research] Completed all research for ${company.name}`);

      } catch (error: any) {
        console.error('[Research] People research error:', error);
        updateCompanyProgress(company.id, { 
          step: 'error',
          error: error.message,
        });
        continue;
      }
    }

    // All done
    console.log(`[Research] All companies completed`);
    setResearchProgress({ isRunning: false });
    isProcessingRef.current = false;
    toast.success('Research complete!');
    
  }, [isRunning, companies, selectedCampaign, integrations, setResearchProgress, updateCompanyProgress]);

  // Start processing when component mounts
  useEffect(() => {
    if (isRunning && !isProcessingRef.current) {
      processCompanies();
    }
  }, [isRunning, processCompanies]);

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
              />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
