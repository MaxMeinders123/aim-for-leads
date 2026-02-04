import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Building2, Users, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/stores/appStore';
import { toast } from 'sonner';
import { AppLayout } from '@/components/AppLayout';

interface ResearchResult {
  id: string;
  user_id: string;
  company_domain: string;
  status: 'processing' | 'completed' | 'rejected';
  company_data: any;
  prospect_data: any;
  clay_triggered: boolean;
  clay_response: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

const ResearchSystem = () => {
  const { integrations, user } = useAppStore();
  const [companyDomain, setCompanyDomain] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate a unique user_id if not provided
  useEffect(() => {
    if (user?.id) {
      setCurrentUserId(user.id);
    } else {
      // Generate a session-based ID for anonymous users
      const sessionId = sessionStorage.getItem('research_user_id') || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('research_user_id', sessionId);
      setCurrentUserId(sessionId);
    }
  }, [user]);

  // Real-time subscription to research_results filtered by user_id
  useEffect(() => {
    if (!currentUserId) return;

    console.log('[ResearchSystem] Setting up realtime subscription for user:', currentUserId);

    const channel = supabase
      .channel(`research_results_${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'research_results',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          console.log('[ResearchSystem] Realtime update:', payload);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newData = payload.new as ResearchResult;
            setCurrentResult(newData);
            
            if (newData.status === 'completed') {
              toast.success('Research completed!');
              setIsLoading(false);
            } else if (newData.status === 'rejected') {
              toast.error('Research was rejected');
              setIsLoading(false);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[ResearchSystem] Subscription status:', status);
      });

    return () => {
      console.log('[ResearchSystem] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handleStartResearch = async () => {
    if (!companyDomain.trim()) {
      toast.error('Please enter a company domain');
      return;
    }

    if (!integrations.company_research_webhook_url) {
      toast.error('Please configure your n8n webhook URL in Settings first');
      return;
    }

    setIsLoading(true);
    setError(null);
    setCurrentResult(null);

    try {
      // Create initial processing record
      const { data: initialRecord, error: insertError } = await supabase
        .from('research_results')
        .insert({
          user_id: currentUserId,
          company_domain: companyDomain.trim(),
          status: 'processing',
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create research record: ${insertError.message}`);
      }

      setCurrentResult(initialRecord as ResearchResult);

      // Send to n8n webhook
      console.log('[ResearchSystem] Sending to n8n webhook...');
      
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

      const responseData = await response.text();
      console.log('[ResearchSystem] n8n response:', responseData);

      toast.success('Research started! Waiting for results...');
      // Loading will be set to false by realtime subscription when results arrive

    } catch (err: any) {
      console.error('[ResearchSystem] Error:', err);
      setError(err.message);
      setIsLoading(false);
      toast.error(err.message);
    }
  };

  const handleClear = () => {
    setCompanyDomain('');
    setCurrentResult(null);
    setError(null);
    setIsLoading(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'rejected':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      processing: 'secondary',
      completed: 'default',
      rejected: 'destructive',
    };
    return (
      <Badge variant={variants[status] || 'outline'} className="flex items-center gap-1">
        {getStatusIcon(status)}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Research System</h1>
          <p className="text-muted-foreground mt-2">
            Enter a company domain to start research. Results will update in real-time.
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
              Enter a company domain and click Start to begin research
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
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="userId">User ID (auto-generated)</Label>
              <Input
                id="userId"
                value={currentUserId}
                onChange={(e) => setCurrentUserId(e.target.value)}
                disabled={isLoading}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleStartResearch}
                disabled={isLoading || !companyDomain.trim()}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Start Research
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleClear} disabled={isLoading}>
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

        {/* Status & Results */}
        {currentResult && (
          <div className="space-y-6">
            {/* Status Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Research Status</CardTitle>
                  {getStatusBadge(currentResult.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Domain:</span>
                    <span className="ml-2 font-medium">{currentResult.company_domain}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">User ID:</span>
                    <span className="ml-2 font-mono text-xs">{currentResult.user_id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <span className="ml-2">{new Date(currentResult.created_at).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Clay Triggered:</span>
                    <span className="ml-2">{currentResult.clay_triggered ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                {currentResult.status === 'rejected' && currentResult.error_message && (
                  <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-destructive font-medium">Rejected</p>
                    <p className="text-sm text-destructive/80">{currentResult.error_message}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Company Data Card */}
            {currentResult.status === 'completed' && currentResult.company_data && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Company Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="p-4 bg-muted rounded-md overflow-auto text-sm max-h-64">
                    {JSON.stringify(currentResult.company_data, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}

            {/* Prospects Card */}
            {currentResult.status === 'completed' && currentResult.prospect_data && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Prospects
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {Array.isArray(currentResult.prospect_data) ? (
                    <div className="space-y-3">
                      {currentResult.prospect_data.map((prospect: any, index: number) => (
                        <div key={index} className="p-3 border rounded-lg">
                          <p className="font-medium">{prospect.name || prospect.first_name + ' ' + prospect.last_name}</p>
                          {prospect.title && <p className="text-sm text-muted-foreground">{prospect.title}</p>}
                          {prospect.email && <p className="text-sm">{prospect.email}</p>}
                          {prospect.linkedin && (
                            <a href={prospect.linkedin} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                              LinkedIn Profile
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="p-4 bg-muted rounded-md overflow-auto text-sm max-h-64">
                      {JSON.stringify(currentResult.prospect_data, null, 2)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Clay Response */}
            {currentResult.clay_triggered && currentResult.clay_response && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Clay Integration Response</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="p-4 bg-muted rounded-md overflow-auto text-sm max-h-32">
                    {JSON.stringify(currentResult.clay_response, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Configuration Info */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg">Configuration</CardTitle>
            <CardDescription>Webhook URLs and endpoints for your n8n workflow</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-medium">n8n Webhook URL (Frontend → n8n):</p>
              <code className="block mt-1 p-2 bg-muted rounded text-xs break-all">
                {integrations.company_research_webhook_url || 'Not configured - set in Settings'}
              </code>
            </div>
            
            <div>
              <p className="font-medium">Edge Function URL (n8n → Supabase):</p>
              <code className="block mt-1 p-2 bg-muted rounded text-xs break-all">
                https://lqrkrzikjlavnltbnnoa.supabase.co/functions/v1/receive-research-results
              </code>
            </div>

            <div>
              <p className="font-medium">n8n HTTP POST Body (to Edge Function):</p>
              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
{`{
  "user_id": "{{$json.body.user_id}}",
  "company_domain": "{{$json.body.company_domain}}",
  "status": "completed",
  "company_data": { ... },
  "prospect_data": [ ... ]
}`}
              </pre>
            </div>

            <div>
              <p className="font-medium">Clay Webhook URL:</p>
              <code className="block mt-1 p-2 bg-muted rounded text-xs break-all">
                {integrations.clay_webhook_url || 'Not configured - set in Settings'}
              </code>
            </div>

            <div>
              <p className="font-medium">Clay Payload (auto-sent on completion):</p>
              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
{`{
  "user_id": "...",
  "company_domain": "...",
  "company_data": { ... },
  "prospect_data": [ ... ],
  "research_result_id": "uuid",
  "triggered_at": "ISO timestamp"
}`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default ResearchSystem;
