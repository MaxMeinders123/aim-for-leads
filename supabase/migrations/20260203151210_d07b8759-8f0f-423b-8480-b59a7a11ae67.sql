-- Add salesforce_webhook_url column to user_integrations table
ALTER TABLE public.user_integrations 
ADD COLUMN IF NOT EXISTS salesforce_webhook_url text;