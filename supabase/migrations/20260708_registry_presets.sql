-- Multi-preset support: registries.client_id becomes the preset identity.
-- Reusing client_id (rather than adding a new PK) avoids touching the
-- cost_config FK. Existing single "disposafe" row becomes preset #1.
ALTER TABLE registries ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE registries ADD COLUMN IF NOT EXISTS created_from_filename TEXT;
ALTER TABLE registries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE registries SET name = 'Default Registry' WHERE name IS NULL;
