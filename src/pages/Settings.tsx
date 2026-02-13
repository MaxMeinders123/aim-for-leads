import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Save, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Settings() {
  const navigate = useNavigate();
  const { user, integrations, setIntegrations, setUser } = useAppStore();
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);

  useEffect(() => {
    const loadIntegrations = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('user_integrations')
        .select('dark_mode, sound_effects, n8n_webhook_url')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setIntegrations({
          dark_mode: data.dark_mode || false,
          sound_effects: data.sound_effects !== false,
        });
        setN8nWebhookUrl(data.n8n_webhook_url || '');
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate('/');
  };

  const handleSaveWebhookUrl = async () => {
    if (!user) return;
    setSavingWebhook(true);
    try {
      const { error } = await supabase
        .from('user_integrations')
        .update({ n8n_webhook_url: n8nWebhookUrl.trim() || null })
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('n8n webhook URL saved');
    } catch {
      toast.error('Failed to save webhook URL');
    } finally {
      setSavingWebhook(false);
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

            {/* Integrations */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Integrations
              </h3>

              <div className="p-4 rounded-xl border border-border space-y-3">
                <div>
                  <p className="font-medium text-foreground">n8n Webhook URL (Add to Campaign)</p>
                  <p className="text-sm text-muted-foreground mb-2">
                    Your n8n webhook URL for adding prospects to Salesforce campaigns.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://your-n8n.app.n8n.cloud/webhook/add-to-salesforce-campaign"
                    value={n8nWebhookUrl}
                    onChange={(e) => setN8nWebhookUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleSaveWebhookUrl} disabled={savingWebhook} size="sm">
                    {savingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Save
                  </Button>
                </div>
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
