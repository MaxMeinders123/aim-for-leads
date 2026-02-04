-- Fix RLS policies for proper user isolation
-- This migration replaces overly permissive policies with user_id-based filtering

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own company research" ON public.company_research;
DROP POLICY IF EXISTS "Edge functions can insert company research" ON public.company_research;
DROP POLICY IF EXISTS "Edge functions can update company research" ON public.company_research;
DROP POLICY IF EXISTS "Users can view prospects" ON public.prospect_research;
DROP POLICY IF EXISTS "Edge functions can insert prospects" ON public.prospect_research;
DROP POLICY IF EXISTS "Edge functions and users can update prospects" ON public.prospect_research;

-- Create secure RLS policies for company_research
-- Users can only view their own company research
CREATE POLICY "Users can view their own company research"
  ON public.company_research
  FOR SELECT
  USING (
    auth.uid()::text = user_id
    OR auth.jwt()->>'role' = 'service_role'
  );

-- Edge functions (service_role) can insert any company research
-- Regular users cannot insert directly (must go through edge function)
CREATE POLICY "Service role can insert company research"
  ON public.company_research
  FOR INSERT
  WITH CHECK (
    auth.jwt()->>'role' = 'service_role'
  );

-- Users can only update their own company research
-- Edge functions can update any
CREATE POLICY "Users can update their own company research"
  ON public.company_research
  FOR UPDATE
  USING (
    auth.uid()::text = user_id
    OR auth.jwt()->>'role' = 'service_role'
  );

-- Create secure RLS policies for prospect_research
-- Users can only view their own prospects
CREATE POLICY "Users can view their own prospects"
  ON public.prospect_research
  FOR SELECT
  USING (
    auth.uid()::text = user_id
    OR auth.jwt()->>'role' = 'service_role'
  );

-- Edge functions (service_role) can insert any prospect
-- Regular users cannot insert directly (must go through edge function)
CREATE POLICY "Service role can insert prospects"
  ON public.prospect_research
  FOR INSERT
  WITH CHECK (
    auth.jwt()->>'role' = 'service_role'
  );

-- Users can only update their own prospects (for sending to Clay)
-- Edge functions can update any
CREATE POLICY "Users can update their own prospects"
  ON public.prospect_research
  FOR UPDATE
  USING (
    auth.uid()::text = user_id
    OR auth.jwt()->>'role' = 'service_role'
  );

-- Add DELETE policies for completeness (users can delete their own data)
CREATE POLICY "Users can delete their own company research"
  ON public.company_research
  FOR DELETE
  USING (
    auth.uid()::text = user_id
    OR auth.jwt()->>'role' = 'service_role'
  );

CREATE POLICY "Users can delete their own prospects"
  ON public.prospect_research
  FOR DELETE
  USING (
    auth.uid()::text = user_id
    OR auth.jwt()->>'role' = 'service_role'
  );