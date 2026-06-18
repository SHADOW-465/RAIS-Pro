// src/lib/ingest/parsers/index.ts
import type { SourceFamily } from "./types";

export { dedupeByPrecedence } from "./dedupe";
export { reconcileConflicts } from "./reconcile";
export { parseAssemblyDaily } from "./parse-assembly-daily";
export { parseRejectionAnalysis } from "./parse-rejection-analysis";
export { parseSizeWise } from "./parse-size-wise";
export * from "./types";

/** Decide the source family from a filename. */
export function routeFamily(file: string): SourceFamily | null {
  const f = file.toLowerCase();
  if (/assembly/.test(f)) return "assembly-daily";
  if (/rejection analysis/.test(f)) return "rejection-analysis";
  if (/visual inspection report|balloon & valve integrity inspection/i.test(f)) return "stage-report";
  if (/c[ou]mm?ulative|yearly/i.test(f)) return "cumulative";
  if (/\b\d{1,2}\s+[a-z]+/i.test(f) || /weekly/i.test(f) || /daily activity/i.test(f)) return "size-wise";
  return null;
}
