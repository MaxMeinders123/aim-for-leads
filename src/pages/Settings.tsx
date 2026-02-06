import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { WEBHOOKS } from '@/lib/constants';
import { fetchUserIntegrations, updateUserIntegrations, testWebhook, testClayPayload } from '@/services/api';
import { toast } from 'sonner';

type WebhookKey = 'salesforce_import_webhook_url' | 'company_research_webhook_url' | 'people_research_webhook_url' | 'clay_webhook_url';

interface WebhookConfig {
  key: WebhookKey;
  label: string;
  description: string;
  placeholder: string;
}

const WEBHOOK_CONFIGS: WebhookConfig[] = [
  {
    key: 'salesforce_import_webhook_url',
    label: 'Salesforce Campaign Import (n8n)',
    description: 'Fetches accounts from a Salesforce Campaign',
    placeholder: WEBHOOKS.SALESFORCE_IMPORT,
  },
  {
    key: 'company_research_webhook_url',
    label: 'Company Research (n8n)',
    description: 'Validates company status (Operating/Acquired/Bankrupt)',
    placeholder: WEBHOOKS.COMPANY_RESEARCH,
  },
  {
    key: 'people_research_webhook_url',
    label: 'Prospect Research (n8n)',
    description: 'Finds decision-makers at company',
    placeholder: WEBHOOKS.PROSPECT_RESEARCH,
  },
  {
    key: 'clay_webhook_url',
    label: 'Clay Integration',
    description: 'Enriches prospects with email/phone',
    placeholder: 'https://clay.com/your-webhook-url',
  },
];

export default function Settings() {
  const navigate = useNavigate();
  const { user, integrations, setIntegrations, setUser } = useAppStore();

  const [webhooks, setWebhooks] = useState<Record<WebhookKey, string>>({
    salesforce_import_webhook_url: '',
    company_research_webhook_url: '',
    people_research_webhook_url: '',
    clay_webhook_url: '',
  });
  const [testingWebhook, setTestingWebhook] = useState<WebhookKey | null>(null);
  const [testResults, setTestResults] = useState<Record<WebhookKey, 'success' | 'error' | null>>({
    salesforce_import_webhook_url: null,
    company_research_webhook_url: null,
    people_research_webhook_url: null,
    clay_webhook_url: null,
  });
  const [savingWebhook, setSavingWebhook] = useState<WebhookKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingClayPayload, setTestingClayPayload] = useState(false);
  const [clayPayloadResult, setClayPayloadResult] = useState<object | null>(null);

  useEffect(() => {
    const loadIntegrations = async () => {
      if (!user) return;
      try {
        const data = await fetchUserIntegrations(user.id);
        setIntegrations({
          dark_mode: data.dark_mode || false,
          sound_effects: data.sound_effects !== false,
          clay_webhook_url: data.clay_webhook_url,
          company_research_webhook_url: data.company_research_webhook_url,
          people_research_webhook_url: data.people_research_webhook_url,
          salesforce_import_webhook_url: data.salesforce_import_webhook_url,
        });
        setWebhooks({
          salesforce_import_webhook_url: data.salesforce_import_webhook_url || '',
          company_research_webhook_url: data.company_research_webhook_url || '',
          people_research_webhook_url: data.people_research_webhook_url || '',
          clay_webhook_url: data.clay_webhook_url || '',
        });
      } catch {
        // Fallback to direct query if function fails
        const { data } = await supabase
          .from('user_integrations')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (data) {
          setIntegrations({
            dark_mode: data.dark_mode || false,
            sound_effects: data.sound_effects !== false,
          });
          setWebhooks({
            salesforce_import_webhook_url: data.salesforce_import_webhook_url || '',
            company_research_webhook_url: data.company_research_webhook_url || '',
            people_research_webhook_url: data.people_research_webhook_url || '',
            clay_webhook_url: data.clay_webhook_url || '',
          });
        }
      } finally {
        setLoading(false);
      }
    };
    loadIntegrations();
  }, [user, setIntegrations]);

  const handleDarkModeToggle = async (enabled: boolean) => {
    setIntegrations({ dark_mode: enabled });
    document.documentElement.classList.toggle('dark', enabled);
    if (user) {
      await supabase.from('user_integrations').update({ dark_mode: enabled }).eq('user_id', user.id);
    }
  };

  const handleSoundToggle = async (enabled: boolean) => {
    setIntegrations({ sound_effects: enabled });
    if (user) {
      await supabase.from('user_integrations').update({ sound_effects: enabled }).eq('user_id', user.id);
    }
  };

  const handleWebhookChange = (key: WebhookKey, value: string) => {
    setWebhooks((prev) => ({ ...prev, [key]: value }));
    // Clear test result when URL changes
    setTestResults((prev) => ({ ...prev, [key]: null }));
  };

  const handleTestWebhook = async (key: WebhookKey) => {
    const url = webhooks[key];
    if (!url) {
      toast.error('Please enter a webhook URL first');
      return;
    }

    setTestingWebhook(key);
    setTestResults((prev) => ({ ...prev, [key]: null }));

    try {
      const result = await testWebhook(url);
      setTestResults((prev) => ({ ...prev, [key]: result.success ? 'success' : 'error' }));
      if (result.success) {
        toast.success('Webhook is reachable!');
      } else {
        toast.error(result.message || 'Webhook test failed');
      }
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [key]: 'error' }));
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingWebhook(null);
    }
  };

  const handleSaveWebhook = async (key: WebhookKey) => {
    if (!user) return;

    setSavingWebhook(key);
    try {
      await updateUserIntegrations(user.id, { [key]: webhooks[key] || null });
      setIntegrations({ [key]: webhooks[key] || undefined });
      toast.success('Webhook URL saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingWebhook(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate('/');
  };

  const handleTestClayPayload = async () => {
    if (!user) return;
    setTestingClayPayload(true);
    setClayPayloadResult(null);
    try {
      const result = await testClayPayload(user.id);
      setClayPayloadResult(result);
      toast.success('Clay payload preview loaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get payload preview');
    } finally {
      setTestingClayPayload(false);
    }
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    if (email) return email.slice(0, 2).toUpperCase();
    return 'U';
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader title="Settings" subtitle="Configure your workspace" backTo="/campaigns" />

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
              </div>
            </div>

            {/* Webhook Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Webhook Configuration
              </h3>
              <p className="text-sm text-muted-foreground">
                Configure your n8n and Clay webhook URLs. Test each webhook before saving to verify connectivity.
              </p>

              {loading ? (
                <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {WEBHOOK_CONFIGS.map((config) => (
                    <div key={config.key} className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={config.key} className="font-medium text-foreground">
                          {config.label}
                        </Label>
                        {testResults[config.key] === 'success' && (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        )}
                        {testResults[config.key] === 'error' && (
                          <XCircle className="w-4 h-4 text-destructive" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                      <div className="flex gap-2">
                        <Input
                          id={config.key}
                          type="url"
                          value={webhooks[config.key]}
                          onChange={(e) => handleWebhookChange(config.key, e.target.value)}
                          placeholder={config.placeholder}
                          className="flex-1 font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestWebhook(config.key)}
                          disabled={testingWebhook === config.key || !webhooks[config.key]}
                        >
                          {testingWebhook === config.key ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Test'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveWebhook(config.key)}
                          disabled={savingWebhook === config.key}
                        >
                          {savingWebhook === config.key ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Save'
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Leave empty to use default URLs from <code className="bg-muted px-1 py-0.5 rounded">src/lib/constants.ts</code>
              </p>

              {/* Clay Payload Test */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Test Clay Payload</p>
                    <p className="text-xs text-muted-foreground">
                      Preview the exact payload that would be sent to Clay for your most recent prospect
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestClayPayload}
                    disabled={testingClayPayload}
                  >
                    {testingClayPayload ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Preview Payload'
                    )}
                  </Button>
                </div>
                {clayPayloadResult && (
                  <pre className="p-3 rounded-lg bg-background border border-border text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(clayPayloadResult, null, 2)}
                  </pre>
                )}
              </div>
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
                <Switch checked={integrations.dark_mode} onCheckedChange={handleDarkModeToggle} />
              </div>

              <div className="p-4 rounded-xl border border-border flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Sound Effects</p>
                  <p className="text-sm text-muted-foreground">Play sounds on actions</p>
                </div>
                <Switch checked={integrations.sound_effects} onCheckedChange={handleSoundToggle} />
              </div>
            </div>

            {/* About */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">About</h3>
              <div className="p-4 rounded-xl border border-border space-y-2">
                <p className="text-sm text-muted-foreground">Engagetech Research Platform v2.0</p>
              </div>
            </div>

            {/* Logout */}
            <Button variant="destructive" onClick={handleLogout} className="w-full h-12 rounded-xl">
              <LogOut className="w-5 h-5 mr-2" />
              Log Out
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
