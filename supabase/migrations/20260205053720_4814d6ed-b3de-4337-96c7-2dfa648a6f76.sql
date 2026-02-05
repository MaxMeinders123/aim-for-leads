-- Fix research_results RLS policies by dropping ALL existing policies and recreating
-- First check what policies exist and drop them all
DROP POLICY IF EXISTS "Users can view their own research results" ON public.research_results;
DROP POLICY IF EXISTS "Service role can insert research results" ON public.research_results;
DROP POLICY IF EXISTS "Users can update their own research results" ON public.research_results;
DROP POLICY IF EXISTS "Allow select by user_id" ON public.research_results;
DROP POLICY IF EXISTS "Allow insert for edge functions" ON public.research_results;
DROP POLICY IF EXISTS "Allow update for edge functions" ON public.research_results;

-- Create proper restrictive policies with user isolation
CREATE POLICY "Users can view their own research results"
  ON public.research_results
  FOR SELECT
  USING ((auth.uid())::text = user_id OR (auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Service role can insert research results"
  ON public.research_results
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Users can update their own research results"
  ON public.research_results
  FOR UPDATE
  USING ((auth.uid())::text = user_id OR (auth.jwt() ->> 'role') = 'service_role');