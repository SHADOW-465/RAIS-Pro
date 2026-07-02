import type { Dataset } from "./types";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

// Reuses the same sheet/file naming signal schema-extractor.ts's resolveStageId
// already relies on — sheet/file names are the strongest, already-proven signal
// for stage identity (stronger than column names alone, which vary by month).
const STAGE_PATTERNS: { re: RegExp; id: string }[] = [
  { re: /valve|integrit/i, id: "valve-integrity" },
  { re: /balloon/i, id: "balloon" },
  { re: /eye.?punch/i, id: "eye-punching" },
  { re: /final/i, id: "final" },
  { re: /visual/i, id: "visual" },
];

function knownStage(id: string): boolean {
  return DISPOSAFE_REGISTRY.stages.some((st) => st.stageId === id);
}

/** Recognize one physical sheet (fileName+sheetName) as a known Disposafe stage,
 *  or null. Two-pass like schema-extractor.ts's resolveStageId: the sheet name is
 *  tried against ALL patterns first, then the file name — a month-named sheet
 *  inside "VISUAL INSPECTION REPORT…" resolves via the file, but a stage-named
 *  sheet is never overridden by its file's name. */
export function recognizeSheetStage(fileName: string, sheetName: string): string | null {
  for (const p of STAGE_PATTERNS) {
    if (p.re.test(sheetName)) return knownStage(p.id) ? p.id : null;
  }
  for (const p of STAGE_PATTERNS) {
    if (p.re.test(fileName)) return knownStage(p.id) ? p.id : null;
  }
  return null;
}

/** Match a Dataset's sources (file/sheet names) against known Disposafe stage
 *  patterns, requiring the SAME stage to win across a majority of sources (not
 *  just one) and requiring the dataset to actually have a checked/rejected-shaped
 *  measure column — a defensive gate against a stray filename coincidence. */
export function recognizeStage(dataset: Dataset): string | null {
  const hasMeasure = dataset.columns.some((c) => c.role === "measure");
  if (!hasMeasure) return null;

  const votes: Record<string, number> = {};
  for (const s of dataset.sources) {
    const id = recognizeSheetStage(s.fileName, s.sheetName);
    if (id) votes[id] = (votes[id] ?? 0) + 1;
  }
  const entries = Object.entries(votes);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  const [topId, topCount] = entries[0];
  // Require the winner to cover a clear majority of sources, not a stray match.
  if (topCount < dataset.sources.length * 0.5) return null;
  return topId;
}
