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
