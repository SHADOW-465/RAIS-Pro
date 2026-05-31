// Golden metric outputs under the ENTRY-STAGE FUNNEL definition (see
// src/lib/metrics.ts computeMetrics). Derived deterministically via
// `npx tsx scripts/derive-golden.ts` (parser → inferSheetGraph → computeMetrics)
// and reconciled against each spreadsheet's own embedded Total row.
// Update ONLY when source files or the metric definition change.
//
// Funnel semantics (LOCKED):
//   checkedQty  = Σ ENTRY-stage stage_checked across non-summary sheets.
//                 Entry stage = first stage in funnel order. Counting only the
//                 entry stage avoids tallying the same physical unit at every
//                 stage. Reason-only sheets (no stage_checked) contribute 0.
//   acceptedQty = Σ ENTRY-stage stage_accepted.
//   rejectedQty = Σ ALL stage_rejected across every stage (a reject at any stage
//                 is a real defect → additive). Reason-only sheets contribute
//                 Σ reason_count.
//   rejectionRate = rejectedQty / checkedQty (0 when checkedQty === 0).
//
// Reconciliation evidence (ASSEMBLY APRIL 25, single sheet):
//   VISUAL QTY sum = 247767                     → MATCHES sheet Total row
//   stage rejects: REJ QTY=19271, REJ QTY (2)=1910, VALVE INTY REJ Qty=6101
//                  → entry-funnel rejected = 19271+1910+6101 = 27282 for April
//   Visual-stage rate 5.58%, Valve 2.87%, Eye Punching 4.39% across the year
//   → overall ASSEMBLY rejectionRate 10.25% (sum of per-stage defects ÷ entry
//   checked) — a believable single-to-low-double-digit figure.
//
// Summary files (cumulative / yearly_production) are isSummary and EXCLUDED from
// aggregation → checkedQty/rejectedQty contribution 0. Their embedded TOTAL REJ
// column sum is recorded in `referenceTotalRej` for cross-checking only.
//
// VISUAL INSPECTION REPORT 2025.xlsx note: in the ACTUAL file every monthly sheet
// is a reason-matrix (COAG/SD/TT/…) with NO REC. QTY / ACCEPT QTY checked column,
// so checkedQty = 0 and rejectedQty = Σ reason_count. The values carry float
// noise inherited from the parser (REJ% bleed into reason columns), hence the
// non-integer rejectedQty. SHOPFLOOR is likewise reason-only (rejectedQty =
// Σ reason counts; "Total" column is derived_total and excluded).

export interface GoldenEntry {
  reportType:
    | "assembly"
    | "visual"
    | "balloon_valve"
    | "shopfloor"
    | "cumulative"
    | "yearly_production";
  /** isSummary files are excluded from aggregation → these are the contribution. */
  isSummary: boolean;
  checkedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  holdQty: number;
  /** rejectedQty / checkedQty, unrounded; 0 when checkedQty === 0. */
  rejectionRate: number;
  /** For summary files: Σ of the embedded TOTAL REJ column (reference only). */
  referenceTotalRej?: number;
}

export const GOLDEN: Record<string, GoldenEntry> = {
  "ASSEMBLY REJECTION REPORT.xlsx": {
    reportType: "assembly",
    isSummary: false,
    checkedQty: 4941846,
    acceptedQty: 4622165,
    rejectedQty: 506489,
    holdQty: 0,
    rejectionRate: 0.10248983881731645,
  },
  "BALLOON & VALVE INTEGRITY INSPECTION REPORT FILE 2025.xlsx": {
    reportType: "balloon_valve",
    isSummary: false,
    checkedQty: 4261221,
    acceptedQty: 4222826.3917007055,
    rejectedQty: 139663.0534047008,
    holdQty: 49707.445489345766,
    rejectionRate: 0.03277536025582827,
  },
  "VISUAL INSPECTION REPORT 2025.xlsx": {
    reportType: "visual",
    isSummary: false,
    checkedQty: 0,
    acceptedQty: 0,
    rejectedQty: 427191.61774889525,
    holdQty: 0,
    rejectionRate: 0,
  },
  "SHOPFLOOR REJECTION REPORT.xlsx": {
    reportType: "shopfloor",
    isSummary: false,
    checkedQty: 0,
    acceptedQty: 0,
    rejectedQty: 41694,
    holdQty: 0,
    rejectionRate: 0,
  },
  "COMMULATIVE 2025-26.xlsx": {
    reportType: "cumulative",
    isSummary: true,
    checkedQty: 0,
    acceptedQty: 0,
    rejectedQty: 0,
    holdQty: 0,
    rejectionRate: 0,
    referenceTotalRej: 202599,
  },
  "YEARLY PRODUCTION COMMULATIVE 2025-26.xlsx": {
    reportType: "yearly_production",
    isSummary: true,
    checkedQty: 0,
    acceptedQty: 0,
    rejectedQty: 0,
    holdQty: 0,
    rejectionRate: 0,
    referenceTotalRej: 310569,
  },
};
