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

// Helper function to parse multi-line/comma-separated text into arrays
const parseToArray = (text?: string): string[] => {
  if (!text) return [];
  return text
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
};

// Build the structured payload for a single company
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
        // 3 minute timeout for company research
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000);
        
        const response = await fetch(integrations.company_research_webhook_url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Company research failed: ${response.status}`);

        const responseText = await response.text();
        let data = null;
        if (responseText?.trim()) {
          try { data = JSON.parse(responseText); } catch (e) { console.warn('Not valid JSON'); }
        }
        
        const parsedData = data ? parseAIResponse(data) as CompanyResearchResult : null;
        updateCompanyProgress(companyId, { step: 'people', companyData: parsedData || undefined });
        toast.success(`Company research complete for ${company.name}`);
      } catch (error: any) {
        const errorMsg = error.name === 'AbortError' ? 'Request timed out (3 min)' : error.message;
        updateCompanyProgress(companyId, { step: 'error', error: errorMsg });
        toast.error(`Failed: ${errorMsg}`);
      }
    }

    if (stepToRetry === 'people') {
      updateCompanyProgress(companyId, { step: 'people', error: undefined });
      
      try {
        // 15 minute timeout for people research (can take up to 10+ min)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 900000);
        
        const response = await fetch(integrations.people_research_webhook_url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`People research failed: ${response.status}`);

        const responseText = await response.text();
        let data = null;
        if (responseText?.trim()) {
          try { data = JSON.parse(responseText); } catch (e) { console.warn('Not valid JSON'); }
        }
        
        const parsedData = data ? parseAIResponse(data) as PeopleResearchResult : null;
        updateCompanyProgress(companyId, { step: 'clay', peopleData: parsedData || undefined });
        toast.success(`People research complete for ${company.name}`);
      } catch (error: any) {
        const errorMsg = error.name === 'AbortError' ? 'Request timed out (15 min)' : error.message;
        updateCompanyProgress(companyId, { step: 'error', error: errorMsg });
        toast.error(`Failed: ${errorMsg}`);
      }
    }

  }, [companies, selectedCampaign, integrations, updateCompanyProgress]);

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
        // 3 minute timeout for company research
        const companyController = new AbortController();
        const companyTimeoutId = setTimeout(() => companyController.abort(), 180000);
        
        console.log(`[Research] Sending company webhook request...`);
        const companyResponse = await fetch(integrations.company_research_webhook_url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: companyController.signal,
        });
        
        clearTimeout(companyTimeoutId);
        console.log(`[Research] Company webhook response status: ${companyResponse.status}`);

        if (!companyResponse.ok) {
          throw new Error(`Company research failed: ${companyResponse.status}`);
        }

        // Wait for full response text
        const responseText = await companyResponse.text();
        console.log(`[Research] Company response received, length: ${responseText?.length || 0} chars`);
        
        let companyData = null;
        if (responseText && responseText.trim()) {
          try {
            companyData = JSON.parse(responseText);
            console.log(`[Research] Company JSON parsed successfully`);
          } catch (e) {
            console.warn('[Research] Company response is not valid JSON:', responseText.substring(0, 200));
          }
        }
        
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
        const errorMsg = error.name === 'AbortError' ? 'Request timed out (3 min)' : error.message;
        updateCompanyProgress(company.id, { 
          step: 'error',
          error: errorMsg,
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
      
      try {
        // 15 minute timeout for people research (can take up to 10+ min)
        const peopleController = new AbortController();
        const peopleTimeoutId = setTimeout(() => peopleController.abort(), 900000);
        
        console.log(`[Research] Sending people webhook request...`);
        const peopleResponse = await fetch(integrations.people_research_webhook_url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: peopleController.signal,
        });
        
        clearTimeout(peopleTimeoutId);
        console.log(`[Research] People webhook response status: ${peopleResponse.status}`);

        if (!peopleResponse.ok) {
          throw new Error(`People research failed: ${peopleResponse.status}`);
        }

        // Wait for full response text
        const peopleText = await peopleResponse.text();
        console.log(`[Research] People response received, length: ${peopleText?.length || 0} chars`);
        
        let peopleData = null;
        if (peopleText && peopleText.trim()) {
          try {
            peopleData = JSON.parse(peopleText);
            console.log(`[Research] People JSON parsed successfully`);
          } catch (e) {
            console.warn('[Research] People response is not valid JSON:', peopleText.substring(0, 200));
          }
        }
        
        const parsedPeopleData = peopleData ? parseAIResponse(peopleData) as PeopleResearchResult : null;
        console.log(`[Research] People data parsed:`, parsedPeopleData ? 'success' : 'null');
        
        updateCompanyProgress(company.id, { 
          step: 'complete',
          peopleData: parsedPeopleData || undefined,
        });
        
        console.log(`[Research] Completed all research for ${company.name}`);

      } catch (error: any) {
        console.error('[Research] People research error:', error);
        const errorMsg = error.name === 'AbortError' ? 'Request timed out (15 min)' : error.message;
        updateCompanyProgress(company.id, { 
          step: 'error',
          error: errorMsg,
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
