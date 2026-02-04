import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Settings() {
  const navigate = useNavigate();
  const { user, integrations, setIntegrations, setUser } = useAppStore();

  const [companyResearchUrl, setCompanyResearchUrl] = useState(integrations.company_research_webhook_url || '');
  const [peopleResearchUrl, setPeopleResearchUrl] = useState(integrations.people_research_webhook_url || '');
  const [clayUrl, setClayUrl] = useState(integrations.clay_webhook_url || '');
  const [salesforceUrl, setSalesforceUrl] = useState(integrations.salesforce_webhook_url || '');
  const [salesforceImportUrl, setSalesforceImportUrl] = useState(integrations.salesforce_import_webhook_url || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<'company' | 'people' | 'clay' | 'salesforce' | 'salesforce_import' | null>(null);

  const isN8nCloudUrl = (url?: string) => {
    if (!url) return false;
    try {
      const u = new URL(url);
      return u.hostname.endsWith('.app.n8n.cloud') || u.hostname.endsWith('.n8n.cloud');
    } catch {
      return false;
    }
  };

  // Load integrations from Supabase
  useEffect(() => {
    const loadIntegrations = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        // Support both new and legacy fields
        const companyUrl = data.company_research_webhook_url || data.n8n_webhook_url || '';
        const peopleUrl = data.people_research_webhook_url || '';
        
        setCompanyResearchUrl(companyUrl);
        setPeopleResearchUrl(peopleUrl);
        setClayUrl(data.clay_webhook_url || '');
        setSalesforceUrl(data.salesforce_webhook_url || '');
        setSalesforceImportUrl((data as any).salesforce_import_webhook_url || '');
        setIntegrations({
          company_research_webhook_url: companyUrl,
          people_research_webhook_url: peopleUrl,
          clay_webhook_url: data.clay_webhook_url || '',
          salesforce_webhook_url: data.salesforce_webhook_url || '',
          salesforce_import_webhook_url: (data as any).salesforce_import_webhook_url || '',
          n8n_webhook_url: data.n8n_webhook_url || '',
          dark_mode: data.dark_mode || false,
          sound_effects: data.sound_effects !== false,
        });
      }
    };

    loadIntegrations();
  }, [user, setIntegrations]);

  const handleSaveIntegrations = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('user_integrations')
        .update({
          company_research_webhook_url: companyResearchUrl || null,
          people_research_webhook_url: peopleResearchUrl || null,
          clay_webhook_url: clayUrl || null,
          salesforce_webhook_url: salesforceUrl || null,
          salesforce_import_webhook_url: salesforceImportUrl || null,
          dark_mode: integrations.dark_mode,
          sound_effects: integrations.sound_effects,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setIntegrations({
        company_research_webhook_url: companyResearchUrl,
        people_research_webhook_url: peopleResearchUrl,
        clay_webhook_url: clayUrl,
        salesforce_webhook_url: salesforceUrl,
        salesforce_import_webhook_url: salesforceImportUrl,
      });

      toast.success('Settings saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestWebhook = async (type: 'company' | 'people' | 'clay' | 'salesforce' | 'salesforce_import') => {
    const urlMap = {
      company: companyResearchUrl,
      people: peopleResearchUrl,
      clay: clayUrl,
      salesforce: salesforceUrl,
      salesforce_import: salesforceImportUrl,
    };
    const url = urlMap[type];
    
    if (!url) {
      toast.error(`Please enter a webhook URL`);
      return;
    }

    setIsTesting(type);
    try {
      const { data, error } = await supabase.functions.invoke('test-webhook', {
        body: { url },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message || 'Webhook returned an error');
      
      toast.success(`Webhook is working!`);
    } catch (error: any) {
      toast.error(`Test failed: ${error.message || 'Could not reach webhook'}`);
    } finally {
      setIsTesting(null);
    }
  };

  const handleDarkModeToggle = async (enabled: boolean) => {
    setIntegrations({ dark_mode: enabled });
    document.documentElement.classList.toggle('dark', enabled);

    if (user) {
      await supabase
        .from('user_integrations')
        .update({ dark_mode: enabled })
        .eq('user_id', user.id);
    }
  };

  const handleSoundToggle = async (enabled: boolean) => {
    setIntegrations({ sound_effects: enabled });

    if (user) {
      await supabase
        .from('user_integrations')
        .update({ sound_effects: enabled })
        .eq('user_id', user.id);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate('/');
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title="Settings"
          subtitle="Configure your workspace"
          backTo="/campaigns"
        />

        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="max-w-2xl space-y-8">
            {/* Profile */}
            <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30">
              <Avatar className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600">
                <AvatarFallback className="bg-transparent text-white text-xl font-medium">
                  {getInitials(user?.name, user?.email)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-foreground">{user?.name || 'User'}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <button className="text-sm text-primary hover:underline mt-1">
                  Edit Profile
                </button>
              </div>
            </div>

            {/* Research Webhooks */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Research Webhooks
              </h3>
              <p className="text-sm text-muted-foreground">
                Configure the 3-step research flow: Company → People → Clay
              </p>

              <div className="p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                  <Label htmlFor="companyUrl">Company Research Webhook (n8n)</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-8">Validates company status, finds cloud preference</p>
                <div className="flex gap-2">
                  <Input
                    id="companyUrl"
                    value={companyResearchUrl}
                    onChange={(e) => setCompanyResearchUrl(e.target.value)}
                    placeholder="https://n8n.example.com/webhook/company-research"
                    className="h-10 rounded-lg flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleTestWebhook('company')}
                    disabled={isTesting === 'company'}
                    className="rounded-lg px-6"
                  >
                    {isTesting === 'company' ? 'Testing...' : 'Test'}
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                  <Label htmlFor="peopleUrl">People Research Webhook (n8n)</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-8">Finds decision-makers and technical buyers</p>
                <div className="flex gap-2">
                  <Input
                    id="peopleUrl"
                    value={peopleResearchUrl}
                    onChange={(e) => setPeopleResearchUrl(e.target.value)}
                    placeholder="https://n8n.example.com/webhook/people-research"
                    className="h-10 rounded-lg flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleTestWebhook('people')}
                    disabled={isTesting === 'people'}
                    className="rounded-lg px-6"
                  >
                    {isTesting === 'people' ? 'Testing...' : 'Test'}
                  </Button>
                </div>

                {isN8nCloudUrl(peopleResearchUrl) && (
                  <Alert className="mt-3">
                    <AlertTitle>n8n Cloud URL detected</AlertTitle>
                    <AlertDescription>
                      Long People Research runs (5–10 min) will time out when called as a single request. Use your self-hosted n8n URL here,
                      or switch People Research to async callback (respond immediately, then POST results back).
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                  <Label htmlFor="clayUrl">Clay Enrichment Webhook</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-8">Enriches contacts with additional data</p>
                <div className="flex gap-2">
                  <Input
                    id="clayUrl"
                    value={clayUrl}
                    onChange={(e) => setClayUrl(e.target.value)}
                    placeholder="https://api.clay.com/v1/webhooks/..."
                    className="h-10 rounded-lg flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleTestWebhook('clay')}
                    disabled={isTesting === 'clay'}
                    className="rounded-lg px-6"
                  >
                    {isTesting === 'clay' ? 'Testing...' : 'Test'}
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</div>
                  <Label htmlFor="salesforceImportUrl">Salesforce Campaign Import Webhook (n8n)</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-8">Fetches accounts from a Salesforce Campaign</p>
                <div className="flex gap-2">
                  <Input
                    id="salesforceImportUrl"
                    value={salesforceImportUrl}
                    onChange={(e) => setSalesforceImportUrl(e.target.value)}
                    placeholder="https://n8n.example.com/webhook/salesforce-campaign-import"
                    className="h-10 rounded-lg flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleTestWebhook('salesforce_import')}
                    disabled={isTesting === 'salesforce_import'}
                    className="rounded-lg px-6"
                  >
                    {isTesting === 'salesforce_import' ? 'Testing...' : 'Test'}
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">5</div>
                  <Label htmlFor="salesforceUrl">Salesforce Export Webhook (n8n)</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-8">Sends individual contacts to Salesforce via n8n</p>
                <div className="flex gap-2">
                  <Input
                    id="salesforceUrl"
                    value={salesforceUrl}
                    onChange={(e) => setSalesforceUrl(e.target.value)}
                    placeholder="https://n8n.example.com/webhook/salesforce-export"
                    className="h-10 rounded-lg flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleTestWebhook('salesforce')}
                    disabled={isTesting === 'salesforce'}
                    className="rounded-lg px-6"
                  >
                    {isTesting === 'salesforce' ? 'Testing...' : 'Test'}
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleSaveIntegrations}
                disabled={isSaving}
                className="w-full rounded-lg"
              >
                {isSaving ? 'Saving...' : 'Save Integrations'}
              </Button>
            </div>

            {/* Preferences */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Preferences
              </h3>

              <div className="p-4 rounded-xl border border-border flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Dark Mode</p>
                  <p className="text-sm text-muted-foreground">Toggle dark theme</p>
                </div>
                <Switch
                  checked={integrations.dark_mode}
                  onCheckedChange={handleDarkModeToggle}
                />
              </div>

              <div className="p-4 rounded-xl border border-border flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Sound Effects</p>
                  <p className="text-sm text-muted-foreground">Play sounds on actions</p>
                </div>
                <Switch
                  checked={integrations.sound_effects}
                  onCheckedChange={handleSoundToggle}
                />
              </div>
            </div>

            {/* About */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                About
              </h3>

              <div className="p-4 rounded-xl border border-border space-y-2">
                <p className="text-sm text-muted-foreground">Version 1.0.0</p>
                <div className="flex gap-4 text-sm">
                  <a href="#" className="text-primary hover:underline">Documentation</a>
                  <a href="#" className="text-primary hover:underline">Report Bug</a>
                </div>
              </div>
            </div>

            {/* Logout */}
            <Button
              variant="destructive"
              onClick={handleLogout}
              className="w-full h-12 rounded-xl"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Log Out
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
