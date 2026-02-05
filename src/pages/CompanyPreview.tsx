import { useNavigate } from 'react-router-dom';
import { Rocket, CheckCircle, Building2, Globe, Linkedin, Check } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useAppStore, Campaign, Company, CompanyResearchProgress } from '@/stores/appStore';
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

    // Check for required webhooks
    if (!integrations.company_research_webhook_url) {
      toast.error('Please configure Company Research Webhook in Settings');
      navigate('/settings');
      return;
    }

    if (!integrations.people_research_webhook_url) {
      toast.error('Please configure People Research Webhook in Settings');
      navigate('/settings');
      return;
    }

    const selectedCompanies = companies.filter((c) => c.selected);

    // Initialize research progress with all companies
    const companiesProgress: CompanyResearchProgress[] = selectedCompanies.map((company) => ({
      companyId: company.id,
      companyName: company.name,
      step: 'company' as const,
    }));

    setResearchProgress({
      isRunning: true,
      currentCompanyIndex: 0,
      totalCompanies: selectedCompanies.length,
      currentCompany: selectedCompanies[0]?.name || '',
      currentStep: 'company',
      companiesProgress,
    });

    // Navigate to research page - the actual webhook calls happen there
    navigate('/research');
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
            {companies.map((company) => {
              const isSelected = company.selected;

              return (
                <div
                  key={company.id}
                  onClick={() => toggleCompanySelection(company.id)}
                  className={cn(
                    'relative p-5 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md',
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {/* Selection Checkbox */}
                  <div className="absolute top-3 right-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleCompanySelection(company.id)}
                      className={cn(
                        'border-2',
                        isSelected && 'border-primary'
                      )}
                    />
                  </div>

                  {/* Company Icon */}
                  <div className={cn(
                    'w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors',
                    isSelected ? 'bg-primary/10' : 'bg-muted'
                  )}>
                    <Building2 className={cn(
                      'w-6 h-6 transition-colors',
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  </div>

                  {/* Company Name */}
                  <h3 className="font-semibold text-lg text-foreground mb-3 pr-8 line-clamp-2">
                    {company.name}
                  </h3>

                  {/* Company Details */}
                  <div className="space-y-2.5">
                    {/* Website */}
                    {company.website && (
                      <div className="flex items-start gap-2.5">
                        <Globe className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <a
                          href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-primary hover:underline break-all line-clamp-1"
                        >
                          {company.website.replace(/^https?:\/\/(www\.)?/, '')}
                        </a>
                      </div>
                    )}

                    {/* LinkedIn */}
                    {company.linkedin_url && (
                      <div className="flex items-start gap-2.5">
                        <Linkedin className="w-4 h-4 text-[#0A66C2] mt-0.5 flex-shrink-0" />
                        <a
                          href={company.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-[#0A66C2] hover:underline break-all line-clamp-1"
                        >
                          LinkedIn Profile
                        </a>
                      </div>
                    )}

                    {/* Salesforce Badge */}
                    {company.salesforce_account_id && (
                      <Badge variant="outline" className="text-xs">
                        <span className="text-[#00A1E0]">●</span>
                        <span className="ml-1">Salesforce</span>
                      </Badge>
                    )}
                  </div>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute bottom-3 right-3">
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {companies.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No companies added yet</p>
                <p className="text-sm mb-4">Add companies to your campaign to start research</p>
                <Button
                  onClick={() => navigate('/add-companies')}
                  className="mt-2"
                >
                  Add Companies
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
