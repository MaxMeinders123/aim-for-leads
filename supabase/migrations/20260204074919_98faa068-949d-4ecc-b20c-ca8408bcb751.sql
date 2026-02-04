-- Update status check constraint to support two-step flow
ALTER TABLE public.research_results DROP CONSTRAINT IF EXISTS research_results_status_check;
ALTER TABLE public.research_results ADD CONSTRAINT research_results_status_check 
  CHECK (status IN ('processing', 'company_complete', 'prospects_pending', 'completed', 'rejected'));