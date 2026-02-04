-- Add Salesforce sync fields to prospect_research table
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS salesforce_contact_id TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS sync_status TEXT;

-- Create index for Salesforce contact lookups
CREATE INDEX IF NOT EXISTS idx_prospect_research_salesforce_contact ON prospect_research(salesforce_contact_id);

-- Add comment for documentation
COMMENT ON COLUMN prospect_research.salesforce_contact_id IS 'Salesforce Contact ID after syncing';
COMMENT ON COLUMN prospect_research.synced_at IS 'Timestamp when prospect was synced to Salesforce';
COMMENT ON COLUMN prospect_research.sync_status IS 'Status of Salesforce sync: success, failed, pending';
