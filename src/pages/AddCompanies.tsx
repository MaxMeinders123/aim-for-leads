import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, FileText, Search, ArrowRight } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function AddCompanies() {
  const navigate = useNavigate();
  const {
    selectedCampaign,
    salesforceListId,
    setSalesforceListId,
    salesforceResult,
    setSalesforceResult,
    setCompanies,
    integrations,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState('salesforce');
  const [manualInput, setManualInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const parseManualInput = (input: string) => {
    const lines = input.split('\n').filter((line) => line.trim());
    return lines.map((line, index) => {
      const parts = line.split('|').map((p) => p.trim());
      return {
        id: `manual-${index}`,
        campaign_id: selectedCampaign?.id || '',
        name: parts[0] || line,
        website: parts[1] || undefined,
        linkedin_url: parts[2] || undefined,
        selected: true,
      };
    });
  };

  const handleSalesforceSearch = async () => {
    if (!salesforceListId.trim()) {
      toast.error('Please enter a Salesforce List ID');
      return;
    }

    if (!integrations.clay_webhook_url) {
      toast.error('Please configure Clay Webhook URL in Settings');
      navigate('/settings');
      return;
    }

    setIsSearching(true);
    try {
      // Call Clay webhook to lookup Salesforce list
      const response = await fetch(integrations.clay_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'salesforce_lookup',
          salesforce_list_id: salesforceListId,
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch from Clay');

      const data = await response.json();
      setSalesforceResult({
        name: data.list_name || 'Salesforce List',
        companyCount: data.companies?.length || 0,
        lastUpdated: data.last_updated,
      });

      // Store companies for loading
      if (data.companies) {
        const companies = data.companies.map((c: any, i: number) => ({
          id: c.id || `sf-${i}`,
          campaign_id: selectedCampaign?.id || '',
          name: c.name,
          website: c.website,
          linkedin_url: c.linkedin_url,
          selected: true,
        }));
        setCompanies(companies);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to search Salesforce list');
    } finally {
      setIsSearching(false);
    }
  };

  const handleLoadCompanies = () => {
    navigate('/company-preview');
  };

  const handlePreviewManual = () => {
    if (!manualInput.trim()) {
      toast.error('Please enter company names');
      return;
    }

    const companies = parseManualInput(manualInput);
    setCompanies(companies);
    navigate('/company-preview');
  };

  const manualCompanyCount = manualInput.split('\n').filter((l) => l.trim()).length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title="Add Companies"
          subtitle={selectedCampaign ? `${selectedCampaign.name} • ${selectedCampaign.product}` : undefined}
          backTo="/campaigns"
        />

        <div className="flex-1 overflow-auto px-6 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-2xl">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="salesforce" className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                Salesforce ID
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Manual Input
              </TabsTrigger>
            </TabsList>

            <TabsContent value="salesforce" className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="salesforceId">Salesforce List ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="salesforceId"
                    value={salesforceListId}
                    onChange={(e) => setSalesforceListId(e.target.value)}
                    placeholder="e.g. 00B5g00000ABC123"
                    className="h-12 rounded-xl flex-1"
                  />
                  <Button
                    onClick={handleSalesforceSearch}
                    disabled={isSearching}
                    className="h-12 px-6 rounded-xl"
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                    <Search className="w-4 h-4 ml-2" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Find this ID in Salesforce under Reports or List Views.
                </p>
              </div>

              {salesforceResult && (
                <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
                  <div>
                    <p className="font-medium text-foreground">{salesforceResult.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {salesforceResult.companyCount} companies
                      {salesforceResult.lastUpdated && ` · Updated ${salesforceResult.lastUpdated}`}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{salesforceListId}</p>
                  <Button
                    onClick={handleLoadCompanies}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                  >
                    Load Companies ({salesforceResult.companyCount})
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              )}

              {!integrations.clay_webhook_url && (
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800">
                  <p className="text-sm">
                    Clay Webhook URL is not configured. Please set it up in{' '}
                    <button
                      onClick={() => navigate('/settings')}
                      className="underline font-medium"
                    >
                      Settings
                    </button>
                    .
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="manualInput">Paste Company List</Label>
                <Textarea
                  id="manualInput"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder={`Company Name\nCompany | website.com\nCompany | site.com | linkedin.com/company/...`}
                  className="min-h-[200px] rounded-xl resize-none font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Format: Company Name / Company | website.com / Company | site.com | linkedin.com/...
                </p>
              </div>

              {manualCompanyCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  {manualCompanyCount} companies ready
                </p>
              )}

              <Button
                onClick={handlePreviewManual}
                disabled={!manualInput.trim()}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              >
                Preview Companies
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
