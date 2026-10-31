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

-- Same pattern as every other table here (see 20260923_batch_conversions.sql),
-- so the feature works whether the server runs on the anon key or the
-- service-role key. The RLS lockdown migration (run last, after
-- SUPABASE_SERVICE_ROLE_KEY is set) tightens this to service_role only.
DROP POLICY IF EXISTS capa_actions_service_role_all ON capa_actions;
CREATE POLICY capa_actions_service_role_all ON capa_actions
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.capa_actions TO anon, authenticated, service_role;
