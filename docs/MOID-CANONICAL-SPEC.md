# MO!D Canonical Specification
*Version 3.0 · Single Source of Truth · June 2026*  
*Owner: Showmik Kumaar / RAIS-MO!D Development*  
*Scope: Disposafe Pilot, Foley Balloon Catheter (FBC) Rejection Intelligence & Diagnostics*

---

## 1. Document Control & Decision Log

This file is the absolute source of truth for the MO!D application. All previous PRDs, blueprints, and proposals in `docs/trash/` or earlier directories are superseded by this document.

### Decision Log

| Date | Decision | Rationale / Evidence | Status |
| :--- | :--- | :--- | :--- |
| **2026-06-10** | RAIS Pro becomes MO!D V1 | Merged the historical spreadsheet forensic scanner with real-time shopfloor diagnostics. | Active |
| **2026-06-11** | Add Findings -> Adjudication loop | Unstructured files have corrupted formulas and carryover discrepancies. | Active |
| **2026-06-15** | Add Size-Wise and SOP diagnostics | Medical plant rejections are highly dependent on catheter size (French size Fr10–Fr18) and SOP compliance. | Active |
| **2026-06-16** | On-Premise Local deployment first | Cloud-only systems will be rejected due to strict network blocks, jammers, and data privacy policies. | Active |
| **2026-06-17** | **Dashboard-First Cockpit Layout** | PA's review report criticized the "report-like" upload screen. The app now lands directly on the cockpit, moving the upload pipeline to a secondary drawer. | **Active** |
| **2026-06-17** | **Editable Ingestion Grid & Comments** | Operators/QE must be able to edit spreadsheet-parsed rows, run real-time AI validation, and add explanatory comments *before* ledger commit. | **Active** |
| **2026-06-17** | **Ask RAS Chat with Source Flyout** | The chatbot answers quality queries and provides a "View Source" badge showing exact cell coordinates, file hashes, and user override comments. | **Active** |
| **2026-06-17** | **Dynamic Cost Inputs** | Removed hardcoded costing. Finished SKU costs and rework labor are input dynamically in forms/settings to compute COPQ. | **Active** |

---

## 2. Core Problem Statement & Product Scope (Focus: Rejections)

The plant does not lack raw numbers; it lacks a dependable, traceable operating layer between messy paperwork and executive decisions.
1. **Unstable Data:** Rejection counts live in weekly summaries, monthly files, daily activity reports, and size-wise workbooks containing broken formulas and external links.
2. **Action Blindness:** The GM can see overall rejection percentages, but cannot determine *why* a spike happened, which size (e.g., Fr16) drove the failure, or what corrective action to take.
3. **Audit Risk:** Preparing for ISO 13485 or CDSCO (MDR 2017) audits requires days of manual file matching.
4. **Data Privacy:** Payloads sent to external LLMs must never expose proprietary compound ratios or raw batch counts.

### V1 Pilot Scope (Focus on Rejections & Money Lost)
* **Interactive 23-Node Process Flowchart:** Graphical SVG map of the Foley Balloon Catheter line, showing FPY, rejections, and dynamic scrap cost (COPQ).
* **Dual-Track Ingestion:** 
  1. *Excel Parsing Pipeline:* SheetJS parses monthly/size-wise workbooks into an editable staging grid.
  2. *Direct Dashboard Entry:* Manual entry forms with dynamic field additions.
* **Staging Grid Verification Layer:** Ingested/manual entries run through deterministic validation checks. Rows are fully editable, and operators can attach comments before signing off.
* **Ask RAS (Rejection Advisory System) Chat:** Natural language QA interface with a "View Source" flyout tracing metrics back to sheet cells (`'VISUAL!C12'`), file hashes, and edit comments.
* **Executive Dashboard Cockpit:** A sleek dark/light mode compatible dashboard summarizing the GM's exact trend graphs (Visual, Balloon, Valve, Final) and Pareto distributions.
* **Compliance Pack Export:** Auto-generation of A4-printable monthly summaries (excluding data health/sign-off widgets) and audit ZIP packages with cryptographic manifests.

---

## 3. Technology Stack & Deployment Architecture

To satisfy strict local cybersecurity compliance, internet blocks, and multi-user access across the plant (GM, Quality Manager, Supervisor, Operators), the application runs as an **On-Premise Web Application** hosted on a local server.

```
                               MO!D ON-PREM LAYERS
  
  [Shopfloor Terminal]     [Supervisor Terminal]     [GM Executive Terminal]
          │                          │                          │
          └──────────────────────────┼──────────────────────────┘
                                     ▼ (Local LAN - HTTP/HTTPS)
                        ┌──────────────────────────┐
                        │     Next.js Web UI       │
                        └────────────┬─────────────┘
                                     ▼
                        ┌──────────────────────────┐
                        │    FastAPI Python API    │
                        └────────────┬─────────────┘
                                     ▼
              ┌──────────────────────┴──────────────────────┐
              ▼                                             ▼
     ┌──────────────────┐                          ┌──────────────────┐
     │  PostgreSQL DB   │                          │ Local GPU Server │
     │  (Supabase/PG)   │                          │ (Ollama Llama3B) │
     └────────┬─────────┘                          └──────────────────┘
              ▼
     ┌──────────────────┐
     │ Read-Only Excel  │
     │  File Storage    │
     └──────────────────┘
```

* **Frontend:** Next.js (React 19 + TypeScript) styled with premium Vanilla CSS tokens for smooth transitions, pillbox cards, and high contrast.
* **Backend:** FastAPI (Python 3.11). Handles Excel file profiling, mathematical SPC engines, Pareto sorting, and interfaces with the local AI.
* **Database:** PostgreSQL (with transaction logs, check constraints, and role-based views).
* **AI Engine:** Ollama running locally serving `meta-llama-3-8b-instruct`.
* **Original File Storage:** A local read-only directory `/Uploads/Original/` keeping uploaded Excel files pristine (MO!D never edits source files).

---

## 4. Detailed Database Schema (Golden Schema)

The database schema runs on PostgreSQL and is optimized for append-only audit trails, user comments, and traceability.

```sql
-- 1. SKUs Table (Stores dynamic finished cost defaults)
CREATE TABLE skus (
    sku_id TEXT PRIMARY KEY,
    sku_name TEXT NOT NULL,
    default_finished_cost REAL NOT NULL DEFAULT 20.0,
    default_rework_cost REAL NOT NULL DEFAULT 5.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Stage Cost Weights Table
CREATE TABLE stage_cost_weights (
    stage_name TEXT PRIMARY KEY,
    sequence_order INTEGER NOT NULL UNIQUE,
    cost_weight REAL NOT NULL CHECK (cost_weight BETWEEN 0.0 AND 1.0)
);

-- 3. Daily Production Summary Table
CREATE TABLE daily_production_summary (
    date DATE PRIMARY KEY,
    sku_id TEXT REFERENCES skus(sku_id) ON DELETE SET NULL,
    total_produced INTEGER NOT NULL DEFAULT 0,
    total_rejected INTEGER NOT NULL DEFAULT 0,
    total_hold INTEGER NOT NULL DEFAULT 0,
    ingestion_file_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Stage Measurements Table
CREATE TABLE stage_measurements (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL REFERENCES daily_production_summary(date) ON DELETE CASCADE,
    stage_name TEXT NOT NULL REFERENCES stage_cost_weights(stage_name) ON UPDATE CASCADE,
    sku_id TEXT REFERENCES skus(sku_id) ON DELETE SET NULL,
    catheter_size TEXT NOT NULL, -- e.g., 'Fr12', 'Fr16', 'Fr18', 'Cumulative'
    qty_checked INTEGER NOT NULL CHECK (qty_checked >= 0),
    qty_accepted INTEGER NOT NULL CHECK (qty_accepted >= 0),
    qty_hold INTEGER NOT NULL DEFAULT 0 CHECK (qty_hold >= 0),
    qty_rejected INTEGER NOT NULL CHECK (qty_rejected >= 0),
    provenance_file TEXT,         -- Source filename
    provenance_coordinate TEXT,   -- Excel cell reference (e.g. 'Sheet1!B18')
    is_direct_entry BOOLEAN DEFAULT FALSE,
    CONSTRAINT chk_qty_balance CHECK (qty_checked = qty_accepted + qty_hold + qty_rejected),
    CONSTRAINT unique_date_stage_size UNIQUE (date, stage_name, catheter_size)
);

-- 5. Defect Logs Table
CREATE TABLE defect_logs (
    id SERIAL PRIMARY KEY,
    measurement_id INTEGER NOT NULL REFERENCES stage_measurements(id) ON DELETE CASCADE,
    defect_type TEXT NOT NULL, -- 'Thin Spod', 'Bubble', 'Leakage', 'Pinhole', 'Others'
    qty_defective INTEGER NOT NULL CHECK (qty_defective >= 0),
    CONSTRAINT unique_measurement_defect UNIQUE (measurement_id, defect_type)
);

-- 6. Adjudication & Rulebook Tables
CREATE TABLE adjudication_logs (
    id SERIAL PRIMARY KEY,
    finding_description TEXT NOT NULL,
    adjudication_type TEXT NOT NULL CHECK (adjudication_type IN ('MISTAKE', 'INTENTIONAL', 'UNRESOLVED')),
    resolved_by TEXT NOT NULL, -- Operator/Supervisor name
    notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. User Comments & Discrepancies Table (Critical for the Ask RAS Traceability Bridge)
CREATE TABLE user_comments (
    id SERIAL PRIMARY KEY,
    target_table TEXT NOT NULL,       -- 'stage_measurements' or 'defect_logs'
    target_row_id INTEGER NOT NULL,
    comment_text TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. CAPA Memory Table (Local Semantic Memory)
CREATE TABLE capa_memory (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    defect_type TEXT NOT NULL,
    stage_name TEXT NOT NULL REFERENCES stage_cost_weights(stage_name),
    problem_description TEXT NOT NULL,
    root_cause_analysis TEXT NOT NULL,
    corrective_action TEXT NOT NULL,
    resolved_by TEXT NOT NULL
);
```

---

## 5. Functional Specs & Logic

### A. Dynamic Costing & COPQ Formulation
Cost parameters are **never hardcoded**. The interface provides dynamic fields where GMs or engineers input SKU costs.
* **Dynamic Finished SKU Cost ($C_{\text{sku}}$):** Default ₹20.00 (editable).
* **Dynamic Rework Labor Cost ($C_{\text{rework}}$):** Default ₹5.00 (editable).
* **Progressive Cost of Poor Quality (COPQ):**
  $$\text{COPQ}_s = \text{Qty Rejected}_s \times (C_{\text{sku}} \times W_s)$$
  *Where $W_s$ is the progressive weight for stage $s$ seeded in `stage_cost_weights` (e.g. Visual Inspection = 0.60).*
* **Rework Cost:**
  $$\text{Rework Cost}_s = \text{Qty Hold}_s \times C_{\text{rework}}$$

### B. Mathematical Validation Rules (The Ingestion Gate)
Whether data is uploaded via Excel or typed manually, the following validation rules run locally before committing to the database:
1. **Arithmetic Balance Rule:** 
   $$\text{Qty Checked} = \text{Qty Accepted} + \text{Qty Hold} + \text{Qty Rejected}$$
2. **Defect Sum Rule:** 
   $$\sum \text{Qty Defective} = \text{Qty Rejected}$$
3. **Sequence Mass-Balance Rule (Poka-Yoke):**
   $$\text{Qty Checked}_{s,d} \le \text{Qty Accepted}_{s-1,d} + \text{Carryover Buffer}_{s-1,d}$$
4. **Anomalous Spike Warning:** Triggered if a stage rejection rate deviates from the 30-day historical mean by $\ge 3\sigma$.

### C. Finding & Comment Lifecycle
If any validation rule fails:
1. The record is flagged as **Pending Adjudication** in the staging grid.
2. The grid highlights the invalid cells in amber/red.
3. The user can **edit the grid cells directly** to correct typos, or click **Comment** to type an explanation (e.g., *"Batch FBC-102 carried over from previous shift"*).
4. Committing the corrected/commented grid writes the final values to `stage_measurements` and saves the comment in `user_comments` linked to that row.

---

## 6. UI/UX Design Specifications (Vanilla CSS)

The UI must feel like a premium, sleek **Factory Intelligence Cockpit** (dark and light mode compatible). Avoid stock-market charts; focus on factory yields, rejections, and financial impact.

### Color Tokens & Typography
* **Typography:** `IBM Plex Sans` for UI controls; `IBM Plex Mono` (tabular-nums) for tables/metrics; `Newsreader` (Georgia fallback) for reports and headings.
* **Sleek Themes:**
  - **Dark Mode (Default):** Carbon background (`#0c0f14`), slate panels (`#141922`), thin borders (`#1d2530`), vibrant status borders.
  - **Light Mode:** Studio background (`#f0f4f8`), white panels (`#ffffff`), border lines (`#d9dee4`).

### Grid Layout: The Cockpit Landing Page

```
 ┌───────────────────────────────────────────────────────────────────────┐
 │ MO!D COCKPIT  [Apr] [May 2026] [Jun]           ◐ Theme  ⎙ Export PDF │
 ├───────────────────────────────────────────────────────────────────────┤
 │  AI EXECUTIVE INSIGHTS (PA Priority 1)                                │
 │  • Rejection Rate spiked 1.2% on Shift B, costing ₹14,200.            │
 │  • Visual Inspection remains the biggest bottleneck (₹1.8L loss MTD). │
 ├───────────────────────────────────────────────────────────────────────┤
 │  [Primary KPI: Rej %]  [Worst Stage]  [COPQ MTD]  [Data Trust Score]  │
 │        3.44%            Visual Insp.   ₹2,84,000        98.4%         │
 ├───────────────────────────────────────────────────────────────────────┤
 │  INTERACTIVE 23-NODE FLOWCHART (Click a step to open Bento Panel)     │
 │  [P1: Compounding] ──> [*P3: Former Dip] ──> [P4: Wire Fixing] ...    │
 ├───────────────────────────────────────────────────────────────────────┤
 │  THE GM's TREND GRAPH (Visual, Balloon, Valve, Final)                 │
 │  (SVG Chart showing daily/monthly rejection trend lines)              │
 ├───────────────────────────────────────────────────────────────────────┤
 │  [ Pareto Defect Chart ]        │  [ Size-Wise Rejection Chart ]      │
 │  Thin Spot (60%)                │  Fr12 (2.1%)                        │
 │  Bubble (25%)                   │  Fr16 (5.8% - Outlier Detected)     │
 └───────────────────────────────────────────────────────────────────────┘
```

#### Process Flowchart & Bento Panel (Slide-out Drawer)
* Clicking any node in the flowchart opens a sliding Bento Box sidebar:
  1. **Quality Metrics:** Monospace FPY indicator (color-coded red/amber/green status ring).
  2. **Financial Impact:** Dynamic COPQ calculator card.
  3. **Override / Log Form:** Steward input fields to log rejections directly with an "Add Fields" button.

#### Ingestion Drawer & Staging Grid
* Triggered by an "Ingest Data" action button:
  - Supports drag-and-drop of Excel files.
  - Generates a spreadsheet-like grid rendering the extracted rows.
  - **All cells are editable.**
  - Clicking any cell reveals a **"Comment" icon** to log discrepancies before clicking "Commit to Ledger".

---

## 7. The "Ask RAS" Chat & Provenance Bridge

The dashboard features a collapsible sidebar housing the **Ask RAS** (Rejection Advisory System) chatbot. It is the central interface for natural language query troubleshooting and audit trails.

```
                    ASK RAS CHAT PANEL
   ┌──────────────────────────────────────────────────┐
   │ Ask RAS (Rejection Advisory System)            X │
   ├──────────────────────────────────────────────────┤
   │ User: Why did Valve Integrity spike in December? │
   │                                                  │
   │ RAS: Valve Integrity rejection spiked to 6.8%    │
   │ in December 2025. This was driven by 420         │
   │ "Leakage" defects logged on Machine M2.          │
   │                                                  │
   │ ┌──────────────────────────────────────────────┐ │
   │ │ [View Source]                                 │ │
   │ └──────────────────────────────────────────────┘ │
   └──────────────────────────────────────────────────┘
```

### The Provenance Flyout (Bridge)
Clicking **[View Source]** opens a detailed verification panel mapping the specific query results to their physical origin:

```
                  PROVENANCE FLYOUT
 ┌──────────────────────────────────────────────────┐
 │ Data Provenance Tracing                        X │
 ├──────────────────────────────────────────────────┤
 │ Stated Metric: Valve Rejections = 420 units      │
 │                                                  │
 │ • File Source: 09 REJECTION ANALYSIS-DEC25.xlsx  │
 │ • Work Sheet: VALVE INTEGRITY                    │
 │ • Cell Range: D12:D24                            │
 │ • MD5 Hash: 8b1f5a9e...                          │
 │ • Timestamp: 2025-12-16 10:14:32                 │
 │ • Ledger ID: SM-89204                            │
 │                                                  │
 │ User Edit Comments:                              │
 │ - Ramesh (QA Supervisor): "Excludes 20 units     │
 │   intentional carryover logged under SM-89201."  │
 └──────────────────────────────────────────────────┘
```

---

## 8. Cybersecurity & Air-Gapped Compliance

MO!D's architecture is engineered to satisfy strict security Audits (preventing data egress and bypassing DNS/domain blocks).

### Payload De-Identification Middleware
If the local server must fall back to a cloud-based AI service, a local **de-identification middleware** intercepts the payload before it leaves the LAN. It pseudonymizes sensitive data using a regex-based token map:

```typescript
// Pseudonymization Mapping
Raw Data: "14 Fr Latex Foley Catheter had 450 Thin Spot rejects by Operator Ramesh on Machine M3"
Scrubbed: "[SKU-ID-1] had [COUNT-1] [DEFECT-1] rejects by [OPERATOR-1] on [MACHINE-1]"
```
Only the scrubbed text is sent to the LLM. The local server maps the AI's structured response back to the original entities before rendering.

### Nginx Forward Proxy Configuration (Squid/Nginx)
The local plant firewall routes all outbound HTTPS traffic through an Nginx proxy that whitelists only the designated AI endpoint (e.g., `api.nvcf.nvidia.com` for NVIDIA NIM) and drops all other traffic.

```nginx
# /etc/nginx/nginx-forward-proxy.conf
http {
    server {
        listen 8888;
        
        # Whitelist NVIDIA Cloud NIM domain
        location /v1/chat/completions {
            resolver 1.1.1.1;
            proxy_pass https://api.nvcf.nvidia.com;
            proxy_set_header X-Real-IP "";
            proxy_set_header X-Forwarded-For "";
            proxy_set_header X-Disable-Telemetry "true";
        }
        
        # Block everything else
        location / {
            return 403;
        }
    }
}
```

---

## 9. Monthly Report & Export Specifications

### Monthly Quality Summary Layout
The system generates a clean, printable monthly report. To match the GM's feedback, the report is structured like `moid-monthly-report-mockup.html` but **completely excludes** the "Data Health Scorecard" and "Sign-Off Signatures" blocks (which are moved to the Ask RAS chat).
* **Page Budget:** Prints on exactly **3 pages** (A4) with no trailing blank page.
  - *Page 1:* Letterhead, Month, Executive AI Insights bulletin, KPI Strip, Worst-stage rankings.
  - *Page 2:* The GM's Rejection Trend Graph (SVG), Defect Pareto, Size-Wise Rejection table.
  - *Page 3:* Detailed Rejection counts by stage and catheter size, active CAPA actions list.

### Audit ZIP Package Exporter
Generates a cryptographically signed ZIP archive containing:
1. `daily_rejections.csv` (Stated daily counts).
2. `user_comments.csv` (All operator comments and override logs).
3. `adjudications.csv` (Supervisor overrides).
4. `manifest.json`: Stores SHA-256 hashes of all exported CSV files to prove audit data integrity (ALCOA+ standard).
