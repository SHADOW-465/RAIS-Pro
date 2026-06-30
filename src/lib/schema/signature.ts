// src/lib/schema/signature.ts
import type { ColumnProfile, SchemaSignature } from "./types";

/** djb2 — a tiny, deterministic, isomorphic string hash (no Node crypto, so it
 *  runs identically in the browser and on the server). */
export function stableHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Fingerprint a table by the ordered (role, normalized-name) of its non-meta
 *  columns. Meta columns (remarks, serials) are excluded so cosmetic noise does
 *  not fragment a logical dataset; data values never enter the signature. */
export function computeSignature(columns: ColumnProfile[]): SchemaSignature {
  const sigCols = columns
    .filter((c) => c.role !== "meta")
    .map((c) => ({ role: c.role, name: normalizeName(c.name) }));
  const basis = sigCols.map((c) => `${c.role}:${c.name}`).join("|");
  return { hash: stableHash(basis), columns: sigCols };
}
