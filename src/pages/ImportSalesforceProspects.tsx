import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, Users, ExternalLink, CheckCircle } from 'lucide-react';

interface ImportResult {
  prospectsImported: number;
  campaignId: string;
  campaignName: string;
}

export default function ImportSalesforceProspects() {
  const navigate = useNavigate();
  const [salesforceCampaignId, setSalesforceCampaignId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    if (!salesforceCampaignId.trim()) {
      toast.error('Please enter a Salesforce Campaign ID');
      return;
    }

    setIsLoading(true);
    setImportResult(null);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Please log in to import prospects');
      }

      const finalCampaignName = campaignName.trim() || `Salesforce Import - ${new Date().toLocaleString()}`;

      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          name: finalCampaignName,
          user_id: user.id,
        })
        .select()
        .single();

      if (campaignError) {
        throw new Error(`Failed to create campaign: ${campaignError.message}`);
      }

      const webhookResponse = await fetch('https://engagetech12.app.n8n.cloud/webhook/salesforce-campaign-prospects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_id: campaign.id,
          user_id: user.id,
          salesforce_campaign_id: salesforceCampaignId.trim(),
        }),
      });

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text();
        throw new Error(`Webhook failed: ${errorText}`);
      }

      const result = await webhookResponse.json();
      const prospectsCount = result.prospects_imported || result.count || 0;

      setImportResult({
        prospectsImported: prospectsCount,
        campaignId: campaign.id,
        campaignName: finalCampaignName,
      });

      toast.success(`Imported ${prospectsCount} prospects successfully`);
      setSalesforceCampaignId('');
      setCampaignName('');

    } catch (err: any) {
      console.error('Import error:', err);
      toast.error(err.message || 'Failed to import prospects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewProspects = () => {
    if (importResult?.campaignId) {
      navigate(`/research?campaign=${importResult.campaignId}`);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Import Salesforce Campaign Prospects"
        subtitle="Import contacts with 'Target Account' prospecting status from your Salesforce campaigns"
        backTo="/campaigns"
      />

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Import Prospects
            </CardTitle>
            <CardDescription>
              Enter your Salesforce Campaign ID to import prospects into your research pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sf-campaign-id">Salesforce Campaign ID *</Label>
              <Input
                id="sf-campaign-id"
                placeholder="701Q400000WQuVfIAL"
                value={salesforceCampaignId}
                onChange={(e) => setSalesforceCampaignId(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Enter the 18-character Salesforce Campaign ID
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign Name (Optional)</Label>
              <Input
                id="campaign-name"
                placeholder="Q4 Enterprise Outreach"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Optional: Give this import a name for tracking
              </p>
            </div>

            <Button
              onClick={handleImport}
              disabled={isLoading || !salesforceCampaignId.trim()}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Prospects
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {importResult && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <CheckCircle className="h-5 w-5" />
                Import Successful
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Prospects Imported</p>
                  <p className="text-2xl font-bold">{importResult.prospectsImported}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Campaign</p>
                  <p className="font-medium truncate">{importResult.campaignName}</p>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Campaign ID: {importResult.campaignId}
                </p>
                <Button onClick={handleViewProspects} variant="outline" className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Prospects
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
