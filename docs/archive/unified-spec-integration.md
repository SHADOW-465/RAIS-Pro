# RAIS / MO!D — Master Specification Unification & Gap Analysis
*Version 1.0 · Technical Integration Blueprint · June 2026*

This document conducts a detailed comparative analysis of Disposafe's Problem Statement ([disposafe-problems.md](file:///C:/Users/acer/Documents/projects/RAIS-Pro/docs/disposafe-problems.md)), the Product Requirements Document ([rais-PRD.md](file:///C:/Users/acer/Documents/projects/RAIS-Pro/docs/rais-PRD.md)), and the Database/System Blueprint ([disposafe-build-blueprint.md](file:///c:/Users/acer/Documents/Obsidian%20Vault/personal%20os/docs/lucid-research/disposafe-build-blueprint.md)). 

Because these files were drafted in different contexts, several features are fragmented, some problems lack technical schemas, and some blueprint metrics lack problem definitions. This document unifies them into a single cohesive engineering roadmap.

---

## 1. Unified Integration Matrix

This matrix maps every identified factory problem to its product specification (PRD) and concrete database/technical implementation (Blueprint), highlighting current gaps.

| Operational Problem (disposafe-problems.md) | Product Solution (rais-PRD.md) | Technical Implementation (disposafe-build-blueprint.md) | Integration Status & Identified Gap |
| :--- | :--- | :--- | :--- |
| **Operator Data Falsification / Data Honesty** | Ingestion Integrity & Validation Queue (Section 6, F2) | `data_health_issues` table | **Gap:** The blueprint schema lacks the fields and validation formulas to check for *Sequence Mass-Balance Discrepancies* between stages. |
| **Audit Panic & Compliance Admin Friction** | One-Click Audit Package (Section 6, F3) | `CAPA_action_items` table + print media styles | **Gap:** The blueprint lacks the file packaging and zip-exporter backend API specification. |
| **Blindness to Process Correlation** | Correlation Engine (Section 8, V2) | `stage_measurements` & `defect_logs` tables | **Gap:** The blueprint tables lack columns for `machine_id`, `operator_id`, and `material_batch_no`, making correlation impossible. |
| **Excessive WIP Inventory Carrying Costs** | VSM Bottleneck Alerts (Section 2) | *None* | **Gap:** WIP buffer tracking is completely missing from the blueprint database schema. |
| **High Visual Inspection Yield Losses (8.1%)** | Pareto & Trend Charts + SPC Alerts (Section 6, F2/F3) | `stage_measurements` table + SPC / Pareto SVG generators | **Fully Aligned** |
| **High Valve Integrity Hold Rates (9.1%)** | Yield & Rework Analytics (Section 4) | `stage_measurements.hold` column + rework cost equations | **Fully Aligned** |
| **COPQ & Value-Added Scrap Disconnection** | Financial-lite (₹/unit config) (Section 4, C) | `skus` finished cost + `stage_cost_weights` progressive weights | **Fully Aligned** |
| **Dipping Machine OEE Blindness** | OEE Tracker (Section 4, D) | `daily_production_summary` OEE fields | **Gap:** The blueprint lacks tables/columns for raw shift time logs and speed rates required to calculate OEE. |
| **Manager Data Slicing (Minitab Friction)** | Scoped Analysis (Section 6, F3) | *None* | **Gap:** The blueprint lacks query optimization or table filters for on-the-fly scoped aggregation. |

---

## 2. Detailed Discrepancy & Fragmentation Audit

### Discrepancy 1: WIP Carrying Costs & VSM Buffers
* **The Problem:** The *Problem Statement* identifies excessive WIP inventory and tied-up capital as a major leak.
* **The PRD:** Specifies "VSM Bottleneck Alerts" as a core feature and schedules auto-VSM for V2.
* **The Blueprint:** Completely omits any table or schema representing WIP buffers or material lag times.
* **Impact of Fragmentation:** The developer building the database will not create tables for WIP, making the "WIP Carrying Cost" feature impossible to render.
* **Unification Action:** Define a `wip_buffers` table in the database schema to capture daily inventory levels at each stage buffer.

### Discrepancy 2: Correlation Engine Metadata Gaps
* **The Problem:** GMs and QAs need to discover *why* rejections occur by correlating defect spikes with shifts, operators, machines, and batches.
* **The PRD:** Schedules the "Correlation Engine" for V2.
* **The Blueprint:** Schema contains zero columns for `machine_id`, `operator_id`, or `material_batch_no` in the daily log tables.
* **Impact of Fragmentation:** If the pilot launches with this database schema, historical data will contain no metadata. When V2 correlation is built, it will be useless due to the missing variables.
* **Unification Action:** Add optional metadata columns to `stage_measurements` and `defect_logs` in the V1 database schema.

### Discrepancy 3: "One-Click Audit Package" ZIP Exporter
* **The Problem:** Administrative friction and preparation panic during regulatory compliance audits.
* **The PRD:** Outlines a "One-Click Audit Package" that compiles data, ledgers, and CAPAs into a ZIP file.
* **The Blueprint:** Focuses entirely on HTML layouts and CSS print styles. No backend route or file assembly logic is specified.
* **Impact of Fragmentation:** The backend developer will not build the export API, leaving the Quality Manager with no fast audit-packaging tool.
* **Unification Action:** Specify a serverless Next.js endpoint (`/api/export/audit-pack`) that queries the tables, generates CSVs, hashes them for immutability, and bundles them into a ZIP archive.

### Discrepancy 4: Recalculatable OEE Inputs
* **The Problem:** Sheet data is untrusted; all parameters must be calculated from raw logs to prevent formula falsification.
* **The PRD:** Includes OEE tracking.
* **The Blueprint:** Stores OEE as static float values in `daily_production_summary` but has no fields to record raw shift run times or machine speeds.
* **Impact of Fragmentation:** The system must trust the pre-calculated OEE values in the spreadsheet, violating the core philosophy of independent reconstruction.
* **Unification Action:** Add raw time and throughput fields to `daily_production_summary` so OEE is calculated dynamically from base inputs.

### Discrepancy 5: Process Rulebook & Adjudication Schema
* **The Problem:** The *Problem Statement* outlines "Data Falsification" but does not trace how the system learns to handle deviations over time.
* **The PRD:** Describes "Adjudication & Process Rulebook" where operator overrides compile into standard rules to reduce alert noise.
* **The Blueprint:** Lacks any database tables to store rules, overrides, or supervisor annotations.
* **Impact of Fragmentation:** Overrides will not persist, forcing supervisors to re-adjudicate the same warning every day.
* **Unification Action:** Create `adjudication_logs` and `process_rulebook` tables.

---

## 3. The Unification Plan: Proposed Code & Schema Extensions

To resolve these discrepancies, we define the following additions. These must be integrated into the pilot code to ensure all documented problems are solved.

### Extension A: WIP Buffer & Carrying Cost Schema (Solves WIP Leak)
Add the following table to the database schema:
```sql
CREATE TABLE wip_buffers (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    stage_name TEXT NOT NULL REFERENCES stage_cost_weights(stage_name),
    buffer_quantity INTEGER NOT NULL DEFAULT 0,
    carrying_cost_per_day REAL GENERATED ALWAYS AS (buffer_quantity * 0.10) STORED, -- ₹0.10 per catheter per day
    CONSTRAINT unique_date_buffer UNIQUE (date, stage_name)
);
```

### Extension B: Correlation Metadata Columns (Solves Cause Detection)
Add these metadata columns to capture audit trails from day one:
```sql
ALTER TABLE stage_measurements 
ADD COLUMN machine_id TEXT,
ADD COLUMN operator_id TEXT,
ADD COLUMN material_batch_no TEXT;

ALTER TABLE defect_logs 
ADD COLUMN machine_id TEXT,
ADD COLUMN operator_id TEXT;
```

### Extension C: OEE Input Columns (Solves Independent OEE Math)
Add raw shift log parameters to `daily_production_summary`:
```sql
ALTER TABLE daily_production_summary
ADD COLUMN planned_production_time_minutes INTEGER NOT NULL DEFAULT 480, -- 8 hour shift
ADD COLUMN actual_run_time_minutes INTEGER NOT NULL DEFAULT 480,
ADD COLUMN standard_dip_rate_per_hour INTEGER NOT NULL DEFAULT 1200;
```
* **Formula Integration:**
  - $\text{Availability} = \frac{\text{actual\_run\_time\_minutes}}{\text{planned\_production\_time\_minutes}}$
  - $\text{Performance} = \frac{\text{total\_produced}}{\text{actual\_run\_time\_minutes} \times (\text{standard\_dip\_rate\_per\_hour} / 60)}$
  - $\text{Quality} = \frac{\text{total\_produced} - \text{total\_rejected}}{\text{total\_produced}}$

### Extension D: Process Rulebook & Adjudication Logs (Solves Data Correction Memory)
Create tables to store supervisor overrides:
```sql
CREATE TABLE adjudication_logs (
    id SERIAL PRIMARY KEY,
    finding_id INTEGER REFERENCES data_health_issues(id) ON DELETE CASCADE,
    adjudication_type TEXT NOT NULL, -- 'MISTAKE', 'INTENTIONAL', 'UNSURE'
    resolved_by UUID REFERENCES auth.users(id),
    notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE process_rulebook (
    id SERIAL PRIMARY KEY,
    rule_type TEXT NOT NULL, -- 'ALLOW_NEGATIVE', 'IGNORE_OUTLIER', 'STAGE_TOLERANCE'
    stage_name TEXT REFERENCES stage_cost_weights(stage_name),
    allowed_tolerance REAL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### Extension E: ZIP Exporter API Endpoint
Create a Next.js serverless route `/api/export/audit-pack` using `archiver`:
* **Functionality:**
  - Fetches the active month's `daily_production_summary`, `stage_measurements`, `wip_buffers`, and `CAPA_action_items`.
  - Serializes each dataset into a clean `.csv` file.
  - Generates `manifest.json` containing the cryptographic SHA-256 hash of each row to prove data immutability.
  - Returns a `.zip` archive to the browser, satisfying the CDSCO audit trail requirements.
