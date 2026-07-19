# EXHAUSTIVE SYSTEM DIAGNOSTIC & OPERATIONAL PROBLEM STATEMENT
*Version 2.0 · Reference Diagnostic Context for Disposafe FBC Plant · June 2026*

This document provides the exhaustive, structured, and clinically organized problem statement for **Disposafe Health and Life Care Limited**'s Foley Balloon Catheter (FBC) dipping and assembly facility in Ballabgarh, Haryana. It details the latent business blindspots, shop floor operational bottlenecks, data-entry anomalies, and progressive financial leaks that the **RAIS/MO!D** application is engineered to solve.

---

## 1. Context & Operational Boundaries

Disposafe operates under strict regulatory and quality parameters:
* **Compliance Framework:** CDSCO (Medical Device Rules 2017) and ISO 13485 (Medical Devices — Quality Management Systems). 
* **Product Focus:** Latex Foley Balloon Catheters (FBC) — a multi-stage dipping, curing, assembly, and testing process.
* **Audit Environment:** High-scrutiny regulatory inspections where audit trail compliance, data integrity, and CAPA (Corrective and Preventive Action) loops are legally binding.

---

## 2. The Root Cause of Profit Drain: Operational Problem Catalog

The factory's operational inefficiencies are categorized into four distinct layers: Executive, Managerial, Process/Shopfloor, and Data/Spreadsheet.

```
┌────────────────────────────────────────────────────────┐
│               EXECUTIVE BLINDSPOTS                     │
│  - COPQ Invisible Bleed      - Regulatory Risk         │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│               MANAGERIAL BLINDSPOTS                    │
│  - Operator Data Falsification  - Correlation Blindness │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│               PROCESS / SHOPFLOOR LEAKS                │
│  - Visual Inspection (8.1%)   - Valve Integrity (9.1%)  │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│             DATA & SPREADSHEET PATHOLOGIES             │
│  - Negative Rejections       - Unjustified Spikes      │
└────────────────────────────────────────────────────────┘
```

### Layer A: Executive Blindspots (The Boardroom)

1. **Invisible Cost of Poor Quality (COPQ):**
   * **The Problem:** The General Manager tracks rejections in *pieces* (e.g., "we rejected 5,000 units today") rather than *rupees*. This decouples quality failures from financial metrics.
   * **The Impact:** The true cash impact of scrap is hidden from the monthly balance sheet, preventing senior management from understanding that a 2% reduction in scrap directly recovers millions in profit.
   * **Financial Scale:** A nominal 2% to 5% rejection rate typically consumes up to **20% of a factory's net profit margin**.

2. **The Regulatory Sword of Damocles:**
   * **The Problem:** Compiling compliance logs and audit trails for ISO 13485 and CDSCO takes weeks of senior engineering time.
   * **The Impact:** Preparation panic during audits creates massive administrative friction. A single missing or tampered record can lead to a regulatory audit warning, which risks shutting down production lines and halting shipments.

3. **High Enterprise IT Overhead:**
   * **The Problem:** Traditional Manufacturing Execution Systems (MES) and ERPs require expensive on-premises servers, dedicated database administrators, and intensive staff retraining.
   * **The Impact:** Traditional enterprise software is cost-prohibitive and too complex for MSME manufacturing facilities, leaving them stuck with insecure Excel sheets.

---

### Layer B: Managerial & Analytical Blindspots (The Quality Lab)

1. **The "Clean Data" Lie (Operator Data Falsification):**
   * **The Problem:** Operators and supervisors are penalized for high scrap rates and rewarded for hitting output targets.
   * **The Impact:** Operators under-report scrap, misclassify critical defects (e.g., classifying a machine-fault "Struck Balloon" as a raw-material "Bubble"), or shift defect numbers to other shifts to avoid blame.
   * **Diagnostic Gap:** Excel spreadsheets have no validation checks to ensure that the sum of parts accepted and rejected at Stage $s$ equals the quantity checked at Stage $s+1$ (Sequence Mass-Balance check).

2. **Blindness to Process Correlation:**
   * **The Problem:** Daily quality logs state *what* failed (e.g., 2,417 "Thin Spod" rejects) but do not record *why*.
   * **The Impact:** GMs and Quality Engineers cannot correlate defect spikes with shifting process variables like operator ID, machine ID, latex compounding batch number, or ambient humidity. Root cause analysis becomes guesswork.

3. **Excessive WIP Inventory Carrying Costs:**
   * **The Problem:** Because production managers receive quality reports 12 to 24 hours after the shift ends, they cannot balance the production flow.
   * **The Impact:** Managers hold high "safety stocks" of semi-finished catheters between dipping and assembly (WIP buffers) to avoid line stoppages. This ties up capital in inventory and masks shopfloor bottlenecks.

---

### Layer C: Process & Shopfloor Leaks (The Production Line)

The Foley Balloon Catheter manufacturing process contains two massive yield bottlenecks:

```
        FOLEY BALLOON CATHETER STAGE YIELDS
  
  [ Raw Latex ] ──> Dipping & Curing Stages 
                          │
                          ▼
  [ Stage 9 ] Visual Inspection ────> [8.1% Scrap Loss]
                          │
                          ▼
  [ Stage 11 ] Valve Integrity ────> [9.1% Hold & Quarantine]
                          │
                          ▼
  [ Final Quality Inspection ] ────> [79.1% Cumulative RTY]
```

1. **Visual Inspection Stage (Stage 9) — 8.1% Scrap Rate:**
   * This inspection point is the largest source of physical scrap.
   * **Thin Spod:** The latex coating thickness drops below the nominal limit during dipping. The thin membrane makes the catheter structurally weak, risking burst failures inside the patient.
   * **Struck Balloon:** Dipping mandrels are placed too close on the rack, or the latex compound viscosity is too high. Catheter balloons stick to each other and tear during mechanical stripping.
   * **Bubble:** Air pockets are trapped in the latex matrix during compounding, creating weak spots.

2. **Valve Integrity Testing (Stage 11) — 9.1% Hold/Quarantine Rate:**
   * Catheters fail the inflation/deflation test, where the balloon must hold water without leaking.
   * **The Bottleneck:** Catheters that fail are put on "Hold" and quarantined. 
   * **The Rework Loop:** Quarantined catheters must be manually disassembled, re-aligned, and re-tested. This creates a labor-intensive bottleneck that slows down packaging.

3. **Rolled Throughput Yield (RTY) Deficit — 79.1% Cumulative Yield:**
   * Due to compounding yield losses across the 12 process stages, the factory has an RTY of only **79.1%**.
   * **The Impact:** **20.9%** of all raw compounding and processing inputs are lost as scrap or trapped in rework loops.

---

### Layer D: Data Quality & Spreadsheet Pathologies (The Excel File)

The spreadsheet files used by shift supervisors suffer from severe data issues:

1. **Impossible Rejection Values (Negative Counts):**
   * **The Pathology:** Excel sheets contain records where rejections are entered as negative numbers (e.g., `Rejection = -2` or `Hold = -5`).
   * **The Root Cause:** Supervisors use negative numbers to "balance" inventory counts at the end of the month, overriding historical records to hide clerical errors.

2. **Unjustified Rejection Spikes:**
   * **The Pathology:** Quality logs show extreme spikes in rejections (e.g., **33.9% rejection on May 18**, compared to the 12.56% monthly average) without any explanation.
   * **The Root Cause:** GMs cannot tell if this spike was a real process failure (e.g., compound temperature drop) or a clerical error where two days of data were combined.

3. **Data Gaps (Missing Logs):**
   * **The Pathology:** Excel sheets have blank columns for critical steps like `Chlorination` or `Hot Leaching` on specific dates.
   * **The Impact:** Missing data skews the month-to-date averages, making it impossible to audit compliance or track process trends.

---

## 3. Reference Process Stage & Diagnostic Code Directory

For developers building the diagnostic validation algorithms in the **RAIS/MO!D** application, the table below maps each process stage to its sequence order, cost weight, defect types, and data-validation rules:

| Stage Name | Seq | Cost Weight ($W_s$) | Expected Defect Types | Mandatory Validation Check |
| :--- | :---: | :---: | :--- | :--- |
| **Former Assembly** | 1 | 0.15 | Mandrel damage, loose jig | Checked Qty > 0 |
| **Coagulant Dipping** | 2 | 0.18 | Low coagulant concentration, run-off | Checked Qty $\le$ Stage 1 Accepted Qty |
| **Latex Dipping** | 3 | 0.22 | Viscosity error, speed variation | Dipping Machine OEE log must exist |
| **Leaching** | 4 | 0.25 | Poor washing, high residue | Chlorination check date $\ge$ Leaching date |
| **Chlorination** | 5 | 0.30 | Acid concentration drop, staining | Concentration logs must not be blank |
| **Hanging & Curing** | 6 | 0.35 | Over-curing, under-curing, deformation | Oven temperature log must link |
| **Gauge Inspection** | 7 | 0.40 | Thin Spod, outer diameter variance | Wall thickness measurement $\ge$ 0.8mm |
| **Trimming** | 8 | 0.45 | Ragged edge, short length | Trimmed waste mass-balance check |
| **Visual Inspection** | 9 | 0.60 | Thin Spod, Struck Balloon, Bubble, Crack | Rejected Qty $\le$ Checked Qty; Scrap cost calculated |
| **Balloon Fix / Test** | 10 | 0.65 | Sleeve tear, misalignment, Struck Balloon | Sleeve thickness correlation check |
| **Valvefixing / Assembly** | 11 | 0.85 | Valve leak, alignment error, block | Hold Qty $\le$ Checked Qty; Rework loop logged |
| **Final QA & Pack** | 12 | 1.00 | Packaging tear, printing blur, label error | Accepted Qty = Packaged Qty; Audit hash generated |

---

## 4. Mathematical Baseline Definitions

To ensure data-consistency, all diagnostic calculations in the application must use these baseline equations:

### First Pass Yield (FPY)
$$FPY_{s,d} = \frac{\text{Checked}_{s,d} - \text{Hold}_{s,d} - \text{Rejected}_{s,d}}{\text{Checked}_{s,d}}$$

### Rolled Throughput Yield (RTY)
$$RTY_d = \prod_{s=1}^{12} FPY_{s,d}$$

### Progressive Cost of Poor Quality (COPQ)
$$\text{Daily COPQ}_d = \sum_{s=1}^{12} \left[ \text{Rejected}_{s,d} \times (C_{\text{finished}} \times W_s) + \text{Hold}_{s,d} \times C_{\text{rework}} \right]$$
*Where finished catheter cost ($C_{\text{finished}}$) = ₹20 and standard rework labor cost ($C_{\text{rework}}$) = ₹5.*

### Mass Balance Delta ($\Delta_{\text{MB}}$)
$$\Delta_{\text{MB}} = \text{Accepted}_{s,d} - \text{Checked}_{s+1,d} + \text{Carryover}_{s,d}$$
*A non-zero Mass Balance Delta ($\Delta_{\text{MB}} \neq 0$) flags a Data Integrity Warning.*
