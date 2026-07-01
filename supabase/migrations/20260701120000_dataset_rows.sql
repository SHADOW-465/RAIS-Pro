-- Row-level values for Datasets (universal schema ingestion, component [D] for
-- generic/unrecognized data). One row per (dataset, source sheet, row index).
-- The UNIQUE constraint makes re-upload of the same file/sheet an idempotent
-- REPLACE of that row's values (upsert on conflict), not a duplicate insert.
CREATE TABLE IF NOT EXISTS dataset_rows (
  id bigserial PRIMARY KEY,
  dataset_id text NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  sheet_name text NOT NULL,
  row_index integer NOT NULL,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, file_name, sheet_name, row_index)
);

CREATE INDEX IF NOT EXISTS dataset_rows_dataset_id_idx ON dataset_rows (dataset_id);

ALTER TABLE dataset_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dataset_rows_service_role_all ON dataset_rows;
CREATE POLICY dataset_rows_service_role_all ON dataset_rows FOR ALL USING (true) WITH CHECK (true);
