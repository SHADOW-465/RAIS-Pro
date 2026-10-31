-- Plant-wide copies of settings that used to live in each browser:
-- report presets, workspace presets, shift windows, lot memory,
-- edit grants, and custom defects. One jsonb document per kind.
-- This file is not applied by the app. Until it is, /api/shared-state
-- answers 503 and each browser keeps its local copy.
--
-- Service role only. The API is the only reader and writer.

CREATE TABLE IF NOT EXISTS plant_shared_state (
  company_id  text        NOT NULL DEFAULT 'default',
  kind        text        NOT NULL,
  record      jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text        NOT NULL DEFAULT '',
  PRIMARY KEY (company_id, kind)
);

ALTER TABLE plant_shared_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plant_shared_state_service_role_all ON plant_shared_state;
CREATE POLICY plant_shared_state_service_role_all ON plant_shared_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON plant_shared_state FROM anon, authenticated;
GRANT ALL ON plant_shared_state TO service_role;
