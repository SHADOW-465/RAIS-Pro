// Unified workbook classifier: run every shape-specific parser over the uploaded
// sheets and merge the results. Each parser only claims sheets it recognizes, so
// a mixed upload (REJECTION ANALYSIS station sheets + a VISUAL INSPECTION REPORT)
// is handled in one pass. A sheet is reported "skipped" only when no parser
// turned it into records.

import type { RawSheet } from "@/types/dashboard";
import { classifyRejectionSheets, type ClassifyResult } from "@/lib/ingest/from-rejection-sheets";
import { classifyVisualInspectionSheets } from "@/lib/ingest/from-visual-inspection";

export function classifyWorkbook(
  rawSheets: RawSheet[],
  ingestionId: string,
  fileHash = "local",
): ClassifyResult {
  const rej = classifyRejectionSheets(rawSheets, ingestionId, fileHash);
  const vis = classifyVisualInspectionSheets(rawSheets, ingestionId, fileHash);

  const handled = new Set([...rej.mappings, ...vis.mappings].map((m) => m.sheet));
  const seen = new Set<string>();
  const skipped = [...rej.skipped, ...vis.skipped].filter((s) => {
    if (handled.has(s.sheet) || seen.has(s.sheet)) return false;
    seen.add(s.sheet);
    return true;
  });

  return {
    records: [...rej.records, ...vis.records],
    mappings: [...rej.mappings, ...vis.mappings],
    skipped,
  };
}
