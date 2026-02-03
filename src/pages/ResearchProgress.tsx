import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, Linkedin, Mail, Check, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const researchSteps = [
  { id: 'company', label: 'Company Research', icon: Building2 },
  { id: 'people', label: 'People Research', icon: Users },
  { id: 'linkedin', label: 'LinkedIn Check', icon: Linkedin },
  { id: 'enrich', label: 'Enrich Data', icon: Mail },
];

export default function ResearchProgress() {
  const navigate = useNavigate();
  const {
    researchProgress,
    setResearchProgress,
    companies,
    selectedCampaign,
    setContacts,
  } = useAppStore();

  const {
    isRunning,
    currentCompanyIndex,
    totalCompanies,
    currentCompany,
    currentStep,
    completedCompanies,
  } = researchProgress;

  const progressPercentage = totalCompanies > 0
    ? Math.round((currentCompanyIndex / totalCompanies) * 100)
    : 0;

  // Poll for results (webhook callback will update contacts in Supabase)
  useEffect(() => {
    if (!isRunning || !selectedCampaign) return;

    const pollInterval = setInterval(async () => {
      const { data: contactsData, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('campaign_id', selectedCampaign.id);

      if (error) return;

      if (contactsData && contactsData.length > 0) {
        // Research complete
        setContacts(contactsData.map((c) => ({ 
          ...c, 
          priority: c.priority as 'high' | 'medium' | 'low',
          selected: true 
        })));
        setResearchProgress({ isRunning: false });
        clearInterval(pollInterval);
        navigate('/results');
      }
    }, 5000);

    // Simulate progress for demo (in production, n8n would send progress updates)
    const steps: Array<'company' | 'people' | 'linkedin' | 'enrich'> = ['company', 'people', 'linkedin', 'enrich'];
    const progressInterval = setInterval(() => {
      const currentStepIndex = steps.indexOf(currentStep);
      
      if (currentStepIndex < steps.length - 1) {
        setResearchProgress({ currentStep: steps[currentStepIndex + 1] });
      } else if (currentCompanyIndex < totalCompanies - 1) {
        const selectedCompanies = companies.filter((c) => c.selected);
        const nextIndex = currentCompanyIndex + 1;
        setResearchProgress({
          currentStep: 'company',
          currentCompanyIndex: nextIndex,
          currentCompany: selectedCompanies[nextIndex]?.name || '',
          completedCompanies: [
            ...completedCompanies,
            {
              name: currentCompany,
              contactsFound: Math.floor(Math.random() * 5) + 1,
              contacts: [],
            },
          ],
        });
      }
    }, 2000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(progressInterval);
    };
  }, [isRunning, selectedCampaign, companies, navigate, setContacts, setResearchProgress, currentStep, currentCompanyIndex, totalCompanies, currentCompany, completedCompanies]);

  const handleStop = () => {
    setResearchProgress({ isRunning: false });
    navigate('/company-preview');
  };

  const getStepStatus = (stepId: string) => {
    const steps = ['company', 'people', 'linkedin', 'enrich'];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(stepId);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title="Researching..."
          subtitle={`${currentCompanyIndex + 1} of ${totalCompanies}`}
          actions={
            <Button variant="outline" onClick={handleStop} className="rounded-lg">
              Stop
            </Button>
          }
        />

        <div className="flex-1 overflow-auto px-6 py-6">
          {/* Progress Bar */}
          <div className="mb-8 max-w-2xl">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Progress</span>
              <span>{progressPercentage}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {/* Current Company */}
          <div className="mb-8 max-w-2xl">
            <h3 className="text-lg font-medium text-foreground mb-4">{currentCompany}</h3>
            <div className="flex gap-4">
              {researchSteps.map((step) => {
                const status = getStepStatus(step.id);
                return (
                  <div
                    key={step.id}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-full text-sm',
                      status === 'completed' && 'bg-green-100 text-green-700',
                      status === 'current' && 'bg-primary text-primary-foreground',
                      status === 'pending' && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {status === 'completed' ? (
                      <Check className="w-4 h-4" />
                    ) : status === 'current' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <step.icon className="w-4 h-4" />
                    )}
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Completed Companies */}
          <div className="space-y-2 max-w-2xl">
            {completedCompanies.map((company, index) => (
              <div
                key={index}
                className="p-4 rounded-xl border border-green-200 bg-green-50 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-foreground">{company.name}</span>
                </div>
                <span className="text-sm text-green-700">
                  {company.contactsFound} contacts found
                </span>
              </div>
            ))}

            {/* Current */}
            {isRunning && (
              <div className="p-4 rounded-xl border-2 border-primary bg-primary/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  <span className="font-medium text-foreground">{currentCompany}</span>
                </div>
                <span className="text-sm text-primary">Processing</span>
              </div>
            )}

            {/* Pending */}
            {companies
              .filter((c) => c.selected)
              .slice(currentCompanyIndex + 1)
              .map((company) => (
                <div
                  key={company.id}
                  className="p-4 rounded-xl border border-border bg-muted/30 flex items-center justify-between"
                >
                  <span className="font-medium text-muted-foreground">{company.name}</span>
                  <span className="text-sm text-muted-foreground">Pending...</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
