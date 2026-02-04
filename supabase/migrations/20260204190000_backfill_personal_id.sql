-- Backfill personal_id for existing prospects that don't have one
-- This ensures Clay webhook can properly identify all prospects

UPDATE prospect_research
SET personal_id = gen_random_uuid()
WHERE personal_id IS NULL;

-- Make personal_id NOT NULL going forward (since it's required for Clay integration)
ALTER TABLE prospect_research ALTER COLUMN personal_id SET NOT NULL;

-- Ensure personal_id has a unique constraint (each prospect gets unique ID for Clay tracking)
ALTER TABLE prospect_research ADD CONSTRAINT unique_personal_id UNIQUE (personal_id);
