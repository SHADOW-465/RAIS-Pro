-- Live updates. One row says "something in the plant data changed".
-- Every open browser asks /api/ledger-meta for it about once a minute; when the
-- number moves, the screens reload what they show.
--
-- This file is not applied by the app. Until it is, /api/ledger-meta answers
-- 503 and each browser reloads its screens on a 60-second timer instead.
--
-- The browser never reads this table directly: the app signs people in with
-- its own session cookie, not a Supabase login, so the API reads the row on the
-- server instead. Grants follow the app's existing pattern (anon + authenticated
-- + service_role) so this works before SUPABASE_SERVICE_ROLE_KEY is set; the RLS
-- lockdown migration, run last, tightens it to service_role only.

CREATE TABLE IF NOT EXISTS ledger_meta (
  id         smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version    bigint      NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ledger_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE ledger_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_meta_service_role_all ON ledger_meta;
CREATE POLICY ledger_meta_service_role_all ON ledger_meta
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.ledger_meta TO anon, authenticated, service_role;

-- One bump per write statement, not per row, so a 5,000-row ingest batch
-- moves the number once. SECURITY DEFINER: the function runs as its owner, so
-- the bump succeeds whichever role (anon or service_role) did the write.
CREATE OR REPLACE FUNCTION bump_ledger_meta() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ledger_meta SET version = version + 1, updated_at = now() WHERE id = 1;
  RETURN NULL;
END;
$$;

-- Every table whose rows a screen shows. Tables that do not exist yet in this
-- project are skipped, so the file can be applied in any order.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'events',
    'ingestions',
    'registries',
    'company_catalog',
    'calculation_policy',
    'cost_config',
    'mods',
    'workbook_snapshots',
    'raw_files',
    'batch_conversions',
    'capa_actions',
    'defect_remedies',
    'plant_shared_state',
    'plant_documents',
    'plant_roles',
    'plant_users'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS ledger_meta_bump ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER ledger_meta_bump AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I '
        'FOR EACH STATEMENT EXECUTE FUNCTION bump_ledger_meta()', t);
    END IF;
  END LOOP;
END
$$;

-- Supabase Realtime publishes ledger_meta only. The plant's own tables are not
-- published: that would stream every event row to the Realtime server and make
-- the ledger readable to anyone who can open a Realtime socket. Skipped when
-- the project has no supabase_realtime publication (a plain Postgres install).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ledger_meta'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_meta;
  END IF;
END
$$;
