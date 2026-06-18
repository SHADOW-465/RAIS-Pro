-- supabase/migrations/20260618_canonical_ledger.sql
-- Canonical append-only ledger (MOID-SPEC §11). Matches src/lib/store/supabase.ts.
-- All domain detail lives in JSONB `payload`; top-level columns are the envelope.

create extension if not exists "uuid-ossp";

-- 1. Events ledger (append-only; idempotent on event_id content hash) ----------
create table if not exists events (
  event_id        text primary key,
  schema_version  text not null,
  ingestion_id    text not null,
  event_type      text not null,
  occurred_on     jsonb not null,
  provenance      jsonb,
  confidence      jsonb,
  extracted_by    text,
  recorded_at     timestamptz not null default now(),
  superseded_by   text,
  payload         jsonb not null default '{}'::jsonb
);
create index if not exists events_event_type_idx on events (event_type);
create index if not exists events_ingestion_id_idx on events (ingestion_id);

-- 2. Findings ------------------------------------------------------------------
create table if not exists findings (
  finding_id            text primary key,
  schema_version        text not null,
  ingestion_id          text not null,
  rule_id               text,
  subtype               text,
  severity              text not null,
  question              text,
  detail                text,
  evidence              jsonb,
  hypotheses            jsonb,
  requires_gm_authority boolean default false,
  occurred_on           jsonb,
  recorded_at           timestamptz not null default now()
);

-- 3. Adjudications -------------------------------------------------------------
create table if not exists adjudications (
  adjudication_id      text primary key,
  finding_id           text not null references findings(finding_id) on delete cascade,
  verdict              text not null,
  why                  text,
  author               text,
  is_recommendation    boolean default false,
  correction_event_id  text,
  recorded_at          timestamptz not null default now()
);
create index if not exists adjudications_finding_id_idx on adjudications (finding_id);

-- 4. Rulebook rules ------------------------------------------------------------
create table if not exists rulebook_rules (
  rulebook_rule_id          text primary key,
  version                   integer not null,
  status                    text not null,
  predicate                 jsonb,
  action                    jsonb,
  rationale                 text,
  born_from_adjudication_ids jsonb,
  drafted_by                text,
  activated_by              text,
  created_at                timestamptz not null default now(),
  retired_at                timestamptz
);

-- 5. Rule applications ---------------------------------------------------------
create table if not exists rule_applications (
  id                uuid primary key default uuid_generate_v4(),
  rulebook_rule_id  text not null,
  rule_version      integer not null,
  finding_id        text not null,
  ingestion_id      text not null,
  applied_at        timestamptz not null default now()
);
create index if not exists rule_applications_finding_id_idx on rule_applications (finding_id);

-- 6. Legacy editorial analyze flow (kept so /api/sessions keeps working) -------
create table if not exists sessions (
  id          uuid primary key default uuid_generate_v4(),
  status      text default 'processing',
  created_at  timestamptz default now()
);
create table if not exists dashboards (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid references sessions(id) on delete cascade,
  analysis_json jsonb not null,
  metadata_json jsonb,
  created_at    timestamptz default now()
);

-- Service-role server client is used (RLS bypassed). No RLS policies here; the
-- app never exposes the anon key to write paths. Revisit when multi-tenant.
