-- Create campaign_imports table to track Salesforce campaign imports
CREATE TABLE IF NOT EXISTS campaign_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  salesforce_campaign_id TEXT NOT NULL,
  total_companies INTEGER NOT NULL DEFAULT 0,
  selected_companies INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_selection' CHECK (status IN ('pending_selection', 'in_progress', 'completed', 'failed')),
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Ensure one import per user per campaign at a time
  UNIQUE(user_id, salesforce_campaign_id)
);

-- Create campaign_companies table to store companies from campaign for selection
CREATE TABLE IF NOT EXISTS campaign_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_import_id UUID NOT NULL REFERENCES campaign_imports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  salesforce_account_id TEXT NOT NULL,
  company_name TEXT,
  website TEXT,
  linkedin TEXT,
  selected BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'researching', 'completed', 'skipped')),
  company_research_id UUID REFERENCES company_research(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- One company per campaign import
  UNIQUE(campaign_import_id, salesforce_account_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_imports_user_id ON campaign_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_imports_sf_campaign_id ON campaign_imports(salesforce_campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_imports_status ON campaign_imports(status);

CREATE INDEX IF NOT EXISTS idx_campaign_companies_import_id ON campaign_companies(campaign_import_id);
CREATE INDEX IF NOT EXISTS idx_campaign_companies_user_id ON campaign_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_companies_selected ON campaign_companies(selected);
CREATE INDEX IF NOT EXISTS idx_campaign_companies_status ON campaign_companies(status);
CREATE INDEX IF NOT EXISTS idx_campaign_companies_sf_account_id ON campaign_companies(salesforce_account_id);

-- Add trigger for updated_at on campaign_imports
CREATE OR REPLACE FUNCTION update_campaign_imports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_campaign_imports_updated_at ON campaign_imports;
CREATE TRIGGER trigger_campaign_imports_updated_at
BEFORE UPDATE ON campaign_imports
FOR EACH ROW
EXECUTE FUNCTION update_campaign_imports_updated_at();

-- Add trigger for updated_at on campaign_companies
CREATE OR REPLACE FUNCTION update_campaign_companies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_campaign_companies_updated_at ON campaign_companies;
CREATE TRIGGER trigger_campaign_companies_updated_at
BEFORE UPDATE ON campaign_companies
FOR EACH ROW
EXECUTE FUNCTION update_campaign_companies_updated_at();

-- Enable RLS
ALTER TABLE campaign_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_companies ENABLE ROW LEVEL SECURITY;

-- RLS policies for campaign_imports
DROP POLICY IF EXISTS "users_see_own_campaign_imports" ON campaign_imports;
CREATE POLICY "users_see_own_campaign_imports"
ON campaign_imports FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_create_own_campaign_imports" ON campaign_imports;
CREATE POLICY "users_create_own_campaign_imports"
ON campaign_imports FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_campaign_imports" ON campaign_imports;
CREATE POLICY "users_update_own_campaign_imports"
ON campaign_imports FOR UPDATE
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_delete_own_campaign_imports" ON campaign_imports;
CREATE POLICY "users_delete_own_campaign_imports"
ON campaign_imports FOR DELETE
USING (user_id = auth.uid());

-- RLS policies for campaign_companies
DROP POLICY IF EXISTS "users_see_own_campaign_companies" ON campaign_companies;
CREATE POLICY "users_see_own_campaign_companies"
ON campaign_companies FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_create_own_campaign_companies" ON campaign_companies;
CREATE POLICY "users_create_own_campaign_companies"
ON campaign_companies FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_campaign_companies" ON campaign_companies;
CREATE POLICY "users_update_own_campaign_companies"
ON campaign_companies FOR UPDATE
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_delete_own_campaign_companies" ON campaign_companies;
CREATE POLICY "users_delete_own_campaign_companies"
ON campaign_companies FOR DELETE
USING (user_id = auth.uid());

-- Add comments
COMMENT ON TABLE campaign_imports IS 'Tracks Salesforce campaign imports for bulk research';
COMMENT ON TABLE campaign_companies IS 'Stores companies from Salesforce campaigns for user selection before research';

COMMENT ON COLUMN campaign_imports.salesforce_campaign_id IS 'Salesforce Campaign ID (e.g., 701Q400000S45dlIAB)';
COMMENT ON COLUMN campaign_imports.status IS 'Import workflow status: pending_selection → in_progress → completed';

COMMENT ON COLUMN campaign_companies.selected IS 'Whether user selected this company for research';
COMMENT ON COLUMN campaign_companies.salesforce_account_id IS 'Salesforce Account ID from CampaignMember';
COMMENT ON COLUMN campaign_companies.company_research_id IS 'Link to company_research table after research completes';
