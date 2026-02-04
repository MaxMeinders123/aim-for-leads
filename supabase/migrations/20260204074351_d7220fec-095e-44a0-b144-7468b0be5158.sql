-- Create research_results table for tracking research across n8n, Supabase, and Clay
CREATE TABLE public.research_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  company_domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'rejected')),
  company_data JSONB,
  prospect_data JSONB,
  clay_triggered BOOLEAN DEFAULT FALSE,
  clay_response JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast user_id lookups (real-time filtering)
CREATE INDEX idx_research_results_user_id ON public.research_results(user_id);
CREATE INDEX idx_research_results_status ON public.research_results(status);
CREATE INDEX idx_research_results_created_at ON public.research_results(created_at DESC);

-- Enable RLS
ALTER TABLE public.research_results ENABLE ROW LEVEL SECURITY;

-- Public insert policy (edge function uses service role, but allow anon for testing)
CREATE POLICY "Allow insert for edge functions"
ON public.research_results
FOR INSERT
WITH CHECK (true);

-- Public select policy (filter by user_id in application)
CREATE POLICY "Allow select by user_id"
ON public.research_results
FOR SELECT
USING (true);

-- Public update policy for status changes
CREATE POLICY "Allow update for edge functions"
ON public.research_results
FOR UPDATE
USING (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.research_results;

-- Add updated_at trigger
CREATE TRIGGER update_research_results_updated_at
BEFORE UPDATE ON public.research_results
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();