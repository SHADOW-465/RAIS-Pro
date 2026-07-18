// Shop-floor Data Entry Matrix — stage hierarchy + defect schemas.
// Source of truth: Disposafe_Data_Entry_System_Documentation.md
// stageId values map into the Disposafe registry / event ledger.

export type MacroId = "primary" | "secondary" | "assembly";

export type DefectDef = { key: string; name: string };

export type ProcessDef = {
  id: string;
  name: string;
  /** Canonical STAGE id written on events (null for showcase-only badges). */
  stageId: string | null;
  interactive: boolean;
};

export type MacroStage = {
  id: MacroId;
  name: string;
  shortLabel: string;
  processes: ProcessDef[];
  /**
   * Defect list for department-level entry (primary), or map keyed by process id
   * (assembly). Secondary hides the defect card entirely.
   */
  defects: DefectDef[] | Record<string, DefectDef[]>;
  /** When true, defect card is hidden and defect-sum validation is skipped. */
  hideDefects: boolean;
};

export const FRENCH_SIZES = [
  "6Fr", "8Fr", "10Fr", "12Fr", "14Fr", "16Fr", "18Fr",
  "20Fr", "22Fr", "24Fr", "26Fr", "28Fr",
] as const;

export const DEFAULT_OPERATORS = [
  "MB Lakshun",
  "Operator 2",
  "Operator 3",
  "Operator 4",
] as const;

const VISUAL_DEFECTS: DefectDef[] = [
  { key: "COAG", name: "COAG" },
  { key: "SD", name: "SD" },
  { key: "TT", name: "TT" },
  { key: "BL", name: "BL" },
  { key: "PS", name: "PS" },
  { key: "SB", name: "SB" },
  { key: "PW", name: "PW" },
  { key: "FP", name: "FP" },
  { key: "RW", name: "RW" },
  { key: "BEP", name: "BEP" },
  { key: "DEC", name: "DEC" },
  { key: "BM", name: "BM" },
  { key: "WEB", name: "WEB" },
  { key: "BT", name: "BT" },
  { key: "SF", name: "SF" },
  { key: "BIC", name: "BIC" },
  { key: "WK", name: "WK" },
  { key: "BMP", name: "BMP" },
  { key: "TF", name: "TF" },
  { key: "PH", name: "PH" },
  { key: "BST", name: "BST" },
];

export const MATRIX_STAGES: Record<MacroId, MacroStage> = {
  primary: {
    id: "primary",
    name: "Primary Production (P1-P9)",
    shortLabel: "Primary Production (P1-P9)",
    hideDefects: false,
    processes: [
      { id: "p1-extrusion", name: "Tube Extrusion (P1)", stageId: null, interactive: false },
      { id: "p2-dipping", name: "Latex Dipping (P2)", stageId: null, interactive: false },
      { id: "p3-curing", name: "Curing (P3)", stageId: null, interactive: false },
      { id: "p4-sizing", name: "Sizing & Cutting (P4)", stageId: null, interactive: false },
      { id: "p5-tipforming", name: "Tip Forming (P5)", stageId: null, interactive: false },
      { id: "p6-eyepunching", name: "Eye Punching (P6)", stageId: null, interactive: false },
      { id: "p7-outerdipping", name: "Outer Dipping (P7)", stageId: null, interactive: false },
      { id: "p8-dipping-qa", name: "Inspection (P8)", stageId: null, interactive: false },
      { id: "p9-qc", name: "Primary QC (P9)", stageId: null, interactive: false },
    ],
    defects: [
      { key: "COAG", name: "Coagulation (COAG)" },
      { key: "Raised Wire", name: "Raised Wire" },
      { key: "Surface Defect", name: "Surface Defect" },
      { key: "Overlaping", name: "Overlaping Layer" },
      { key: "Black Mark", name: "Black Mark" },
      { key: "Webbing", name: "Latex Webbing" },
      { key: "Missing Formers", name: "Missing Formers" },
      { key: "Others", name: "Others" },
    ],
  },
  secondary: {
    id: "secondary",
    name: "Secondary Production (P10-P14)",
    shortLabel: "Secondary Production (P10-P14)",
    // Docs: defect card hidden — rejections are qty-only.
    hideDefects: true,
    processes: [
      { id: "p10-washing", name: "Tunnel Washing (P10)", stageId: null, interactive: false },
      { id: "p11-siliconization", name: "Siliconization (P11)", stageId: null, interactive: false },
      { id: "p12-preprep", name: "Assembly Prep (P12)", stageId: null, interactive: false },
      { id: "p13-intqc", name: "Intermediate QC (P13)", stageId: null, interactive: false },
      { id: "p14-serialization", name: "Serialization (P14)", stageId: null, interactive: false },
    ],
    defects: [],
  },
  assembly: {
    id: "assembly",
    name: "Assembly (P15-P27)",
    shortLabel: "Assembly (P15-P27)",
    hideDefects: false,
    processes: [
      { id: "p15-visual", name: "Visual (P17)", stageId: "visual", interactive: true },
      { id: "p16-balloon", name: "Balloon Inspection", stageId: "balloon", interactive: true },
      { id: "p17-valve", name: "Valve Fixing", stageId: "valve-integrity", interactive: true },
      { id: "p18-final", name: "Final Inspection", stageId: "final", interactive: true },
    ],
    defects: {
      "p15-visual": VISUAL_DEFECTS,
      // Final shares the same 21 visual defects (docs).
      "p18-final": VISUAL_DEFECTS,
      "p16-balloon": [
        { key: "STRUCK BALLOON", name: "Struck Balloon" },
        { key: "BALLOOM BRUST", name: "Balloon Burst (BALLOOM BRUST)" },
        { key: "LEAKAGE", name: "Leakage (LEAKAGE)" },
        { key: "OTHERS", name: "Others (OTHERS)" },
      ],
      "p17-valve": [
        { key: "LEAKAGE", name: "Valve Leakage (LEAKAGE)" },
        { key: "90/10", name: "90/10 Ratio Fail (90/10)" },
        { key: "BUBBLE", name: "Valve Bubble (BUBBLE)" },
        { key: "THIN SPOD", name: "Thin Spod (THIN SPOD)" },
        { key: "OTHERS", name: "Others (OTHERS)" },
      ],
    },
  },
};

/** Ledger stageId for the active macro/micro selection. */
export function resolveStageId(macro: MacroId, micro: string): string {
  if (macro === "primary") return "production";
  if (macro === "secondary") return "secondary";
  const proc = MATRIX_STAGES.assembly.processes.find((p) => p.id === micro);
  return proc?.stageId ?? "visual";
}

/** Active defect schema for the selection (empty when hidden). */
export function defectsFor(macro: MacroId, micro: string): DefectDef[] {
  const stage = MATRIX_STAGES[macro];
  if (stage.hideDefects) return [];
  if (Array.isArray(stage.defects)) return stage.defects;
  if (macro === "assembly") {
    // Final reuses visual list
    return stage.defects[micro] ?? stage.defects["p15-visual"] ?? [];
  }
  return [];
}

export function processLabel(macro: MacroId, micro: string): string {
  if (macro !== "assembly") return MATRIX_STAGES[macro].name;
  return MATRIX_STAGES.assembly.processes.find((p) => p.id === micro)?.name ?? micro;
}

export type ShiftBatchRecord = {
  id: string;
  date: string;
  operator: string;
  macro: MacroId;
  micro: string;
  stageId: string;
  stageName: string;
  processName: string;
  size: string;          // display "14Fr"
  sizeCanonical: string; // "Fr14"
  batchId: string;
  checked: number;
  accept: number;
  hold: number;
  reject: number;
  defects: Record<string, number>;
  remarks: string;
  shift: string;
  savedAt: string;
  /** Set after successful POST /api/ingest */
  synced?: boolean;
};

export const SHIFT_STORAGE_KEY = "disposafe_shift_batches";
