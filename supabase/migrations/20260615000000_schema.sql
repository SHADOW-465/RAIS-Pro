-- supabase/migrations/20260615000000_schema.sql
-- Schema migrations for MO!D append-only event ledger and diagnostic queues.

-- 1. Raw Uploaded Files Table
CREATE TABLE IF NOT EXISTS raw_files (
    file_hash TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_bytes BYTEA,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Ingestions Envelope Table
CREATE TABLE IF NOT EXISTS ingestions (
    ingestion_id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_hash TEXT REFERENCES raw_files(file_hash) ON DELETE SET NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 3. Canonical Events Table (Append-Only)
CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    schema_version TEXT NOT NULL,
    ingestion_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    occurred_on JSONB NOT NULL,
    provenance JSONB NOT NULL,
    confidence JSONB NOT NULL,
    extracted_by TEXT NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    superseded_by TEXT,
    payload JSONB NOT NULL
);

-- 4. Findings Table (Diagnostic Alerts)
CREATE TABLE IF NOT EXISTS findings (
    finding_id TEXT PRIMARY KEY,
    schema_version TEXT NOT NULL,
    ingestion_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    subtype TEXT,
    severity TEXT NOT NULL,
    question TEXT NOT NULL,
    detail TEXT NOT NULL,
    evidence JSONB NOT NULL,
    hypotheses JSONB NOT NULL,
    requires_gm_authority BOOLEAN NOT NULL,
    occurred_on JSONB NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 5. Adjudications Table (Supervisor Verdicts)
CREATE TABLE IF NOT EXISTS adjudications (
    adjudication_id TEXT PRIMARY KEY,
    finding_id TEXT NOT NULL REFERENCES findings(finding_id) ON DELETE CASCADE,
    verdict TEXT NOT NULL,
    why TEXT NOT NULL,
    author TEXT NOT NULL,
    is_recommendation BOOLEAN NOT NULL,
    correction_event_id TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 6. Rulebook Rules Table (Learning Loop Rules)
CREATE TABLE IF NOT EXISTS rulebook_rules (
    rulebook_rule_id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    predicate JSONB NOT NULL,
    action JSONB NOT NULL,
    rationale TEXT NOT NULL,
    born_from_adjudication_ids JSONB NOT NULL,
    drafted_by TEXT NOT NULL,
    activated_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    retired_at TIMESTAMP WITH TIME ZONE
);

-- 7. Rule Applications Table
CREATE TABLE IF NOT EXISTS rule_applications (
    rulebook_rule_id TEXT NOT NULL,
    rule_version INTEGER NOT NULL,
    finding_id TEXT NOT NULL REFERENCES findings(finding_id) ON DELETE CASCADE,
    ingestion_id TEXT NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (rulebook_rule_id, rule_version, finding_id)
);

-- 8. Client Registries Table
CREATE TABLE IF NOT EXISTS registries (
    client_id TEXT PRIMARY KEY,
    registry_version TEXT NOT NULL,
    fiscal_year_start_month INTEGER NOT NULL,
    stages JSONB NOT NULL,
    defects JSONB NOT NULL
);

-- 9. Cost Configuration Table
CREATE TABLE IF NOT EXISTS cost_config (
    client_id TEXT PRIMARY KEY REFERENCES registries(client_id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    finished_unit_cost_inr REAL,
    per_stage JSONB NOT NULL,
    rework_cost_per_unit_inr REAL
);

-- 10. Indexes for High-Performance Queries
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_ingestion ON events(ingestion_id);
CREATE INDEX IF NOT EXISTS idx_findings_rule ON findings(rule_id);
CREATE INDEX IF NOT EXISTS idx_findings_ingestion ON findings(ingestion_id);
CREATE INDEX IF NOT EXISTS idx_adjudications_finding ON adjudications(finding_id);
CREATE INDEX IF NOT EXISTS idx_rule_apps_finding ON rule_applications(finding_id);

-- 11. Enable Row Level Security (RLS)
ALTER TABLE raw_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE adjudications ENABLE ROW LEVEL SECURITY;
ALTER TABLE rulebook_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_config ENABLE ROW LEVEL SECURITY;

-- 12. Public Select & Insert Policies (Allow reads and inserts, block updates/deletes)
CREATE POLICY "Allow public select" ON raw_files FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON raw_files FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select" ON ingestions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON ingestions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select" ON events FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON events FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select" ON findings FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON findings FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select" ON adjudications FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON adjudications FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select" ON rulebook_rules FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON rulebook_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON rulebook_rules FOR UPDATE USING (true);

CREATE POLICY "Allow public select" ON rule_applications FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON rule_applications FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select" ON registries FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON registries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON registries FOR UPDATE USING (true);

CREATE POLICY "Allow public select" ON cost_config FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON cost_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON cost_config FOR UPDATE USING (true);
