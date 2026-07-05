// src/lib/ingest/capture-fields.ts
// Shared between the daily entry grid (data-entry/page.tsx) and the Monthly
// Entry grid — both render the same capture columns (Checked/Good/Rework/
// Rejected) against the same StageDayRecord fields, so the label/key mappings
// live in one place instead of two copies drifting apart.

/** Registry `stage.captures` id -> short column label shown in the grid header. */
export const CAPTURE_LABEL: Record<string, string> = { checked: "Checked", accepted: "Accept", hold: "Hold", rejected: "Reject" };

/** Registry `stage.captures` id -> the schema field name used for edits/lookup. */
export const CAPTURE_FIELD: Record<string, string> = { checked: "Checked Qty", accepted: "Good Qty", hold: "Rework Qty", rejected: "Rejected Qty" };

/** Registry `stage.captures` id -> StageDayRecord property name. */
export const CAPTURE_TO_RECORD_FIELD: Record<string, "checked" | "acceptedGood" | "rework" | "rejected"> = {
  checked: "checked", accepted: "acceptedGood", hold: "rework", rejected: "rejected",
};

/** Schema field name -> StageDayRecord property name (the reverse direction,
 *  used by updateCell to route an edit on a named column to the right field). */
export const CORE_FIELD_BY_COL: Record<string, "checked" | "acceptedGood" | "rework" | "rejected"> = {
  "Checked Qty": "checked", "Good Qty": "acceptedGood", "Rework Qty": "rework", "Rejected Qty": "rejected",
};
