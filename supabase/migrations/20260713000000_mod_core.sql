-- MOD v2 knowledge plane (docs/redesign/MOD-ADD.md §7.1). Additive — Phase 1.
-- The event ledger (facts plane) is untouched.

-- One lossless workbook capture per upload (Step 1 output). Content-addressed.
CREATE TABLE IF NOT EXISTS workbook_snapshots (
  snapshot_id   text PRIMARY KEY,             -- sha256 of file bytes
  file_name     text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  content       jsonb NOT NULL                -- {sheets:[{name,ref,cells,merges,colWidths}]}
);

-- The Manufacturing Ontology Document. One row per (workbook lineage, version).
CREATE TABLE IF NOT EXISTS mods (
  mod_id        text NOT NULL,                -- stable lineage id (first snapshot hash)
  version       int  NOT NULL,
  company_id    text NOT NULL,
  status        text NOT NULL CHECK (status IN ('draft','verified','superseded')),
  snapshot_id   text NOT NULL REFERENCES workbook_snapshots(snapshot_id),
  document      jsonb NOT NULL,               -- ModDocument (src/shared/models/ontology.ts)
  created_at    timestamptz NOT NULL DEFAULT now(),
  verified_by   text,
  verified_at   timestamptz,
  supersedes    int,
  PRIMARY KEY (mod_id, version)
);
-- Exactly one verified version per lineage.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_mod ON mods (mod_id) WHERE status = 'verified';
CREATE INDEX IF NOT EXISTS mods_company_idx ON mods (company_id, status);

-- Everything the company has confirmed, reusable across workbooks (resolver rung 2).
CREATE TABLE IF NOT EXISTS company_knowledge (
  company_id    text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('stage-alias','defect-alias','column-mapping','header-pattern')),
  key           text NOT NULL,                -- normalized raw label
  canonical_id  text NOT NULL,
  confidence    numeric NOT NULL,
  learned_from  text,                         -- mod_id that taught it
  learned_at    timestamptz NOT NULL DEFAULT now(),
  use_count     int NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, kind, key)
);

-- Cross-company manufacturing concepts (resolver rung 3). Seed data, not code.
CREATE TABLE IF NOT EXISTS global_ontology (
  concept_id    text PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('measure','entity-class','dimension')),
  match_terms   jsonb NOT NULL,
  description   text NOT NULL
);

-- Versioned decision rules (ADD §14; consumed in Phase 6).
CREATE TABLE IF NOT EXISTS decision_rules (
  rule_id       text NOT NULL,
  version       int  NOT NULL,
  status        text NOT NULL CHECK (status IN ('draft','active','retired')),
  definition    jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, version)
);

ALTER TABLE workbook_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE mods ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_ontology ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workbook_snapshots_service_role_all ON workbook_snapshots;
CREATE POLICY workbook_snapshots_service_role_all ON workbook_snapshots FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS mods_service_role_all ON mods;
CREATE POLICY mods_service_role_all ON mods FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS company_knowledge_service_role_all ON company_knowledge;
CREATE POLICY company_knowledge_service_role_all ON company_knowledge FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS global_ontology_service_role_all ON global_ontology;
CREATE POLICY global_ontology_service_role_all ON global_ontology FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS decision_rules_service_role_all ON decision_rules;
CREATE POLICY decision_rules_service_role_all ON decision_rules FOR ALL USING (true) WITH CHECK (true);

-- Global ontology seed (mirrors src/core/ontology/global-ontology.ts).
INSERT INTO global_ontology (concept_id, kind, match_terms, description) VALUES
  ('CHECKED_QTY',  'measure',      '["checked","chk","qty checked","quantity","input","rec","received","inspected"]', 'Units entering an inspection gate (denominator).'),
  ('ACCEPTED_QTY', 'measure',      '["accepted","accept","acpt","good","ok","pass"]', 'Units accepted as good.'),
  ('REWORK_QTY',   'measure',      '["rework","hold","rw qty"]', 'Units held or sent to rework.'),
  ('REJECTED_QTY', 'measure',      '["rejected","reject","rej","rejection"]', 'Units rejected at a gate.'),
  ('PRODUCED_QTY', 'measure',      '["produced","production","output","dispatch"]', 'Units produced/dispatched.'),
  ('STAGE',        'entity-class', '["stage","station","process","gate","inspection"]', 'A process/inspection stage on the line.'),
  ('DEFECT',       'entity-class', '["defect","reason","rejection reason","fault"]', 'A rejection reason code; columns tallying one reason each.'),
  ('SIZE',         'dimension',    '["size","fr","french"]', 'Product size dimension (e.g. French catheter sizes).'),
  ('DATE',         'dimension',    '["date","day","month","period","week"]', 'The record''s time axis.'),
  ('BATCH',        'dimension',    '["batch","lot","trolley"]', 'Production batch/lot identifier.'),
  ('OPERATOR',     'dimension',    '["operator","inspector","supervisor"]', 'Person performing/overseeing the operation.'),
  ('MACHINE',      'dimension',    '["machine","m/c","equipment"]', 'Machine/equipment identifier.'),
  ('SHIFT',        'dimension',    '["shift"]', 'Work shift.'),
  ('STATED_PCT',   'measure',      '["%","pct","percent","rate","rej %"]', 'A stated percentage — an aggregate CLAIM to verify, never an input.')
ON CONFLICT (concept_id) DO NOTHING;
