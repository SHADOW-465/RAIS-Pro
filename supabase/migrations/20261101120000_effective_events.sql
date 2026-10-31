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
