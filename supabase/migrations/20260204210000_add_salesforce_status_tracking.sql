-- Add Salesforce status tracking fields to prospect_research table
-- These fields track the prospect's status within Salesforce campaigns

-- CampaignMember status from Salesforce (Added, Sent, Responded, etc.)
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS salesforce_campaign_status TEXT;

-- Whether the prospect has responded in Salesforce
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS salesforce_has_responded BOOLEAN DEFAULT false;

-- First response date from Salesforce
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS salesforce_first_responded TIMESTAMP WITH TIME ZONE;

-- Last activity/modification date from Salesforce
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS salesforce_last_activity TIMESTAMP WITH TIME ZONE;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prospect_research_sf_campaign_status ON prospect_research(salesforce_campaign_status);
CREATE INDEX IF NOT EXISTS idx_prospect_research_sf_has_responded ON prospect_research(salesforce_has_responded);
CREATE INDEX IF NOT EXISTS idx_prospect_research_sf_last_activity ON prospect_research(salesforce_last_activity DESC);

-- Add comments for documentation
COMMENT ON COLUMN prospect_research.salesforce_campaign_status IS 'CampaignMember Status from Salesforce: Added, Sent, Responded, Converted, etc.';
COMMENT ON COLUMN prospect_research.salesforce_has_responded IS 'Whether the prospect has responded in Salesforce campaign';
COMMENT ON COLUMN prospect_research.salesforce_first_responded IS 'First response date from Salesforce CampaignMember';
COMMENT ON COLUMN prospect_research.salesforce_last_activity IS 'Last modified date from Salesforce CampaignMember';

-- Update the status column check constraint to include new Salesforce-related statuses
ALTER TABLE prospect_research DROP CONSTRAINT IF EXISTS prospect_research_status_check;

ALTER TABLE prospect_research ADD CONSTRAINT prospect_research_status_check
CHECK (status IN (
  'pending',           -- Initial state
  'sent_to_clay',      -- Sent to Clay for enrichment
  'inputted',          -- Enriched by Clay and ready
  'duplicate',         -- Marked as duplicate by Clay
  'synced_to_salesforce', -- Synced to Salesforce
  'contacted',         -- Contacted in Salesforce (Status = Sent)
  'responded',         -- Responded in Salesforce
  'converted'          -- Converted in Salesforce
));

-- Add comment explaining the status flow
COMMENT ON COLUMN prospect_research.status IS 'Prospect lifecycle status: pending → sent_to_clay → inputted → synced_to_salesforce → contacted → responded → converted';
