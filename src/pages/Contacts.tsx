import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/stores/appStore';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { CompanyProspectCard } from '@/components/research/CompanyProspectCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Building2, Users, Loader2, FolderOpen, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CompanyResearch {
  id: string;
  company_name: string | null;
  company_domain: string;
  status: string;
  created_at: string;
  cloud_provider: string | null;
  campaign_id: string | null;
}

interface ProspectResearch {
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
  sent_to_clay_at: string | null;
}

interface CompanyWithProspects {
  company: {
    id: string;
    name: string;
    website: string | null;
    linkedin_url: string | null;
    salesforce_account_id: string | null;
  };
  prospects: ProspectResearch[];
  researchStatus: string;
  campaignId: string | null;
  campaignName: string | null;
}

interface CampaignGroup {
  campaignId: string | null;
  campaignName: string;
  companies: CompanyWithProspects[];
}

export default function Contacts() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [companies, setCompanies] = useState<CompanyWithProspects[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('campaign');
  const [campaigns, setCampaigns] = useState<Record<string, string>>({});

  const loadCompaniesWithProspects = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Load campaigns for mapping
      const { data: campaignsData, error: campaignsError } = await supabase
        .from('campaigns')
        .select('id, name')
        .eq('user_id', user.id);

      if (!campaignsError && campaignsData) {
        const campaignMap = campaignsData.reduce((acc, c) => {
          acc[c.id] = c.name;
          return acc;
        }, {} as Record<string, string>);
        setCampaigns(campaignMap);
      }

      // Load all company research records for the user
      const { data: companyResearch, error: companyError } = await supabase
        .from('company_research')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (companyError) throw companyError;

      if (!companyResearch || companyResearch.length === 0) {
        setCompanies([]);
        setIsLoading(false);
        return;
      }

      // Load all prospects for these companies in one query
      const companyIds = companyResearch.map(c => c.id);
      const { data: prospects, error: prospectError } = await supabase
        .from('prospect_research')
        .select('*')
        .in('company_research_id', companyIds)
        .order('created_at', { ascending: false });

      if (prospectError) throw prospectError;

      // Group company research records by domain (to handle duplicates)
      const companyByDomain = companyResearch.reduce((acc, cr) => {
        const domain = cr.company_domain.toLowerCase();
        // Keep only the most recent research for each domain
        if (!acc[domain] || new Date(cr.created_at) > new Date(acc[domain].created_at)) {
          acc[domain] = cr;
        }
        return acc;
      }, {} as Record<string, typeof companyResearch[0]>);

      // Get all company_research IDs for the same domain (to merge prospects)
      const domainToIds = companyResearch.reduce((acc, cr) => {
        const domain = cr.company_domain.toLowerCase();
        if (!acc[domain]) {
          acc[domain] = [];
        }
        acc[domain].push(cr.id);
        return acc;
      }, {} as Record<string, string[]>);

      // Group prospects by company domain (merging all prospects for the same company)
      const prospectsByDomain = (prospects || []).reduce((acc, prospect) => {
        const companyRec = companyResearch.find(cr => cr.id === prospect.company_research_id);
        if (companyRec) {
          const domain = companyRec.company_domain.toLowerCase();
          if (!acc[domain]) {
            acc[domain] = [];
          }
          // Only add if not already present (avoid duplicates within merged prospects)
          const isDuplicate = acc[domain].some(p =>
            p.first_name === prospect.first_name &&
            p.last_name === prospect.last_name &&
            p.linkedin_url === prospect.linkedin_url
          );
          if (!isDuplicate) {
            acc[domain].push(prospect);
          }
        }
        return acc;
      }, {} as Record<string, ProspectResearch[]>);

      // Build the combined data structure from unique domains
      const companiesWithProspects: CompanyWithProspects[] = Object.values(companyByDomain).map((cr) => {
        const domain = cr.company_domain.toLowerCase();
        return {
          company: {
            id: cr.id,
            name: cr.company_name || cr.company_domain,
            website: cr.company_domain,
            linkedin_url: null,
            salesforce_account_id: null,
          },
          prospects: prospectsByDomain[domain] || [],
          researchStatus: cr.status,
          campaignId: cr.campaign_id,
          campaignName: cr.campaign_id ? (campaigns[cr.campaign_id] || 'Unknown Campaign') : null,
        };
      });

      setCompanies(companiesWithProspects);
    } catch (error: any) {
      console.error('Error loading companies:', error);
      toast.error('Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Initial load
  useEffect(() => {
    loadCompaniesWithProspects();
  }, [loadCompaniesWithProspects]);

  // Real-time subscriptions
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('contacts-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_research',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadCompaniesWithProspects();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prospect_research',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadCompaniesWithProspects();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadCompaniesWithProspects]);

  // Filter companies based on active tab
  const filteredCompanies = companies.filter((item) => {
    const matchesSearch = searchTerm === '' ||
      item.company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.company.website?.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || item.researchStatus === statusFilter;

    const matchesTab = activeTab === 'campaign'
      ? item.campaignId !== null
      : item.campaignId === null;

    return matchesSearch && matchesStatus && matchesTab;
  });

  // Group companies by campaign for the campaign tab
  const campaignGroups: CampaignGroup[] = [];
  if (activeTab === 'campaign') {
    const groupMap = new Map<string, CompanyWithProspects[]>();

    filteredCompanies.forEach(company => {
      const key = company.campaignId || 'uncategorized';
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(company);
    });

    groupMap.forEach((companies, campaignId) => {
      const campaignName = campaignId === 'uncategorized'
        ? 'Uncategorized'
        : campaigns[campaignId] || 'Unknown Campaign';

      campaignGroups.push({
        campaignId: campaignId === 'uncategorized' ? null : campaignId,
        campaignName,
        companies,
      });
    });
  }

  // Calculate stats
  const totalCompanies = companies.length;
  const totalProspects = companies.reduce((sum, c) => sum + c.prospects.length, 0);
  const pendingProspects = companies.reduce(
    (sum, c) => sum + c.prospects.filter(p => !p.status || p.status === 'pending').length,
    0
  );

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title="Contacts"
          subtitle="Manage your researched companies and prospects"
          actions={
            <Button onClick={() => navigate('/research')}>
              <Plus className="w-4 h-4 mr-2" />
              Start Research
            </Button>
          }
        />

        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="campaign" className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Campaign List
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Manual List
                </TabsTrigger>
              </TabsList>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalCompanies}</p>
                    <p className="text-sm text-muted-foreground">Companies</p>
                  </div>
                </div>
              </div>
              <div className="bg-card border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalProspects}</p>
                    <p className="text-sm text-muted-foreground">Prospects</p>
                  </div>
                </div>
              </div>
              <div className="bg-card border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <Users className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{pendingProspects}</p>
                    <p className="text-sm text-muted-foreground">Pending</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tab Content */}
            <TabsContent value="campaign" className="mt-6 space-y-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : campaignGroups.length === 0 ? (
                <div className="text-center py-12 border rounded-lg bg-card">
                  <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    {searchTerm || statusFilter !== 'all' ? 'No matching companies in campaigns' : 'No campaign companies yet'}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {searchTerm || statusFilter !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'Companies researched through campaigns will appear here'}
                  </p>
                  {!searchTerm && statusFilter === 'all' && (
                    <Button onClick={() => navigate('/campaigns')}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Campaign
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  {campaignGroups.map((group) => (
                    <div key={group.campaignId || 'uncategorized'} className="space-y-4">
                      <div className="flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-10">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <FolderOpen className="h-5 w-5 text-primary" />
                            {group.campaignName}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {group.companies.length} {group.companies.length === 1 ? 'company' : 'companies'} · {' '}
                            {group.companies.reduce((sum, c) => sum + c.prospects.length, 0)} prospects
                          </p>
                        </div>
                      </div>
                      <div className="space-y-4 pl-4">
                        {group.companies.map((item) => (
                          <div key={item.company.id} className="relative">
                            {item.researchStatus !== 'completed' && (
                              <Badge
                                className={cn(
                                  'absolute -top-2 -right-2 z-10',
                                  item.researchStatus === 'processing'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                )}
                              >
                                {item.researchStatus}
                              </Badge>
                            )}
                            <CompanyProspectCard
                              company={item.company}
                              prospects={item.prospects}
                              onProspectUpdated={loadCompaniesWithProspects}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual" className="mt-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCompanies.length === 0 ? (
                <div className="text-center py-12 border rounded-lg bg-card">
                  <UserPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    {searchTerm || statusFilter !== 'all' ? 'No matching manually added companies' : 'No manually added companies yet'}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {searchTerm || statusFilter !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'Manually added companies and contacts will appear here'}
                  </p>
                  {!searchTerm && statusFilter === 'all' && (
                    <Button onClick={() => navigate('/research')}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Manually
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredCompanies.map((item) => (
                    <div key={item.company.id} className="relative">
                      {item.researchStatus !== 'completed' && (
                        <Badge
                          className={cn(
                            'absolute -top-2 -right-2 z-10',
                            item.researchStatus === 'processing'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          )}
                        >
                          {item.researchStatus}
                        </Badge>
                      )}
                      <CompanyProspectCard
                        company={item.company}
                        prospects={item.prospects}
                        onProspectUpdated={loadCompaniesWithProspects}
                      />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
