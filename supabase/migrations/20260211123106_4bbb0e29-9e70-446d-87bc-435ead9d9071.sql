
-- Create research_feedback table to capture quality signals for AI improvement
CREATE TABLE public.research_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  prospect_research_id UUID REFERENCES public.prospect_research(id) ON DELETE SET NULL,
  company_research_id UUID REFERENCES public.company_research(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  feedback_type TEXT NOT NULL DEFAULT 'not_working',
  prospect_name TEXT,
  prospect_title TEXT,
  company_name TEXT,
  company_domain TEXT,
  linkedin_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.research_feedback ENABLE ROW LEVEL SECURITY;

-- Users can view their own feedback
CREATE POLICY "Users can view their own feedback"
ON public.research_feedback FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own feedback
CREATE POLICY "Users can create their own feedback"
ON public.research_feedback FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own feedback
CREATE POLICY "Users can delete their own feedback"
ON public.research_feedback FOR DELETE
USING (auth.uid() = user_id);
