// UI helpers for the batch conversion reason and GM undo. Pure, so tests can
// pin them. The category list is the backend's own (CONVERSION_REASON_CATEGORIES).

import { CONVERSION_REASON_CATEGORIES, normalizeReasonCategory, type BatchConversion } from "@/lib/lineage/types";

export const REASON_OPTIONS = CONVERSION_REASON_CATEGORIES.map((c) => ({ value: c.id, label: c.label }));

export function reasonLabel(id: string | null | undefined): string {
  return CONVERSION_REASON_CATEGORIES.find((c) => c.id === id)?.label ?? "";
}

/** Client check mirroring planConversion: a new conversion needs a category and a note. */
export function conversionReasonError(category: string, note: string): string | null {
  if (!normalizeReasonCategory(category)) return "Choose why the size changed.";
  if (!note.trim()) return "Add a note saying what happened.";
  return null;
}

/** Reason fields for POST /api/batch-conversions. */
export function conversionReasonBody(category: string, note: string): { reasonCategory: string; reasonNote: string } {
  return { reasonCategory: normalizeReasonCategory(category) ?? "", reasonNote: note.trim() };
}

/** Undo is GM-only on the server (/api/batch-conversions/undo). */
export function canUndoConversion(role: string | null | undefined, canWrite: boolean): boolean {
  return canWrite && role === "gm";
}

/** How a row's reason reads. Old rows may have only the legacy `reason` text. */
export function conversionReasonText(row: Pick<BatchConversion, "reason" | "reasonCategory" | "reasonNote">): string {
  const cat = reasonLabel(row.reasonCategory);
  const note = (row.reasonNote ?? "").trim();
  if (cat && note) return `${cat}: ${note}`;
  if (cat) return cat;
  return (row.reason ?? "").trim() || "No reason recorded (older conversion)";
}

export async function undoConversion(id: string, reason: string): Promise<{ ok: true; conversion: BatchConversion; warning?: string | null } | { ok: false; error: string }> {
  const why = reason.trim();
  if (!why) return { ok: false, error: "Say why this conversion is being undone." };
  const res = await fetch("/api/batch-conversions/undo", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, reason: why }),
  });
  const data = (await res.json().catch(() => ({}))) as { conversion?: BatchConversion; error?: string; warning?: string | null };
  if (!res.ok || !data.conversion) return { ok: false, error: data.error || `Undo failed (${res.status}).` };
  return { ok: true, conversion: data.conversion, warning: data.warning };
}
