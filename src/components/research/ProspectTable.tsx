import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Linkedin, Send, CheckCircle2, Loader2, ExternalLink, AlertTriangle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { StatusBadge } from './StatusBadge';

interface Prospect {
  id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  priority: string | null;
  priority_reason: string | null;
  pitch_type: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  salesforce_url?: string | null;
  sent_to_clay: boolean;
  sent_to_clay_at: string | null;
  raw_data?: {
    linkedin_validated?: boolean;
    linkedin_source?: string;
    [key: string]: unknown;
  } | null;
}

interface ProspectTableProps {
  prospects: Prospect[];
  onProspectUpdated?: () => void;
}

export const ProspectTable = ({ prospects, onProspectUpdated }: ProspectTableProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [showUnsentOnly, setShowUnsentOnly] = useState(false);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const unsent = prospects.filter(p => !p.sent_to_clay && p.status !== 'inputted' && p.status !== 'duplicate').map(p => p.id);
      setSelectedIds(new Set(unsent));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const sendToClay = async (prospectIds: string[]) => {
    const newSending = new Set(sendingIds);
    prospectIds.forEach(id => newSending.add(id));
    setSendingIds(newSending);

    try {
      const { data, error } = await supabase.functions.invoke('send-prospect-to-clay', {
        body: { prospect_ids: prospectIds },
      });

      if (error) throw error;

      if (data.sent > 0) {
        toast.success(`Sent ${data.sent} prospect(s) to Clay`);
        setSelectedIds(new Set());
        onProspectUpdated?.();
      }
      
      if (data.failed > 0) {
        toast.error(`Failed to send ${data.failed} prospect(s)`);
      }
    } catch (err: any) {
      console.error('Error sending to Clay:', err);
      toast.error(err.message || 'Failed to send to Clay');
    } finally {
      const cleared = new Set(sendingIds);
      prospectIds.forEach(id => cleared.delete(id));
      setSendingIds(cleared);
    }
  };

  const handleSendSelected = async () => {
    setIsBulkSending(true);
    await sendToClay(Array.from(selectedIds));
    setIsBulkSending(false);
  };

  const handleSendOne = async (id: string) => {
    await sendToClay([id]);
  };

  const getPriorityBadgeClass = (priority: string | null) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-destructive/10 text-destructive dark:bg-destructive/20';
      case 'medium':
        return 'bg-warning/10 text-warning-foreground dark:bg-warning/20';
      case 'low':
        return 'bg-muted text-muted-foreground';
      default:
        return '';
    }
  };

  // Count prospects that can be sent (pending status, not yet sent)
  const sendableCount = prospects.filter(p => 
    !p.sent_to_clay && 
    (!p.status || p.status === 'pending')
  ).length;

  const allSendable = prospects.filter(p => 
    !p.sent_to_clay && 
    (!p.status || p.status === 'pending')
  );
  const allSelected = allSendable.length > 0 && allSendable.every(p => selectedIds.has(p.id));

  // Filter prospects based on showUnsentOnly toggle
  const filteredProspects = showUnsentOnly
    ? prospects.filter(p => !p.sent_to_clay && (!p.status || p.status === 'pending'))
    : prospects;

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Prospects
            <Badge variant="secondary">{prospects.length} contacts</Badge>
            {sendableCount > 0 && (
              <Badge variant="outline">{sendableCount} pending</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                onClick={handleSendSelected}
                disabled={isBulkSending}
                size="sm"
              >
                {isBulkSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send {selectedIds.size} to Clay
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter Toggle */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b">
          <Checkbox
            checked={showUnsentOnly}
            onCheckedChange={(checked) => setShowUnsentOnly(checked as boolean)}
            id="show-unsent-only"
          />
          <label htmlFor="show-unsent-only" className="text-sm text-muted-foreground cursor-pointer">
            Show pending only
          </label>
          {sendableCount > 0 && !showUnsentOnly && (
            <span className="text-xs text-muted-foreground ml-auto">
              (All {prospects.length} shown)
            </span>
          )}
        </div>

        {/* Select All */}
        {sendableCount > 0 && !showUnsentOnly && (
          <div className="flex items-center gap-2 mb-4 pb-3 border-b">
            <Checkbox
              checked={allSelected}
              onCheckedChange={handleSelectAll}
              id="select-all"
            />
            <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">
              Select all pending ({sendableCount})
            </label>
          </div>
        )}

        {/* Prospects List */}
        <div className="space-y-3">
          {filteredProspects.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              {showUnsentOnly ? 'All prospects have been processed' : 'No prospects found'}
            </p>
          )}
          {filteredProspects.map((prospect) => {
            const isSending = sendingIds.has(prospect.id);
            const fullName = `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() || 'Unknown';
            const canBeSent = !prospect.sent_to_clay && (!prospect.status || prospect.status === 'pending');
            
            return (
              <div 
                key={prospect.id} 
                className={`p-4 border rounded-lg transition-colors ${
                  prospect.status === 'inputted' 
                    ? 'bg-accent/30 opacity-90' 
                    : prospect.status === 'duplicate'
                    ? 'bg-destructive/10 opacity-80'
                    : prospect.sent_to_clay
                    ? 'bg-muted/30 opacity-75'
                    : 'bg-card hover:bg-muted/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  {canBeSent && (
                    <Checkbox
                      checked={selectedIds.has(prospect.id)}
                      onCheckedChange={(checked) => handleSelectOne(prospect.id, checked as boolean)}
                      disabled={isSending}
                      className="mt-1"
                    />
                  )}
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Name and Priority */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium">{fullName}</span>
                      {prospect.priority && (
                        <Badge className={getPriorityBadgeClass(prospect.priority)}>
                          {prospect.priority}
                        </Badge>
                      )}
                      {/* Clay Status Badge - improved messaging */}
                      {(() => {
                        const hasEnrichmentData = !!(prospect.email || prospect.phone);

                        if (isSending) {
                          return (
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                              <span className="flex items-center gap-1">
                                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                </svg>
                                Sending to Clay...
                              </span>
                            </Badge>
                          );
                        }

                        if (hasEnrichmentData) {
                          return (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Enriched by Clay
                            </Badge>
                          );
                        }

                        if (prospect.sent_to_clay) {
                          return (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              <span className="flex items-center gap-1">
                                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                </svg>
                                Awaiting Clay enrichment
                              </span>
                            </Badge>
                          );
                        }

                        if (prospect.status) {
                          return <StatusBadge status={prospect.status} />;
                        }

                        return null;
                      })()}
                      {prospect.pitch_type && (
                        <Badge variant="outline" className="text-xs">
                          {prospect.pitch_type}
                        </Badge>
                      )}
                    </div>

                    {/* Job Title */}
                    {prospect.job_title && (
                      <p className="text-sm text-muted-foreground mb-2">{prospect.job_title}</p>
                    )}

                    {/* Contact Info (if enriched) */}
                    {(prospect.email || prospect.phone) && (
                      <div className="flex gap-4 text-sm text-muted-foreground mb-2">
                        {prospect.email && <span>{prospect.email}</span>}
                        {prospect.phone && <span>{prospect.phone}</span>}
                      </div>
                    )}

                    {/* Sent Timestamp */}
                    {prospect.sent_to_clay && prospect.sent_to_clay_at && (
                      <p className="text-xs text-muted-foreground">
                        Sent: {formatTimestamp(prospect.sent_to_clay_at)}
                      </p>
                    )}
                    
                    {/* Priority Reason */}
                    {prospect.priority_reason && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                        {prospect.priority_reason}
                      </p>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* LinkedIn Link with validation status */}
                    {prospect.linkedin_url && (
                      <a
                        href={prospect.linkedin_url.startsWith('http') ? prospect.linkedin_url : `https://${prospect.linkedin_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 flex items-center gap-1 text-sm"
                        title={
                          prospect.raw_data?.linkedin_validated
                            ? `Verified LinkedIn profile (source: ${prospect.raw_data?.linkedin_source || 'search'})`
                            : 'LinkedIn URL not verified - may need manual check'
                        }
                      >
                        <Linkedin className="h-4 w-4" />
                        {prospect.raw_data?.linkedin_validated === true ? (
                          <ShieldCheck className="h-3 w-3 text-green-500" />
                        ) : prospect.raw_data?.linkedin_validated === false ? (
                          <AlertTriangle className="h-3 w-3 text-yellow-500" />
                        ) : null}
                      </a>
                    )}

                    {/* CRM Link - show Salesforce URL from Clay webhook */}
                    {prospect.salesforce_url && (
                      <a
                        href={prospect.salesforce_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80"
                      >
                        <Badge variant="outline" className="gap-1 cursor-pointer">
                          <ExternalLink className="h-3 w-3" />
                          CRM Link
                        </Badge>
                      </a>
                    )}
                    
                    {/* Send to Clay button */}
                    {canBeSent && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleSendOne(prospect.id)}
                        disabled={isSending}
                        className="min-w-[130px]"
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
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
