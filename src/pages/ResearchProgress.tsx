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
    // Handle the nested structure from n8n
    if (responseData?.output?.[0]?.content?.[0]?.text) {
      const text = responseData.output[0].content[0].text;
      return JSON.parse(text);
    }
    // Direct JSON response
    if (typeof responseData === 'object') {
      return responseData;
    }
    // Try parsing as string
    return JSON.parse(responseData);
  } catch (e) {
    console.error('Failed to parse AI response:', e);
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

        const companyData = await companyResponse.json();
        const parsedCompanyData = parseAIResponse(companyData) as CompanyResearchResult;
        
        updateCompanyProgress(company.id, { 
          step: 'people',
          companyData: parsedCompanyData,
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

        const peopleData = await peopleResponse.json();
        const parsedPeopleData = parseAIResponse(peopleData) as PeopleResearchResult;
        
        updateCompanyProgress(company.id, { 
          step: 'clay',
          peopleData: parsedPeopleData,
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
              />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
