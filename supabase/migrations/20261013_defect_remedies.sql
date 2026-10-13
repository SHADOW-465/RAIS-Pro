-- Plant defect remedies. The previous book lived in each browser's
-- localStorage, so "0 of 31" described that browser, not the plant.
-- This file is not applied by the app. The API falls back when the table
-- is missing.

CREATE TABLE IF NOT EXISTS defect_remedies (
  company_id   text NOT NULL DEFAULT 'default',
  code         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  remedy       text NOT NULL DEFAULT '',
  updated_at   timestamptz NOT NULL,
  updated_by   text NOT NULL,
  PRIMARY KEY (company_id, code)
);

CREATE TABLE IF NOT EXISTS defect_trend_notes (
  id           text PRIMARY KEY,
  company_id   text NOT NULL DEFAULT 'default',
  kind         text NOT NULL,
  graph        text NOT NULL,
  period       text NOT NULL DEFAULT '',
  description  text NOT NULL,
  remedy       text NOT NULL,
  updated_at   timestamptz NOT NULL,
  updated_by   text NOT NULL
);

CREATE INDEX IF NOT EXISTS defect_trend_notes_company_idx
  ON defect_trend_notes (company_id, updated_at DESC);

ALTER TABLE defect_remedies ENABLE ROW LEVEL SECURITY;
ALTER TABLE defect_trend_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS defect_remedies_all ON defect_remedies;
CREATE POLICY defect_remedies_all ON defect_remedies
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS defect_trend_notes_all ON defect_trend_notes;
CREATE POLICY defect_trend_notes_all ON defect_trend_notes
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.defect_remedies TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.defect_trend_notes TO anon, authenticated, service_role;
