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
  AlertTriangle,
  XCircle,
  HelpCircle,
  ArrowUpRight,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAppStore, type Company, type CompanyResearchProgress } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { fetchCompanies, addManualCompany, importSalesforceCompanies, deleteMultipleCompanies } from '@/services/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ResearchedCompany {
  id: string;
  company_domain: string;
  company_name: string | null;
  company_status: string | null;
  acquired_by: string | null;
  cloud_provider: string | null;
  status: string;
}

export default function Companies() {
  const navigate = useNavigate();
  const { campaignId } = useParams<{ campaignId: string }>();
  const {
    companies,
    setCompanies,
    toggleCompanySelection,
    selectAllCompanies,
    deselectAllCompanies,
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
  const [showResearched, setShowResearched] = useState(true);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Set selected campaign from URL
  useEffect(() => {
    if (campaignId && campaigns.length > 0) {
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (campaign) setSelectedCampaign(campaign);
    }
  }, [campaignId, campaigns, setSelectedCampaign]);

  // Load companies and filter out completed research
  useEffect(() => {
    if (!campaignId) return;
    loadCompanies();
    loadCompletedResearch();
  }, [campaignId]);

  const loadCompletedResearch = useCallback(async () => {
    if (!campaignId || !user?.id) return;
    try {
      // Fetch company_research records for this campaign with full details
      const { data, error } = await supabase
        .from('company_research')
        .select('id, company_domain, company_name, company_status, acquired_by, cloud_provider, status')
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Set researched companies for display
      setResearchedCompanies(data || []);
      
      // Set domains for filtering (only completed ones)
      const completedRecords = data?.filter(r => r.status === 'completed') || [];
      const domains = new Set(completedRecords.map(r => r.company_domain.toLowerCase()));
      setCompletedDomains(domains);
    } catch (err) {
      console.error('Failed to load completed research:', err);
    }
  }, [campaignId, user?.id]);

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
    if (!manualName.trim()) {
      toast.error('Please enter a company name');
      return;
    }
    if (!campaignId || !user?.id) return;

    setIsAddingManual(true);
    try {
      const newCompany = await addManualCompany(user.id, campaignId, {
        name: manualName.trim(),
        website: manualWebsite.trim() || undefined,
        linkedin_url: manualLinkedin.trim() || undefined,
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

  // Helper to extract domain from website URL
  const getDomain = (website?: string) => {
    if (!website) return null;
    try {
      const url = website.startsWith('http') ? website : `https://${website}`;
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return website.toLowerCase();
    }
  };

  // Filter out companies that have completed research
  const pendingCompanies = companies.filter((c) => {
    const domain = getDomain(c.website);
    return !domain || !completedDomains.has(domain);
  });

  const selectedCount = pendingCompanies.filter((c) => c.selected).length;
  const completedCount = researchedCompanies.length;

  // Split companies by source for tab display
  const salesforceCompanies = pendingCompanies.filter((c) => c.salesforce_account_id);
  const manualCompanies = pendingCompanies.filter((c) => !c.salesforce_account_id);

  // Get company status icon and color
  const getStatusDisplay = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'operating':
        return { icon: CheckCircle, variant: 'default' as const, label: 'Operating', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' };
      case 'acquired':
        return { icon: ArrowUpRight, variant: 'secondary' as const, label: 'Acquired', className: 'bg-sky-500/10 text-sky-700 border-sky-200' };
      case 'renamed':
        return { icon: ArrowUpRight, variant: 'secondary' as const, label: 'Renamed', className: 'bg-amber-500/10 text-amber-700 border-amber-200' };
      case 'bankrupt':
        return { icon: XCircle, variant: 'destructive' as const, label: 'Bankrupt', className: 'bg-destructive/10 text-destructive border-destructive/20' };
      case 'not_found':
        return { icon: HelpCircle, variant: 'outline' as const, label: 'Not Found', className: '' };
      default:
        return { icon: AlertTriangle, variant: 'outline' as const, label: status || 'Unknown', className: '' };
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
        <CollapsibleContent className="mt-3">
          <div className="border rounded-lg overflow-hidden">
            <div className="divide-y">
              {researchedCompanies.map((company) => {
                const statusDisplay = getStatusDisplay(company.company_status);
                const StatusIcon = statusDisplay.icon;
                const isProcessing = company.status === 'processing';
                
                return (
                  <div
                    key={company.id}
                    onClick={() => navigate(`/contacts/${campaignId}`)}
                    className="flex items-center gap-4 px-4 py-3.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {company.company_name || company.company_domain}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{company.company_domain}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {isProcessing ? (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Processing
                        </Badge>
                      ) : (
                        <Badge variant={statusDisplay.variant} className={cn("flex items-center gap-1", statusDisplay.className)}>
                          <StatusIcon className="w-3 h-3" />
                          {statusDisplay.label}
                        </Badge>
                      )}
                      
                      {company.acquired_by && (
                        <span className="text-xs text-muted-foreground">
                          by {company.acquired_by}
                        </span>
                      )}
                      
                      {company.cloud_provider && (
                        <Badge variant="outline" className="text-xs">
                          {company.cloud_provider}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderCompanyTable = (companyList: Company[]) => {
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
            checked={companyList.every((c) => c.selected)}
            onCheckedChange={(checked) => {
              if (checked) selectAllCompanies();
              else deselectAllCompanies();
            }}
          />
          <span className="text-sm font-medium text-muted-foreground flex-1">
            {companyList.filter((c) => c.selected).length} of {companyList.length} selected
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
              onClick={() => toggleCompanySelection(company.id)}
              className={cn(
                'flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-colors',
                company.selected ? 'bg-primary/5' : 'hover:bg-muted/30',
              )}
            >
              <Checkbox
                checked={company.selected}
                onCheckedChange={() => toggleCompanySelection(company.id)}
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
    </AppLayout>
  );
}
