import { useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/appStore";
import Login from "./pages/Login";
import CampaignSetup from "./pages/CampaignSetup";
import AddCompanies from "./pages/AddCompanies";
import CompanyPreview from "./pages/CompanyPreview";
import ResearchProgress from "./pages/ResearchProgress";
import Results from "./pages/Results";
import Settings from "./pages/Settings";
import ResearchSystem from "./pages/ResearchSystem";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, setUser, setIntegrations } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check initial session immediately
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || '',
        });

        // Load integrations in background (don't block)
        supabase
          .from('user_integrations')
          .select('*')
          .eq('user_id', session.user.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setIntegrations({
                n8n_webhook_url: data.n8n_webhook_url || '',
                clay_webhook_url: data.clay_webhook_url || '',
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

    // Set up auth state listener for subsequent changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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
  
  if (!user) {
    return <Navigate to="/" replace />;
  }

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
            <Route path="/" element={<Login />} />
            <Route
              path="/campaigns"
              element={
                <ProtectedRoute>
                  <CampaignSetup />
                </ProtectedRoute>
              }
            />
            <Route
              path="/add-companies"
              element={
                <ProtectedRoute>
                  <AddCompanies />
                </ProtectedRoute>
              }
            />
            <Route
              path="/company-preview"
              element={
                <ProtectedRoute>
                  <CompanyPreview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/companies"
              element={
                <ProtectedRoute>
                  <CompanyPreview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/research"
              element={
                <ProtectedRoute>
                  <ResearchProgress />
                </ProtectedRoute>
              }
            />
            <Route
              path="/results"
              element={
                <ProtectedRoute>
                  <Results />
                </ProtectedRoute>
              }
            />
            <Route
              path="/contacts"
              element={
                <ProtectedRoute>
                  <Results />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/research-system"
              element={
                <ProtectedRoute>
                  <ResearchSystem />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthWrapper>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
