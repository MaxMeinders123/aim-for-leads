-- Create company_research table for storing company research results
CREATE TABLE public.company_research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  company_domain TEXT NOT NULL,
  company_name TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  company_status TEXT,
  acquired_by TEXT,
  cloud_provider TEXT,
  cloud_confidence INTEGER,
  evidence_urls TEXT[],
  raw_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create prospect_research table for storing individual prospects
CREATE TABLE public.prospect_research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_research_id UUID NOT NULL REFERENCES public.company_research(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  job_title TEXT,
  linkedin_url TEXT,
  priority TEXT,
  priority_reason TEXT,
  pitch_type TEXT,
  raw_data JSONB,
  sent_to_clay BOOLEAN NOT NULL DEFAULT false,
  sent_to_clay_at TIMESTAMP WITH TIME ZONE,
  clay_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.company_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_research ENABLE ROW LEVEL SECURITY;

-- RLS policies for company_research
CREATE POLICY "Users can view their own company research"
  ON public.company_research
  FOR SELECT
  USING (true);

CREATE POLICY "Edge functions can insert company research"
  ON public.company_research
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Edge functions can update company research"
  ON public.company_research
  FOR UPDATE
  USING (true);

-- RLS policies for prospect_research
CREATE POLICY "Users can view prospects"
  ON public.prospect_research
  FOR SELECT
  USING (true);

CREATE POLICY "Edge functions can insert prospects"
  ON public.prospect_research
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Edge functions and users can update prospects"
  ON public.prospect_research
  FOR UPDATE
  USING (true);

-- Create indexes for better query performance
CREATE INDEX idx_company_research_user_id ON public.company_research(user_id);
CREATE INDEX idx_company_research_company_domain ON public.company_research(company_domain);
CREATE INDEX idx_company_research_status ON public.company_research(status);
CREATE INDEX idx_prospect_research_company_id ON public.prospect_research(company_research_id);
CREATE INDEX idx_prospect_research_user_id ON public.prospect_research(user_id);
CREATE INDEX idx_prospect_research_sent_to_clay ON public.prospect_research(sent_to_clay);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.company_research;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prospect_research;

-- Create trigger for updated_at on company_research
CREATE TRIGGER update_company_research_updated_at
  BEFORE UPDATE ON public.company_research
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();