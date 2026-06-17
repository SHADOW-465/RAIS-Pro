# EXHAUSTIVE PRODUCT REQUIREMENTS DOCUMENT (PRD) & SYSTEM SPECIFICATION
*Version 2.1 · Engineering-Ready Pilot Specification · June 2026*

This document serves as the single source of truth for the product requirements, functional specifications, system architecture, database schemas, and mathematical formulations of the **RAIS/MO!D** application built for **Disposafe Health and Life Care Limited**'s Foley Balloon Catheter (FBC) dipping and assembly plant in Ballabgarh, Haryana.

---

## 1. Document Control & Metadata

* **Project Name:** RAIS Pro / MO!D (Manufacturing Operational Intelligence & Diagnostics)
* **Client Organization:** Disposafe Health and Life Care Limited
* **Process Focus:** Foley Balloon Catheter (FBC) Production Line
* **Primary Objective:** Transform raw operational data (manual inputs and spreadsheets) into traceable, money-denominated quality diagnostics and audit-ready compliance trails.
* **Target Audience:** Frontend/Backend Developers, Database Engineers, and QA Auditors.

---

## 2. Core Product Pillars & UX Framework

The application must adhere to these four core design principles:

### A. The Legible-First Design
* **Typography:**
  - *Serif Font:* `Newsreader` (Georgia fallback) for editorial screens, headings, print titles, and formal letters.
  - *Sans-Serif Font:* `IBM Plex Sans` for UI controls, navigation, input forms, and status labels.
  - *Monospace Font:* `IBM Plex Mono` with `font-variant-numeric: tabular-nums` for all numeric data tables, yield calculations, and KPI counters.
* **Size Hierarchy:**
  - Minimum dashboard font size: `14px`.
  - Monospace table body cells: `10.5px` (row padding `5.5px 7px`).
  - Monospace table headers: `10px` bold uppercase.
  - Big KPI display numbers: `26px` tabular-nums.
  - Print layout body text floor: `9.5pt` (A4 format).

### B. Layered Depth (The L0–L2 model)
* **L0 (Glance):** Large card layout showing a single primary metric and a plain-language summary verdict (e.g., `"Rejection is HIGH — 8.10% visual scrap detected"`).
* **L1 (Read):** Interactive SVG trend lines, Pareto charts, and CAPA summary cards.
* **L2 (Drill):** Traceability tables, source data cells, raw equations, and SQL query filters.

### C. The Dual-Audience Explain Layer
* A global **"Explain" Toggle** in the navigation header. 
* When enabled, every mathematical metric, SPC chart label, and dashboard metric displays an inline tooltip or subtitle card explaining what the metric means in layman's terms (e.g., *“Rolled Throughput Yield (RTY) is the probability of a catheter passing all 12 stages without any defects or rework. Currently at 79.1%, meaning 20.9% of catheters require correction or are scrapped.”*).

### D. The Provenance Bridge (Trust Badge)
* Double-clicking any computed metric triggers a bezier highlight beam.
* The screen splits to show the exact source data provenance:
  - File hash, filename, and sheet name.
  - Cell coordinate (e.g., `'Visual_Inspection!D24'`).
  - Raw uncalculated value.

---

## 3. Database Schema & Data Contracts (Golden Schema)

The database runs on Supabase (PostgreSQL). Below are the five canonical table schemas, extended with the correlation and validation columns.

```
                  DATABASE SCHEMA RELATIONSHIPS
  
  ┌─────────────────┐        ┌──────────────────────┐
  │      skus       │        │  daily_production_   │
  │  - sku_id (PK)  ◄────────┤       summary        │
  └────────┬────────┘        │  - date (PK)         │
           │                 └──────────────────────┘
           │
           │   ┌──────────────────────┐
           ├───►  stage_measurements  │
           │   │  - id (PK)           │
           │   │  - sku_id (FK)       │
           │   └──────────┬───────────┘
           │              │
           │              ▼
           │   ┌──────────────────────┐
           └───►     defect_logs      │
               │  - id (PK)           │
               │  - measurement_id (FK)
               └──────────────────────┘
```

### A. SKUs Table
Stores standard finished product parameters and cost metrics:
```sql
CREATE TABLE skus (
    sku_id TEXT PRIMARY KEY,
    sku_name TEXT NOT NULL,
    finished_cost REAL NOT NULL DEFAULT 20.0, -- Default ₹20 finished cost
    rework_cost REAL NOT NULL DEFAULT 5.0,     -- Default ₹5 rework labor cost
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### B. Stage Cost Weights Table
Defines progressive value multipliers as raw material moves down the line:
```sql
CREATE TABLE stage_cost_weights (
    stage_name TEXT PRIMARY KEY,
    sequence_order INTEGER NOT NULL,
    cost_weight REAL NOT NULL CHECK (cost_weight BETWEEN 0.0 AND 1.0)
);
-- Seeding data:
-- 'Former Assembly' (1, 0.15), 'Coagulant Dipping' (2, 0.18), 'Latex Dipping' (3, 0.22),
-- 'Leaching' (4, 0.25), 'Chlorination' (5, 0.30), 'Hanging' (6, 0.35), 'Gauge' (7, 0.40),
-- 'Trimming' (8, 0.45), 'Visual Insp.' (9, 0.60), 'Balloon Insp.' (10, 0.65),
-- 'Valve Fixing' (11, 0.70), 'Valve Integrity' (12, 0.85), 'Final Insp.' (13, 1.00)
```

### C. Daily Production Summary Table
Stores daily rollup values and OEE inputs:
```sql
CREATE TABLE daily_production_summary (
    date DATE PRIMARY KEY,
    sku_id TEXT REFERENCES skus(sku_id),
    total_produced INTEGER NOT NULL DEFAULT 0,
    total_rejected INTEGER NOT NULL DEFAULT 0,
    planned_production_time_minutes INTEGER NOT NULL DEFAULT 480, -- 8 hour shift
    actual_run_time_minutes INTEGER NOT NULL DEFAULT 480,
    standard_dip_rate_per_hour INTEGER NOT NULL DEFAULT 1200,
    calculated_oee REAL,
    ingestion_file_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### D. Stage Measurements Table
Logs raw production run metrics per stage:
```sql
CREATE TABLE stage_measurements (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    stage_name TEXT REFERENCES stage_cost_weights(stage_name),
    sku_id TEXT REFERENCES skus(sku_id),
    qty_checked INTEGER NOT NULL CHECK (qty_checked >= 0),
    qty_accepted INTEGER NOT NULL CHECK (qty_accepted >= 0),
    qty_hold INTEGER NOT NULL DEFAULT 0 CHECK (qty_hold >= 0),
    qty_rejected INTEGER NOT NULL CHECK (qty_rejected >= 0),
    machine_id TEXT,             -- Extended for Correlation Engine
    operator_id TEXT,            -- Extended for Correlation Engine
    material_batch_no TEXT,      -- Extended for Correlation Engine
    provenance_coordinate TEXT,  -- Excel cell reference (e.g. 'Sheet1!B18')
    CONSTRAINT chk_math CHECK (qty_checked = qty_accepted + qty_hold + qty_rejected),
    CONSTRAINT unique_date_stage UNIQUE (date, stage_name)
);
```

### E. Defect Logs Table
Records specific defect reason rollups:
```sql
CREATE TABLE defect_logs (
    id SERIAL PRIMARY KEY,
    measurement_id INTEGER REFERENCES stage_measurements(id) ON DELETE CASCADE,
    defect_type TEXT NOT NULL, -- 'Thin Spod', 'Struck Balloon', 'Leakage', 'Bubble', '90/10', 'Pinhole', 'Others'
    qty_defective INTEGER NOT NULL CHECK (qty_defective >= 0),
    machine_id TEXT,           -- Extended for Correlation Engine
    operator_id TEXT           -- Extended for Correlation Engine
);
```

---

## 4. Extended Operational Features

To bridge the gap between Disposafe's operational vulnerabilities and technical code, the system implements these five critical features:

### 1. Ingestion Integrity Engine (Sequence Mass Balance)
* **Objective:** Prevent operators from entering falsified low rejection numbers.
* **Mechanism:** Upon excel upload or data entry, run a sequence-check query:
  $$\text{Checked}_{s,d} \le \text{Accepted}_{s-1,d} + \text{Carryover}_{s-1,d}$$
* **System Action:** If the quantity checked at stage $s$ exceeds the available stock passed from stage $s-1$ (after factoring in carryover WIP), the system halts ingestion, flags a **Mass Balance Delta Warning ($\Delta_{\text{MB}} > 0$)**, and moves the record to the Adjudication Queue.

### 2. VSM Buffer & WIP Cost Tracker
* **Objective:** Highlight capital tied up on the factory floor due to bottleneck delays.
* **Table Schema:**
```sql
CREATE TABLE wip_buffers (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    stage_name TEXT REFERENCES stage_cost_weights(stage_name),
    buffer_quantity INTEGER NOT NULL DEFAULT 0 CHECK (buffer_quantity >= 0),
    carrying_cost_per_day REAL GENERATED ALWAYS AS (buffer_quantity * 0.10) STORED, -- ₹0.10 per catheter/day
    CONSTRAINT unique_date_wip UNIQUE (date, stage_name)
);
```
* **System Action:** Displays alerts on the Plant GM dashboard when a buffer's daily carrying cost exceeds ₹1,000, signaling a bottleneck.

### 3. Multivariable Correlation Engine
* **Objective:** Pinpoint the mechanical or material root causes of defect spikes.
* **Mechanism:** Runs correlation queries across `stage_measurements` and `defect_logs` metadata:
```sql
-- Identifies if a defect is correlated with a specific machine
SELECT machine_id, SUM(qty_defective) as total_defects
FROM defect_logs
WHERE defect_type = 'Thin Spod'
GROUP BY machine_id
ORDER BY total_defects DESC;
```
* **UX Visualization:** Renders a heatmap highlighting high-correlation cells (e.g., M3 machine and Thin Spod rejections on night shift).

### 4. Dynamic OEE Tracker
* **Objective:** Eliminate manual, static OEE reporting.
* **System Action:** Dynamic calculations utilizing shift parameters:
  - $\text{Availability} = \frac{\text{actual\_run\_time\_minutes}}{\text{planned\_production\_time\_minutes}}$
  - $\text{Performance} = \frac{\text{total\_produced}}{\text{actual\_run\_time\_minutes} \times (\text{standard\_dip\_rate\_per\_hour} / 60)}$
  - $\text{Quality} = \frac{\text{total\_produced} - \text{total\_rejected}}{\text{total\_produced}}$
  - $\text{OEE} = \text{Availability} \times \text{Performance} \times \text{Quality}$

### 5. Process Rulebook & Adjudication Loop
* **Objective:** Ensure supervisors can handle exceptions transparently.
* **Table Schemas:**
```sql
CREATE TABLE adjudication_logs (
    id SERIAL PRIMARY KEY,
    finding_description TEXT NOT NULL,
    adjudication_type TEXT NOT NULL, -- 'MISTAKE' (override), 'INTENTIONAL' (bypass), 'UNRESOLVED'
    resolved_by UUID REFERENCES auth.users(id),
    notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE process_rulebook (
    id SERIAL PRIMARY KEY,
    rule_type TEXT NOT NULL, -- 'ALLOW_NEGATIVE', 'IGNORE_OUTLIER', 'STAGE_TOLERANCE'
    stage_name TEXT REFERENCES stage_cost_weights(stage_name),
    allowed_tolerance REAL DEFAULT 0.0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### 6. One-Click Compliance ZIP Exporter
* **Endpoint:** `/api/export/audit-pack` (Next.js serverless route).
* **Operation:** 
  1. Queries all five active tables for the requested month.
  2. Generates CSV files: `daily_summary.csv`, `measurements.csv`, `wip_buffers.csv`, `CAPA.csv`.
  3. Creates a `manifest.json` containing the SHA-256 hash of each CSV file to prove compliance logs have not been tampered with.
  4. Archives the files into a single `.zip` dossier downloadable with one click.

---

## 5. UI/UX Directives & Role Workflows

The interface is customized for four distinct factory roles:

```
┌────────────────────────────────────────────────────────┐
│                   USER INTERFACES                      │
├───────────────────┬───────────────────┬────────────────┤
│ OPERATOR TERMINAL │ QUALITY ENGINEER  │ EXECUTIVE GM   │
│ - Large Inputs    │ - SPC Charts      │ - Rupees Lost  │
│ - Bilingual Labels│ - Pareto Heatmaps │ - Audit Pack   │
└───────────────────┴───────────────────┴────────────────┘
```

### Role A: The Operator (Shop Floor Entry)
* **View:** Mobile/tablet-first layout. Large touch-friendly input cards.
* **Localization:** English titles with Hindi sub-labels (e.g., **Visual Inspection (visual जांच)**).
* **Validation:** Immediate inline validation. Form will not submit if `Accepted + Hold + Rejected` does not equal `Checked`.

### Role B: The Quality Engineer (Analytic Control)
* **View:** Full-screen desktop view featuring:
  - **Pareto defect distribution** (bar charts showing major failure reasons).
  - **SPC Control Charts** (X-Bar / R-Charts showing UCL, LCL, and Mean).
  - **CAPA Action Center** allowing the engineer to open 5-Why and Fishbone diagrams.

### Role C: The Executive GM (Financial & Regulatory Shield)
* **View:** Clean, dashboard layout displaying:
  - **Money Lost:** Rupees lost per day and month-to-date (calculated using stage multipliers).
  - **OEE Gauge:** Clean radial gauges showing availability and quality performance.
  - **Export Button:** One-click compliance zip exporter.

---

## 6. Regulatory & Data Integrity Compliance (ALCOA+)

To pass ISO 13485 and CDSCO inspections, the system enforces the ALCOA+ framework:

1. **Attributable:** Every database record stores the `UUID` of the logged-in user who entered it.
2. **Legible:** Typography guidelines guarantee audit logs remain readable on operations screens.
3. **Contemporaneous:** The server records the `created_at` timestamp automatically at the moment of entry.
4. **Original:** Raw uploaded Excel workbooks are stored in a secure cloud bucket before parsing.
5. **Accurate:** Mandatory check constraints prevent negative entries, and the ingestion engine flags math mismatches immediately.
6. **Plus (+) Integrity:** Cryptographic hashes in the `manifest.json` verify that the data has not been modified.
