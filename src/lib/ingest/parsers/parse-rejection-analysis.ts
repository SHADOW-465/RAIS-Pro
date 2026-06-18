// src/lib/ingest/parsers/parse-rejection-analysis.ts
import { parseWorkbookBuffer } from "@/lib/parser";
import { classifyRejectionSheets } from "@/lib/ingest/from-rejection-sheets";
import type { PrecededRecord } from "./types";

export function parseRejectionAnalysis(buf: Buffer | ArrayBuffer, file: string): PrecededRecord[] {
  const { rawSheets } = parseWorkbookBuffer(buf as Buffer, file);
  const { records } = classifyRejectionSheets(rawSheets, "init-seed-rej");
  return records.map((record) => ({ record, family: "rejection-analysis" as const }));
}
