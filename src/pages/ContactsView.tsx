import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  Building2,
  ExternalLink,
  Send,
  Loader2,
  Search,
  Download,
  Users,
  Check,
  Filter,
  Plus,
  AlertTriangle,
  UserX,
  Undo2,
  Pencil,
  X,
  UserPlus,
  AlertCircle,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert';
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import {
  sendProspectToClay,
  sendBulkToClay,
  fetchCompanyResearch,
  fetchProspectResearch,
  exportProspectsToCSV,
  addProspectToSalesforceCampaign,
} from '@/services/api';
import { CLAY_STATUSES } from '@/lib/constants';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { validateLinkedInUrl } from '@/lib/validation';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useRateLimit } from '@/hooks/useThrottle';
import { PageErrorBoundary } from '@/components/ErrorBoundary';

interface ProspectRow {
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
  sent_to_clay: boolean;
  sent_to_clay_at: string | null;
  salesforce_url: string | null;
  company_name?: string;
}

interface CompanyGroup {
  companyId: string;
  companyName: string;
  companyDomain: string;
  companyStatus?: string | null;
  cloudProvider?: string | null;
  acquiredBy?: string | null;
  prospects: ProspectRow[];
  sentCount: number;
  unsentCount: number;
}

function ContactsViewPage() {
  const navigate = useNavigate();
  const { campaignId } = useParams<{ campaignId: string }>();
  const { user, campaigns, selectedCampaign, setSelectedCampaign } = useAppStore();

  const [companyGroups, setCompanyGroups] = useState<CompanyGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [sendingGroupIds, setSendingGroupIds] = useState<Set<string>>(new Set());
  const [editingLinkedinId, setEditingLinkedinId] = useState<string | null>(null);
  const [linkedinInput, setLinkedinInput] = useState('');
  const refreshTimeoutRef = useRef<number | null>(null);
  const [addingToCampaign, setAddingToCampaign] = useState<Record<string, boolean>>({});
  const [addedToCampaign, setAddedToCampaign] = useState<Record<string, boolean>>({});
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState<string | null>(null);

  // LinkedIn verification dialog state
  const [linkedinCheckDialog, setLinkedinCheckDialog] = useState<{
    open: boolean;
    prospectId: string;
    prospectName: string;
    linkedinUrl: string | null;
  }>({ open: false, prospectId: '', prospectName: '', linkedinUrl: null });

  // Not working prospects section
  const [showNotWorking, setShowNotWorking] = useState(false);
  const [notWorkingProspects, setNotWorkingProspects] = useState<ProspectRow[]>([]);

  // Set campaign from URL
  useEffect(() => {
    if (campaignId && campaigns.length > 0) {
      const c = campaigns.find((c) => c.id === campaignId);
      if (c) setSelectedCampaign(c);
    }
  }, [campaignId, campaigns, setSelectedCampaign]);

  const loadData = useCallback(async () => {
    if (!user?.id || !campaignId) return;
    try {
      const research = await fetchCompanyResearch(campaignId, user.id);
      if (research.length === 0) {
        setCompanyGroups([]);
        setNotWorkingProspects([]);
        setIsLoading(false);
        return;
      }

      const crIds = research.map((r) => r.id);
      const prospects = await fetchProspectResearch(crIds);

      // Separate not_working prospects
      const working = prospects.filter((p) => p.status !== 'not_working');
      const notWorking = prospects.filter((p) => p.status === 'not_working');

      // Add company_name to not_working prospects
      const notWorkingWithNames = notWorking.map((p) => {
        const cr = research.find((r) => r.id === p.company_research_id);
        return { ...p, company_name: cr?.company_name || cr?.company_domain || 'Unknown' };
      });
      setNotWorkingProspects(notWorkingWithNames);

      // Group by normalized company domain to avoid duplicate company accordions
      const groupsByDomain = new Map<string, CompanyGroup>();

      research.forEach((cr) => {
        const companyProspects = working.filter((p) => p.company_research_id === cr.id);
        if (companyProspects.length === 0) {
          return;
        }

        const normalizedDomain = cr.company_domain.toLowerCase();
        const existingGroup = groupsByDomain.get(normalizedDomain);

        const normalizedProspects = companyProspects.map((p) => ({
          ...p,
          company_name: cr.company_name || cr.company_domain,
        }));

        if (!existingGroup) {
          groupsByDomain.set(normalizedDomain, {
            companyId: cr.id,
            companyName: cr.company_name || cr.company_domain,
            companyDomain: cr.company_domain,
            companyStatus: cr.company_status,
            cloudProvider: cr.cloud_provider,
            acquiredBy: cr.acquired_by,
            prospects: normalizedProspects,
            sentCount: normalizedProspects.filter((p) => p.sent_to_clay).length,
            unsentCount: normalizedProspects.filter((p) => !p.sent_to_clay).length,
          });
          return;
        }

        existingGroup.prospects = [...existingGroup.prospects, ...normalizedProspects];
        existingGroup.sentCount = existingGroup.prospects.filter((p) => p.sent_to_clay).length;
        existingGroup.unsentCount = existingGroup.prospects.filter((p) => !p.sent_to_clay).length;
      });

      const groups = Array.from(groupsByDomain.values());

      // Only show companies with prospects
      setCompanyGroups(groups.filter((g) => g.prospects.length > 0));

      // Auto-expand first company only when nothing is expanded yet
      setExpandedCompanies((prev) => {
        if (prev.size > 0 || groups.length === 0) {
          return prev;
        }
        return new Set([groups[0].companyId]);
      });
    } catch (err: unknown) {
      logger.error('Failed to load contacts view data', err);
      toast.error('Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch n8n webhook URL for "Add to Campaign"
  useEffect(() => {
    const fetchN8nUrl = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('user_integrations')
        .select('n8n_webhook_url')
        .eq('user_id', user.id)
        .single();
      setN8nWebhookUrl(data?.n8n_webhook_url || null);
    };
    fetchN8nUrl();
  }, [user?.id]);

  // Realtime subscription with proper cleanup (fixes memory leak)
  useRealtimeSubscription('contacts-view-rt', {
    table: 'prospect_research',
    event: '*',
    filter: user?.id ? `user_id=eq.${user.id}` : undefined,
    callback: () => loadData(),
    debounceMs: 300,
  });

  const toggleCompany = (id: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Open LinkedIn check dialog before sending to Clay
  const promptLinkedinCheck = (prospect: ProspectRow) => {
    const fullName = `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() || 'Unknown';
    setLinkedinCheckDialog({
      open: true,
      prospectId: prospect.id,
      prospectName: fullName,
      linkedinUrl: prospect.linkedin_url,
    });
  };

  const handleConfirmWorksThere = async () => {
    const prospectId = linkedinCheckDialog.prospectId;
    const dialogData = { ...linkedinCheckDialog };
    setLinkedinCheckDialog({ open: false, prospectId: '', prospectName: '', linkedinUrl: null });

    // Log positive feedback for AI improvement
    const prospect = companyGroups
      .flatMap((g) => g.prospects.map((p) => ({ ...p, companyName: g.companyName, companyDomain: g.companyDomain })))
      .find((p) => p.id === prospectId);

    if (user?.id && prospect) {
      supabase
        .from('research_feedback')
        .insert({
          user_id: user.id,
          prospect_research_id: prospectId,
          company_research_id: prospect.company_research_id,
          campaign_id: campaignId || null,
          feedback_type: 'confirmed_working',
          prospect_name: dialogData.prospectName,
          prospect_title: prospect.job_title,
          company_name: prospect.companyName,
          company_domain: prospect.companyDomain,
          linkedin_url: prospect.linkedin_url,
        })
        .then(({ error }) => {
          if (error) logger.error('Failed to log positive feedback', error);
        });
    }

    await actualSendToClay(prospectId);
  };

  const handleConfirmNotWorking = async () => {
    const prospectId = linkedinCheckDialog.prospectId;
    const dialogData = { ...linkedinCheckDialog };
    setLinkedinCheckDialog({ open: false, prospectId: '', prospectName: '', linkedinUrl: null });

    try {
      // Find the prospect to get context for feedback
      const prospect = companyGroups
        .flatMap((g) => g.prospects.map((p) => ({ ...p, companyName: g.companyName, companyDomain: g.companyDomain })))
        .find((p) => p.id === prospectId);

      // Update status to not_working
      const { error } = await supabase
        .from('prospect_research')
        .update({ status: 'not_working' })
        .eq('id', prospectId);

      if (error) throw error;

      // Log feedback for AI improvement
      if (user?.id && prospect) {
        await supabase
          .from('research_feedback')
          .insert({
            user_id: user.id,
            prospect_research_id: prospectId,
            company_research_id: prospect.company_research_id,
            campaign_id: campaignId || null,
            feedback_type: 'not_working',
            prospect_name: dialogData.prospectName,
            prospect_title: prospect.job_title,
            company_name: prospect.companyName,
            company_domain: prospect.companyDomain,
            linkedin_url: prospect.linkedin_url,
          });
      }

      toast.success('Prospect marked as no longer at company — feedback logged for AI improvement');
      await loadData();
    } catch (err: unknown) {
      logger.error('Failed to mark prospect as not working', { prospectId, err });
      toast.error('Failed to update prospect status');
    }
  };

  const handleRestoreProspect = async (prospectId: string) => {
    try {
      const { error } = await supabase
        .from('prospect_research')
        .update({ status: 'pending' })
        .eq('id', prospectId);

      if (error) throw error;
      toast.success('Prospect restored');
      await loadData();
    } catch (err: unknown) {
      logger.error('Failed to restore prospect', { prospectId, err });
      toast.error('Failed to restore prospect');
    }
  };

  const handleMarkAsWrongContact = async (prospect: ProspectRow, companyName: string, companyDomain: string) => {
    try {
      const fullName = `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() || 'Unknown';

      // Update status to not_working
      const { error } = await supabase
        .from('prospect_research')
        .update({ status: 'not_working' })
        .eq('id', prospect.id);

      if (error) throw error;

      // Log feedback for AI improvement
      if (user?.id) {
        await supabase
          .from('research_feedback')
          .insert({
            user_id: user.id,
            prospect_research_id: prospect.id,
            company_research_id: prospect.company_research_id,
            campaign_id: campaignId || null,
            feedback_type: 'not_working',
            prospect_name: fullName,
            prospect_title: prospect.job_title,
            company_name: companyName,
            company_domain: companyDomain,
            linkedin_url: prospect.linkedin_url,
          });
      }

      toast.success('Marked as wrong contact — feedback logged for AI improvement');
      await loadData();
    } catch (err: unknown) {
      logger.error('Failed to mark as wrong contact', { prospectId: prospect.id, err });
      toast.error('Failed to mark as wrong contact');
    }
  };

  const actualSendToClay = async (prospectId: string) => {
    if (!user?.id) return;
    setSendingIds((prev) => new Set(prev).add(prospectId));
    try {
      const result = await sendProspectToClay(prospectId, user.id);
      if (result.sent > 0) {
        toast.success('Prospect sent to Clay. Waiting for Clay feedback...');
        await loadData();
      } else {
        toast.error(result.results?.[0]?.error || 'Failed to send to Clay');
      }
    } catch (err: unknown) {
      logger.error('Failed to send single prospect to Clay', { prospectId, err });
      toast.error(err instanceof Error ? err.message : 'Failed to send to Clay');
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(prospectId);
        return next;
      });
    }
  };

  // Add prospect to Salesforce Campaign via n8n webhook
  const handleAddToSalesforceCampaign = async (prospect: ProspectRow) => {
    try {
      setAddingToCampaign(prev => ({ ...prev, [prospect.id]: true }));

      if (!n8nWebhookUrl) {
        toast.error('n8n webhook not configured. Go to Settings to add your n8n webhook URL.');
        return;
      }

      if (!prospect.salesforce_url) {
        toast.error('No Salesforce contact URL found. Enrich this prospect with Clay first.');
        return;
      }

      // Get full prospect data including sf_dupe_id and sf_new_id
      const { data: prospectData } = await supabase
        .from('prospect_research')
        .select('salesforce_account_id, salesforce_campaign_id, personal_id, sf_dupe_id, sf_new_id')
        .eq('id', prospect.id)
        .single();

      const sfAccountId = prospectData?.salesforce_account_id;
      const sfCampaignId = prospectData?.salesforce_campaign_id;

      if (!sfAccountId || !sfCampaignId) {
        toast.error('Prospect missing Salesforce Account ID or Campaign ID. These should come from the research pipeline.');
        return;
      }

      // Use sf_new_id (new contact) or sf_dupe_id (existing merged contact) as the contact identifier
      const sfContactId = prospectData?.sf_new_id || prospectData?.sf_dupe_id;
      if (!sfContactId) {
        toast.error('No Salesforce Contact ID found. Clay must return sf_new_id or sf_dupe_id first.');
        return;
      }

      const payload = {
        personal_id: prospectData?.personal_id || prospect.id,
        session_id: null,
        salesforce_contact_id: sfContactId,
        salesforce_campaign_id: sfCampaignId,
        sf_dupe_id: prospectData?.sf_dupe_id || null,
        sf_new_id: prospectData?.sf_new_id || null,
        prospect_name: `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim(),
        prospect_title: prospect.job_title,
        company_name: prospect.company_name || null,
        linkedin_url: prospect.linkedin_url,
        email: prospect.email,
        phone: prospect.phone,
      };

      await addProspectToSalesforceCampaign(n8nWebhookUrl, payload);
      toast.success(`Added ${payload.prospect_name} to Salesforce campaign`);
      setAddedToCampaign(prev => ({ ...prev, [prospect.id]: true }));
    } catch (error: any) {
      logger.error('Failed to add to Salesforce campaign', { prospectId: prospect.id, error });
      toast.error(error.message || 'Failed to add to Salesforce campaign');
    } finally {
      setAddingToCampaign(prev => ({ ...prev, [prospect.id]: false }));
    }
  };

  // Send All is disabled — must check each individually
  // (kept for reference but not used)

  // Filter
  const filteredGroups = companyGroups
    .map((group) => {
      const filtered = group.prospects.filter((p) => {
        const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
        const matchesSearch =
          !searchTerm ||
          name.includes(searchTerm.toLowerCase()) ||
          group.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.job_title?.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'unsent' && !p.sent_to_clay) ||
          (statusFilter === 'sent' && p.sent_to_clay);

        return matchesSearch && matchesStatus;
      });
      return { ...group, prospects: filtered };
    })
    .filter((g) => g.prospects.length > 0);

  const handleExportCSV = () => {
    const visibleProspects = filteredGroups.flatMap((g) =>
      g.prospects.map((p) => ({ ...p, company_name: g.companyName })),
    );

    if (visibleProspects.length === 0) {
      toast.error('No visible prospects to export');
      return;
    }

    exportProspectsToCSV(visibleProspects, `prospects-${selectedCampaign?.name || campaignId}`);
    toast.success(`Exported ${visibleProspects.length} visible prospects to CSV`);
  };

  // Stats (based on current filters)
  const totalProspects = filteredGroups.reduce((sum, g) => sum + g.prospects.length, 0);
  const sentCount = filteredGroups.reduce(
    (sum, g) => sum + g.prospects.filter((p) => p.sent_to_clay).length,
    0,
  );
  const unsentCount = totalProspects - sentCount;


  const getClayStatusMeta = (status: string | null, sentToClay: boolean) => {
    if (status === 'new') {
      return { label: 'New in Salesforce', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', tooltip: 'This contact has been added as a new record in Salesforce' };
    }
    if (status === 'update') {
      return { label: 'Updated in Salesforce', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', tooltip: 'This contact already existed in Salesforce and has been updated' };
    }
    if (status === CLAY_STATUSES.DUPLICATE) {
      return { label: 'Duplicate in Salesforce', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', tooltip: 'This contact was already in Salesforce' };
    }
    if (status === CLAY_STATUSES.INPUTTED) {
      return { label: 'Added to Salesforce', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', tooltip: 'Successfully added to Salesforce' };
    }
    if (status === CLAY_STATUSES.FAILED || status === 'fail') {
      return { label: 'Clay failed', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', tooltip: 'Clay enrichment failed for this contact' };
    }
    if (status === CLAY_STATUSES.SENT || status === CLAY_STATUSES.PENDING || sentToClay) {
      return { label: 'Waiting for Clay feedback', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', tooltip: 'Sent to Clay, waiting for enrichment results' };
    }
    return { label: 'Not sent', className: 'bg-muted text-muted-foreground', tooltip: 'Not yet sent to Clay for enrichment' };
  };

  const handleSaveLinkedin = async (prospectId: string) => {
    const url = linkedinInput.trim();
    if (!url) { toast.error('Please enter a LinkedIn URL'); return; }
    try {
      const { error } = await supabase
        .from('prospect_research')
        .update({ linkedin_url: url })
        .eq('id', prospectId);
      if (error) throw error;
      toast.success('LinkedIn URL saved');
      setEditingLinkedinId(null);
      setLinkedinInput('');
      await loadData();
    } catch (err: unknown) {
      logger.error('Error saving LinkedIn URL', err);
      toast.error('Failed to save LinkedIn URL');
    }
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
      default: return '';
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title="Contacts"
          subtitle={selectedCampaign ? selectedCampaign.name : undefined}
          backTo="/campaigns"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExportCSV} disabled={totalProspects === 0}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={() => navigate(`/research/${campaignId}`)}>
                <Plus className="w-4 h-4 mr-2" />
                New Research
              </Button>
            </div>
          }
        />

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* How it works notice */}
          <Alert className="max-w-3xl border-blue-300 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-700">
            <Users className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm">
              <strong>How it works:</strong> When you run research on companies, AI-discovered prospects are automatically stored here.
              Review them, verify LinkedIn profiles, then send to Clay for email/phone enrichment.
            </AlertDescription>
          </Alert>

          {/* LinkedIn Beta Notice */}
          <Alert className="max-w-3xl border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-700">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-sm">
              <strong>LinkedIn verification (Beta):</strong> Our AI research finds prospects and their LinkedIn profiles, but this is still in beta.
              Please <strong>check each prospect's LinkedIn profile</strong> before sending to Clay to confirm they still work at the company.
              <span className="block mt-1 text-muted-foreground italic">
                Sorry for the extra manual step — we're working on automating this! 🙏
              </span>
            </AlertDescription>
          </Alert>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 max-w-2xl">
            <div className="bg-card border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{companyGroups.length}</p>
                  <p className="text-xs text-muted-foreground">Companies</p>
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
                  <p className="text-xs text-muted-foreground">Prospects</p>
                </div>
              </div>
            </div>
            <div className="bg-card border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Send className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {sentCount}<span className="text-sm font-normal text-muted-foreground">/{totalProspects}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Sent to Clay</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, company, or title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({totalProspects})</SelectItem>
                <SelectItem value="unsent">Not Sent ({unsentCount})</SelectItem>
                <SelectItem value="sent">Sent ({sentCount})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="space-y-4 max-w-3xl">
              {[1, 2].map((i) => (
                <div key={i} className="border rounded-lg p-5 space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <div className="space-y-2 pt-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && companyGroups.length === 0 && notWorkingProspects.length === 0 && (
            <div className="text-center py-16 max-w-md mx-auto">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No contacts yet</h3>
              <p className="text-muted-foreground mb-6">
                Run research on companies to discover prospects ready for outreach.
              </p>
              <Button onClick={() => navigate(campaignId ? `/companies/${campaignId}` : '/campaigns')}>
                <Plus className="w-4 h-4 mr-2" />
                Start Research
              </Button>
            </div>
          )}

          {/* Company Accordions */}
          {!isLoading && (
            <div className="space-y-4 max-w-3xl">
              {filteredGroups.map((group) => {
                const isExpanded = expandedCompanies.has(group.companyId);
                return (
                  <div key={group.companyId} className="border rounded-lg overflow-hidden bg-card">
                    {/* Accordion header */}
                    <button
                      onClick={() => toggleCompany(group.companyId)}
                      className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{group.companyName}</h3>
                            {group.companyStatus && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs',
                                  group.companyStatus === 'Operating' && 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400',
                                  group.companyStatus === 'Acquired' && 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400',
                                  group.companyStatus === 'Bankrupt' && 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400'
                                )}
                              >
                                {group.companyStatus === 'Acquired' && group.acquiredBy
                                  ? `Acquired by ${group.acquiredBy}`
                                  : group.companyStatus}
                              </Badge>
                            )}
                            {group.cloudProvider && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">
                                {group.cloudProvider}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {group.prospects.filter((p) => !p.sent_to_clay).length > 0 && (
                              <span>{group.prospects.filter((p) => !p.sent_to_clay).length} not sent</span>
                            )}
                            {group.prospects.some((p) => !p.sent_to_clay) &&
                              group.prospects.some((p) => p.sent_to_clay) &&
                              ' | '}
                            {group.prospects.filter((p) => p.sent_to_clay).length > 0 && (
                              <span className="text-green-600">
                                {group.prospects.filter((p) => p.sent_to_clay).length} sent to Clay
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-bold">{group.prospects.length}</span>
                        <span className="text-sm text-muted-foreground">prospects</span>
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </button>

                    {/* Accordion content */}
                    {isExpanded && (
                      <div className="border-t">
                        {/* Info: must check each individually */}
                        {group.prospects.some((p) => !p.sent_to_clay) && (
                          <div className="px-4 py-3 bg-muted/30 border-b flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
                            <span className="text-sm text-muted-foreground">
                              Please check each prospect's LinkedIn individually before sending to Clay
                            </span>
                          </div>
                        )}

                        <div className="divide-y">
                          {group.prospects.map((prospect) => {
                            const isSending = sendingIds.has(prospect.id);
                            const fullName = `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() || 'Unknown';
                            const isSent = prospect.sent_to_clay;

                            return (
                              <div
                                key={prospect.id}
                                className={cn(
                                  'p-4 transition-colors',
                                  isSent ? 'bg-green-50/50 dark:bg-green-900/5' : 'hover:bg-muted/30',
                                )}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                      <span className="font-medium">{fullName}</span>
                                      {prospect.priority && (
                                        <Badge className={getPriorityColor(prospect.priority)}>
                                          {prospect.priority}
                                        </Badge>
                                      )}
                                      {/* Clay Status Badge - improved messaging */}
                                      {(() => {
                                        const hasEnrichmentData = !!(prospect.email || prospect.phone);

                                        if (isSending) {
                                          return (
                                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              Sending to Clay...
                                            </Badge>
                                          );
                                        }

                                        if (hasEnrichmentData) {
                                          return (
                                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                              <Check className="h-3 w-3 mr-1" />
                                              Enriched by Clay
                                            </Badge>
                                          );
                                        }

                                        if (prospect.sent_to_clay) {
                                          return (
                                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              Awaiting Clay enrichment
                                            </Badge>
                                          );
                                        }

                                        // Show old status meta for other cases
                                        const statusMeta = getClayStatusMeta(prospect.status, prospect.sent_to_clay);
                                        return (
                                          <Badge
                                            className={statusMeta.className}
                                            title={statusMeta.tooltip}
                                          >
                                            {statusMeta.label}
                                          </Badge>
                                        );
                                      })()}
                                      {prospect.sent_to_clay && prospect.sent_to_clay_at && (prospect.email || prospect.phone) && (
                                        <Badge variant="outline" className="text-xs" title={`Sent on ${new Date(prospect.sent_to_clay_at).toLocaleString()}`}>
                                          Sent {new Date(prospect.sent_to_clay_at).toLocaleDateString()}
                                        </Badge>
                                      )}
                                      {prospect.pitch_type && (
                                        <Badge variant="outline" className="text-xs">{prospect.pitch_type}</Badge>
                                      )}
                                      {/* Salesforce CRM Link */}
                                      {prospect.salesforce_url && (
                                        <a
                                          href={prospect.salesforce_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title="View contact in Salesforce"
                                        >
                                          <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-primary/10 transition-colors">
                                            <ExternalLink className="h-3 w-3" />
                                            CRM
                                          </Badge>
                                        </a>
                                      )}
                                    </div>

                                    {prospect.job_title && (
                                      <p className="text-sm text-muted-foreground mb-1">{prospect.job_title}</p>
                                    )}

                                    {prospect.linkedin_url ? (
                                      <a
                                        href={prospect.linkedin_url.startsWith('http') ? prospect.linkedin_url : `https://${prospect.linkedin_url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-primary hover:underline flex items-center gap-1 mb-1"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        {prospect.linkedin_url.replace(/^https?:\/\/(www\.)?/, '')}
                                      </a>
                                    ) : editingLinkedinId === prospect.id ? (
                                      <div className="flex items-center gap-1 mb-1">
                                        <Input
                                          value={linkedinInput}
                                          onChange={(e) => setLinkedinInput(e.target.value)}
                                          placeholder="linkedin.com/in/..."
                                          className="h-7 text-xs w-52"
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveLinkedin(prospect.id);
                                            if (e.key === 'Escape') { setEditingLinkedinId(null); setLinkedinInput(''); }
                                          }}
                                          autoFocus
                                        />
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSaveLinkedin(prospect.id)}>
                                          <Check className="w-3 h-3" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingLinkedinId(null); setLinkedinInput(''); }}>
                                          <X className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <button
                                        className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mb-1 transition-colors"
                                        onClick={() => { setEditingLinkedinId(prospect.id); setLinkedinInput(''); }}
                                      >
                                        <Pencil className="w-3 h-3" />
                                        Add LinkedIn URL
                                      </button>
                                    )}

                                    {/* Show enrichment data after Clay */}
                                    {(prospect.email || prospect.phone) && (
                                      <div className="flex gap-4 text-sm mt-2">
                                        {prospect.email && (
                                          <span className="text-foreground">
                                            Email: <strong>{prospect.email}</strong>
                                          </span>
                                        )}
                                        {prospect.phone && (
                                          <span className="text-foreground">
                                            Phone: <strong>{prospect.phone}</strong>
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {prospect.priority_reason && (
                                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                                        {prospect.priority_reason}
                                      </p>
                                    )}
                                  </div>

                                  {/* Action buttons */}
                                  <div className="shrink-0 flex flex-col items-end gap-2">
                                    {/* Primary action row - Send to Clay */}
                                    <div className="flex items-center gap-2">
                                      {!isSent ? (
                                        <Button
                                          size="sm"
                                          variant="default"
                                          onClick={() => promptLinkedinCheck(prospect)}
                                          disabled={isSending}
                                          className="min-w-[140px]"
                                        >
                                          {isSending ? (
                                            <>
                                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                              Sending...
                                            </>
                                          ) : (
                                            <>
                                              <Send className="h-4 w-4 mr-2" />
                                              Send to Clay
                                            </>
                                          )}
                                        </Button>
                                      ) : (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => actualSendToClay(prospect.id)}
                                          disabled={isSending}
                                          className="min-w-[140px]"
                                        >
                                          {isSending ? (
                                            <>
                                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                              Sending...
                                            </>
                                          ) : (
                                            <>
                                              <Send className="h-4 w-4 mr-2" />
                                              Resend to Clay
                                            </>
                                          )}
                                        </Button>
                                      )}
                                    </div>

                                    {/* Secondary actions row - Salesforce & Remove */}
                                    <div className="flex items-center gap-3">
                                      {/* Add to Salesforce Campaign button */}
                                      {prospect.salesforce_url && n8nWebhookUrl && (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => handleAddToSalesforceCampaign(prospect)}
                                          disabled={addingToCampaign[prospect.id] || addedToCampaign[prospect.id]}
                                          className={cn(
                                            "h-8 px-3",
                                            addedToCampaign[prospect.id] && "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                                          )}
                                          title={
                                            addedToCampaign[prospect.id]
                                              ? "Added to Salesforce campaign"
                                              : "Add to Salesforce campaign"
                                          }
                                        >
                                          {addingToCampaign[prospect.id] ? (
                                            <>
                                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                              Adding...
                                            </>
                                          ) : addedToCampaign[prospect.id] ? (
                                            <>
                                              <Check className="h-4 w-4 mr-1" />
                                              Added to SF
                                            </>
                                          ) : (
                                            <>
                                              <UserPlus className="h-4 w-4 mr-1" />
                                              Add to SF
                                            </>
                                          )}
                                        </Button>
                                      )}

                                      {/* Remove/Wrong Contact button - separated */}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleMarkAsWrongContact(prospect, group.companyName, group.companyDomain)}
                                        className="h-8 px-3 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                        title="Mark as wrong contact / no longer works here"
                                      >
                                        <UserX className="h-4 w-4 mr-1" />
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Not Working Prospects Section */}
              {notWorkingProspects.length > 0 && (
                <div className="border rounded-lg overflow-hidden bg-card border-orange-200 dark:border-orange-800">
                  <button
                    onClick={() => setShowNotWorking(!showNotWorking)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-500/10">
                        <UserX className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-orange-700 dark:text-orange-400">No Longer at Company</h3>
                        <p className="text-sm text-muted-foreground">
                          {notWorkingProspects.length} prospect{notWorkingProspects.length !== 1 ? 's' : ''} marked as no longer working there
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold text-orange-600">{notWorkingProspects.length}</span>
                      {showNotWorking ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  {showNotWorking && (
                    <div className="border-t divide-y">
                      {notWorkingProspects.map((prospect) => {
                        const fullName = `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() || 'Unknown';
                        return (
                          <div key={prospect.id} className="p-4 bg-orange-50/30 dark:bg-orange-900/5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-medium text-muted-foreground line-through">{fullName}</span>
                                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                                    Not at company
                                  </Badge>
                                  {prospect.pitch_type && (
                                    <Badge variant="outline" className="text-xs">{prospect.pitch_type}</Badge>
                                  )}
                                </div>
                                {prospect.job_title && (
                                  <p className="text-sm text-muted-foreground">{prospect.job_title}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  Company: {prospect.company_name}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRestoreProspect(prospect.id)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Undo2 className="h-4 w-4 mr-1" />
                                Restore
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* LinkedIn Check Confirmation Dialog */}
      <Dialog
        open={linkedinCheckDialog.open}
        onOpenChange={(open) => {
          if (!open) setLinkedinCheckDialog({ open: false, prospectId: '', prospectName: '', linkedinUrl: null });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Have you checked their LinkedIn?
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <span className="block">
                Before sending <strong>{linkedinCheckDialog.prospectName}</strong> to Clay, please verify they still work at the company.
              </span>
              {linkedinCheckDialog.linkedinUrl && (
                <a
                  href={linkedinCheckDialog.linkedinUrl.startsWith('http') ? linkedinCheckDialog.linkedinUrl : `https://${linkedinCheckDialog.linkedinUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open LinkedIn Profile
                </a>
              )}
              <span className="block text-xs text-muted-foreground italic">
                Sorry for the extra step — LinkedIn verification is still in beta and we want to make sure you're sending the right people! 🙏
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="destructive"
              onClick={handleConfirmNotWorking}
              className="flex-1"
            >
              <UserX className="h-4 w-4 mr-2" />
              Doesn't work there
            </Button>
            <Button
              onClick={handleConfirmWorksThere}
              className="flex-1"
            >
              <Check className="h-4 w-4 mr-2" />
              Works there — Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// Wrap with error boundary to prevent crashes
export default function ContactsView() {
  return (
    <PageErrorBoundary>
      <ContactsViewPage />
    </PageErrorBoundary>
  );
}
