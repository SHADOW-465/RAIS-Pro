# CODEBASE COMPARISON & INTERACTIVE FLOWCHART UI PROPOSAL
*Version 1.0 · System Refinement & UI/UX Specification · June 2026*

This document provides a detailed comparison between the existing prototype codebase of the **RAIS Pro** repository (`C:/Users/acer/Documents/projects/RAIS-Pro`) and the planned Product Requirements Document (PRD), database blueprints, and operational bottlenecks. It then proposes a concrete implementation plan for an **Interactive FBC Process Flowchart (Bento UI)** and refines the **Data Ingestion Pipeline UI/UX** based on the files in `C:/Users/acer/Documents/MO!D`.

---

## 1. Codebase vs. Specification Gap Analysis

A thorough audit of the active repository (`C:/Users/acer/Documents/projects/RAIS-Pro`) compared with the exhaustive PRD and blueprints reveals the following architectural gaps:

| Feature Dimension | In Current Codebase | In Planned Specification / Blueprint | Core Engineering Gaps |
| :--- | :--- | :--- | :--- |
| **Database & Persistence** | Local client-side storage & memory caches; mock `/api/sessions` API routes. | Supabase PostgreSQL schema with 8 custom relational tables. | **No database integration:** The app runs entirely in-memory with client-side upload parses. Needs PostgreSQL schema migration. |
| **Ingestion Validation** | Parser extracts rows and counts, runs basic range check. | **Sequence Mass-Balance verification** (Checked $\le$ Accepted + Carryover) + MD5 duplication check. | **No integrity checking:** The prototype parses whatever is uploaded without verifying sequence coherence or file hashes. |
| **VSM & WIP Tracking** | *None* | `wip_buffers` table tracking buffer counts and carrying costs (₹0.10/catheter/day). | **VSM Blindness:** The codebase lacks any schema or dashboard UI to calculate buffer backlogs. |
| **Correlation Diagnostics** | Mocked insights card indicating correlation. | Multivariable correlation queries aggregating defects by operator, machine, and material batch. | **No data fields:** [stage_measurements](file:///C:/Users/acer/Documents/projects/RAIS-Pro/src/components/DataTable.tsx) table does not capture `machine_id`, `operator_id`, or `material_batch_no`. |
| **OEE Formulation** | *None* | Availability, Performance, and Quality calculations based on planned shift times and machine dip rates. | **Static OEE representation:** The OEE is not calculated from raw machine stop inputs. |
| **Compliance Exporter** | *None* | `/api/export/audit-pack` serverless ZIP exporter generating SHA-256 integrity manifests. | **No export functionality:** The GM cannot download a traceable, hashed zip package for auditors. |

---

## 2. Clickable FBC Process Flowchart & Bento UI

### The Concept
Instead of rendering process steps as a static table or list, the central dashboard will feature a visual **Process Flowchart Grid** modeled after the official Disposafe document (`Doc. No. DS/ANX/02:00` in `FBC FLOW CHART.pdf`). 

Operators and Quality Managers can view the entire factory floor in a single interactive view. Each process node is clickable, revealing its daily statistics and defect variables in styled "Bento Boxes".

```
                    INTERACTIVE FLOWCHART UI
  
  [P1: Compounding] ──> [*P3: Former Dip] ──> [P4: Wire Fixing] ──> ...
                               │
            ┌──────────────────┴──────────────────┐
            │         CLICKED BENTO BOX           │
            │  - Stage: P3 Main Former Dipping    │
            │  - FPY: 98.2% (Status: OK)          │
            │  - Checked: 10,000 | Scrap: ₹1,200  │
            │  - Defect Types: Bubble, Struck     │
            │  ┌───────────────────────────────┐  │
            │  │  Update Rejection Log (Steward)│  │
            │  └───────────────────────────────┘  │
            └─────────────────────────────────────┘
```

### The 23-Node Process Mapping
The flowchart maps the 23 FBC steps extracted from the PDF, marking the critical stages (`*` / `✻`):
1. `P1`: Compounding Latex
2. `*P3`: Main Former Dipping & Drying (Critical)
3. `P4`: Wire Fixing
4. `*P5`: Build-up Dipping & Drying (Critical)
5. `*P6`: Balloon Dipping & Drying (Critical)
6. `P7`: Balloon Fixing
7. `*P8`: Finish Dipping & Drying (Critical)
8. `P9`: Stripping
9. `P10`: Hot Water Dipping
10. `P11`: Eye Punching
11. `P12`: Leaching
12. `*P13`: Surface Treatment (Critical)
13. `*P14`: Post Curing (Critical)
14. `P15`: Gauge Inspection
15. `P16`: Trimming
16. `P17`: 100% Visual Inspection
17. `P18`: Balloon Inspection
18. `P19`: Valve Fixing
19. `P20`: 100% Valve Integrity & Balloon Inspection
20. `P21`: Balloon Deflation
21. `P22`: Sleeve Fixing & Balloon Shrinking
22. `P24`: Final Inspection
23. `*P25`: Siliconization & Primary Pack (Critical)

### Bento Box UI Specifications
Clicking a node in the flowchart opens a **Bento Box panel** displaying three distinct sections:
1. **Quality & Yield Section:**
   - **First Pass Yield (FPY):** Monospace percentage indicator with status ring (Green if $\ge 95\%$, Amber if $90\%-94\%$, Red if $<90\%$).
   - **Progressive Scrap Cost:** Displays the money lost at this stage in rupees:
     $$\text{Scrap Cost} = \text{Rejected Qty} \times (\text{SKU Finished Cost} \times W_s)$$
2. **Defect Breakdown (Pareto Mini-chart):**
   - Mini bar chart listing the defect counts for this stage (e.g., for `P17` showing counts of *Thin Spod*, *Struck Balloon*, and *Bubble*).
3. **Data entry / Override form (Steward role only):**
   - Allows operators to update rejection reasons or input daily counts directly if they choose to bypass the Excel upload:
     - `Accepted` / `Hold` / `Rejected` number inputs.
     - Select dropdown for defect reasons (enforcing constraints: $\sum \text{defects} \le \text{Rejected}$).
     - Click "Commit to Ledger" to trigger a Supabase mutation.

---

## 3. Data Ingestion Pipeline UI/UX Refinement

Based on the ui direction in `moid-gm-overview-mockup-2.html`, the Data Ingestion pipeline is divided into a three-step layout: **Ingestion Zone**, **Validation Queue**, and **Adjudication Console**.

```
                DATA INGESTION PIPELINE WORKFLOW
  
  ┌──────────────┐      ┌─────────────────┐      ┌─────────────────┐
  │ Upload Zone  ├─────►│ Validation Gate ├─────►│  Adjudication   │
  │ (SheetJS/MD5)│      │  (Sequence & MB)│      │     Console     │
  └──────────────┘      └────────┬────────┘      └────────┬────────┘
                                 │                        │
                                 ▼ (Pass)                 ▼ (Override)
                       ┌─────────────────┐      ┌─────────────────┐
                       │  Write Draft to │◄─────┤ Update Rulebook │
                       │    Ledger DB    │      │  & Ledger Entry │
                       └─────────────────┘      └─────────────────┘
```

### Step 1: The Ingestion Zone
* **UI/UX:** A drag-and-drop workspace supporting `.xlsx` and `.csv` files.
* **Backend Processing:**
  - Extracts the file MD5 checksum to verify the document hasn't already been uploaded.
  - Clears all calculated spreadsheet formulas to reconstruct the numbers from raw input cells.
  - Generates the cell provenance coordinate markers for the Verification bezier beam.

### Step 2: The Validation Gate
* **UI/UX:** A real-time progress loader that displays parsing phases.
* **Math Validation Checks:**
  1. **Positive Integer Check:** Enforces that all counts are $\ge 0$.
  2. **Arithmetic Check:** Verifies if `Checked` equals `Accepted + Hold + Rejected`.
  3. **Sequence Mass-Balance Check:** Compares Checked quantity of Stage $s$ against Accepted quantity of Stage $s-1$.

### Step 3: The Adjudication Console (Handling Gaps & Tampering)
* If a validation check fails, the record moves to the **Adjudication Console** instead of throwing a generic database error.
* **UX Layout:** A split-screen showing the raw Excel row on the left, and the validation error description on the right.
* **Supervisor Action Panel:** The supervisor has three options:
  - **Override/Correct:** Manually edit the incorrect cell (e.g., correcting a `-2` typo to `2`).
  - **Accept Intentional Deviation:** If there is a legitimate inventory carryover (WIP buffer release) that caused a mass-balance breach, the supervisor approves the entry and logs the explanation. This inserts a rule into the `process_rulebook` to ignore the outlier, preventing future alerts.
  - **Reject Ingestion:** Deletes the draft and requests a file re-upload.

---

## 4. Implementation Plan for Next.js

To implement this on top of the existing codebase:

1. **Database Integration**:
   - Run the SQL migrations in Supabase.
   - Replace the mock endpoints in `/api/analyze` and `/api/sessions` with serverless controllers querying the newly created Postgres tables.

2. **Flowchart Component**:
   - Create a React component `ProcessFlowchart.tsx` in `src/components/`.
   - Render the 23 steps as styled CSS cards connected by SVG bezier paths.
   - Attach click listeners to each step card to toggle the Bento Box overlay.

3. **Bento Box Sidebar**:
   - Add a sliding sidebar component `BentoPanel.tsx` that fetches `stage_measurements` and `defect_logs` for the active date and stage name.
   - Include the manual data-entry form inside this panel, enabling operators to log rejections directly.

4. **ZIP Compliance Exporter**:
   - Build the Next.js API route `/api/export/audit-pack` to fetch the monthly data, serialize it to CSVs, generate the SHA-256 manifest, and stream the ZIP file.
