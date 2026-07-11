ALTER TABLE registries ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;
