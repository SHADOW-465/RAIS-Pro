// src/lib/ingest/parsers/index.ts
import type { PrecededRecord } from "./types";
import { routeFamily } from "./types";
import { parseAssemblyDaily } from "./parse-assembly-daily";
import { parseRejectionAnalysis } from "./parse-rejection-analysis";
import { parseSizeWise } from "./parse-size-wise";

export { dedupeByPrecedence } from "./dedupe";
export { reconcileConflicts } from "./reconcile";
export { parseAssemblyDaily } from "./parse-assembly-daily";
export { parseRejectionAnalysis } from "./parse-rejection-analysis";
export { parseSizeWise } from "./parse-size-wise";
export * from "./types";

/**
 * Parse one workbook buffer into precedence-tagged records, routing by filename
 * family. Pure (no fs) so it runs in the browser (the /staging upload) AND on
 * the server (seedFromDisk) — both MUST classify identically. `fileName` is the
 * routing key; `buf` is the raw workbook bytes.
 */
export function recordsFromBuffer(buf: Buffer | ArrayBuffer, fileName: string): PrecededRecord[] {
  const name = fileName.split(/[\\/]/).pop()!;
  const family = routeFamily(name);
  if (!family) return [];
  // rejection-analysis / assembly embed the file name in per-cell provenance
  // refs (which are length-capped), so they get the short BASENAME. parse-size-
  // wise instead needs the FULL path — it distinguishes Valve vs Visual
  // workbooks from the folder segment ("…/VALVE INTEGRITY/…" vs "…/VISUAL/…"),
  // which identically-named monthly files ("1 APRIL 26.xlsx") lack — and it
  // builds cells from the sheet name, so the long path never reaches provenance.
  if (family === "assembly-daily") {
    return parseAssemblyDaily(buf, name).records.map((record) => ({ record, family }));
  }
  if (family === "rejection-analysis") {
    return parseRejectionAnalysis(buf, name);
  }
  if (family === "size-wise" || family === "stage-report") {
    return parseSizeWise(buf, fileName).map((record) => ({ record, family }));
  }
  return [];
}
