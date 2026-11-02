// Offline seed for Data Entry + shop-floor helpers that are not schema
// (catheter cascade, roles, persisted ShiftBatchRecord).
//
// Live stations, defects, and quantity columns come from /api/entry-template
// via lib/entry/entry-schema.ts. This file is the total fallback when that
// projection is unavailable — same role plant-catalog.ts plays for analytics.
// Do not read MATRIX_STAGES as a per-field overlay on a live catalog.
//
// Source of truth for the seed lists: Disposafe_Data_Entry_System_Documentation.md

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
  "20Fr", "22Fr", "24Fr", "26Fr", "28Fr", "30Fr",
] as const;

/** FBC product variants on the shop floor (filter also offers "All Type"). */
export const PRODUCT_TYPES = ["2 way", "3 way", "Female"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Catheter category / type / size cascade — same rules as the shop-floor
// standalone matrix tool, applied here so Data Entry follows one source of
// truth instead of drifting from it.
// ─────────────────────────────────────────────────────────────────────────────

export const CATHETER_CATEGORIES = ["Male", "Female", "Peadiatric"] as const;
export type CatheterCategory = (typeof CATHETER_CATEGORIES)[number];
export const CATHETER_TYPES = ["2 way", "3 way"] as const;
export type CatheterType = (typeof CATHETER_TYPES)[number];

/** Only Male has a real choice of type — Type is hidden for Female/Peadiatric
 *  and the record is written as "2 way" in the background either way. */
export function typeIsSelectable(category: CatheterCategory): boolean {
  return category === "Male";
}

const MALE_2WAY_FR = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
const MALE_3WAY_FR = [16, 18, 20, 22, 24, 26, 28, 30]; // strictly starts at 16Fr
const FEMALE_FR = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
const PEADIATRIC_FR = [6, 8, 10];

/** Valid catheter sizes ("16Fr", …) for a category (+ type, for Male). */
export function sizesFor(category: CatheterCategory, type: CatheterType): readonly string[] {
  const fr =
    category === "Female" ? FEMALE_FR
    : category === "Peadiatric" ? PEADIATRIC_FR
    : type === "3 way" ? MALE_3WAY_FR
    : MALE_2WAY_FR;
  return fr.map((n) => `${n}Fr`);
}

/** category + type collapsed to the single legacy `productType` string this app
 *  already persists everywhere ("2 way" | "3 way" | "Female"). Peadiatric has no
 *  legacy slot, so it travels as its own value — downstream code that doesn't
 *  recognise it (filters, CSV) treats it as free text, same as any new type. */
export function productTypeFor(category: CatheterCategory, type: CatheterType): string {
  if (category === "Female") return "Female";
  if (category === "Peadiatric") return "Peadiatric";
  return type;
}

/**
 * How a recorded `productType` reads on a history / audit row.
 *
 * The stored string collapses the two controls the operator actually used:
 * "2 way" means Male + 2 way, and the word Male never appears. Showing it raw
 * is why the category looked like it had not been recorded at all — it had,
 * losslessly, but only half of it was ever printed.
 */
export function describeProductType(productType: string | null | undefined): string | null {
  const pt = (productType ?? "").trim();
  if (!pt) return null;
  const { category, type } = categoryAndTypeFrom(pt);
  return typeIsSelectable(category) ? `${category} · ${type}` : category;
}

/** Inverse of productTypeFor, for loading a saved/draft record back into the
 *  category+type controls. */
export function categoryAndTypeFrom(productType: string | undefined | null): { category: CatheterCategory; type: CatheterType } {
  if (productType === "Female") return { category: "Female", type: "2 way" };
  if (productType === "Peadiatric") return { category: "Peadiatric", type: "2 way" };
  if (productType === "3 way") return { category: "Male", type: "3 way" };
  return { category: "Male", type: "2 way" };
}

/**
 * Who is recording the entry, by role rather than by name.
 *
 * These are the roles the plant's own controlled forms sign off with
 * (F/ASSEM/02:00 carries "Assembly Supervisor / Production Manager / Verified
 * By"), so the ledger records a role that maps to a real signature authority
 * instead of a free-typed name that nobody can validate later.
 */
export const ENTRY_ROLES = [
  "Data Entry Operator",
  "Supervisor",
  "Production Manager",
  "GM",
] as const;
export type EntryRole = (typeof ENTRY_ROLES)[number];

/** Coerce a stored value (older rows carry a person's name) to a valid role.
 *  Anything unrecognised falls back to the default rather than leaving the
 *  dropdown showing a value that is no longer selectable. */
export function toEntryRole(value: string | null | undefined): EntryRole {
  return (ENTRY_ROLES as readonly string[]).includes(value ?? "")
    ? (value as EntryRole)
    : ENTRY_ROLES[0];
}

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
    // Single display title per card (no key + long-name duplication).
    defects: [
      { key: "COAG", name: "COAG" },
      { key: "Raised Wire", name: "Raised Wire" },
      { key: "Surface Defect", name: "Surface Defect" },
      { key: "Overlaping", name: "Overlapping" },
      { key: "Black Mark", name: "Black Mark" },
      { key: "Webbing", name: "Webbing" },
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
    // Labels and P-codes are the plant's own, per FBC_PROCESS in
    // app/process-flow/fbc-process-data.ts. The chip used to read "Valve
    // Fixing" while writing stageId "valve-integrity" — two different steps:
    // P19 Valve Fixing is a flow-through operation, P20 Valve Integrity is the
    // inspection gate that actually gets recorded here.
    //
    // The `id` values are retired local keys. New writes store `stageId`.
    // migrateToStageId() in entry-schema.ts still maps these for in-flight
    // drafts / shift rows / Ask MOID prefills.
    processes: [
      { id: "p15-visual", name: "Visual (P17)", stageId: "visual", interactive: true },
      { id: "p16-balloon", name: "Balloon Inspection (P18)", stageId: "balloon", interactive: true },
      { id: "p17-valve", name: "Valve Integrity (P20)", stageId: "valve-integrity", interactive: true },
      { id: "p18-final", name: "Final Inspection (P24)", stageId: "final", interactive: true },
    ],
    defects: {
      "p15-visual": VISUAL_DEFECTS,
      // Final shares the same 21 visual defects (docs).
      "p18-final": VISUAL_DEFECTS,
      "p16-balloon": [
        { key: "STRUCK BALLOON", name: "Struck Balloon" },
        { key: "BALLOOM BRUST", name: "Balloon Burst" },
        { key: "LEAKAGE", name: "Leakage" },
        { key: "OTHERS", name: "Others" },
      ],
      "p17-valve": [
        { key: "LEAKAGE", name: "Leakage" },
        { key: "90/10", name: "90/10 Ratio Fail" },
        { key: "BUBBLE", name: "Bubble" },
        { key: "THIN SPOD", name: "Thin Spod" },
        { key: "OTHERS", name: "Others" },
      ],
    },
  },
};

/**
 * What the operator sees on a Data Entry defect tile: the plant code.
 * Floor staff type and search COAG / PH / SD — never "Coagulum".
 */
export function defectEntryTitle(d: Pick<DefectDef, "key" | "name">): string {
  const key = (d.key || "").trim();
  return key || (d.name || "").trim();
}

/**
 * Single title for a defect card. Prefers short codes (COAG, SD) when the key
 * is a compact code; otherwise a clean human label without "(CODE)" duplication.
 */
export function defectDisplayLabel(d: DefectDef): string {
  const key = d.key.trim();
  const name = (d.name || key).trim();
  // Compact codes used as keys across the plant (COAG, SD, 90/10, …)
  if (/^[A-Z0-9][A-Z0-9 /\-]{0,14}$/.test(key) && key === key.toUpperCase() && key.length <= 16) {
    // Visual/assembly style: key is the card title
    if (key === name || name.toUpperCase().includes(key)) return key;
  }
  // Strip trailing parenthetical that restates the key: "Coagulation (COAG)" → "Coagulation"
  const stripped = name.replace(new RegExp(`\\s*\\(${escapeRegExp(key)}\\)\\s*$`, "i"), "").trim();
  return stripped || key;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

/**
 * The stageId immediately before `micro` in the Assembly chain
 * (Visual → Balloon → Valve → Final), or null for the first stage.
 * Used to prefill a stage's Checked qty from the previous stage's
 * Accepted qty for the same batch — units physically flow forward.
 */
export function previousAssemblyStageId(micro: string): string | null {
  const processes = MATRIX_STAGES.assembly.processes;
  let idx = processes.findIndex((p) => p.id === micro);
  if (idx < 0) idx = processes.findIndex((p) => p.stageId === micro);
  if (idx <= 0) return null;
  return processes[idx - 1].stageId;
}

export type ShiftBatchRecord = {
  id: string;
  date: string;
  operator: string;
  macro: string;
  /**
   * @deprecated Retired local process id (p15-visual, …). New writes store
   * the ledger `stageId` here too so old readers still have a value.
   * Prefer `stageId`. migrateToStageId() accepts either.
   */
  micro: string;
  stageId: string;
  stageName: string;
  processName: string;
  size: string;          // display "14Fr"
  sizeCanonical: string; // "Fr14"
  /** 2 way | 3 way | Female */
  productType: ProductType | string;
  batchId: string;
  /**
   * Quantity Produced (Primary) / Quantity (Secondary) / Checked (Assembly).
   * Maps to the production `checked` slot on StageDayRecord.
   */
  checked: number;
  /** Primary + Assembly only. Always 0 for Secondary. */
  accept: number;
  /** Assembly only. Always 0 for Primary and Secondary. */
  hold: number;
  /** Primary + Assembly only. Always 0 for Secondary. */
  reject: number;
  /** Primary Production only — trolley count. */
  trolleys?: number;
  /**
   * Production Dipping: one defect map per trolley. `defects` is the sum
   * across these rows (what the ledger and balance check use).
   */
  trolleyDefects?: Record<string, number>[];
  /** Secondary Production only — production/storage bin id. */
  bin?: string;
  defects: Record<string, number>;
  remarks: string;
  shift: string;
  savedAt: string;
  /** Set after successful POST /api/ingest */
  synced?: boolean;
  /**
   * Set when the operator explicitly confirmed this batch as a genuinely
   * separate lot despite matching another batch's checked/accepted/rejected
   * counts (see suspectedDuplicateBatch). Carries the OTHER batch's code so
   * every later view can mark both as "confirmed distinct" instead of the
   * operator (or an auditor) mistaking the coincidence for a data-entry error.
   */
  duplicateConfirmedOf?: string | null;
  /**
   * Which time this lot came through this station. 1 unless the operator
   * explicitly declared a repeat pass (re-inspection after rework, a run split
   * across days). Part of the entry's identity — see lib/entry/identity.ts.
   */
  pass?: number;
  /** Why a pass beyond the first exists. Required when `pass` > 1. */
  passReason?: string | null;
};

/** Common bin labels for Secondary Production (operators may also free-type). */
export const SECONDARY_BINS = [
  "Bin A",
  "Bin B",
  "Bin C",
  "Bin D",
  "Bin E",
  "Hold Area",
  "Staging",
] as const;

