import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Linkedin, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Prospect {
  id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  priority: string | null;
  priority_reason: string | null;
  pitch_type: string | null;
  sent_to_clay: boolean;
  sent_to_clay_at: string | null;
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
      const unsent = prospects.filter(p => !p.sent_to_clay).map(p => p.id);
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
    switch (priority) {
      case 'High':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Low':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
      default:
        return '';
    }
  };

  const unsentCount = prospects.filter(p => !p.sent_to_clay).length;
  const allUnsent = prospects.filter(p => !p.sent_to_clay);
  const allSelected = allUnsent.length > 0 && allUnsent.every(p => selectedIds.has(p.id));

  // Filter prospects based on showUnsentOnly toggle
  const filteredProspects = showUnsentOnly
    ? prospects.filter(p => !p.sent_to_clay)
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
            {unsentCount > 0 && (
              <Badge variant="outline">{unsentCount} unsent</Badge>
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
            Show unsent only
          </label>
          {unsentCount > 0 && !showUnsentOnly && (
            <span className="text-xs text-muted-foreground ml-auto">
              (All {prospects.length} shown)
            </span>
          )}
        </div>

        {/* Select All */}
        {unsentCount > 0 && !showUnsentOnly && (
          <div className="flex items-center gap-2 mb-4 pb-3 border-b">
            <Checkbox
              checked={allSelected}
              onCheckedChange={handleSelectAll}
              id="select-all"
            />
            <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">
              Select all unsent ({unsentCount})
            </label>
          </div>
        )}

        {/* Prospects List */}
        <div className="space-y-3">
          {filteredProspects.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              {showUnsentOnly ? 'All prospects have been sent to Clay' : 'No prospects found'}
            </p>
          )}
          {filteredProspects.map((prospect) => {
            const isSending = sendingIds.has(prospect.id);
            const fullName = `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() || 'Unknown';
            
            return (
              <div 
                key={prospect.id} 
                className={`p-4 border rounded-lg transition-colors ${
                  prospect.sent_to_clay 
                    ? 'bg-muted/30 opacity-75' 
                    : 'bg-card hover:bg-muted/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  {!prospect.sent_to_clay && (
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
                      {prospect.pitch_type && (
                        <Badge variant="outline" className="text-xs">
                          {prospect.pitch_type}
                        </Badge>
                      )}
                      {prospect.sent_to_clay && (
                        <Badge variant="default" className="bg-green-600 text-white">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Sent to Clay
                        </Badge>
                      )}
                    </div>

                    {/* Job Title */}
                    {prospect.job_title && (
                      <p className="text-sm text-muted-foreground mb-2">{prospect.job_title}</p>
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
                    {/* LinkedIn Link */}
                    {prospect.linkedin_url && (
                      <a
                        href={prospect.linkedin_url.startsWith('http') ? prospect.linkedin_url : `https://${prospect.linkedin_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 flex items-center gap-1 text-sm"
                      >
                        <Linkedin className="h-4 w-4" />
                      </a>
                    )}
                    
                    {/* Send to Clay button */}
                    {!prospect.sent_to_clay && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendOne(prospect.id)}
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
      </CardContent>
    </Card>
  );
};
