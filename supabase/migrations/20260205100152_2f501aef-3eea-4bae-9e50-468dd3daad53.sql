-- ==============================================
-- 1. ADD MISSING COLUMNS TO TABLES
-- ==============================================

-- Add columns to companies table
ALTER TABLE companies 
  ADD COLUMN IF NOT EXISTS salesforce_account_id TEXT,
  ADD COLUMN IF NOT EXISTS salesforce_campaign_id TEXT;

-- Add columns to company_research table  
ALTER TABLE company_research
  ADD COLUMN IF NOT EXISTS salesforce_account_id TEXT;

-- Add column to prospect_research table
ALTER TABLE prospect_research
  ADD COLUMN IF NOT EXISTS salesforce_account_id TEXT;

-- ==============================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ==============================================

CREATE INDEX IF NOT EXISTS idx_companies_campaign 
  ON companies(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_salesforce_account 
  ON companies(salesforce_account_id) WHERE salesforce_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_salesforce_campaign 
  ON companies(salesforce_campaign_id) WHERE salesforce_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_research_campaign 
  ON company_research(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_research_salesforce 
  ON company_research(salesforce_account_id) WHERE salesforce_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospect_research_salesforce 
  ON prospect_research(salesforce_account_id) WHERE salesforce_account_id IS NOT NULL;

-- ==============================================
-- 3. DATABASE TRIGGERS FOR AUTO-COUNTING
-- ==============================================

-- Trigger to update companies_count in campaigns table
CREATE OR REPLACE FUNCTION update_campaign_companies_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE campaigns
    SET companies_count = (
      SELECT COUNT(DISTINCT id)
      FROM companies
      WHERE campaign_id = NEW.campaign_id
    ),
    updated_at = NOW()
    WHERE id = NEW.campaign_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE campaigns
    SET companies_count = (
      SELECT COUNT(DISTINCT id)
      FROM companies
      WHERE campaign_id = OLD.campaign_id
    ),
    updated_at = NOW()
    WHERE id = OLD.campaign_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS companies_count_trigger ON companies;
CREATE TRIGGER companies_count_trigger
AFTER INSERT OR DELETE ON companies
FOR EACH ROW EXECUTE FUNCTION update_campaign_companies_count();

-- Trigger to update contacts_count in campaigns table
CREATE OR REPLACE FUNCTION update_campaign_contacts_count()
RETURNS TRIGGER AS $$
DECLARE
  v_campaign_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT cr.campaign_id INTO v_campaign_id
    FROM company_research cr
    WHERE cr.id = NEW.company_research_id;
    
    IF v_campaign_id IS NOT NULL THEN
      UPDATE campaigns
      SET contacts_count = (
        SELECT COUNT(pr.id)
        FROM prospect_research pr
        JOIN company_research cr ON cr.id = pr.company_research_id
        WHERE cr.campaign_id = v_campaign_id
      ),
      updated_at = NOW()
      WHERE id = v_campaign_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT cr.campaign_id INTO v_campaign_id
    FROM company_research cr
    WHERE cr.id = OLD.company_research_id;
    
    IF v_campaign_id IS NOT NULL THEN
      UPDATE campaigns
      SET contacts_count = (
        SELECT COUNT(pr.id)
        FROM prospect_research pr
        JOIN company_research cr ON cr.id = pr.company_research_id
        WHERE cr.campaign_id = v_campaign_id
      ),
      updated_at = NOW()
      WHERE id = v_campaign_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS contacts_count_trigger ON prospect_research;
CREATE TRIGGER contacts_count_trigger
AFTER INSERT OR DELETE ON prospect_research
FOR EACH ROW EXECUTE FUNCTION update_campaign_contacts_count();