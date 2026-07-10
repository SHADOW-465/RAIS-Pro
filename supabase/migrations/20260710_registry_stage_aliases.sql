ALTER TABLE registries ADD COLUMN IF NOT EXISTS stage_aliases JSONB NOT NULL DEFAULT '{}'::jsonb;
