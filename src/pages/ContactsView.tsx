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
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import {
  sendProspectToClay,
  sendBulkToClay,
  fetchCompanyResearch,
  fetchProspectResearch,
  exportProspectsToCSV,
} from '@/services/api';
import { CLAY_STATUSES } from '@/lib/constants';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  prospects: ProspectRow[];
  sentCount: number;
  unsentCount: number;
}

export default function ContactsView() {
  const navigate = useNavigate();
  const { campaignId } = useParams<{ campaignId: string }>();
  const { user, campaigns, selectedCampaign, setSelectedCampaign } = useAppStore();

  const [companyGroups, setCompanyGroups] = useState<CompanyGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const refreshTimeoutRef = useRef<number | null>(null);

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
        setIsLoading(false);
        return;
      }

      const crIds = research.map((r) => r.id);
      const prospects = await fetchProspectResearch(crIds);

      // Group by company
      const groups: CompanyGroup[] = research.map((cr) => {
        const companyProspects = prospects.filter((p) => p.company_research_id === cr.id);
        return {
          companyId: cr.id,
          companyName: cr.company_name || cr.company_domain,
          companyDomain: cr.company_domain,
          prospects: companyProspects.map((p) => ({
            ...p,
            company_name: cr.company_name || cr.company_domain,
          })),
          sentCount: companyProspects.filter((p) => p.sent_to_clay).length,
          unsentCount: companyProspects.filter((p) => !p.sent_to_clay).length,
        };
      });

      // Only show companies with prospects
      setCompanyGroups(groups.filter((g) => g.prospects.length > 0));

      // Auto-expand first company
      if (groups.length > 0 && expandedCompanies.size === 0) {
        setExpandedCompanies(new Set([groups[0].companyId]));
      }
    } catch {
      toast.error('Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user?.id) return;
    const channel: RealtimeChannel = supabase
      .channel('contacts-view-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prospect_research', filter: `user_id=eq.${user.id}` },
        () => {
          if (refreshTimeoutRef.current) {
            window.clearTimeout(refreshTimeoutRef.current);
          }
          refreshTimeoutRef.current = window.setTimeout(() => {
            loadData();
            refreshTimeoutRef.current = null;
          }, 300);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [user?.id, loadData]);

  const toggleCompany = (id: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSendToClay = async (prospectId: string) => {
    if (!user?.id) return;
    setSendingIds((prev) => new Set(prev).add(prospectId));
    try {
      const result = await sendProspectToClay(prospectId, user.id);
      if (result.sent > 0) {
        toast.success('Prospect sent to Clay');
        await loadData();
      } else {
        toast.error(result.results?.[0]?.error || 'Failed to send to Clay');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send to Clay');
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(prospectId);
        return next;
      });
    }
  };

  const handleSendAllUnsent = async (group: CompanyGroup) => {
    if (!user?.id) return;
    const unsentIds = group.prospects.filter((p) => !p.sent_to_clay).map((p) => p.id);
    if (unsentIds.length === 0) return;

    unsentIds.forEach((id) => setSendingIds((prev) => new Set(prev).add(id)));
    try {
      const result = await sendBulkToClay(unsentIds, user.id);
      toast.success(`Sent ${result.sent} of ${unsentIds.length} prospects to Clay`);
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send to Clay');
    } finally {
      unsentIds.forEach((id) =>
        setSendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }),
      );
    }
  };

  const handleExportCSV = () => {
    const allProspects = companyGroups.flatMap((g) =>
      g.prospects.map((p) => ({ ...p, company_name: g.companyName })),
    );
    if (allProspects.length === 0) {
      toast.error('No prospects to export');
      return;
    }
    exportProspectsToCSV(allProspects, `prospects-${selectedCampaign?.name || campaignId}`);
    toast.success(`Exported ${allProspects.length} prospects to CSV`);
  };

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

  // Stats
  const totalProspects = companyGroups.reduce((sum, g) => sum + g.prospects.length, 0);
  const sentCount = companyGroups.reduce((sum, g) => sum + g.sentCount, 0);
  const unsentCount = companyGroups.reduce((sum, g) => sum + g.unsentCount, 0);

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
          {!isLoading && companyGroups.length === 0 && (
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
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{group.companyName}</h3>
                          <p className="text-sm text-muted-foreground">
                            {group.unsentCount > 0 && (
                              <span>{group.unsentCount} not sent</span>
                            )}
                            {group.unsentCount > 0 && group.sentCount > 0 && ' | '}
                            {group.sentCount > 0 && (
                              <span className="text-green-600">{group.sentCount} sent to Clay</span>
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
                        {/* Bulk send button */}
                        {group.unsentCount > 0 && (
                          <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              {group.unsentCount} prospect{group.unsentCount !== 1 ? 's' : ''} ready to send
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendAllUnsent(group)}
                            >
                              <Send className="w-4 h-4 mr-2" />
                              Send All Unsent to Clay
                            </Button>
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
                                      {isSent && (
                                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                          <Check className="w-3 h-3 text-white" />
                                        </div>
                                      )}
                                      {prospect.priority && (
                                        <Badge className={getPriorityColor(prospect.priority)}>
                                          {prospect.priority}
                                        </Badge>
                                      )}
                                      {prospect.pitch_type && (
                                        <Badge variant="outline" className="text-xs">{prospect.pitch_type}</Badge>
                                      )}
                                    </div>

                                    {prospect.job_title && (
                                      <p className="text-sm text-muted-foreground mb-1">{prospect.job_title}</p>
                                    )}

                                    {prospect.linkedin_url && (
                                      <a
                                        href={prospect.linkedin_url.startsWith('http') ? prospect.linkedin_url : `https://${prospect.linkedin_url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-primary hover:underline flex items-center gap-1 mb-1"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        {prospect.linkedin_url.replace(/^https?:\/\/(www\.)?/, '')}
                                      </a>
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

                                  {/* Send to Clay button */}
                                  <div className="shrink-0">
                                    {!isSent ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleSendToClay(prospect.id)}
                                        disabled={isSending}
                                      >
                                        {isSending ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <>
                                            <Send className="h-4 w-4 mr-1" />
                                            Send to Clay
                                          </>
                                        )}
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleSendToClay(prospect.id)}
                                        disabled={isSending}
                                        className="text-muted-foreground"
                                      >
                                        {isSending ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <>
                                            <Send className="h-4 w-4 mr-1" />
                                            Resend
                                          </>
                                        )}
                                      </Button>
                                    )}
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
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
