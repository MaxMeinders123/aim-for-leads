-- Add separate webhook URLs for the 3-step research flow
ALTER TABLE public.user_integrations 
ADD COLUMN IF NOT EXISTS company_research_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS people_research_webhook_url TEXT;

-- Migrate existing n8n_webhook_url to company_research_webhook_url if not already set
UPDATE public.user_integrations 
SET company_research_webhook_url = n8n_webhook_url 
WHERE company_research_webhook_url IS NULL AND n8n_webhook_url IS NOT NULL;