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
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Settings() {
  const navigate = useNavigate();
  const { user, integrations, setIntegrations, setUser } = useAppStore();

  const [n8nUrl, setN8nUrl] = useState(integrations.n8n_webhook_url || '');
  const [clayUrl, setClayUrl] = useState(integrations.clay_webhook_url || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<'n8n' | 'clay' | null>(null);

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
        setN8nUrl(data.n8n_webhook_url || '');
        setClayUrl(data.clay_webhook_url || '');
        setIntegrations({
          n8n_webhook_url: data.n8n_webhook_url || '',
          clay_webhook_url: data.clay_webhook_url || '',
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
        .upsert({
          user_id: user.id,
          n8n_webhook_url: n8nUrl || null,
          clay_webhook_url: clayUrl || null,
          dark_mode: integrations.dark_mode,
          sound_effects: integrations.sound_effects,
        });

      if (error) throw error;

      setIntegrations({
        n8n_webhook_url: n8nUrl,
        clay_webhook_url: clayUrl,
      });

      toast.success('Settings saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestWebhook = async (type: 'n8n' | 'clay') => {
    const url = type === 'n8n' ? n8nUrl : clayUrl;
    if (!url) {
      toast.error(`Please enter a ${type === 'n8n' ? 'n8n' : 'Clay'} webhook URL`);
      return;
    }

    setIsTesting(type);
    try {
      // Use edge function proxy to avoid CORS issues
      const { data, error } = await supabase.functions.invoke('test-webhook', {
        body: { url },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message || 'Webhook returned an error');
      
      toast.success(`${type === 'n8n' ? 'n8n' : 'Clay'} webhook is working!`);
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

            {/* Integrations */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Integrations
              </h3>

              <div className="p-4 rounded-xl border border-border space-y-3">
                <Label htmlFor="n8nUrl">n8n Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="n8nUrl"
                    value={n8nUrl}
                    onChange={(e) => setN8nUrl(e.target.value)}
                    placeholder="https://n8n.cloudar.com/webhook/..."
                    className="h-10 rounded-lg flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleTestWebhook('n8n')}
                    disabled={isTesting === 'n8n'}
                    className="rounded-lg px-6"
                  >
                    {isTesting === 'n8n' ? 'Testing...' : 'Test'}
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border space-y-3">
                <Label htmlFor="clayUrl">Clay Webhook URL</Label>
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
