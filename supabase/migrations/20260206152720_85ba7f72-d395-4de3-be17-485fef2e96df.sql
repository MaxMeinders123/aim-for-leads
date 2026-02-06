-- Add salesforce_campaign_id column to prospect_research table
ALTER TABLE public.prospect_research
ADD COLUMN salesforce_campaign_id text;

-- Add index for performance on Salesforce campaign lookups
CREATE INDEX idx_prospect_research_salesforce_campaign_id 
ON public.prospect_research(salesforce_campaign_id);

-- Add comment for documentation
COMMENT ON COLUMN public.prospect_research.salesforce_campaign_id IS 'Salesforce Campaign ID for CRM synchronization';