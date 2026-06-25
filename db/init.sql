-- db/init.sql
-- ============================================================================
-- RAIS-Pro on-prem APPLIANCE schema (Stage B of the Supabase → plain-Postgres
-- migration). This is the single, idempotent bootstrap script for a fresh
-- Postgres database. Run it once against the DB named by DATABASE_URL:
--
--     psql "$DATABASE_URL" -f db/init.sql
--
-- It consolidates every CREATE TABLE / CREATE INDEX from supabase/migrations/*
-- into one file and DROPS all Supabase-specific machinery: this deployment is
-- single-tenant on-prem, so there is NO Row Level Security, no policies, and no
-- references to Supabase auth roles (auth.*, anon, authenticated, service_role).
-- The app connects with a single trusted DB role and is the only writer.
--
-- Safe to re-run: every statement uses IF NOT EXISTS.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto on modern Postgres; uuid_generate_v4()
-- comes from uuid-ossp. Enable both so the historical defaults keep working.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Editorial analyze flow: sessions + insight slides ────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    text NOT NULL,
  title        text NOT NULL,
  files        jsonb NOT NULL DEFAULT '[]'::jsonb,
  dashboard    jsonb NOT NULL DEFAULT '{}'::jsonb,
  merge_plan   jsonb,
  data_summary text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_device_id_idx ON sessions (device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS insight_slides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  device_id   text NOT NULL,
  question    text NOT NULL,
  slide       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS slides_session_id_idx ON insight_slides (session_id, created_at ASC);

-- ── Raw uploaded files (durable archive) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS raw_files (
  file_hash   text PRIMARY KEY,
  file_name   text NOT NULL,
  file_bytes  bytea,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- ── Ingestion envelopes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingestions (
  ingestion_id text PRIMARY KEY,
  file_name    text NOT NULL,
  file_hash    text REFERENCES raw_files(file_hash) ON DELETE SET NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Canonical append-only event ledger ───────────────────────────────────────
-- Top-level columns are the canonical envelope; all domain detail lives in the
-- JSONB `payload`. Idempotent on event_id (a content hash).
CREATE TABLE IF NOT EXISTS events (
  event_id              text PRIMARY KEY,
  schema_version        text NOT NULL,
  ingestion_id          text NOT NULL,
  event_type            text NOT NULL,
  occurred_on           jsonb NOT NULL,
  provenance            jsonb,
  confidence            jsonb,
  extracted_by          text,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  superseded_by         text,
  -- Provenance Bridge columns (explicit, alongside the provenance JSONB).
  provenance_file       text,
  provenance_coordinate text,
  provenance_hash       text,
  is_direct_entry       boolean DEFAULT false,
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_events_type      ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_ingestion ON events (ingestion_id);

-- ── Findings (diagnostic alerts / open questions) ────────────────────────────
CREATE TABLE IF NOT EXISTS findings (
  finding_id            text PRIMARY KEY,
  schema_version        text NOT NULL,
  ingestion_id          text NOT NULL,
  rule_id               text,
  subtype               text,
  severity              text NOT NULL,
  question              text,
  detail                text,
  evidence              jsonb,
  hypotheses            jsonb,
  requires_gm_authority boolean DEFAULT false,
  occurred_on           jsonb,
  recorded_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_findings_rule      ON findings (rule_id);
CREATE INDEX IF NOT EXISTS idx_findings_ingestion ON findings (ingestion_id);

-- ── Adjudications (supervisor verdicts) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS adjudications (
  adjudication_id     text PRIMARY KEY,
  finding_id          text NOT NULL REFERENCES findings(finding_id) ON DELETE CASCADE,
  verdict             text NOT NULL,
  why                 text,
  author              text,
  is_recommendation   boolean DEFAULT false,
  correction_event_id text,
  recorded_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_adjudications_finding ON adjudications (finding_id);

-- ── Rulebook rules (learning-loop) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rulebook_rules (
  rulebook_rule_id           text PRIMARY KEY,
  version                    integer NOT NULL,
  status                     text NOT NULL,
  predicate                  jsonb,
  action                     jsonb,
  rationale                  text,
  born_from_adjudication_ids jsonb,
  drafted_by                 text,
  activated_by               text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  retired_at                 timestamptz
);

-- ── Rule applications ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rule_applications (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  rulebook_rule_id text NOT NULL,
  rule_version     integer NOT NULL,
  finding_id       text NOT NULL REFERENCES findings(finding_id) ON DELETE CASCADE,
  ingestion_id     text NOT NULL,
  applied_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rule_applications_finding_id_idx ON rule_applications (finding_id);
CREATE INDEX IF NOT EXISTS idx_rule_apps_finding            ON rule_applications (finding_id);

-- ── Per-client registry (stages, defects, French sizes) ──────────────────────
CREATE TABLE IF NOT EXISTS registries (
  client_id               text PRIMARY KEY,
  registry_version        text NOT NULL,
  fiscal_year_start_month integer NOT NULL,
  stages                  jsonb NOT NULL,
  defects                 jsonb NOT NULL,
  -- French-size dimension (migration 20260625_add_registry_sizes).
  sizes                   jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- ── Cost configuration ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_config (
  client_id              text PRIMARY KEY REFERENCES registries(client_id) ON DELETE CASCADE,
  enabled                boolean NOT NULL,
  currency               text NOT NULL DEFAULT 'INR',
  finished_unit_cost_inr real,
  per_stage              jsonb NOT NULL,
  rework_cost_per_unit_inr real
);
