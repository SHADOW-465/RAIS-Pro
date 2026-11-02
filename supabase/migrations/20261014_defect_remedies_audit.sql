-- Audit + optimistic concurrency for the plant remedy book.
-- Additive only: existing (company_id, code) uniqueness stays the identity.

ALTER TABLE defect_remedies
  ADD COLUMN IF NOT EXISTS defect_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

UPDATE defect_remedies
   SET created_at = COALESCE(created_at, updated_at),
       created_by = COALESCE(created_by, updated_by)
 WHERE created_at IS NULL OR created_by IS NULL;

ALTER TABLE defect_trend_notes
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

UPDATE defect_trend_notes
   SET created_at = COALESCE(created_at, updated_at),
       created_by = COALESCE(created_by, updated_by)
 WHERE created_at IS NULL OR created_by IS NULL;
