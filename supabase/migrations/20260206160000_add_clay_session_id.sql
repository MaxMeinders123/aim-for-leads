-- Add clay_session_id column to prospect_research for matching Clay responses back
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS clay_session_id UUID;

-- Index for fast lookups when Clay calls back with session_id
CREATE INDEX IF NOT EXISTS idx_prospect_research_clay_session_id ON prospect_research(clay_session_id);

COMMENT ON COLUMN prospect_research.clay_session_id IS 'Unique session ID sent to Clay in the HTTP POST, used to match the response back to the prospect';
