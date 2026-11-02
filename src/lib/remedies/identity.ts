// Canonical defect-code identity for the plant remedy book.
// Shared by the API store and the client so a Pareto label, an alias, and a
// catalog code all address the same row.

import { DEFECTS, canonicalDefectCode } from "@/core/ontology/plant-catalog";

export function resolveRemedyKey(codeOrLabel: string): string {
  const raw = codeOrLabel.trim();
  if (!raw) return "";
  const aliased = canonicalDefectCode(raw);
  if (aliased) return aliased;
  const upper = raw.toUpperCase();
  const byCode = DEFECTS.find((d) => d.defectCode.toUpperCase() === upper);
  if (byCode) return byCode.defectCode;
  const byLabel = DEFECTS.find((d) => d.label.toLowerCase() === raw.toLowerCase());
  if (byLabel) return byLabel.defectCode;
  return upper;
}

export function catalogLabelFor(code: string): string {
  const key = resolveRemedyKey(code);
  return DEFECTS.find((d) => d.defectCode === key)?.label ?? key;
}

export function isRemedyComplete(r: { description?: string; remedy?: string } | null | undefined): boolean {
  return Boolean(r && r.description?.trim() && r.remedy?.trim());
}

/** Keep only complete rows whose code resolves to a stable key. */
export function validatedDefects<T extends { code: string; description: string; remedy: string }>(
  incoming: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [code, row] of Object.entries(incoming ?? {})) {
    if (!row || typeof row !== "object") continue;
    if (!isRemedyComplete(row)) continue;
    const key = resolveRemedyKey(row.code || code);
    if (!key) continue;
    out[key] = { ...row, code: key };
  }
  return out;
}
