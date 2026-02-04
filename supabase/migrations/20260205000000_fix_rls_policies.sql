-- Fix RLS policies to enforce proper user_id filtering
-- This migration replaces overly permissive USING (true) policies with proper user isolation

-- Drop existing permissive policies for company_research
DROP POLICY IF EXISTS "Users can view their own company research" ON public.company_research;
DROP POLICY IF EXISTS "Edge functions can insert company research" ON public.company_research;
DROP POLICY IF EXISTS "Edge functions can update company research" ON public.company_research;

-- Drop existing permissive policies for prospect_research
DROP POLICY IF EXISTS "Users can view prospects" ON public.prospect_research;
DROP POLICY IF EXISTS "Edge functions can insert prospects" ON public.prospect_research;
DROP POLICY IF EXISTS "Edge functions and users can update prospects" ON public.prospect_research;

-- Create proper RLS policies for company_research
CREATE POLICY "Users can view their own company research"
  ON public.company_research
  FOR SELECT
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert their own company research"
  ON public.company_research
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can update their own company research"
  ON public.company_research
  FOR UPDATE
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Create proper RLS policies for prospect_research
CREATE POLICY "Users can view their own prospects"
  ON public.prospect_research
  FOR SELECT
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert their own prospects"
  ON public.prospect_research
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can update their own prospects"
  ON public.prospect_research
  FOR UPDATE
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Fix research_results table if it has permissive policies
DROP POLICY IF EXISTS "Users can view research results" ON public.research_results;
DROP POLICY IF EXISTS "Users can insert research results" ON public.research_results;
DROP POLICY IF EXISTS "Users can update research results" ON public.research_results;

CREATE POLICY "Users can view their own research results"
  ON public.research_results
  FOR SELECT
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert their own research results"
  ON public.research_results
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can update their own research results"
  ON public.research_results
  FOR UPDATE
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');
