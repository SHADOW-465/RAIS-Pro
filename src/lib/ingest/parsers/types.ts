import type { StageDayRecord } from "@/lib/ingest/emit";

/** Which kind of workbook a record came from — sets dedup precedence. */
export type SourceFamily =
  | "size-wise"
  | "assembly-daily"
  | "rejection-analysis"
  | "stage-report"
  | "cumulative";

/** Higher wins. cumulative is 0 (claims only; never a base count). */
export const PRECEDENCE: Record<SourceFamily, number> = {
  "size-wise": 40,
  "assembly-daily": 30,
  "rejection-analysis": 30,
  "stage-report": 20,
  "cumulative": 0,
};

export interface PrecededRecord {
  record: StageDayRecord;
  family: SourceFamily;
}
