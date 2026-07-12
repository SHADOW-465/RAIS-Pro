// FBC (Foley Balloon Catheter) process flow — Disposafe Doc DS/ANX/02:00 (eff. 11/11/2024).
//
// The official 27-step shop-floor map (P1..P27). This is versioned config, not
// events. It grounds three things:
//   1. The process-flow view  — render the full line, highlighting steps that
//      have uploaded inspection data and flagging critical (*) operations.
//   2. AI / chat grounding     — bind shorthand sheet names (VISUAL, BALLOON …)
//      to their official P-codes so the model knows the real process order.
//   3. COPQ weighting          — critical (*) steps carry progressive cost risk.
//
// Source of truth: C:\Users\acer\Documents\MO!D\FBC FLOW CHART.pdf. When that PDF
// is uploaded, /api/ingest-flow refreshes this baseline (see parseFlowPdf).

export interface ProcessStep {
  /** "P1".."P27" */
  code: string;
  label: string;
  /** Asterisked in the flowchart — requires special control → weight COPQ. */
  critical: boolean;
  /** Bound rejection-inspection stageId when this step is one of the 4 stations. */
  stageId?: string;
}

/** The 27-step Foley Balloon Catheter process flow, in order. */
export const FBC_PROCESS: ProcessStep[] = [
  { code: "P1",  label: "Compounding Latex & Analysis",            critical: true },
  { code: "P2",  label: "Wire Former Dipping & Drying",            critical: true },
  { code: "P3",  label: "Main Former Dipping & Drying",            critical: true },
  { code: "P4",  label: "Wire Fixing",                             critical: false },
  { code: "P5",  label: "Build-up Dipping & Drying",               critical: true },
  { code: "P6",  label: "Balloon Dipping & Drying",                critical: true },
  { code: "P7",  label: "Balloon Fixing",                          critical: false },
  { code: "P8",  label: "Finish Dipping & Drying",                 critical: true },
  { code: "P9",  label: "Stripping",                               critical: false },
  { code: "P10", label: "Hot Water Dipping",                       critical: false },
  { code: "P11", label: "Eye Punching",                            critical: false, stageId: "eye-punching" },
  { code: "P12", label: "Leaching",                                critical: false },
  { code: "P13", label: "Surface Treatment",                       critical: true },
  { code: "P14", label: "Post Curing",                             critical: true },
  { code: "P15", label: "Gauge Inspection",                        critical: false },
  { code: "P16", label: "Trimming",                                critical: false },
  { code: "P17", label: "100% Visual Inspection",                  critical: false, stageId: "visual" },
  { code: "P18", label: "Balloon Inspection",                      critical: false, stageId: "balloon" },
  { code: "P19", label: "Valve Fixing",                            critical: false },
  { code: "P20", label: "100% Valve Integrity & Balloon Inspection", critical: false, stageId: "valve-integrity" },
  { code: "P21", label: "Balloon Deflation",                       critical: false },
  { code: "P22", label: "Sleeve Fixing & Balloon Shrinking",       critical: false },
  { code: "P23", label: "Printing",                                critical: false },
  { code: "P24", label: "Final Inspection",                        critical: false, stageId: "final" },
  { code: "P25", label: "Siliconization & Primary Pack",           critical: true },
  { code: "P26", label: "Primary Sealing",                         critical: false },
  { code: "P27", label: "Carton Box Packing & Dispatch",           critical: false },
];

/** stageId → official P-code (the inspection stations only). */
export const STAGE_TO_PCODE: Record<string, string> = Object.fromEntries(
  FBC_PROCESS.filter((s) => s.stageId).map((s) => [s.stageId as string, s.code]),
);

/** The process step that maps to a given rejection inspection stage, if any. */
export function stepForStage(stageId: string): ProcessStep | undefined {
  return FBC_PROCESS.find((s) => s.stageId === stageId);
}

/** Critical (*) process codes — used to weight COPQ on upstream failures. */
export const CRITICAL_PCODES: string[] = FBC_PROCESS.filter((s) => s.critical).map((s) => s.code);
