# RAIS / MO!D — Exhaustive Product Requirements Document & System Specification
*Version 2.0 · Pilot Production Specification · June 2026*

This document serves as the single source of truth for the **RAIS/MO!D** system built for **Disposafe Health and Life Care Limited**'s latex Foley Balloon Catheter (FBC) dipping and assembly plant in Ballabgarh (Faridabad), Haryana. It consolidates all data contracts, mathematical formulations, user roles, UI/UX systems, and compliance frameworks.

---

## 1. Executive Summary & Scope

RAIS/MO!D is a manufacturing quality intelligence and diagnostics application. It ingests daily production Excel sheets and manual records, reconstructs them into an immutable ledger, runs deterministic calculations, and produces role-specific dashboards.

* **Client:** Disposafe Health and Life Care Limited.
* **Product Focus:** Foley Balloon Catheter (FBC) Dipping & Assembly lines.
* **Primary Objective:** Transform raw quality paperwork into traceable, money-denominated, audit-ready operational insights to support Lean/Kaizen practices without introducing hardware dependencies.
* **System Language:** English UI with Hindi labels for operator data entry.

---

## 2. Core Design & Usability Pillars

Every software engineering and UI decision must conform to these four principles:
1. **Legible-First:** Essential screen text must be $\ge 14\text{px}$. Numbers are the heroes; tabular-num spacing is mandatory. Print text floor is $9.5\text{pt}$ for data.
2. **Layered Depth (The L0–L2 Model):**
   * **L0 (Glance):** Large display text showing a single headline metric and a plain-language verdict (e.g., `"Rejection is HIGH — 12.56%"`).
   * **L1 (Read):** Standard dashboard charts, KPI cards, and "what it means" summaries for managers.
   * **L2 (Drill):** Comprehensive daily tables, formulas, SPC mathematics, and raw source references.
3. **Dual-Audience (The Explain Layer):** A global **"Explain" toggle** in the top bar. When active, every metric label and chart gets a plain-language definition, ensuring the General Manager (layman) and the Quality Engineer (expert) can collaborate on the same screen.
4. **Trustable & Printable:** Every figure carries a trust badge that can be clicked to trace its lineage back to the source Excel cell. Every view has a print-layout equivalent that renders as an A4 controlled document.

---

## 3. Data Contract & Canonical Ledger

The system parses raw read-only sheets, neutralizes all pre-calculated Excel formulas, and inserts raw values into a canonical, transaction-safe event ledger.

### A. The 6 Production Dispositions
Every event in the ledger represents a material log entry classified under one of six dispositions:
1. **Accept:** Passed inspection, moves to next stage.
2. **Reject:** Irreversibly scrapped at this stage.
3. **Rework:** Defective but fixable, sent back to previous step.
4. **Hold:** Defective, placed in quarantine pending reinspection.
5. **Scrap:** Disposed material, cannot be reused.
6. **Downgrade:** Passed secondary inspection but downgraded to lower-value SKU.

### B. Event Schema
Every row parsed or typed represents a database transaction with the following columns:
* `event_id`: Unique UUID.
* `timestamp`: ISO Date/Time.
* `sku_id`: Catheter SKU reference.
* `line_id`: Production line ID.
* `stage_name`: Dipping/assembly stage.
* `quantity_checked`: Integer.
* `quantity_accepted`: Integer.
* `quantity_hold`: Integer.
* `quantity_rejected`: Integer.
* `provenance_id`: Link to source metadata.

### C. Cell Provenance Schema
To support the verification layer, the ingestion engine logs exact coordinates of the source files:
* `file_hash`: MD5 checksum of the uploaded file (prevents duplicate ingestion).
* `filename`: Name of the source Excel workbook.
* `sheet_name`: Worksheet name.
* `cell_coordinate_checked`: String (e.g., `'Sheet1!B18'`).
* `cell_coordinate_rejected`: String (e.g., `'Sheet1!E18'`).

---

## 4. Yield, OEE, & Financial Formulations

The core analytical engine runs deterministic calculations on the canonical ledger to derive yields and financial leakage.

### A. First Pass Yield (FPY)
FPY measures the proportion of units that pass an inspection stage without being rejected or put on hold for rework.
For stage $s$ on date $d$:
$$FPY_{s,d} = \frac{\text{Checked}_{s,d} - \text{Hold}_{s,d} - \text{Rejected}_{s,d}}{\text{Checked}_{s,d}}$$

### B. Rolled Throughput Yield (RTY)
RTY is the cumulative probability that a catheter passes through all 12 stages of the dipping and assembly line without rework or reject. It is the product of individual FPYs:
$$RTY_d = \prod_{s=1}^{12} FPY_{s,d} = FPY_{1,d} \times FPY_{2,d} \times \dots \times FPY_{12,d}$$
* *Baseline Performance:* With Visual Inspection rejections at 8.1% and Valve Integrity holds at 9.1%, the FBC line RTY averages **79.1%**.

### C. Progressive Financial Leakage (Money Lost)
Instead of applying a flat rate, rejections are priced progressively based on the accumulated value-add at each stage.

1. **Stage Cost Weights ($W_s$):** Each stage $s$ has a defined cost multiplier:
   * `Production` (0.15), `Eye Punching` (0.20), `Leaching` (0.25), `Chlorination` (0.30), `Hanging` (0.35), `Gauge` (0.40), `Trimming` (0.45), `Visual Insp.` (0.60), `Balloon Insp.` (0.65), `Valve Fixing` (0.70), `Valve Integrity` (0.85), `Final Insp.` (1.00).

2. **Scrap Loss:** For a finished catheter cost $C_{\text{finished}}$ (default ₹20):
   $$\text{Scrap Loss}_{s,d} = \text{Rejected}_{s,d} \times (C_{\text{finished}} \times W_s)$$

3. **Rework Loss:** For a standard inspection/rework labor cost $C_{\text{rework}}$ (default ₹5):
   $$\text{Rework Loss}_{s,d} = \text{Hold}_{s,d} \times C_{\text{rework}}$$

4. **Total Daily Financial Leakage:**
   $$\text{Total Loss}_d = \sum_{s=1}^{12} \left[ \text{Rejected}_{s,d} \times (C_{\text{finished}} \times W_s) + \text{Hold}_{s,d} \times C_{\text{rework}} \right]$$

### D. Dipping Machine OEE
Calculated for the former dipping machines using operator shift logs:
* **Availability:** $\frac{\text{Shift Duration} - \text{Logged Downtime}}{\text{Shift Duration}}$ (categorizes mechanical vs setup stoppages).
* **Performance:** $\frac{\text{Actual Dip Qty}}{\text{Ideal Qty}}$ (ideal rate = 1,200 catheters per hour).
* **Quality:** $\frac{\text{Accepted Dip Qty}}{\text{Total Dip Qty}}$ (yield of the dipping stage).
* **OEE:** $\text{Availability} \times \text{Performance} \times \text{Quality}$.

---

## 5. Disposafe Dipping Line Ontology

To ensure strict data classification, the system restricts inputs to the following stages and defects:

### A. The 12 Dipping & Assembly Stages
1. **Production:** Main former dipping and compounding.
2. **Eye Punching:** Catheter tip hole-punching.
3. **Leaching:** Hot water leaching to extract proteins.
4. **Chlorination:** Outer surface treatment.
5. **Hanging:** Curing and drying racks.
6. **Gauge:** Sizing and balloon thickness check.
7. **Trimming:** Excess latex removal.
8. **Visual Insp. (Visual Inspection):** Major visual QC (historical rejection mean = 8.1%).
9. **Balloon Insp. (Balloon Inspection):** Low-pressure balloon inflation check.
10. **Valve Fixing:** Assembling the valve.
11. **Valve Integrity:** Core integrity test (historical hold mean = 9.1%).
12. **Final Insp. (Final Inspection):** Double-check QC before sterilization.

### B. The 8 Defect Modes
* `Thin Spod` (Visual defect - dipping thickness variance)
* `Struck Balloon` (Balloon sticking defect)
* `Leakage` (Inflation leak)
* `Balloon Burst` (Rupture during testing)
* `Bubble` (Air pockets in latex)
* `90/10` (Component alignment defect)
* `Pinhole` (Microscopic membrane breaches)
* `Others` (Miscellaneous mechanical/surface defects)

---

## 6. Functional Requirements

### F1 — Ingestion & In-App Data Entry
* **Multi-file Ingestion:** Parse raw `.xlsx` and `.csv` workbooks entirely on the client side using SheetJS.
* **Form Ingest:** Web entry forms mapped to the 12 FBC stages. The forms pre-populate defaults, enforce positive integers, and auto-calculate accepted counts (`Checked - Hold - Rejected`).
* **Header Mapping:** A rule-based mapper that maps client headers (e.g. "Appearance Test") to the canonical ontology (`Visual Insp.`).

### F2 — Validation & Findings Queue
* **Negative Check:** Flags files where rejection or checked values are negative (e.g. `Rej = -2` entry errors).
* **Arithmetic Verification:** Recomputes every subtotal and percentage column. Any difference between raw sheet values and recomputed math triggers a `Finding`.
* **Outlier Flags:** Tracks daily rejection % and triggers an SPC warning if a day exceeds the Upper Control Limit (UCL) or follows Nelson Rules for special-cause variations.

### F3 — Adjudication & Action (CAPA)
* **Adjudication UI:** GMs/QAs mark a finding as *Mistake* (system overrides using corrected math), *Intentional* (accepts variance, logs note), or *Not Sure* (marks for follow-up).
* **CAPA Trigger:** UCL breaches allow QAs to issue a Corrective and Preventive Action (CAPA) ticket containing: Problem, Root Cause (fishbone/5-Why template), Owner, Target Date, and Status.

### F4 — Verification Panel (The Moat)
* Double-clicking any metric or chart node triggers the **Provenance Bridge**.
* Draws a bezier highlight beam from the dashboard metric to a split-screen view showing the exact Excel workbook row, sheet name, cell coordinate, and raw value, proving 100% data traceability.

---

## 7. Role-Based Dashboards

1. **Data Steward / Operator:** Minimal-distraction screen for uploading files, checking sheet validation indicators, and filling out daily logs with large, touch-friendly inputs.
2. **Quality Engineer (QE):** Technical view showing Pareto defect charts, SPC control charts with UCL/CL/LCL, and the correlation matrix (e.g., connecting Machine 3 with "Thin Spod" spikes).
3. **Plant Director / GM:** High-level dashboard showing monthly OEE, cumulative FPY/RTY, total rupees lost, the open CAPA queue, and the print/export gateway.
4. **Admin:** Configuration screen for setting finished SKU costs ($C_{\text{finished}}$), rework costs ($C_{\text{rework}}$), and editing stage weights ($W_s$).

---

## 8. Technical Specifications & UI/UX Directives

### A. Typography & Fonts
* **Serif:** `Newsreader` (Georgia fallback) for screen titles, headings, and printable letters.
* **Sans-Serif:** `IBM Plex Sans` (system-ui fallback) for UI controls, inputs, and labels.
* **Monospace:** `IBM Plex Mono` (Consolas fallback) with `font-variant-numeric: tabular-nums` for data tables and numeric displays.
* **Line Height:** $\ge 1.5$ for body text, $\ge 1.3$ for titles.

### B. Color & Themes
* **Screen Backdrop:** Dark theme (`#0c0f14` background, `#121821` card, `#e7edf3` text) for operation terminals.
* **Backdrop Toggle:** Toggles screen workspace background between Dark Blueprint (`#0c0f14`) and Light Studio (`#f0f4f8`) to optimize screen readability in bright offices.
* **Print Canvas:** Flips automatically to light theme (`#ffffff` background, `#14181f` text, `#d9dee4` borders) to conserve ink.
* **Status Colors:** In-control/good (`#1a9d6e`), warning (`#d98a0b`), out-of-control/bad (`#d23f55`).

### C. Printable 4-Page Monthly Quality Report Specification
* **Page 1:** Letterhead, Document Control Table, Executive Summary, Narrative Insight, Daily Rejection Control Chart, Stage Status Grid.
* **Page 2:** Stage Rejection Bar Chart, Consolidated Stage Register Table (13 rows including Totals), FBC Process Flow Inspection Coverage Strip.
* **Page 3:** Defect Pareto Chart, SPC Visual Inspection Control Chart, Weekly Trend Table.
* **Page 4:** Open Findings & Adjudication queue, Recommended Actions Table (CAPA status), Sign-off Signature blocks.
* **Print Requirements:** Margins set to `14mm 16mm 16mm`. Repeating headers and page numbers (`PAGE X / 4`). Safe page-breaks configured to prevent table split cuts.

---

## 9. Compliance Framework (ALCOA+)

To meet regulatory audits (ISO 13485 QMS and CDSCO Medical Device Rules 2017):
* **Attributable:** Every Excel upload is tagged with the operator's digital signature and timestamp.
* **Legible:** Typography floors ensure all audit logs remain readable forever.
* **Contemporaneous:** Logs contain validation checks matching the date of entry.
* **Original:** Raw files are saved unmodified. MO!D works on derived ledger entries.
* **Accurate:** Every recomputed total is verified; deviations are flagged as unresolved findings.
* **Plus (+) Integrity:** The system hashes local databases to prevent database-tampering or unauthorized direct edits.
