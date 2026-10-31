-- ============================================================================
-- MOID - UNDO the database lockdown (emergency rollback), 2026-10-31
-- ============================================================================
-- Use this ONLY if the app stopped working after supabase/APPLY_ME_2026-10-31_LOCKDOWN.sql.
-- It gives the public (anon) and signed-in (authenticated) roles back the same
-- open access the database had before the lockdown, so a deployment that is
-- still using the anon key works again straight away. No data is touched.
--
-- Paste this WHOLE file into the Supabase SQL Editor and press Run.
-- Safe to run more than once. Instructions: docs/APPLY_ME_INSTRUCTIONS.md
--
-- This re-opens the database to anyone holding the public anon key. Run the
-- lockdown again once SUPABASE_SERVICE_ROLE_KEY is set and the app is
-- redeployed (check /api/health says dbKey = "service_role").
-- ============================================================================

DO $$
DECLARE
  r record;
  low_roles text;
  open_roles text;
  has_service boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  SELECT string_agg(quote_ident(rolname), ', ') INTO low_roles
  FROM pg_roles WHERE rolname IN ('anon', 'authenticated');

  IF low_roles IS NULL THEN
    RAISE NOTICE 'no anon/authenticated roles in this database: nothing to restore';
    RETURN;
  END IF;
  open_roles := low_roles || CASE WHEN has_service THEN ', service_role' ELSE '' END;

  -- 1. Tables: RLS stays on, with the original "allow everything" policy back.
  FOR r IN
    SELECT c.relname AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', left(r.t, 40) || '_open_access', r.t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO %s USING (true) WITH CHECK (true)',
      left(r.t, 40) || '_open_access', r.t, low_roles
    );
    EXECUTE format('GRANT ALL ON TABLE public.%I TO %s', r.t, open_roles);
  END LOOP;

  -- 2. Views (effective_events): readable again, and back to running with the
  --    owner's rights like before the lockdown.
  FOR r IN
    SELECT c.relname AS v
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO %s', r.v, open_roles);
    BEGIN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = false)', r.v);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- older Postgres, or a materialized view: nothing to reset
    END;
  END LOOP;

  -- 3. Sequences.
  EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO %s', open_roles);

  -- 4. Functions (totals_*, ...): callable again.
  FOR r IN
    SELECT p.oid::regprocedure AS f
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, %s', r.f, open_roles);
  END LOOP;

  -- 5. Tables created from now on are open again too (Supabase's default).
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %s', open_roles);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %s', open_roles);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO %s', open_roles);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('postgres', 'supabase_admin') LOOP
    BEGIN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO %s', r.rolname, open_roles);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON SEQUENCES TO %s', r.rolname, open_roles);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON FUNCTIONS TO %s', r.rolname, open_roles);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'could not change default privileges for role %, continuing', r.rolname;
    END;
  END LOOP;
END
$$;

-- ===========================================================================
-- Check (read-only): after the rollback every table should show anon_can_read = true.
-- ===========================================================================
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_on,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_read
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
