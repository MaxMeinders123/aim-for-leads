-- Fix remaining overly permissive RLS policies on research_results table

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow insert for edge functions" ON public.research_results;
DROP POLICY IF EXISTS "Allow select by user_id" ON public.research_results;
DROP POLICY IF EXISTS "Allow update for edge functions" ON public.research_results;

-- Create secure RLS policies for research_results
-- Users can only view their own research results
CREATE POLICY "Users can view their own research results"
  ON public.research_results
  FOR SELECT
  USING (
    auth.uid()::text = user_id
    OR auth.jwt()->>'role' = 'service_role'
  );

-- Only service role can insert (edge functions)
CREATE POLICY "Service role can insert research results"
  ON public.research_results
  FOR INSERT
  WITH CHECK (
    auth.jwt()->>'role' = 'service_role'
  );

-- Users can update their own, or service role can update any
CREATE POLICY "Users can update their own research results"
  ON public.research_results
  FOR UPDATE
  USING (
    auth.uid()::text = user_id
    OR auth.jwt()->>'role' = 'service_role'
  );