import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Building2, Users, AlertCircle, CheckCircle2, Clock, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/stores/appStore';
import { toast } from 'sonner';
import { AppLayout } from '@/components/AppLayout';
import { CompanyResearchCard } from '@/components/research/CompanyResearchCard';
import { ProspectTable } from '@/components/research/ProspectTable';

interface CompanyResearch {
  id: string;
  user_id: string;
  company_domain: string;
  company_name: string | null;
  status: string;
  company_status: string | null;
  acquired_by: string | null;
  cloud_provider: string | null;
  cloud_confidence: number | null;
  evidence_urls: string[] | null;
  raw_data: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface ProspectResearch {
  id: string;
  company_research_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  priority: string | null;
  priority_reason: string | null;
  pitch_type: string | null;
  sent_to_clay: boolean;
  sent_to_clay_at: string | null;
  created_at: string;
}

const ResearchSystem = () => {
  const { integrations, user } = useAppStore();
  const [companyDomain, setCompanyDomain] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [isCompanyLoading, setIsCompanyLoading] = useState(false);
  const [isProspectLoading, setIsProspectLoading] = useState(false);
  const [companyResearch, setCompanyResearch] = useState<CompanyResearch | null>(null);
  const [prospects, setProspects] = useState<ProspectResearch[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Generate a unique user_id if not provided
  useEffect(() => {
    if (user?.id) {
      setCurrentUserId(user.id);
    } else {
      const sessionId = sessionStorage.getItem('research_user_id') || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('research_user_id', sessionId);
      setCurrentUserId(sessionId);
    }
  }, [user]);

  // Real-time subscription to company_research
  useEffect(() => {
    if (!currentUserId) return;

    console.log('[ResearchSystem] Setting up realtime subscription for user:', currentUserId);

    const companyChannel = supabase
      .channel(`company_research_${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_research',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          console.log('[ResearchSystem] Company research update:', payload);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newData = payload.new as CompanyResearch;
            setCompanyResearch(newData);
            
            if (newData.status === 'completed') {
              toast.success('Company research completed!');
              setIsCompanyLoading(false);
            } else if (newData.status === 'failed') {
              toast.error('Company research failed');
              setIsCompanyLoading(false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(companyChannel);
    };
  }, [currentUserId]);

  // Real-time subscription to prospect_research
  useEffect(() => {
    if (!companyResearch?.id) return;

    console.log('[ResearchSystem] Setting up prospect subscription for company:', companyResearch.id);

    const prospectChannel = supabase
      .channel(`prospect_research_${companyResearch.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prospect_research',
          filter: `company_research_id=eq.${companyResearch.id}`,
        },
        (payload) => {
          console.log('[ResearchSystem] Prospect research update:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newProspect = payload.new as ProspectResearch;
            setProspects(prev => [...prev, newProspect]);
            setIsProspectLoading(false);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ProspectResearch;
            setProspects(prev => prev.map(p => p.id === updated.id ? updated : p));
          }
        }
      )
      .subscribe();

    // Load existing prospects
    loadProspects(companyResearch.id);

    return () => {
      supabase.removeChannel(prospectChannel);
    };
  }, [companyResearch?.id]);

  const loadProspects = async (companyResearchId: string) => {
    const { data, error } = await supabase
      .from('prospect_research')
      .select('*')
      .eq('company_research_id', companyResearchId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setProspects(data as ProspectResearch[]);
    }
  };

  const handleStartCompanyResearch = async () => {
    if (!companyDomain.trim()) {
      toast.error('Please enter a company domain');
      return;
    }

    if (!integrations.company_research_webhook_url) {
      toast.error('Please configure your Company Research webhook URL in Settings first');
      return;
    }

    setIsCompanyLoading(true);
    setError(null);
    setCompanyResearch(null);
    setProspects([]);

    try {
      console.log('[ResearchSystem] Starting company research...');
      
      const response = await fetch(integrations.company_research_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUserId,
          company_domain: companyDomain.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }

      toast.success('Company research started! Waiting for results...');

    } catch (err: any) {
      console.error('[ResearchSystem] Error:', err);
      setError(err.message);
      setIsCompanyLoading(false);
      toast.error(err.message);
    }
  };

  const handleStartProspectResearch = async () => {
    if (!companyResearch) {
      toast.error('Complete company research first');
      return;
    }

    if (!integrations.people_research_webhook_url) {
      toast.error('Please configure your People Research webhook URL in Settings first');
      return;
    }

    setIsProspectLoading(true);

    try {
      console.log('[ResearchSystem] Starting prospect research...');
      
      const response = await fetch(integrations.people_research_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUserId,
          company_domain: companyResearch.company_domain,
          company_research_id: companyResearch.id,
          company_data: companyResearch.raw_data,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }

      toast.success('Prospect research started! Waiting for results...');

    } catch (err: any) {
      console.error('[ResearchSystem] Error:', err);
      toast.error(err.message);
      setIsProspectLoading(false);
    }
  };

  const handleClear = () => {
    setCompanyDomain('');
    setCompanyResearch(null);
    setProspects([]);
    setError(null);
    setIsCompanyLoading(false);
    setIsProspectLoading(false);
  };

  const refreshProspects = () => {
    if (companyResearch?.id) {
      loadProspects(companyResearch.id);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Research System</h1>
          <p className="text-muted-foreground mt-2">
            Enter a company domain to start research. Company research runs first, then prospect research.
          </p>
        </div>

        {/* Input Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Start Research
            </CardTitle>
            <CardDescription>
              Enter a company domain to begin the research workflow
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Company Domain</Label>
              <Input
                id="domain"
                placeholder="example.com"
                value={companyDomain}
                onChange={(e) => setCompanyDomain(e.target.value)}
                disabled={isCompanyLoading}
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleStartCompanyResearch}
                disabled={isCompanyLoading || !companyDomain.trim()}
                className="flex-1"
              >
                {isCompanyLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing Company...
                  </>
                ) : (
                  <>
                    <Building2 className="mr-2 h-4 w-4" />
                    Start Company Research
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleClear} disabled={isCompanyLoading || isProspectLoading}>
                Clear
              </Button>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Company Research Results */}
        {companyResearch && (
          <div className="space-y-6">
            <CompanyResearchCard 
              company={companyResearch} 
              showJustReceived={companyResearch.status === 'completed' && prospects.length === 0}
            />

            {/* Start Prospect Research Button */}
            {companyResearch.status === 'completed' && (
              <Card>
                <CardContent className="pt-6">
                  <Button
                    onClick={handleStartProspectResearch}
                    disabled={isProspectLoading}
                    className="w-full"
                    size="lg"
                  >
                    {isProspectLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Finding Prospects...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Start Prospect Research
                      </>
                    )}
                  </Button>
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    Company research is complete. Click above to find prospects.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Prospects Table */}
            {prospects.length > 0 && (
              <ProspectTable 
                prospects={prospects} 
                onProspectUpdated={refreshProspects}
              />
            )}
          </div>
        )}

        {/* Configuration Info */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg">Configuration</CardTitle>
            <CardDescription>Webhook URLs and endpoints for your n8n workflows</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-sm">
            {/* Step 1: Frontend to n8n Company */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <p className="font-semibold text-base mb-2">Step 1: Frontend → n8n (Company Research)</p>
              <p className="text-muted-foreground mb-2">Your n8n webhook receives the initial request:</p>
              <code className="block mt-1 p-2 bg-muted rounded text-xs break-all">
                {integrations.company_research_webhook_url || 'Not configured - set in Settings'}
              </code>
              <p className="mt-2 text-muted-foreground">Payload sent:</p>
              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
{`{ "user_id": "...", "company_domain": "example.com" }`}
              </pre>
            </div>
            
            {/* Step 2: n8n to Company Results Endpoint */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <p className="font-semibold text-base mb-2">Step 2: n8n → receive-company-results</p>
              <p className="text-muted-foreground mb-2">After company research, POST results here:</p>
              <code className="block mt-1 p-2 bg-muted rounded text-xs break-all">
                https://lqrkrzikjlavnltbnnoa.supabase.co/functions/v1/receive-company-results
              </code>
              <p className="mt-2 text-muted-foreground">Payload:</p>
              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
{`{
  "user_id": "{{$json.body.user_id}}",
  "company_domain": "{{$json.body.company_domain}}",
  "company": "{{$json.llm_output}}",
  "status": "completed"
}`}
              </pre>
            </div>

            {/* Step 3: Frontend triggers Prospect Research */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <p className="font-semibold text-base mb-2">Step 3: Frontend → n8n (Prospect Research)</p>
              <p className="text-muted-foreground mb-2">User clicks "Start Prospect Research" button, sending to:</p>
              <code className="block mt-1 p-2 bg-muted rounded text-xs break-all">
                {integrations.people_research_webhook_url || 'Not configured - set in Settings'}
              </code>
              <p className="mt-2 text-muted-foreground">Payload includes company_research_id:</p>
              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
{`{
  "user_id": "...",
  "company_domain": "...",
  "company_research_id": "uuid",
  "company_data": { ... }
}`}
              </pre>
            </div>

            {/* Step 4: n8n to Prospect Results Endpoint */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <p className="font-semibold text-base mb-2">Step 4: n8n → receive-prospect-results</p>
              <p className="text-muted-foreground mb-2">After prospect research, POST results here:</p>
              <code className="block mt-1 p-2 bg-muted rounded text-xs break-all">
                https://lqrkrzikjlavnltbnnoa.supabase.co/functions/v1/receive-prospect-results
              </code>
              <p className="mt-2 text-muted-foreground">Payload:</p>
              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
{`{
  "user_id": "{{$json.body.user_id}}",
  "company_domain": "{{$json.body.company_domain}}",
  "company_research_id": "{{$json.body.company_research_id}}",
  "prospect": "{{$json.llm_output}}",
  "status": "completed"
}`}
              </pre>
            </div>

            {/* Step 5: Individual Clay Sending */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <p className="font-semibold text-base mb-2">Step 5: Send Prospects to Clay (Individual)</p>
              <p className="text-muted-foreground mb-2">Use checkboxes to select prospects, then click "Send to Clay"</p>
              <code className="block mt-1 p-2 bg-muted rounded text-xs break-all">
                {integrations.clay_webhook_url || 'Not configured - set in Settings'}
              </code>
              <p className="mt-2 text-xs text-muted-foreground">
                ✅ Each prospect is sent individually with full company context
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default ResearchSystem;
