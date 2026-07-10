-- Follow-up to 20260710_registry_stage_aliases.sql: persist the confidence
-- behind a Dataset's recognizedStageId (src/lib/dataset/types.ts) so the
-- "needs review" badge (GenericDashboardBody.tsx) survives a round-trip
-- through Supabase, not just the in-memory dev store.
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS recognition_confidence numeric NULL;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS recognition_basis text NULL;
