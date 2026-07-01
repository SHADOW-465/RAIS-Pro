-- Persisted Datasets (universal schema ingestion, component [C]). A Dataset
-- groups all tables sharing one schema signature. id = signature hash, or
-- hash-suffixed on a genuine collision (see src/lib/dataset/registry.ts).
CREATE TABLE IF NOT EXISTS datasets (
  id text PRIMARY KEY,
  signature_hash text NOT NULL,
  title text NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_rows integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS datasets_signature_hash_idx ON datasets (signature_hash);

ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS datasets_service_role_all ON datasets;
CREATE POLICY datasets_service_role_all ON datasets FOR ALL USING (true) WITH CHECK (true);
