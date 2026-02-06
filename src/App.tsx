import { useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/appStore";
import Login from "./pages/Login";
import Campaigns from "./pages/Campaigns";
import Companies from "./pages/Companies";
import Research from "./pages/Research";
import ContactsView from "./pages/ContactsView";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { setUser, setIntegrations } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || '',
        });

        supabase
          .from('user_integrations')
          .select('*')
          .eq('user_id', session.user.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setIntegrations({
                dark_mode: data.dark_mode || false,
                sound_effects: data.sound_effects !== false,
              });
              if (data.dark_mode) {
                document.documentElement.classList.add('dark');
              }
            }
          });
      }
      setIsLoading(false);
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            email: session.user.email || '',
          });
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setIntegrations]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAppStore();
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthWrapper>
          <Routes>
            {/* Auth */}
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />

            {/* Main flow */}
            <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
            <Route path="/companies/:campaignId" element={<ProtectedRoute><Companies /></ProtectedRoute>} />
            <Route path="/research/:campaignId" element={<ProtectedRoute><Research /></ProtectedRoute>} />
            <Route path="/contacts/:campaignId" element={<ProtectedRoute><ContactsView /></ProtectedRoute>} />

            {/* Settings */}
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

            {/* Legacy redirects */}
            <Route path="/companies" element={<Navigate to="/campaigns" replace />} />
            <Route path="/contacts" element={<Navigate to="/campaigns" replace />} />
            <Route path="/research" element={<Navigate to="/campaigns" replace />} />
            <Route path="/results" element={<Navigate to="/campaigns" replace />} />
            <Route path="/add-companies" element={<Navigate to="/campaigns" replace />} />
            <Route path="/company-preview" element={<Navigate to="/campaigns" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthWrapper>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
