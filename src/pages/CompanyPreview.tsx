import { useNavigate } from 'react-router-dom';
import { Rocket, CheckCircle } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppStore, Campaign, Company } from '@/stores/appStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

export default function CompanyPreview() {
  const navigate = useNavigate();
  const {
    companies,
    toggleCompanySelection,
    selectAllCompanies,
    deselectAllCompanies,
    selectedCampaign,
    integrations,
    setResearchProgress,
  } = useAppStore();

  const selectedCount = companies.filter((c) => c.selected).length;

  const handleStartResearch = async () => {
    if (selectedCount === 0) {
      toast.error('Please select at least one company');
      return;
    }

    if (!integrations.n8n_webhook_url) {
      toast.error('Please configure n8n Webhook URL in Settings');
      navigate('/settings');
      return;
    }

    const selectedCompanies = companies.filter((c) => c.selected);

    // Initialize research progress
    setResearchProgress({
      isRunning: true,
      currentCompanyIndex: 0,
      totalCompanies: selectedCompanies.length,
      currentCompany: selectedCompanies[0]?.name || '',
      currentStep: 'company',
      completedCompanies: [],
    });

    try {
      // Send individual requests for each company with structured payload
      const requests = selectedCompanies.map((company) =>
        fetch(integrations.n8n_webhook_url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildCompanyPayload(selectedCampaign, company)),
        })
      );

      const responses = await Promise.all(requests);
      const failedCount = responses.filter((r) => !r.ok).length;

      if (failedCount > 0) {
        toast.warning(`${failedCount} of ${selectedCompanies.length} requests failed`);
      } else {
        toast.success('Research started!');
      }

      navigate('/research');
    } catch (error: any) {
      toast.error(error.message || 'Failed to start research');
      setResearchProgress({ isRunning: false });
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title="Review Companies"
          backTo="/add-companies"
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={selectAllCompanies}
                className="rounded-lg"
              >
                Select All
              </Button>
              <Button
                variant="outline"
                onClick={deselectAllCompanies}
                className="rounded-lg"
              >
                Deselect All
              </Button>
            </div>
          }
        />

        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="space-y-2 max-w-2xl">
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => toggleCompanySelection(company.id)}
                className={cn(
                  'w-full p-4 rounded-xl border-2 flex items-center gap-4 transition-all text-left',
                  company.selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <Checkbox
                  checked={company.selected}
                  onCheckedChange={() => toggleCompanySelection(company.id)}
                  className="w-5 h-5"
                />
                <div className="flex-1">
                  <p className="font-medium text-foreground">{company.name}</p>
                  {company.website && (
                    <p className="text-sm text-muted-foreground">{company.website}</p>
                  )}
                </div>
              </button>
            ))}

            {companies.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p>No companies loaded yet.</p>
                <Button
                  variant="link"
                  onClick={() => navigate('/add-companies')}
                  className="mt-2"
                >
                  Add companies
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          <div className="flex items-center justify-center gap-2 text-muted-foreground mb-3">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">{selectedCount} companies selected</span>
          </div>
          <Button
            onClick={handleStartResearch}
            disabled={selectedCount === 0}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-medium"
          >
            Start Research
            <Rocket className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
