# 12 · Database Schema (actual Postgres)

The app stores the **event ledger**, not the §4 relational model. These are the real tables (`supabase/migrations/`). Column types are Postgres; `jsonb` holds the Zod-validated structures.

## 12.1 Canonical ledger (primary)
```sql
raw_files     ( file_hash text PK, file_name text, file_bytes bytea, recorded_at timestamptz default now() )

ingestions    ( ingestion_id text PK, file_name text, file_hash text → raw_files,
                recorded_at timestamptz default now() )

events        ( event_id text PK,                 -- content hash (idempotency)
                schema_version text, ingestion_id text, event_type text,
                occurred_on jsonb, provenance jsonb, confidence jsonb,
                extracted_by text, recorded_at timestamptz, superseded_by text,
                payload jsonb,                     -- variant-specific fields
                -- flattened mirrors (migration 20260619):
                provenance_file text, provenance_coordinate text,
                provenance_hash text, is_direct_entry boolean default false )

findings      ( finding_id text PK, schema_version text, ingestion_id text,
                rule_id text, subtype text, severity text, question text, detail text,
                evidence jsonb, hypotheses jsonb, requires_gm_authority boolean,
                occurred_on jsonb, recorded_at timestamptz )

adjudications ( adjudication_id text PK, finding_id text → findings, verdict text,
                why text, author text, is_recommendation boolean,
                correction_event_id text, recorded_at timestamptz )

rulebook_rules( rulebook_rule_id text PK, version int, status text, predicate jsonb,
                action jsonb, rationale text, born_from_adjudication_ids jsonb,
                drafted_by text, activated_by text, created_at timestamptz, retired_at timestamptz )

rule_applications ( id uuid PK, rulebook_rule_id text, rule_version int,
                    finding_id text → findings, ingestion_id text, applied_at timestamptz )
```

## 12.2 Registry / cost config
```sql
registries  ( client_id text PK, registry_version text, fiscal_year_start_month int,
              stages jsonb, defects jsonb )
cost_config ( client_id text PK → registries, enabled boolean, currency text default 'INR',
              finished_unit_cost_inr real, per_stage jsonb, rework_cost_per_unit_inr real )
```

## 12.3 Legacy session/analyze tables (not the live cockpit)
```sql
sessions       ( id uuid PK, device_id text, title text, files jsonb, dashboard jsonb,
                 merge_plan jsonb, data_summary text, created_at timestamptz )   -- + v2 minimal {id,status,created_at}
insight_slides ( id uuid PK, session_id uuid → sessions, device_id, question, slide jsonb, created_at )
dashboards     ( id uuid PK, session_id uuid → sessions, analysis_json jsonb, metadata_json jsonb, created_at )
```

## 12.4 RLS / roles
RLS enabled on `sessions`, `insight_slides` (device-scoped in PoC). **Production:** add role-based policies (GM / QM / Supervisor / Operator) on `events`, `findings`, `adjudications`; `is_direct_entry` and `provenance_*` columns support row-level audit views.

## 12.5 Optional §4 projection (if SQL/BI wanted)
The plant's analysts can materialize a `stage_measurements(date, stage_name, catheter_size, qty_checked, qty_accepted, qty_hold, qty_rejected, …, CHECK chk_qty_balance)` view from the events ledger. It is a **projection**, never the source of truth — the events table is.
