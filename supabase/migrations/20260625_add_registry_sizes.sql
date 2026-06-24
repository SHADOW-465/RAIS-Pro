-- Add the French-size dimension to the per-client registry.
ALTER TABLE registries ADD COLUMN IF NOT EXISTS sizes JSONB NOT NULL DEFAULT '[]'::jsonb;
