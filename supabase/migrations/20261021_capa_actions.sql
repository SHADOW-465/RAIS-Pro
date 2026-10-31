-- Plant CAPA register. The previous register lived in each browser's
-- localStorage, so a second browser or user saw a different list.
-- This file is not applied by the app. Until it is, /api/capa answers
-- source "unavailable" and the browser keeps its local list, then imports
-- that list once the table exists and is still empty.
--
-- One row per CAPA. `record` is the whole CapaRecord (validated by Zod in
-- /api/capa); status and due_date are copied out so the register can be
-- queried without unpacking JSON.

CREATE TABLE IF NOT EXISTS capa_actions (
  company_id   text        NOT NULL DEFAULT 'default',
  id           text        NOT NULL,
  record       jsonb       NOT NULL,
  status       text        NOT NULL,
  due_date     text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL,
  updated_by   text        NOT NULL,
  PRIMARY KEY (company_id, id)
);

CREATE INDEX IF NOT EXISTS capa_actions_company_idx
  ON capa_actions (company_id, created_at DESC);

ALTER TABLE capa_actions ENABLE ROW LEVEL SECURITY;

-- Service role only: CAPA text names owners and problems, so it is not
-- readable through the anon key. The API is the only reader and writer.
DROP POLICY IF EXISTS capa_actions_service_role_all ON capa_actions;
CREATE POLICY capa_actions_service_role_all ON capa_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON capa_actions FROM anon, authenticated;
GRANT ALL ON capa_actions TO service_role;
