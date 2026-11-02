-- ============================================================================
-- MOID - database LOCKDOWN, 2026-10-31
-- ============================================================================
-- !!  ONLY run this AFTER SUPABASE_SERVICE_ROLE_KEY is set in Vercel and the
-- !!  app has been redeployed. Confirm first: sign in and open /api/health -
-- !!  it must say "dbKey": "service_role". An app that still uses the anon key
-- !!  stops working the moment this runs (undo: ROLLBACK_LOCKDOWN_2026-10-31.sql).
--
-- Paste this WHOLE file into the Supabase SQL Editor and press Run.
-- Step-by-step instructions: docs/APPLY_ME_INSTRUCTIONS.md
--
-- * Run APPLY_ME_2026-10-31.sql (the features file) first.
-- * Safe to run more than once. It is one script: if a statement fails,
--   nothing is changed.
--
-- Expected result: no red error, and a results grid listing every table with
-- rls_on = true and anon_can_read = false.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Preflight: the tables this update builds on must already exist.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.events') IS NULL THEN
    RAISE EXCEPTION 'Table public.events is missing. This does not look like the MOID database - check you are in the right Supabase project.';
  END IF;
  IF to_regclass('public.batch_conversions') IS NULL THEN
    RAISE EXCEPTION 'Table public.batch_conversions is missing. Run supabase/migrations/20260923_batch_conversions.sql and 20261006_batch_conversion_partial.sql first.';
  END IF;
END
$$;

-- ===========================================================================
-- 1. 20261102000000_rls_lockdown.sql
-- ===========================================================================
-- RLS lockdown: only the server (service_role) may touch application data.
--
-- The app's browser code never talks to Supabase (every read and write goes
-- through a Next.js API route that uses SUPABASE_SERVICE_ROLE_KEY), so the
-- anon and authenticated roles need no access at all. Earlier migrations
-- granted them everything (`GRANT ALL ... TO anon, authenticated`) behind
-- `USING (true)` policies, which meant the public anon key could read and
-- rewrite the whole ledger and read plant_users password hashes.
--
-- !! BEFORE APPLYING: SUPABASE_SERVICE_ROLE_KEY must be set in the app's
-- !! environment (e.g. Vercel). A deployment that only has the anon key stops
-- !! working the moment this runs. See docs/APPLY_ME_INSTRUCTIONS.md.
--
-- Idempotent: safe to run any number of times, and it covers tables created
-- by any earlier migration (or by hand) because it walks the catalog instead
-- of naming tables. Run it LAST, after every other migration.

DO $$
DECLARE
  r record;
  pol record;
  low_roles text;
  has_service boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  -- Only name roles that exist (a plain Postgres install may lack some).
  SELECT string_agg(quote_ident(rolname), ', ') INTO low_roles
  FROM pg_roles WHERE rolname IN ('anon', 'authenticated');

  IF NOT has_service THEN
    RAISE WARNING 'role service_role does not exist: skipping its policies and grants';
  END IF;

  -- 1. Tables: RLS on, every old policy replaced by one service_role-only policy.
  FOR r IN
    SELECT c.relname AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.t);

    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = r.t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, r.t);
    END LOOP;

    IF has_service THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
        left(r.t, 40) || '_service_role_all', r.t
      );
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', r.t);
    END IF;

    IF low_roles IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %s', r.t, low_roles);
    END IF;
  END LOOP;

  IF low_roles IS NULL THEN
    RETURN;
  END IF;

  -- 2. Views (e.g. effective_events): a view runs with its owner's rights and
  --    ignores the caller's RLS, so it needs its own revoke. Also make it run
  --    with the caller's rights where Postgres supports it (15+).
  FOR r IN
    SELECT c.relname AS v
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %s', r.v, low_roles);
    IF has_service THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', r.v);
    END IF;
    BEGIN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.v);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- older Postgres, or a materialized view: the revoke above is enough
    END;
  END LOOP;

  -- 3. Sequences.
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %s', low_roles);

  -- 4. Functions / RPCs (totals_*, bump_ledger_meta, ...): not callable through
  --    the public API. Extension-owned functions are left alone.
  FOR r IN
    SELECT p.oid::regprocedure AS f
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, %s', r.f, low_roles);
    IF has_service THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.f);
    END IF;
  END LOOP;

  -- 5. Objects created from now on should not be handed to anon/authenticated
  --    either (Supabase's default privileges do exactly that).
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %s', low_roles);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %s', low_roles);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %s', low_roles);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('postgres', 'supabase_admin') LOOP
    BEGIN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %s', r.rolname, low_roles);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %s', r.rolname, low_roles);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %s', r.rolname, low_roles);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'could not change default privileges for role %, continuing', r.rolname;
    END;
  END LOOP;
END
$$;

-- ===========================================================================
-- Check (read-only). Every application table should show rls_on = true and anon_can_read = false.
-- ===========================================================================
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_on,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_read
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
