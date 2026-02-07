import { useState } from 'react';
import { 
  ChevronDown, 
  Building2, 
  ExternalLink, 
  Send, 
  Loader2, 
  RefreshCw, 
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ArrowUpRight,
  Cloud,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { StatusBadge } from './StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Prospect {
  id: string;
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
}

interface ResearchedCompany {
  id: string;
  company_domain: string;
  company_name: string | null;
  company_status: string | null;
  acquired_by: string | null;
  cloud_provider: string | null;
  cloud_confidence: number | null;
  status: string;
}

interface ResearchedCompanyCardProps {
  company: ResearchedCompany;
  prospects: Prospect[];
  onReResearch: (companyId: string) => void;
  onProspectsUpdated: () => void;
  isReResearching?: boolean;
}

export function ResearchedCompanyCard({
  company,
  prospects,
  onReResearch,
  onProspectsUpdated,
  isReResearching = false,
}: ResearchedCompanyCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [selectedProspects, setSelectedProspects] = useState<Set<string>>(new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [isSendingSelected, setIsSendingSelected] = useState(false);

  const isProcessing = company.status === 'processing';
  
  // Get status display
  const getStatusDisplay = () => {
    switch (company.company_status?.toLowerCase()) {
      case 'operating':
        return { icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-700 border-emerald-200', label: 'Operating' };
      case 'acquired':
        return { icon: ArrowUpRight, className: 'bg-sky-500/10 text-sky-700 border-sky-200', label: 'Acquired' };
      case 'renamed':
        return { icon: ArrowUpRight, className: 'bg-amber-500/10 text-amber-700 border-amber-200', label: 'Renamed' };
      case 'bankrupt':
        return { icon: XCircle, className: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Bankrupt' };
      case 'not_found':
        return { icon: HelpCircle, className: '', label: 'Not Found' };
      default:
        return { icon: AlertTriangle, className: '', label: company.company_status || 'Unknown' };
    }
  };

  const statusDisplay = getStatusDisplay();
  const StatusIcon = statusDisplay.icon;

  const pendingProspects = prospects.filter(p => !p.status || p.status === 'pending');

  const toggleProspectSelection = (id: string) => {
    setSelectedProspects(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllPending = () => {
    setSelectedProspects(new Set(pendingProspects.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedProspects(new Set());
  };

  const handleSendToClay = async (prospectId: string) => {
    setSendingIds(prev => new Set(prev).add(prospectId));
    
    try {
      const { data, error } = await supabase.functions.invoke('send-prospect-to-clay', {
        body: { prospect_ids: [prospectId] },
      });

      if (error) throw error;

      if (data.sent > 0) {
        toast.success('Prospect sent to Clay');
        onProspectsUpdated();
      } else if (data.failed > 0) {
        toast.error(data.results?.[0]?.error || 'Failed to send to Clay');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send to Clay');
    } finally {
      setSendingIds(prev => {
        const next = new Set(prev);
        next.delete(prospectId);
        return next;
      });
    }
  };

  const handleSendSelectedToClay = async () => {
    if (selectedProspects.size === 0) return;
    
    setIsSendingSelected(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-prospect-to-clay', {
        body: { prospect_ids: Array.from(selectedProspects) },
      });

      if (error) throw error;

      toast.success(`Sent ${data.sent} prospect(s) to Clay`);
      setSelectedProspects(new Set());
      onProspectsUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send to Clay');
    } finally {
      setIsSendingSelected(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedProspects.size === 0) return;
    
    setIsDeletingSelected(true);
    try {
      const { error } = await supabase
        .from('prospect_research')
        .delete()
        .in('id', Array.from(selectedProspects));

      if (error) throw error;

      toast.success(`Deleted ${selectedProspects.size} prospect(s)`);
      setSelectedProspects(new Set());
      onProspectsUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete prospects');
    } finally {
      setIsDeletingSelected(false);
    }
  };

  const getPriorityClass = (priority: string | null) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'medium':
        return 'bg-amber-500/10 text-amber-700 border-amber-200';
      case 'low':
        return 'bg-muted text-muted-foreground';
      default:
        return '';
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger className="w-full px-4 py-3.5 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-4">
            <ChevronDown className={cn("w-4 h-4 transition-transform shrink-0", isExpanded && "rotate-180")} />
            
            <div className="flex-1 min-w-0 text-left">
              <p className="font-medium text-foreground truncate">
                {company.company_name || company.company_domain}
              </p>
              <p className="text-sm text-muted-foreground truncate">{company.company_domain}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Company Status */}
              {isProcessing ? (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Processing
                </Badge>
              ) : (
                <Badge variant="outline" className={cn("flex items-center gap-1", statusDisplay.className)}>
                  <StatusIcon className="w-3 h-3" />
                  {statusDisplay.label}
                </Badge>
              )}
              
              {company.acquired_by && (
                <span className="text-xs text-muted-foreground">by {company.acquired_by}</span>
              )}
              
              {company.cloud_provider && (
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  <Cloud className="w-3 h-3" />
                  {company.cloud_provider}
                </Badge>
              )}

              {/* Prospect count */}
              <Badge variant="secondary" className="text-xs">
                {prospects.length} prospects
              </Badge>

              {/* Re-research button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onReResearch(company.id);
                }}
                disabled={isReResearching}
                className="h-8"
              >
                {isReResearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 py-3">
            {/* Bulk actions */}
            {pendingProspects.length > 0 && (
              <div className="flex items-center gap-2 mb-4 pb-3 border-b">
                <Button variant="outline" size="sm" onClick={selectAllPending}>
                  Select All Pending ({pendingProspects.length})
                </Button>
                {selectedProspects.size > 0 && (
                  <>
                    <Button variant="outline" size="sm" onClick={deselectAll}>
                      Deselect
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSendSelectedToClay}
                      disabled={isSendingSelected}
                    >
                      {isSendingSelected ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-1" />
                      )}
                      Send to Clay ({selectedProspects.size})
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteSelected}
                      disabled={isDeletingSelected}
                    >
                      {isDeletingSelected ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-1" />
                      )}
                      Delete ({selectedProspects.size})
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Prospects list */}
            {prospects.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No prospects found</p>
            ) : (
              <div className="space-y-2">
                {prospects.map((prospect) => {
                  const isSending = sendingIds.has(prospect.id);
                  const isSelected = selectedProspects.has(prospect.id);
                  const isPending = !prospect.status || prospect.status === 'pending';
                  const fullName = `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() || 'Unknown';

                  return (
                    <div
                      key={prospect.id}
                      className={cn(
                        "p-3 border rounded-lg transition-colors",
                        isSelected && "border-primary bg-primary/5",
                        prospect.status === 'inputted' && "bg-emerald-50/50 dark:bg-emerald-900/10",
                        prospect.status === 'duplicate' && "bg-amber-50/50 dark:bg-amber-900/10"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {isPending && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleProspectSelection(prospect.id)}
                            className="mt-1"
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium">{fullName}</span>
                            {prospect.priority && (
                              <Badge variant="outline" className={cn("text-xs", getPriorityClass(prospect.priority))}>
                                {prospect.priority}
                              </Badge>
                            )}
                            <StatusBadge status={prospect.status} />
                          </div>

                          {prospect.job_title && (
                            <p className="text-sm text-muted-foreground mb-1">{prospect.job_title}</p>
                          )}

                          {prospect.priority_reason && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{prospect.priority_reason}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {prospect.linkedin_url && (
                            <a
                              href={prospect.linkedin_url.startsWith('http') ? prospect.linkedin_url : `https://${prospect.linkedin_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}

                          {prospect.salesforce_url && (
                            <a
                              href={prospect.salesforce_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Badge variant="outline" className="gap-1 text-xs">
                                <ExternalLink className="h-3 w-3" />
                                SF
                              </Badge>
                            </a>
                          )}

                          {isPending && !prospect.sent_to_clay && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendToClay(prospect.id)}
                              disabled={isSending}
                            >
                              {isSending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
