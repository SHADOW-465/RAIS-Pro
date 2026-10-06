-- Batch conversion lineage, including partial quantity and the station
-- where the size changes. Safe to run when the table is missing and when
-- an older table already exists without changed_qty / stage_id.

CREATE TABLE IF NOT EXISTS public.batch_conversions (
  id            text PRIMARY KEY,
  from_batch    text NOT NULL,
  to_batch      text NOT NULL,
  from_size     text NOT NULL,
  to_size       text NOT NULL,
  changed_qty   integer NOT NULL DEFAULT 0,
  stage_id      text NOT NULL DEFAULT '',
  converted_on  date NOT NULL,
  reason        text NOT NULL,
  created_at    timestamptz NOT NULL,
  created_by    text NOT NULL
);

ALTER TABLE public.batch_conversions
  ADD COLUMN IF NOT EXISTS changed_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_id text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS batch_conversions_from_batch_uidx
  ON public.batch_conversions (from_batch);

CREATE UNIQUE INDEX IF NOT EXISTS batch_conversions_to_batch_uidx
  ON public.batch_conversions (to_batch);

CREATE INDEX IF NOT EXISTS batch_conversions_created_idx
  ON public.batch_conversions (created_at DESC);

ALTER TABLE public.batch_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_conversions_service_role_all ON public.batch_conversions;
CREATE POLICY batch_conversions_service_role_all ON public.batch_conversions
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.batch_conversions TO anon, authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.plant_roles') IS NULL THEN
    RETURN;
  END IF;
  UPDATE plant_roles
  SET
    nav_allow = CASE
      WHEN nav_allow @> '["batch-conversion"]'::jsonb THEN nav_allow
      ELSE nav_allow || '["batch-conversion"]'::jsonb
    END,
    grants = CASE
      WHEN grants @> '["screen.batch-conversion"]'::jsonb THEN grants
      ELSE grants || '["screen.batch-conversion"]'::jsonb
    END,
    updated_at = now()
  WHERE builtin = true AND role_id IN ('gm', 'operator');
END $$;
