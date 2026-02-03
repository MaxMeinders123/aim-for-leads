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
    // Handle the nested structure from n8n with markdown code blocks
    if (responseData?.output?.[0]?.content?.[0]?.text) {
      let text = responseData.output[0].content[0].text;
      
      // Strip markdown code blocks if present (```json ... ```)
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        text = jsonMatch[1].trim();
      }
      
      return JSON.parse(text);
    }
    
    // Handle array response (first element)
    if (Array.isArray(responseData) && responseData[0]?.output) {
      return parseAIResponse(responseData[0]);
    }
    
    // Direct JSON response with the expected fields
    if (typeof responseData === 'object' && (responseData.status || responseData.company_status)) {
      return responseData;
    }
    
    // Try parsing as string
    if (typeof responseData === 'string') {
      // Strip markdown code blocks if present
      const jsonMatch = responseData.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      return JSON.parse(responseData);
    }
    
    return responseData;
  } catch (e) {
    console.error('Failed to parse AI response:', e, responseData);
    return null;
  }
};

const researchSteps = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'people', label: 'People', icon: Users },
  { id: 'clay', label: 'Enrich', icon: Zap },
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
        const response = await fetch(integrations.company_research_webhook_url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

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
        updateCompanyProgress(companyId, { step: 'error', error: error.message });
        toast.error(`Failed: ${error.message}`);
      }
    }

    if (stepToRetry === 'people') {
      updateCompanyProgress(companyId, { step: 'people', error: undefined });
      
      try {
        const response = await fetch(integrations.people_research_webhook_url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

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
        updateCompanyProgress(companyId, { step: 'error', error: error.message });
        toast.error(`Failed: ${error.message}`);
      }
    }

    if (stepToRetry === 'clay') {
      updateCompanyProgress(companyId, { step: 'clay', error: undefined });
      
      try {
        if (!integrations.clay_webhook_url) {
          updateCompanyProgress(companyId, { step: 'complete' });
          toast.success(`Skipped Clay (not configured) - ${company.name} complete`);
          return;
        }

        const response = await fetch(integrations.clay_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error(`Clay enrichment failed: ${response.status}`);
        
        updateCompanyProgress(companyId, { step: 'complete' });
        toast.success(`Clay enrichment complete for ${company.name}`);
      } catch (error: any) {
        updateCompanyProgress(companyId, { step: 'error', error: error.message });
        toast.error(`Failed: ${error.message}`);
      }
    }
  }, [companies, selectedCampaign, integrations, updateCompanyProgress]);

  // Process companies sequentially through the 3 webhooks
  const processCompanies = useCallback(async () => {
    if (isProcessingRef.current || !isRunning) return;
    isProcessingRef.current = true;

    const selectedCompanies = companies.filter(c => c.selected);

    for (let i = 0; i < selectedCompanies.length; i++) {
      const company = selectedCompanies[i];
      const payload = buildCompanyPayload(selectedCampaign, company);

      setResearchProgress({
        currentCompanyIndex: i,
        currentCompany: company.name,
      });

      // Step 1: Company Research
      setResearchProgress({ currentStep: 'company' });
      updateCompanyProgress(company.id, { step: 'company' });

      try {
        const companyResponse = await fetch(integrations.company_research_webhook_url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!companyResponse.ok) {
          throw new Error(`Company research failed: ${companyResponse.status}`);
        }

        // Handle empty or non-JSON responses
        const responseText = await companyResponse.text();
        let companyData = null;
        if (responseText && responseText.trim()) {
          try {
            companyData = JSON.parse(responseText);
          } catch (e) {
            console.warn('Company response is not valid JSON:', responseText.substring(0, 100));
          }
        }
        
        const parsedCompanyData = companyData ? parseAIResponse(companyData) as CompanyResearchResult : null;
        
        updateCompanyProgress(company.id, { 
          step: 'people',
          companyData: parsedCompanyData || undefined,
        });

        // Auto-expand current company to show results
        setExpandedCompanies(prev => new Set(prev).add(company.id));

      } catch (error: any) {
        console.error('Company research error:', error);
        updateCompanyProgress(company.id, { 
          step: 'error',
          error: error.message,
        });
        continue; // Skip to next company
      }

      // Step 2: People Research
      setResearchProgress({ currentStep: 'people' });
      
      try {
        const peopleResponse = await fetch(integrations.people_research_webhook_url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!peopleResponse.ok) {
          throw new Error(`People research failed: ${peopleResponse.status}`);
        }

        // Handle empty or non-JSON responses
        const peopleText = await peopleResponse.text();
        let peopleData = null;
        if (peopleText && peopleText.trim()) {
          try {
            peopleData = JSON.parse(peopleText);
          } catch (e) {
            console.warn('People response is not valid JSON:', peopleText.substring(0, 100));
          }
        }
        
        const parsedPeopleData = peopleData ? parseAIResponse(peopleData) as PeopleResearchResult : null;
        
        updateCompanyProgress(company.id, { 
          step: 'clay',
          peopleData: parsedPeopleData || undefined,
        });

      } catch (error: any) {
        console.error('People research error:', error);
        updateCompanyProgress(company.id, { 
          step: 'error',
          error: error.message,
        });
        continue;
      }

      // Step 3: Clay Enrichment (if configured)
      if (integrations.clay_webhook_url) {
        setResearchProgress({ currentStep: 'clay' });
        
        try {
          const clayResponse = await fetch(integrations.clay_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!clayResponse.ok) {
            console.warn('Clay enrichment failed, continuing without enrichment');
          }
        } catch (error: any) {
          console.warn('Clay enrichment error:', error);
          // Don't fail the whole process for Clay errors
        }
      }

      // Mark as complete
      updateCompanyProgress(company.id, { step: 'complete' });
    }

    // All done
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
    const steps = ['company', 'people', 'clay', 'complete'];
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
