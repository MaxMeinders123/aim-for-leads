-- Phase 1: Add missing columns to prospect_research table
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS salesforce_url TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS salesforce_account_id TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS personal_id UUID DEFAULT gen_random_uuid();
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Add salesforce fields to companies table if missing
ALTER TABLE companies ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS salesforce_account_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS salesforce_campaign_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Add salesforce_import_webhook_url to user_integrations
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS salesforce_import_webhook_url TEXT;

-- Create index for personal_id lookups (used by clay-webhook)
CREATE INDEX IF NOT EXISTS idx_prospect_research_personal_id ON prospect_research(personal_id);

-- Create index for company_id lookups
CREATE INDEX IF NOT EXISTS idx_prospect_research_company_id ON prospect_research(company_id);

-- Update trigger for companies updated_at
CREATE OR REPLACE FUNCTION update_companies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_companies_updated_at ON companies;
CREATE TRIGGER trigger_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION update_companies_updated_at();

-- RLS for companies - users can only see/modify their own
DROP POLICY IF EXISTS "users_see_own_companies" ON companies;
DROP POLICY IF EXISTS "users_create_own_companies" ON companies;
DROP POLICY IF EXISTS "users_update_own_companies" ON companies;
DROP POLICY IF EXISTS "users_delete_own_companies" ON companies;

CREATE POLICY "users_see_own_companies"
ON companies FOR SELECT
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM campaigns WHERE campaigns.id = companies.campaign_id AND campaigns.user_id = auth.uid()
));

CREATE POLICY "users_create_own_companies"
ON companies FOR INSERT
WITH CHECK (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM campaigns WHERE campaigns.id = companies.campaign_id AND campaigns.user_id = auth.uid()
));

CREATE POLICY "users_update_own_companies"
ON companies FOR UPDATE
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM campaigns WHERE campaigns.id = companies.campaign_id AND campaigns.user_id = auth.uid()
));

CREATE POLICY "users_delete_own_companies"
ON companies FOR DELETE
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM campaigns WHERE campaigns.id = companies.campaign_id AND campaigns.user_id = auth.uid()
));