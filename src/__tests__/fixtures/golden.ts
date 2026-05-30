// Ground truth computed once via scripts/ground-truth.ts and reconciled against
// each spreadsheet's own embedded Total row. Update ONLY when source files change.
//
// Reconciliation evidence (run `npx tsx scripts/ground-truth.ts`):
//   ASSEMBLY  APRIL 25  visual checked=247767 / rej=19271  → matches Total row
//   VISUAL    APRIL 25  REC=247767 ACC=215296 REJ=19271    → matches TOTAL row
//   BALLOON   APRIL 25  daily REJ sum=1910                 → matches summary block
//
// Per-FILE aggregates below are the sum across each file's MONTHLY sheets only
// (yearly / cumulative / FORMATE template sheets are excluded to avoid
// double-counting). rejectionRate = rejectedQty / checkedQty, unrounded.
//
// Files where a "checked qty" is not meaningful in rejection terms record only
// rejectedQty and set checkedQty / acceptedQty / rejectionRate to null:
//   - SHOPFLOOR: reason-count matrix (rejected = sum of the per-row Total column)
//   - COMMULATIVE / YEARLY PRODUCTION: production summaries (rejected = TOTAL REJ)

export interface GoldenEntry {
  reportType:
    | "assembly"
    | "visual"
    | "balloon_valve"
    | "shopfloor"
    | "cumulative"
    | "yearly_production";
  checkedQty: number | null;
  acceptedQty: number | null;
  rejectedQty: number | null;
  /** rejectedQty / checkedQty, unrounded; null when checkedQty is not meaningful. */
  rejectionRate: number | null;
}

export const GOLDEN: Record<string, GoldenEntry> = {
  "ASSEMBLY REJECTION REPORT.xlsx": {
    reportType: "assembly",
    checkedQty: 4276394,
    acceptedQty: 3781769,
    rejectedQty: 274683,
    rejectionRate: 0.06423238831595031,
  },
  "BALLOON & VALVE INTEGRITY INSPECTION REPORT FILE 2025.xlsx": {
    reportType: "balloon_valve",
    checkedQty: 3760741,
    acceptedQty: 3732873,
    rejectedQty: 21892,
    rejectionRate: 0.005821193216975059,
  },
  "VISUAL INSPECTION REPORT 2025.xlsx": {
    reportType: "visual",
    checkedQty: 2732719,
    acceptedQty: 2477606,
    rejectedQty: 160812,
    rejectionRate: 0.05884688473275152,
  },
  "SHOPFLOOR REJECTION REPORT.xlsx": {
    reportType: "shopfloor",
    checkedQty: null,
    acceptedQty: null,
    rejectedQty: 41668,
    rejectionRate: null,
  },
  "COMMULATIVE 2025-26.xlsx": {
    reportType: "cumulative",
    checkedQty: null,
    acceptedQty: null,
    rejectedQty: 202599,
    rejectionRate: null,
  },
  "YEARLY PRODUCTION COMMULATIVE 2025-26.xlsx": {
    reportType: "yearly_production",
    checkedQty: null,
    acceptedQty: null,
    rejectedQty: 310569,
    rejectionRate: null,
  },
};
