# Implementation Plan: Pareto Engine Integration & UI Layout Refactoring

This plan details the implementation of a dedicated **Pareto Engine** to automate Lean Six Sigma 80/20 diagnostics, alongside the UI layout refactor (scroll isolation, column compression, and trace beam clipping) to ensure a flawless presentation tomorrow afternoon.

## Tomorrow's Presentation Scope
We will pitch RAIS Pro as **MO!D Phase 1: Forensic Ingestion & Verification Studio**, while using the 8-system architecture from the master PRD as the "Product Vision & Integration Roadmap" (Phases 2-5). This proves you have a working product today *and* a massive enterprise moat designed for tomorrow.

---

## 1. The Pareto Engine Architecture (Math & Types)

The Pareto Engine will process the sorted reason data to distinguish the **Vital Few** (causes creating ~80% of quality losses) from the **Useful Many**.

### A. Data Contract & Math
We will define the data structures in a new type definition file or inline:

```typescript
export interface ParetoItem {
  rank: number;
  label: string;
  value: number;       // Defect Count
  contribution: number;  // (Count / Total) * 100
  cumulative: number;   // Running sum of Contribution %
  isVitalFew: boolean;  // cumulative <= 80% (plus first item that crosses 80%)
}

export interface ParetoAnalysis {
  items: ParetoItem[];
  totalDefects: number;
  vitalFewCount: number;
  vitalFewContribution: number; // Combined % of the vital few
  criticalAreaText: string;     // Automated Lean diagnostic brief
}
```

### B. Analytical Algorithm
We will write a helper `calculatePareto(data: SeriesPoint[]): ParetoAnalysis`:
1.  Sum the values of all elements in `data` to get `totalDefects`.
2.  Iterate through the sorted elements. For each element $i$:
    *   $\text{contribution}_i = (\text{value}_i / \text{totalDefects}) \times 100$
    *   $\text{cumulative}_i = \sum_{k=0}^{i} \text{contribution}_k$
    *   $\text{rank}_i = i + 1$
    *   Mark $\text{isVitalFew}_i = \text{true}$ if the *previous* element's cumulative percentage was $< 80\%$. (This guarantees we capture the subset that makes up at least 80% of the defects).
3.  Compute summary statistics and format the `criticalAreaText` dynamically, e.g., *"The top 2 defect categories (Leakage, Struck Balloon) account for 81.4% of total quality rejects."*

---

## 2. Front-End Components & UI Layout Changes

### A. New Component: `ParetoChart.tsx`
Create a custom, high-fidelity SVG chart component in `src/components/ParetoChart.tsx`:
*   **Dual Axis Rendering:**
    *   **Left Y-Axis (Defect Count):** Scale from 0 to $\text{max(value)} \times 1.15$. Render vertical bars for each defect.
    *   **Right Y-Axis (Cumulative %):** Scale rigidly from 0% to 100%. Render a smooth Bezier line connecting the cumulative points.
*   **Aesthetic Styling:**
    *   Bars in the **Vital Few** group will be filled with an active alert color (`var(--critical)` or `var(--accent)`) to flag them as critical improvement areas.
    *   Bars in the **Useful Many** group will be filled with a neutral color (`var(--border-strong)`).
    *   A horizontal dashed line drawn at the 80% mark on the right axis, colored `var(--warning)` and labeled *"80% Pareto Cut-off"*.
*   **Interactive Tooltips:** Show rank, count, individual contribution, and cumulative percentage on hover.

### B. Dashboard Integration & Scroll Isolation
Modify `src/components/Dashboard.tsx`:
*   **Scroll Lock:** Add `height: 100vh; overflow: hidden;` to the outer dashboard viewport wrapper.
*   **Independent Scroll Containers:** Set `#main-scroll` (left panel) and `#verify-scroll` (right panel) to scroll independently:
    ```tsx
    style={{
      flex: 1,
      height: "calc(100vh - 64px)", // 64px = masthead height
      overflowY: "auto",
      overflowX: "hidden",
    }}
    ```
*   **Observations Layout:** In Verify Mode, condense the layout to a single column (`grid-cols-1`) so that the Pareto chart and data items stack vertically without squishing.
*   **Trace Beam Clipping:** Refactor `computeBeams()` to ensure that the trace beam is instantly cleared if the active KPI card scrolls off the viewport bounds of `#main-scroll`.

---

## 3. Pareto Diagnostics UI Box

Place a dedicated **Lean Six Sigma Diagnostics Card** at the top of the Observations section when Pareto analysis is active:

```text
┌────────────────────────────────────────────────────────────────────────┐
│  ⚡ LEAN DIAGNOSTICS: PARETO ANALYSIS (80/20 RULE)                     │
├────────────────────────────────────────────────────────────────────────┤
│  Critical Improvement Area Flagged:                                    │
│  The top 2 defect categories (Leakage, Struck Balloon) account for     │
│  81.4% of total quality rejects.                                       │
│                                                                        │
│  Action Plan: Prioritizing corrective engineering on these two stages  │
│  will resolve the vast majority of your shopfloor quality losses.      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Verification Plan

### Manual Verification Steps
1.  **Ingest Sample Data:** Upload the inspection spreadsheets.
2.  **Verify Calculations:** Confirm that:
    *   The cumulative percentage strictly reaches 100% on the final column.
    *   The ranking corresponds to descending order of raw totals.
    *   The "Vital Few" are correctly colored and segregated.
3.  **Validate Independent Scrolls:** Scroll the left column down to the Pareto chart. Scroll the right column table horizontally. Confirm the SVG Bezier trace beams update their positions smoothly and clip immediately if the target column scrolls off-screen.
