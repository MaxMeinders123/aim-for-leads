import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, RefreshCw, Users, Mail, ChevronDown, Copy, ExternalLink, Cloud, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAppStore } from '@/stores/appStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function Results() {
  const navigate = useNavigate();
  const {
    contacts,
    toggleContactSelection,
    selectAllContacts,
    deselectAllContacts,
    integrations,
    resetCampaignDraft,
    setSelectedCampaign,
    setCampaignStep,
  } = useAppStore();

  const selectedCount = contacts.filter((c) => c.selected).length;
  const emailCount = contacts.filter((c) => c.email).length;
  const enrichedPercent = contacts.length > 0
    ? Math.round((emailCount / contacts.length) * 100)
    : 0;

  const [sendingToSalesforce, setSendingToSalesforce] = useState<string | null>(null);

  // Group contacts by company
  const contactsByCompany = useMemo(() => {
    const grouped: Record<string, typeof contacts> = {};
    contacts.forEach((contact) => {
      const company = contact.company_name || 'Unknown Company';
      if (!grouped[company]) grouped[company] = [];
      grouped[company].push(contact);
    });
    return grouped;
  }, [contacts]);

  const companyCount = Object.keys(contactsByCompany).length;

  const handleExport = () => {
    const selectedContacts = contacts.filter((c) => c.selected);
    if (selectedContacts.length === 0) {
      toast.error('Please select contacts to export');
      return;
    }

    const headers = ['Name', 'Title', 'Company', 'Email', 'Phone', 'LinkedIn', 'Priority'];
    const rows = selectedContacts.map((c) => [
      c.name,
      c.title || '',
      c.company_name || '',
      c.email || '',
      c.phone || '',
      c.linkedin_url || '',
      c.priority,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts.csv';
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${selectedContacts.length} contacts`);
  };

  const handleSyncSF = async () => {
    if (!integrations.clay_webhook_url) {
      toast.error('Please configure Clay Webhook URL in Settings');
      navigate('/settings');
      return;
    }

    const selectedContacts = contacts.filter((c) => c.selected);
    if (selectedContacts.length === 0) {
      toast.error('Please select contacts to sync');
      return;
    }

    try {
      const response = await fetch(integrations.clay_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'send_to_clay',
          contacts: selectedContacts,
        }),
      });

      if (!response.ok) throw new Error('Failed to send to Clay');
      toast.success(`Sent ${selectedContacts.length} contacts to Clay`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to sync');
    }
  };

  const handleStartNew = () => {
    resetCampaignDraft();
    setSelectedCampaign(null);
    setCampaignStep(0);
    navigate('/campaigns');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleAddToSalesforce = async (contact: typeof contacts[0]) => {
    if (!integrations.salesforce_webhook_url) {
      toast.error('Please configure Salesforce Webhook URL in Settings');
      navigate('/settings');
      return;
    }

    setSendingToSalesforce(contact.id);
    try {
      const response = await fetch(integrations.salesforce_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'add_to_salesforce',
          contact: {
            name: contact.name,
            title: contact.title,
            company_name: contact.company_name,
            email: contact.email,
            phone: contact.phone,
            linkedin_url: contact.linkedin_url,
            priority: contact.priority,
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to send to Salesforce');
      toast.success(`Added ${contact.name} to Salesforce`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to add to Salesforce');
    } finally {
      setSendingToSalesforce(null);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700';
      case 'medium':
        return 'bg-amber-100 text-amber-700';
      case 'low':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title="Results"
          subtitle={`${contacts.length} contacts found`}
          backTo="/company-preview"
          actions={
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExport}
              className="rounded-lg"
            >
              <Download className="w-5 h-5" />
            </Button>
          }
        />

        <div className="flex-1 overflow-auto px-6 py-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6 max-w-2xl">
            <div className="p-4 rounded-xl border border-green-200 bg-green-50">
              <div className="flex items-center gap-2 text-green-700 mb-1">
                <Users className="w-4 h-4" />
                <span className="text-sm font-medium">Contacts</span>
              </div>
              <p className="text-2xl font-bold text-green-800">{contacts.length}</p>
              <p className="text-sm text-green-600">{companyCount} companies</p>
            </div>
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50">
              <div className="flex items-center gap-2 text-blue-700 mb-1">
                <Mail className="w-4 h-4" />
                <span className="text-sm font-medium">Emails</span>
              </div>
              <p className="text-2xl font-bold text-blue-800">{emailCount}</p>
              <p className="text-sm text-blue-600">{enrichedPercent}% enriched</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mb-6 max-w-2xl">
            <Button variant="outline" onClick={selectAllContacts} className="flex-1 rounded-lg">
              Select All
            </Button>
            <Button variant="outline" onClick={deselectAllContacts} className="flex-1 rounded-lg">
              Deselect
            </Button>
          </div>

          {/* Contacts by Company */}
          <div className="space-y-3 max-w-2xl">
            {Object.entries(contactsByCompany).map(([companyName, companyContacts]) => (
              <Collapsible key={companyName} defaultOpen>
                <CollapsibleTrigger className="w-full p-4 rounded-xl border border-border bg-muted/30 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-foreground">{companyName}</span>
                    <span className="text-sm text-muted-foreground">
                      {companyContacts.length} contacts
                    </span>
                  </div>
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2 pl-4">
                  {companyContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className={cn(
                        'p-4 rounded-xl border flex items-start gap-4',
                        contact.selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border'
                      )}
                    >
                      <Checkbox
                        checked={contact.selected}
                        onCheckedChange={() => toggleContactSelection(contact.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground">{contact.name}</span>
                          <Badge className={cn('text-xs', getPriorityColor(contact.priority))}>
                            {contact.priority}
                          </Badge>
                        </div>
                        {contact.title && (
                          <p className="text-sm text-muted-foreground mb-2">{contact.title}</p>
                        )}
                        <div className="flex flex-wrap gap-3 text-sm">
                          {contact.email && (
                            <button
                              onClick={() => copyToClipboard(contact.email!)}
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              <Mail className="w-3 h-3" />
                              {contact.email}
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                          {contact.linkedin_url && (
                            <a
                              href={contact.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              LinkedIn
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleAddToSalesforce(contact)}
                        disabled={sendingToSalesforce === contact.id}
                        className="shrink-0 h-9 w-9 rounded-lg hover:bg-blue-50 hover:border-blue-300"
                        title="Add to Salesforce"
                      >
                        {sendingToSalesforce === contact.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Cloud className="w-4 h-4 text-blue-600" />
                        )}
                      </Button>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}

            {contacts.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p>No contacts found yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border space-y-3">
          <div className="flex gap-3">
            <Button
              onClick={handleExport}
              variant="outline"
              className="flex-1 h-12 rounded-xl"
            >
              <Download className="w-5 h-5 mr-2" />
              Export ({selectedCount})
            </Button>
            <Button
              onClick={handleSyncSF}
              className="flex-1 h-12 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              Sync SF
            </Button>
          </div>
          <button
            onClick={handleStartNew}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Start New Research
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
