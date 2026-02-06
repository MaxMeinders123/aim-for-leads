-- Add campaign_id to prospect_research so prospects can be linked directly to the correct campaign
ALTER TABLE public.prospect_research
ADD COLUMN IF NOT EXISTS campaign_id uuid;

-- FK is optional but helps keep integrity; keep nullable for manual/non-campaign research
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prospect_research_campaign_id_fkey'
  ) THEN
    ALTER TABLE public.prospect_research
      ADD CONSTRAINT prospect_research_campaign_id_fkey
      FOREIGN KEY (campaign_id)
      REFERENCES public.campaigns(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Index for common filtering
CREATE INDEX IF NOT EXISTS idx_prospect_research_campaign_id
ON public.prospect_research(campaign_id);

COMMENT ON COLUMN public.prospect_research.campaign_id IS 'Owning campaign (nullable for manual research)';