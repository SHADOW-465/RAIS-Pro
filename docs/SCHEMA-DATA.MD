Listed directory ANALYTICAL%20DATA
Listed directory ANNEXURE
Listed directory REJECTION%20ANALYSIS%202025-26
Listed directory SIZE%20WISE%20REJECTION
Listed directory FINAL
Listed directory VALVE%20INTEGRITY
Listed directory VISUAL
Listed directory SOP
Viewed disposafe.ts:1-64
Viewed package.json:1-43
Viewed parser.ts:1-542
Listed directory ingest
Listed directory parsers
Viewed parse-size-wise.ts:1-228
Viewed parse-rejection-analysis.ts:1-11
Viewed from-rejection-sheets.ts:1-162
Viewed page.tsx:1-495
Listed directory docs
Viewed MOID-CANONICAL-SPEC.md:1-366
Ran command: `python --version`
Edited scan_analytical_data.py
Ran command: `python scratch/scan_analytical_data.py`

I am executing the python script to parse the binary `.doc` files and Excel workbooks to gather the schemas and text contents. I will notify you when it finishes.

Edited scan_analytical_data.py
Ran command: `python scratch/scan_analytical_data.py`

### 1. Directory Structure & File Map
The `ANALYTICAL DATA` directory contains the raw plant records, business rules, and standard operating procedures (SOPs) for the Foley Balloon Catheter (FBC) manufacturing plant:

```
ANALYTICAL DATA/
├── SOP/
│   ├── WI-PRD-25-00... (P17 Visual Inspection Procedure)
│   ├── WI-PRD-30-00... (P24 & P25 Final Inspection & Siliconization Procedure)
│   ├── WI-QC-15-00...  (QC Valve & Balloon Integrity Test Procedure)
│   └── WI-QC-25-00...  (100% Inspection Post-Primary Packing QC Procedure)
├── ANNEXURE/
│   └── DS-ANX-13 GUIDE FOR REMEDIAL ACTION.doc (CAPA action matrix)
├── REJECTION ANALYSIS 2025-26/
│   ├── [01..12] REJECTION ANALYSIS-*.xlsx (Monthly stage summaries)
│   └── YEARLY ANALYSIS.xlsx (MTD/YTD external consolidation spreadsheet)
└── SIZE WISE REJECTION/
    ├── VISUAL/ (Visual daily spreadsheets and cumulative trackers)
    ├── VALVE INTEGRITY/ (Balloon & Valve daily/cumulative trackers)
    ├── FINAL/ (Final inspection logs and Daily Activity reports)
    └── VISUAL INSPECTION SOP.doc (Large master catalog of visual criteria)
```

---

### 2. Comprehensive File Schema & Business Logic

#### A. Standard Operating Procedures (SOPs)
* **Visual Inspection (`WI-PRD-25-00` / P17)**:
  * **Objective**: Define visual pass/fail thresholds for shopfloor operators.
  * **Defect Catalog & Threshold Rules**:
    * **Coagulum (`COAG`)**: Accepted if *slight* visual presence; rejected if *projected/rough*.
    * **Surface Defect (`SD`)**: Accepted if *slight feelable roughness*; rejected if *clearly feelable*.
    * **Tip Thin (`THSP`)**: Absolute rejection if tip thickness is uneven.
    * **Bubble (`BUB`)**: Rejected if internal bubble is clearly visible.
    * **Ply Separation**: Accepted if *slight*; rejected if *apparently visible*.
    * **Raised Wire (`RW`)**: Accepted if *slight*; rejected if *severe/projected*.
    * **Bad Eye Punching**: Rejected if cross-eyed or burred.
    * **Decolourisation**: Accepted if *minute dots*; rejected if *clearly visible*.
    * **Black Mark (`BM`)**: Segregated based on spot size.
* **Valve & Balloon Integrity QC (`WI-QC-15-00` / P18 & P20)**:
  * **Objective**: Define pressure testing rules.
  * **Procedure**: Catheters are inflated with air and checked after **20–30 minutes**.
  * **Defect Catalog & Threshold Rules**:
    * **Balloon Quality**: Rejected if **90/10** ratio, weak balloon, dog-leg curvature, or thin spots (>3).
    * **Valve Quality**: Rejected if slow deflation, non-inflation, or leakage occurs.
* **Final Inspection & Siliconization (`WI-PRD-30-00` / P24 & P25)**:
  * **Objective**: Check final print readability, sleeve wrinkles, surface spots, and apply siliconization (Hexane + MED 361 Silicon Fluid).
* **Primary Packing Inspection (`WI-QC-25-00`)**:
  * **Objective**: Post-packaging check to ensure no seal open, delamination, hair, or dust ingress occurs during packing.

#### B. Spreadsheet Schema (Ingested Ledger)
* **Monthly Rejection Summaries (`REJECTION ANALYSIS`)**:
  * **Structure**: Each tab represents a stage (`Visual`, `Balloon`, `Valve`, `Final`). 
  * **Columns**: `DATE` | `QUANTITY CHECKED` | `REJECTION` | `% REJECTION`.
* **Size-Wise Production & Rejection sheets (`SIZE WISE REJECTION`)**:
  * **Structure**: Tabs represent French sizes (`10FR`, `12FR`, `14FR`, `16FR`, `18FR`, `20FR`, `22FR`, `24FR`).
  * **Columns**:
    * *Visual & Final*: `DATE` | `INPUT QTY` | `REJ. QTY` | Defect reason columns (`COAG` | `SD` | `BUB` | `PINH` | `BM` | `WEB` | `OTHERS`).
    * *Valve Integrity*: Contains **two stages** side-by-side:
      * **Balloon Testing (Cols D–L)**: Checked, Accepted, Rej Qty, and defects (`Stuck Balloon`, `Balloon Burst`, `Leakage`, `Others`).
      * **Valve Integrity (Cols P–Y)**: Checked, Accepted, Rej Qty, and defects (`Leakage`, `90-10`, `Bubble`, `Thin Spot`, `Others`).

---

### 3. Correlation with the Application Architecture

The app was engineered directly around these document patterns:
1. **The Ingestion Gate (`parser.ts`)**:
   * Uses multi-row header merging (`buildHeaderBlock`) to bypass the blank spacer rows and read the sub-header defect codes (e.g. `COAG`, `SD`) as column headers.
   * `parseSizeWise` dynamically splits the side-by-side Valve Integrity sheets into two distinct `StageDayRecord` instances (`balloon` and `valve-integrity`) to respect the double-stage layout of the Excel sheets.
2. **Deterministic Resolution (`disposafe.ts`)**:
   * Resolves raw spreadsheet labels against the registry using separator-insensitive normalizations (e.g. `90-10`, `90/10` and `90 10` all resolve to a single code: `90/10`).
3. **Flow Chart Coordinates**:
   * Highlights P17 (Visual), P18 (Balloon), P20 (Valve), and P24 (Final) as the four main quality gates.

---

### 4. Strategic Recommendations: What We Missed / Should Consider

Based on a comparison of the raw files with the current application, here are 4 important gaps to address in future phases:

#### 1. Hold and Rework Loop Integration
* **The Gap**: Both `WI-QC-25-00` and `WI-QC-15-00` emphasize segregating products for **rework** in identified tubs. While the database schema supports `qty_hold` and `rework` fields, the current parser (`parse-size-wise.ts`) assigns `rework: null` and only maps checked vs. rejected counts.
* **Mitigation**: Update the parser to read "HOLD" or "REWORK" columns from the spreadsheet, allowing the staging grid to capture items flagged for adjustment rather than total scrapping.

#### 2. Live SOP Pre-Flight Compliance checklists
* **The Gap**: The SOPs require pre-checks (e.g. checking Hexane fluids, calibrating heating elements, checking table cleanliness). These currently live on paper.
* **Mitigation**: In the **Data Entry** or **Audit Trail** page, add a shift-start "SOP Pre-Flight Checklist" for supervisors. Committing a daily log could require checking off these tasks, matching live shopfloor operations with standard procedures.

#### 3. Seed AI Prompts with SOP Corrective Action Rules
* **The Gap**: The **Ask RAS** chat currently gives generic AI recommendations.
* **Mitigation**: Inject a summarized ruleset of `DS-ANX-13 Guide for Remedial Action` into the system prompt. For example, if a user asks about "90/10" defects, the AI should respond:
  > *"SOP WI-QC-15-00 recommends inspecting valve alignment, checking for dog-leg curvatures, and verifying that the inflation test ran for the full 20–30 minutes."*

#### 4. Excel Link Health Check Indicator
* **The Gap**: The monthly `YEARLY ANALYSIS.xlsx` sheet uses external file links (e.g. `='[2]May Cummulative'!B30`). When users upload these individually to the browser, the formulas break.
* **Mitigation**: Add a warning system to the staging grid that flags if an uploaded workbook contains unresolved external sheet links, prompting the user to upload the missing month's sheets.