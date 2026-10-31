-- ============================================================================
-- MOID - combined database update, 2026-10-31
-- ============================================================================
-- Paste this WHOLE file into the Supabase SQL Editor and press Run.
-- Step-by-step instructions: docs/APPLY_ME_INSTRUCTIONS.md
--
-- * Safe to run more than once (every statement is idempotent).
-- * It is one script: if any statement fails, nothing is changed. Copy the
--   error message and send it to the developer.
-- * It contains, in order, every migration added on the fix/production-hardening
--   branch, copied verbatim from supabase/migrations/. The row-level-security
--   lockdown is deliberately LAST.
--
-- BEFORE YOU RUN: SUPABASE_SERVICE_ROLE_KEY must already be set in the app's
-- environment (Vercel). The lockdown at the end removes the public (anon) key's
-- access to the data; an app that only has the anon key stops working.
--
-- Expected result: no red error, and a results grid listing every table with
-- rls_on = true and anon_can_read = false (the check query at the very bottom).
-- The editor may ask you to confirm "destructive operations" (DROP POLICY /
-- DROP INDEX appear because the script is re-runnable) - that is expected.
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
-- 1. 20261021_capa_actions.sql
-- ===========================================================================
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

-- ===========================================================================
-- 2. 20261031120000_batch_conversion_reversal.sql
-- ===========================================================================
-- Soft undo for a batch conversion. The row stays. Active lineage is every
-- row whose reversed_at is null. Unique lot edges apply only to those rows,
-- so a lot can be converted again after a GM undoes the previous edge.
-- Idempotent: safe to run once the batch_conversions table exists.

ALTER TABLE public.batch_conversions
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by text,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

DROP INDEX IF EXISTS public.batch_conversions_from_batch_uidx;
DROP INDEX IF EXISTS public.batch_conversions_to_batch_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS batch_conversions_from_batch_active_uidx
  ON public.batch_conversions (from_batch)
  WHERE reversed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS batch_conversions_to_batch_active_uidx
  ON public.batch_conversions (to_batch)
  WHERE reversed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.batch_conversion_audits (
  id text PRIMARY KEY,
  conversion_id text NOT NULL,
  action text NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL,
  at timestamptz NOT NULL,
  snapshot jsonb NOT NULL
);

ALTER TABLE public.batch_conversion_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_conversion_audits_all ON public.batch_conversion_audits;
CREATE POLICY batch_conversion_audits_all ON public.batch_conversion_audits
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.batch_conversion_audits TO anon, authenticated, service_role;

-- ===========================================================================
-- 3. 20261031130000_batch_conversion_reason.sql
-- ===========================================================================
-- Why a size change happened. Text, not an enum, so a later category
-- (appended to CONVERSION_REASON_CATEGORIES) does not need another migration.
-- Idempotent. Existing rows keep a null category; new saves require one
-- in application code and refuse with 503 until these columns exist.

ALTER TABLE public.batch_conversions
  ADD COLUMN IF NOT EXISTS reason_category text,
  ADD COLUMN IF NOT EXISTS reason_note text;

-- ===========================================================================
-- 4. 20261031140000_plant_shared_state.sql
-- ===========================================================================
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

-- ===========================================================================
-- 5. 20261101120000_effective_events.sql
-- ===========================================================================
-- Effective ledger and server-side totals.
--
-- Not applied by this change. The app feature-detects these functions and, until
-- they exist, aggregates with the same JS selectors in src/lib/analytics.
-- The executable spec of the sums below is src/lib/analytics/sql-totals.ts.
-- Keep the two in lockstep: a jest test compares that reference to byStage,
-- byDefect, and per-day aggregate().
--
-- Idempotent: CREATE OR REPLACE, CREATE INDEX IF NOT EXISTS.

-- Rows a Correction has superseded are not part of any total. The correction
-- row itself stays, so the history of the change is still in `events`.
create or replace view public.effective_events as
select e.*
from public.events e
where not exists (
  select 1
  from public.events c
  where c.event_type = 'correction'
    and c.payload->>'supersedesEventId' = e.event_id
);

-- Stable keyset/offset order. recorded_at alone ties inside one ingest, and
-- PostgREST then repeats or skips rows once a page crosses 1000.
create index if not exists events_recorded_at_event_id_idx
  on public.events (recorded_at, event_id);

create index if not exists events_correction_supersedes_idx
  on public.events ((payload->>'supersedesEventId'))
  where event_type = 'correction';

create index if not exists events_type_occurred_stage_idx
  on public.events (event_type, ((occurred_on->>'start')), ((payload->>'stageId')));

-- Quantity lives in the JSON payload. Missing or non-numeric counts as 0,
-- which is what lib/analytics qty() does.
create or replace function public.moid_event_qty(payload jsonb)
returns numeric
language sql
immutable
as $$
  select case
    when jsonb_typeof(payload->'quantity') = 'number' then (payload->>'quantity')::numeric
    else 0
  end;
$$;

-- One row per occurred-on start day. Sums match aggregate() in rejection.ts:
--   checked  = production
--   good     = inspection/accepted
--   rework   = inspection/rework
--   rejected = inspection/rejected, or the day's rejection events when that
--              inspection sum is 0
--   reworkCountsAs 'checked' adds rework into checked
create or replace function public.totals_daily(
  p_from date,
  p_to date,
  p_stage_ids text[] default null,
  p_rework_counts_as text default 'excluded'
)
returns table (
  day date,
  checked numeric,
  good numeric,
  rework numeric,
  rejected numeric
)
language sql
stable
as $$
  with base as (
    select
      (e.occurred_on->>'start')::date as day,
      e.event_type,
      e.payload->>'disposition' as disposition,
      public.moid_event_qty(e.payload) as quantity
    from public.effective_events e
    where e.event_type in ('production', 'inspection', 'rejection')
      and (p_from is null or (e.occurred_on->>'start') >= p_from::text)
      and (p_to is null or coalesce(e.occurred_on->>'end', e.occurred_on->>'start') <= p_to::text)
      and (
        p_stage_ids is null
        or coalesce(array_length(p_stage_ids, 1), 0) = 0
        or e.payload->>'stageId' = any (p_stage_ids)
      )
  ),
  agg as (
    select
      day,
      coalesce(sum(quantity) filter (where event_type = 'production'), 0) as checked,
      coalesce(sum(quantity) filter (where event_type = 'inspection' and disposition = 'accepted'), 0) as good,
      coalesce(sum(quantity) filter (where event_type = 'inspection' and disposition = 'rework'), 0) as rework,
      coalesce(sum(quantity) filter (where event_type = 'inspection' and disposition = 'rejected'), 0) as rejected_insp,
      coalesce(sum(quantity) filter (where event_type = 'rejection'), 0) as defect_rej
    from base
    where day is not null
    group by day
  )
  select
    agg.day,
    case
      when p_rework_counts_as = 'checked' then agg.checked + agg.rework
      else agg.checked
    end as checked,
    agg.good,
    agg.rework,
    case
      when agg.rejected_insp = 0 and agg.defect_rej > 0 then agg.defect_rej
      else agg.rejected_insp
    end as rejected
  from agg
  order by agg.day;
$$;

-- Per-stage sums with the same batch cascade as batchCascadedAgg:
-- within one batch, a later gate whose checked equals the batch's first
-- checked (or is 0) is measured on the previous gate's accepted quantity.
-- p_stage_order is the catalog order stagesFor() would use. Stages absent
-- from that list are appended, sorted by name, so an unknown gate is still
-- counted.
create or replace function public.totals_stage(
  p_from date,
  p_to date,
  p_stage_ids text[] default null,
  p_stage_order text[] default null,
  p_rework_counts_as text default 'excluded'
)
returns table (
  stage_id text,
  checked numeric,
  good numeric,
  rework numeric,
  rejected numeric
)
language plpgsql
stable
as $$
declare
  rec record;
  batch text;
  sid text;
  present text[];
  ordered text[];
  idx int;
  initial_checked numeric;
  prev_accepted numeric;
  a_checked numeric;
  a_good numeric;
  a_rework numeric;
  a_rejected numeric;
  use_checked numeric;
  use_good numeric;
begin
  create temporary table if not exists moid_stage_acc (
    stage_id text primary key,
    checked numeric not null,
    good numeric not null,
    rework numeric not null,
    rejected numeric not null
  ) on commit drop;
  truncate moid_stage_acc;

  create temporary table if not exists moid_stage_rows (
    batch_key text,
    stage_id text,
    event_type text,
    disposition text,
    quantity numeric
  ) on commit drop;
  truncate moid_stage_rows;

  insert into moid_stage_rows (batch_key, stage_id, event_type, disposition, quantity)
  select
    -- Match batchCascadedAgg: a present batchNo wins even when it is null or
    -- blank. customFields.batch is used only when the batchNo key is absent.
    case
      when e.payload ? 'batchNo' then nullif(btrim(e.payload->>'batchNo'), '')
      else nullif(btrim(coalesce(e.payload #>> '{customFields,batch}', '')), '')
    end,
    e.payload->>'stageId',
    e.event_type,
    e.payload->>'disposition',
    public.moid_event_qty(e.payload)
  from public.effective_events e
  where e.event_type in ('production', 'inspection', 'rejection')
    and e.payload->>'stageId' is not null
    and (p_from is null or (e.occurred_on->>'start') >= p_from::text)
    and (p_to is null or coalesce(e.occurred_on->>'end', e.occurred_on->>'start') <= p_to::text)
    and (
      p_stage_ids is null
      or coalesce(array_length(p_stage_ids, 1), 0) = 0
      or e.payload->>'stageId' = any (p_stage_ids)
    );

  select coalesce(array_agg(s order by s), array[]::text[])
    into ordered
  from (
    select distinct r.stage_id as s from moid_stage_rows r
  ) d;

  if p_stage_order is not null and coalesce(array_length(p_stage_order, 1), 0) > 0 then
    select coalesce(array_agg(s order by ord, s), array[]::text[])
      into ordered
    from (
      select
        d.s,
        coalesce(array_position(p_stage_order, d.s), 100000) as ord
      from (select distinct r.stage_id as s from moid_stage_rows r) d
    ) x;
  end if;

  insert into moid_stage_acc (stage_id, checked, good, rework, rejected)
  select s, 0, 0, 0, 0 from unnest(ordered) as s;

  -- Unbatched rows: plain aggregate(), no cascade.
  for sid in select a.stage_id from moid_stage_acc a loop
    select
      coalesce(sum(quantity) filter (where event_type = 'production'), 0),
      coalesce(sum(quantity) filter (where event_type = 'inspection' and disposition = 'accepted'), 0),
      coalesce(sum(quantity) filter (where event_type = 'inspection' and disposition = 'rework'), 0),
      coalesce(sum(quantity) filter (where event_type = 'inspection' and disposition = 'rejected'), 0),
      coalesce(sum(quantity) filter (where event_type = 'rejection'), 0)
    into a_checked, a_good, a_rework, a_rejected, prev_accepted
    from moid_stage_rows
    where stage_id = sid and batch_key is null;

    if a_rejected = 0 and prev_accepted > 0 then
      a_rejected := prev_accepted;
    end if;
    if p_rework_counts_as = 'checked' then
      a_checked := a_checked + a_rework;
    end if;

    update moid_stage_acc
      set checked = checked + a_checked,
          good = good + a_good,
          rework = rework + a_rework,
          rejected = rejected + a_rejected
      where stage_id = sid;
  end loop;

  for batch in
    select distinct r.batch_key from moid_stage_rows r where r.batch_key is not null
  loop
    select coalesce(array_agg(s order by array_position(ordered, s)), array[]::text[])
      into present
    from (
      select distinct r.stage_id as s
      from moid_stage_rows r
      where r.batch_key = batch and r.stage_id = any (ordered)
    ) p;

    initial_checked := 0;
    prev_accepted := null;
    idx := 1;
    foreach sid in array present loop
      select
        coalesce(sum(quantity) filter (where event_type = 'production'), 0),
        coalesce(sum(quantity) filter (where event_type = 'inspection' and disposition = 'accepted'), 0),
        coalesce(sum(quantity) filter (where event_type = 'inspection' and disposition = 'rework'), 0),
        coalesce(sum(quantity) filter (where event_type = 'inspection' and disposition = 'rejected'), 0),
        coalesce(sum(quantity) filter (where event_type = 'rejection'), 0)
      into a_checked, a_good, a_rework, a_rejected, use_good
      from moid_stage_rows
      where batch_key = batch and stage_id = sid;

      if a_rejected = 0 and use_good > 0 then
        a_rejected := use_good;
      end if;
      if p_rework_counts_as = 'checked' then
        a_checked := a_checked + a_rework;
      end if;

      if idx = 1 then
        initial_checked := a_checked;
      end if;

      use_checked := a_checked;
      use_good := case when a_good > 0 then a_good else greatest(0, use_checked - a_rejected) end;

      if idx > 1 and prev_accepted is not null and prev_accepted > 0 then
        if use_checked = initial_checked or use_checked = 0 then
          use_checked := prev_accepted;
          use_good := greatest(0, use_checked - a_rejected);
        end if;
      end if;

      prev_accepted := use_good;
      idx := idx + 1;

      update moid_stage_acc
        set checked = checked + use_checked,
            good = good + use_good,
            rework = rework + a_rework,
            rejected = rejected + a_rejected
        where stage_id = sid;
    end loop;
  end loop;

  return query
  select a.stage_id, a.checked, a.good, a.rework, a.rejected
  from moid_stage_acc a
  where a.checked > 0 or a.rejected > 0
  order by array_position(ordered, a.stage_id);
end;
$$;

-- Defect quantities. Alias match uses the same collapse as collapseKey:
-- uppercase, strip non-alphanumeric. p_aliases is
-- [{"key":"thin spod","canonicalId":"THSP","label":"Thin spot"}].
-- A stored defectCode wins. Otherwise the raw label. Otherwise Unclassified.
create or replace function public.totals_defect(
  p_from date,
  p_to date,
  p_stage_ids text[] default null,
  p_aliases jsonb default '[]'::jsonb
)
returns table (
  defect_code text,
  label text,
  rejected numeric,
  unresolved boolean
)
language sql
stable
as $$
  with base as (
    select
      nullif(btrim(e.payload->>'defectCode'), '') as stored_code,
      btrim(coalesce(e.payload->>'defectCodeRaw', '')) as raw_label,
      public.moid_event_qty(e.payload) as quantity
    from public.effective_events e
    where e.event_type = 'rejection'
      and (p_from is null or (e.occurred_on->>'start') >= p_from::text)
      and (p_to is null or coalesce(e.occurred_on->>'end', e.occurred_on->>'start') <= p_to::text)
      and (
        p_stage_ids is null
        or coalesce(array_length(p_stage_ids, 1), 0) = 0
        or e.payload->>'stageId' = any (p_stage_ids)
      )
  ),
  resolved as (
    select
      b.quantity,
      b.raw_label,
      case
        when b.stored_code is not null then b.stored_code
        else (
          select nullif(btrim(regexp_replace(a->>'canonicalId', '^(STAGE|DEFECT|SIZE):', '', 'i')), '')
          from jsonb_array_elements(coalesce(p_aliases, '[]'::jsonb)) a
          where upper(regexp_replace(coalesce(a->>'key', ''), '[^A-Za-z0-9]', '', 'g'))
                = upper(regexp_replace(b.raw_label, '[^A-Za-z0-9]', '', 'g'))
             or upper(regexp_replace(regexp_replace(coalesce(a->>'canonicalId', ''), '^(STAGE|DEFECT|SIZE):', '', 'i'), '[^A-Za-z0-9]', '', 'g'))
                = upper(regexp_replace(b.raw_label, '[^A-Za-z0-9]', '', 'g'))
          limit 1
        )
      end as code
    from base b
  ),
  keyed as (
    select
      r.quantity,
      r.code,
      case
        when r.code is not null then false
        when r.raw_label <> '' then true
        else false
      end as unresolved,
      case
        when r.code is not null then coalesce(
          (
            select nullif(btrim(a->>'label'), '')
            from jsonb_array_elements(coalesce(p_aliases, '[]'::jsonb)) a
            where upper(regexp_replace(regexp_replace(coalesce(a->>'canonicalId', ''), '^(STAGE|DEFECT|SIZE):', '', 'i'), '[^A-Za-z0-9]', '', 'g'))
                  = upper(regexp_replace(r.code, '[^A-Za-z0-9]', '', 'g'))
               or upper(regexp_replace(coalesce(a->>'key', ''), '[^A-Za-z0-9]', '', 'g'))
                  = upper(regexp_replace(r.code, '[^A-Za-z0-9]', '', 'g'))
            limit 1
          ),
          r.code
        )
        when r.raw_label <> '' then r.raw_label || ' · unresolved'
        else 'Unclassified'
      end as label,
      case
        when r.code is not null then 'code:' || r.code
        when r.raw_label <> '' then 'raw:' || r.raw_label
        else 'unclassified'
      end as bucket
    from resolved r
  )
  select
    case when k.bucket like 'code:%' then substring(k.bucket from 6) else null end as defect_code,
    min(k.label) as label,
    coalesce(sum(k.quantity), 0) as rejected,
    bool_or(k.unresolved) as unresolved
  from keyed k
  group by k.bucket
  order by coalesce(sum(k.quantity), 0) desc, k.bucket;
$$;

grant select on public.effective_events to service_role;
grant execute on function public.moid_event_qty(jsonb) to service_role;
grant execute on function public.totals_daily(date, date, text[], text) to service_role;
grant execute on function public.totals_stage(date, date, text[], text[], text) to service_role;
grant execute on function public.totals_defect(date, date, text[], jsonb) to service_role;

-- ===========================================================================
-- 6. 20261101130000_ledger_meta.sql
-- ===========================================================================
-- Live updates. One row says "something in the plant data changed".
-- Every open browser asks /api/ledger-meta for it about once a minute; when the
-- number moves, the screens reload what they show.
--
-- This file is not applied by the app. Until it is, /api/ledger-meta answers
-- 503 and each browser reloads its screens on a 60-second timer instead.
--
-- Service role only. The browser never reads this table directly: the app
-- signs people in with its own session cookie, not a Supabase login, so a
-- direct (Realtime) subscription would need the anon role to read the plant's
-- tables. The API reads the row with the service key instead.

CREATE TABLE IF NOT EXISTS ledger_meta (
  id         smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version    bigint      NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ledger_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE ledger_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_meta_service_role_all ON ledger_meta;
CREATE POLICY ledger_meta_service_role_all ON ledger_meta
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON ledger_meta FROM anon, authenticated;
GRANT ALL ON ledger_meta TO service_role;

-- One bump per write statement, not per row, so a 5,000-row ingest batch
-- moves the number once.
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

-- ===========================================================================
-- 7. 20261102000000_rls_lockdown.sql
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
-- Check (read-only): every application table should show rls_on = true and
-- anon_can_read = false.
-- ===========================================================================
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_on,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_read
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
