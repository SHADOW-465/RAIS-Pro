import type { StageDayRecord } from "@/lib/ingest/emit";

/** Which kind of workbook a record came from — sets dedup precedence. */
export type SourceFamily =
  | "size-wise"
  | "assembly-daily"
  | "daily-activity"
  | "rejection-analysis"
  | "stage-report"
  | "cumulative";

/** Higher wins. cumulative is 0 (claims only; never a base count). */
export const PRECEDENCE: Record<SourceFamily, number> = {
  "size-wise": 40,
  "assembly-daily": 30,
  "rejection-analysis": 30,
  "daily-activity": 25,
  "stage-report": 20,
  "cumulative": 0,
};

export interface PrecededRecord {
  record: StageDayRecord;
  family: SourceFamily;
}

/** Decide the source family from a filename. Pure string logic (no xlsx) so it
 *  can be imported by the read-side canonicalizer without bundling the parsers. */
export function routeFamily(file: string): SourceFamily | null {
  const f = file.toLowerCase();
  // "DAILY ACTIVITY REPORT" is a process-stage production log with an evolving,
  // multi-stage column layout that parse-assembly-daily's FIXED columns do NOT
  // match — routing it there would silently misparse. It is also redundant for
  // counts (size-wise is authoritative for Visual/Balloon/Valve; rejection-
  // analysis covers Final). Skip it until a dedicated parser exists.
  if (/daily activity/.test(f)) return "daily-activity";
  if (/assembly/.test(f)) return "assembly-daily";
  if (/rejection analysis/.test(f)) return "rejection-analysis";
  if (/visual inspection report|balloon & valve integrity inspection/i.test(f)) return "stage-report";
  if (/c[ou]mm?ulative|yearly/i.test(f)) return "cumulative";
  if (/\b\d{1,2}\s+[a-z]+/i.test(f) || /weekly/i.test(f)) return "size-wise";
  return null;
}
