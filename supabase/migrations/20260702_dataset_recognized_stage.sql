-- Domain recognizer (component [E]): a Dataset recognized as a known Disposafe
-- stage carries that stage id. Labeling only — publishing a recognized dataset's
-- rows into the canonical event store stays an explicit user action.
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS recognized_stage_id text NULL;
