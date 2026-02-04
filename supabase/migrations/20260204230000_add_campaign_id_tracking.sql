-- Add salesforce_campaign_id to company_research table
-- This tracks which Salesforce Campaign the research came from
ALTER TABLE company_research ADD COLUMN IF NOT EXISTS salesforce_campaign_id TEXT;

-- Add salesforce_campaign_id to prospect_research table
-- This allows Clay to add the Contact to the correct Campaign
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS salesforce_campaign_id TEXT;

-- Create indexes for campaign queries
CREATE INDEX IF NOT EXISTS idx_company_research_sf_campaign_id ON company_research(salesforce_campaign_id);
CREATE INDEX IF NOT EXISTS idx_prospect_research_sf_campaign_id ON prospect_research(salesforce_campaign_id);

-- Add comments for documentation
COMMENT ON COLUMN company_research.salesforce_campaign_id IS 'Salesforce Campaign ID (e.g., 701Q400000S45dlIAB) - used to track which campaign this research came from';
COMMENT ON COLUMN prospect_research.salesforce_campaign_id IS 'Salesforce Campaign ID - Clay uses this to add the Contact as a CampaignMember to the correct campaign';
