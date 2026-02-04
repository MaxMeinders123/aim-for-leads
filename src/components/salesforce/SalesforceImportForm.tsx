import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, Database } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';

interface SalesforceImportFormProps {
  campaignId: string;
  onImportSuccess?: () => void;
}

export function SalesforceImportForm({ campaignId, onImportSuccess }: SalesforceImportFormProps) {
  const [salesforceCampaignId, setSalesforceCampaignId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAppStore();

  const handleImport = async () => {
    if (!salesforceCampaignId.trim()) {
      toast.error('Please enter a Salesforce Campaign ID');
      return;
    }

    if (!user?.id) {
      toast.error('Please log in to import companies');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'import-salesforce-campaign',
        {
          body: {
            salesforce_campaign_id: salesforceCampaignId.trim(),
            campaign_id: campaignId,
            user_id: user.id,
          },
        }
      );

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast.success(`✅ Imported ${data.imported_count} companies from Salesforce`);
      onImportSuccess?.();
      setSalesforceCampaignId('');
    } catch (err: any) {
      console.error('Salesforce import error:', err);
      toast.error(err.message || 'Failed to import from Salesforce');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Import from Salesforce Campaign
        </CardTitle>
        <CardDescription>
          Enter your Salesforce Campaign ID to import accounts as companies for research.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="sf-campaign-id" className="sr-only">Salesforce Campaign ID</Label>
            <Input
              id="sf-campaign-id"
              placeholder="e.g., 701xyz789"
              value={salesforceCampaignId}
              onChange={(e) => setSalesforceCampaignId(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <Button onClick={handleImport} disabled={isLoading || !salesforceCampaignId.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Note: Make sure you have configured your Salesforce Import Webhook URL in Settings.
        </p>
      </CardContent>
    </Card>
  );
}
