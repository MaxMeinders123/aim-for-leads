import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, Building2, ExternalLink, Send, Loader2, Pencil, Check, X } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
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
  email: string | null;
  phone: string | null;
  status: string | null;
  salesforce_url: string | null;
  sent_to_clay: boolean;
  sent_to_clay_at: string | null;
}

interface Company {
  id: string;
  name: string;
  website: string | null;
  linkedin_url: string | null;
  salesforce_account_id: string | null;
}

interface CompanyProspectCardProps {
  company: Company;
  prospects: Prospect[];
  onProspectUpdated?: () => void;
}

export function CompanyProspectCard({ company, prospects, onProspectUpdated }: CompanyProspectCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [editingLinkedinId, setEditingLinkedinId] = useState<string | null>(null);
  const [linkedinInput, setLinkedinInput] = useState('');

  const statusCounts = {
    pending: prospects.filter(p => p.status === 'pending' || !p.status).length,
    inputted: prospects.filter(p => p.status === 'inputted').length,
    duplicate: prospects.filter(p => p.status === 'duplicate').length,
    sent_to_clay: prospects.filter(p => p.status === 'sent_to_clay').length,
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
        onProspectUpdated?.();
      } else if (data.failed > 0) {
        toast.error(data.results?.[0]?.error || 'Failed to send to Clay');
      }
    } catch (err: any) {
      console.error('Error sending to Clay:', err);
      toast.error(err.message || 'Failed to send to Clay');
    } finally {
      setSendingIds(prev => {
        const next = new Set(prev);
        next.delete(prospectId);
        return next;
      });
    }
  };

  const handleSaveLinkedin = async (prospectId: string) => {
    const url = linkedinInput.trim();
    if (!url) {
      toast.error('Please enter a LinkedIn URL');
      return;
    }

    try {
      const { error } = await supabase
        .from('prospect_research')
        .update({ linkedin_url: url })
        .eq('id', prospectId);

      if (error) throw error;
      toast.success('LinkedIn URL saved');
      setEditingLinkedinId(null);
      setLinkedinInput('');
      onProspectUpdated?.();
    } catch (err: any) {
      console.error('Error saving LinkedIn URL:', err);
      toast.error('Failed to save LinkedIn URL');
    }
  };

  const getPriorityBadgeClass = (priority: string | null) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
      default:
        return '';
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{company.name}</h3>
              <p className="text-sm text-muted-foreground">{company.website}</p>
            </div>
            {company.salesforce_account_id && (
              <Badge variant="outline" className="ml-2">
                <ExternalLink className="h-3 w-3 mr-1" />
                SF Account
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-bold">{prospects.length}</p>
              <p className="text-xs text-muted-foreground">prospects</p>
            </div>
            
            {/* Status summary */}
            <div className="flex gap-1 items-center">
              {statusCounts.pending > 0 && (
                <Badge variant="outline" className="text-xs">{statusCounts.pending} pending</Badge>
              )}
              {statusCounts.inputted > 0 && (
                <Badge className="bg-green-100 text-green-800 text-xs">{statusCounts.inputted} inputted</Badge>
              )}
            </div>
            
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-3 border-t pt-4">
            {prospects.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No prospects found</p>
            ) : (
              prospects.map((prospect) => {
                const isSending = sendingIds.has(prospect.id);
                const fullName = `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() || 'Unknown';

                return (
                  <div 
                    key={prospect.id}
                    className={`p-4 border rounded-lg transition-colors ${
                      prospect.status === 'inputted' 
                        ? 'bg-green-50/50 dark:bg-green-900/10' 
                        : prospect.status === 'duplicate'
                        ? 'bg-orange-50/50 dark:bg-orange-900/10'
                        : 'bg-card hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Name and badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium">{fullName}</span>
                          {prospect.priority && (
                            <Badge className={getPriorityBadgeClass(prospect.priority)}>
                              {prospect.priority}
                            </Badge>
                          )}
                          <StatusBadge status={prospect.status} />
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

                        {/* Priority Reason */}
                        {prospect.priority_reason && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {prospect.priority_reason}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* LinkedIn Link or Edit */}
                        {prospect.linkedin_url ? (
                          <a
                            href={prospect.linkedin_url.startsWith('http') ? prospect.linkedin_url : `https://${prospect.linkedin_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : editingLinkedinId === prospect.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={linkedinInput}
                              onChange={(e) => setLinkedinInput(e.target.value)}
                              placeholder="linkedin.com/in/..."
                              className="h-7 text-xs w-44"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveLinkedin(prospect.id);
                                if (e.key === 'Escape') { setEditingLinkedinId(null); setLinkedinInput(''); }
                              }}
                              autoFocus
                            />
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSaveLinkedin(prospect.id)}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingLinkedinId(null); setLinkedinInput(''); }}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-muted-foreground gap-1"
                            onClick={() => { setEditingLinkedinId(prospect.id); setLinkedinInput(''); }}
                          >
                            <Pencil className="h-3 w-3" />
                            Add LinkedIn
                          </Button>
                        )}

                        {/* Salesforce Link - show if inputted/duplicate */}
                        {prospect.salesforce_url && (
                          <a
                            href={prospect.salesforce_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Badge variant="outline" className="gap-1">
                              <ExternalLink className="h-3 w-3" />
                              SF
                            </Badge>
                          </a>
                        )}

                        {/* Send to Clay button - show if pending */}
                        {(!prospect.status || prospect.status === 'pending') && !prospect.sent_to_clay && (
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
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
