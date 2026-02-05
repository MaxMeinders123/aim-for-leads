-- Add Salesforce columns to company_research table
ALTER TABLE public.company_research
ADD COLUMN IF NOT EXISTS salesforce_account_id TEXT,
ADD COLUMN IF NOT EXISTS salesforce_campaign_id TEXT;

-- Create indexes for these new columns for better query performance
CREATE INDEX IF NOT EXISTS idx_company_research_salesforce_account_id
  ON public.company_research(salesforce_account_id);

CREATE INDEX IF NOT EXISTS idx_company_research_salesforce_campaign_id
  ON public.company_research(salesforce_campaign_id);
