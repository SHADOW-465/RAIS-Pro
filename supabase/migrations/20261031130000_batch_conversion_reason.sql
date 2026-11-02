-- Why a size change happened. Text, not an enum, so a later category
-- (appended to CONVERSION_REASON_CATEGORIES) does not need another migration.
-- Idempotent. Existing rows keep a null category; new saves require one
-- in application code and refuse with 503 until these columns exist.

ALTER TABLE public.batch_conversions
  ADD COLUMN IF NOT EXISTS reason_category text,
  ADD COLUMN IF NOT EXISTS reason_note text;
