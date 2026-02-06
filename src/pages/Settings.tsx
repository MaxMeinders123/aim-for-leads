import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { WEBHOOKS } from '@/lib/constants';

export default function Settings() {
  const navigate = useNavigate();
  const { user, integrations, setIntegrations, setUser } = useAppStore();

  useEffect(() => {
    const loadIntegrations = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('user_integrations')
        .select('dark_mode, sound_effects')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setIntegrations({
          dark_mode: data.dark_mode || false,
          sound_effects: data.sound_effects !== false,
        });
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

            {/* Webhook Configuration (read-only info) */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Webhook Configuration
              </h3>
              <p className="text-sm text-muted-foreground">
                Webhook URLs are configured in the codebase. Current endpoints:
              </p>
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Salesforce Import</p>
                  <p className="text-sm font-mono text-foreground break-all">{WEBHOOKS.SALESFORCE_IMPORT}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Company Research</p>
                  <p className="text-sm font-mono text-foreground break-all">{WEBHOOKS.COMPANY_RESEARCH}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Prospect Research</p>
                  <p className="text-sm font-mono text-foreground break-all">{WEBHOOKS.PROSPECT_RESEARCH}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                To change these URLs, update <code className="bg-muted px-1 py-0.5 rounded">src/lib/constants.ts</code>
              </p>
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
