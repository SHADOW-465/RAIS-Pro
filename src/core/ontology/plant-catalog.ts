// The authored plant catalog — the source of truth for what this factory is.
//
// This replaces schema INFERENCE (profiler → resolver ladder → MOD → merge) with
// schema AUTHORSHIP. The plant's process is written down in its SOPs and has not
// changed across 14 months / 1,436 sheets of records; what changes is Excel
// LAYOUT, which is noise. Inferring an ontology from the artifact is unbounded
// work; reading a known ontology out of a sheet is ~150 lines.
//
// Sources (see docs/ANALYTICAL-DATA-AUDIT.md):
//   stages      DAILY ACTIVITY REPORT column groups + WI-PRD-25 / WI-QC-15 /
//               WI-PRD-30 / WI-QC-25
//   visual 21   F/QC/01:00 + F/ASSEM/02:00 header rows and their legend
//   balloon 4   F/QC/01:00 "BALLOON ISPECTION REPORT - P17" block
//   valve 5     F/QC/01:00 "VALVE INTEGRITY" block
//   dipping 8   SHOPFLOOR REJECTION REPORT
//   targets     per-defect target rows (they DIFFER per stage — see below)
//
// Editing this file is how the plant's schema changes. It is data, not logic:
// a new field is an edit here, not a release. That is the whole point.

import type { z } from "zod";
import type { StageDef, DefectDef, SizeDef } from "@/lib/contract/d1";
import type { CompanyCatalog } from "@/core/ontology/store/catalog-store";

type Stage = z.infer<typeof StageDef>;
type Defect = z.infer<typeof DefectDef>;
type Size = z.infer<typeof SizeDef>;

/** Per-defect rejection targets, %, keyed by stage. Absent = NO target set,
 *  which is NOT the same as a target of 0 — the Excel used 0 for both and that
 *  is why its RESULTS column prints "OK" for defects with real counts. */
export type DefectTarget = { stageId: string; pct: number };

// ─────────────────────────────────────────────────────────────────────────────
// Stages — process order. `upstream` declares the cascade so it is never guessed.
// `captures` says which quantity columns the stage actually records: the
// conveyance steps (leaching…trimming, valve fixing) log throughput only.
// ─────────────────────────────────────────────────────────────────────────────

const GATE = { sizeWise: true, isQualityGate: true } as const;
const FLOW = { sizeWise: false, isQualityGate: false } as const;

// HOLD is captured at VISUAL only. The plant re-inspects and dispositions held
// material at that station; downstream gates pass or reject. Historical sheets
// do carry HOLD columns at balloon/valve/final — the sheet reader still reads
// them, so nothing is lost; this governs the Data Entry form only.
const HELD = ["checked", "accepted", "hold", "rejected"] as const;
const PASS = ["checked", "accepted", "rejected"] as const;

export const STAGES: Stage[] = [
  { stageId: "production", label: "Dipping", effectiveFrom: null, effectiveTo: null,
    upstream: [], captures: [...PASS], ...FLOW, sizeWise: true, category: "primary" },
  { stageId: "eye-punching", label: "Eye Punching", effectiveFrom: null, effectiveTo: null,
    upstream: ["production"], captures: [...PASS], ...FLOW, category: "secondary" },
  { stageId: "leaching", label: "Leaching", effectiveFrom: null, effectiveTo: null,
    upstream: ["eye-punching"], captures: ["checked"], ...FLOW, category: "primary" },
  { stageId: "chlorination", label: "Chlorination", effectiveFrom: null, effectiveTo: null,
    upstream: ["leaching"], captures: ["checked"], ...FLOW, category: "primary" },
  { stageId: "hanging", label: "Hanging", effectiveFrom: null, effectiveTo: null,
    upstream: ["chlorination"], captures: ["checked"], ...FLOW, category: "secondary" },
  { stageId: "gauge", label: "Gauge", effectiveFrom: null, effectiveTo: null,
    upstream: ["hanging"], captures: ["checked"], ...FLOW, category: "primary" },
  { stageId: "trimming", label: "Trimming", effectiveFrom: null, effectiveTo: null,
    upstream: ["gauge"], captures: ["checked"], ...FLOW, category: "primary" },
  // Feeds the balloon, not the catheter line — parallel, not downstream.
  { stageId: "balloon-production", label: "Balloon Production", effectiveFrom: null, effectiveTo: null,
    upstream: [], captures: [...PASS], ...FLOW, category: "primary" },

  // P10–P14. Qty-only: the plant records no defect breakdown here.
  { stageId: "secondary", label: "Secondary Production", effectiveFrom: null, effectiveTo: null,
    upstream: ["trimming"], captures: [...PASS], ...FLOW, category: "secondary" },

  { stageId: "visual", label: "Visual Inspection (P17)", effectiveFrom: null, effectiveTo: null,
    upstream: ["secondary"], captures: [...HELD], ...GATE, category: "assembly" },
  { stageId: "balloon", label: "Balloon Inspection", effectiveFrom: null, effectiveTo: null,
    upstream: ["visual"], captures: [...PASS], ...GATE, category: "assembly" },
  { stageId: "valve-fixing", label: "Valve Fixing", effectiveFrom: null, effectiveTo: null,
    upstream: ["balloon"], captures: ["checked"], ...FLOW, category: "assembly" },
  { stageId: "valve-integrity", label: "Valve Integrity", effectiveFrom: null, effectiveTo: null,
    upstream: ["valve-fixing"], captures: [...PASS], ...GATE, category: "assembly" },
  { stageId: "final", label: "Final Inspection (P24)", effectiveFrom: null, effectiveTo: null,
    upstream: ["valve-integrity"], captures: [...PASS], ...GATE, category: "assembly" },
  // WI-QC-25-00. Real SOP stage; no workbook records it yet. Present so that when
  // they start recording it, it is a data entry, not a code change.
  { stageId: "primary-pack-inspection", label: "Primary Pack Inspection", effectiveFrom: null, effectiveTo: null,
    upstream: ["final"], captures: [...PASS], ...FLOW, category: "assembly" },
];

export type StageCategory = "primary" | "secondary" | "assembly";

/** stageId → shop-floor section, for the Sources filter. */
export const STAGE_CATEGORY: Record<string, StageCategory> = Object.fromEntries(
  STAGES.filter((s) => s.category).map((s) => [s.stageId, s.category as StageCategory]),
);

// ─────────────────────────────────────────────────────────────────────────────
// Process order — the ONE place analytics learns where a gate sits on the line.
//
// Every screen that has to answer "which gate does this section enter at?" must
// route through here. Two implementations of that question is what let View
// Source and the dashboard disagree; deriving it from ledger order instead is
// what made Overall Rejection read 3588%.
// ─────────────────────────────────────────────────────────────────────────────

/** Authored process order: stageId → index on the line. */
export const STAGE_ORDER: string[] = STAGES.map((s) => s.stageId);

/** Display name: the catalog label minus its SOP suffix ("Visual Inspection
 *  (P17)" → "Visual Inspection"). */
export const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  STAGES.map((s) => [s.stageId, s.label.replace(/\s*\(.*\)$/, "")]),
);

const STAGE_ID_BY_LABEL = new Map(
  Object.entries(STAGE_LABELS).map(([id, label]) => [label.toLowerCase(), id]),
);

/** Sequential line (excludes parallel Balloon Production). Primary →
 *  secondary → assembly, in authored process order. */
export const FLOW_CHAIN: string[] = STAGE_ORDER.filter((id) => id !== "balloon-production");

function compactStageToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** A stageId from either an id, a display label, or a catalog alias
 *  ("production-dipping" → production). Undefined when neither names an
 *  authored stage. */
export function resolveStageId(idOrLabel?: string | null): string | undefined {
  const raw = (idOrLabel || "").trim();
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (STAGE_ORDER.includes(s)) return s;
  const byLabel = STAGE_ID_BY_LABEL.get(s);
  if (byLabel) return byLabel;
  for (const id of STAGE_ORDER) {
    if (s.startsWith(`${id}-`) || s.startsWith(`${id} `)) return id;
  }
  const compact = compactStageToken(s);
  for (const [id, aliases] of Object.entries(STAGE_ALIASES)) {
    if (compactStageToken(id) === compact) return id;
    if (aliases.some((a) => compactStageToken(a) === compact)) return id;
  }
  return undefined;
}

/** Position on the line. Stages the catalog never authored sort last (99) — they
 *  become their own section anyway, so they never displace a real entry gate. */
export function stageSortKey(stageId?: string | null, stageLabel?: string | null): number {
  const resolved = resolveStageId(stageId) ?? resolveStageId(stageLabel);
  if (resolved) return STAGE_ORDER.indexOf(resolved);
  return 99;
}

/** Plant-schema order: production-dipping before Visual, not the other way. */
export function sortStageIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const ka = stageSortKey(a);
    const kb = stageSortKey(b);
    if (ka !== kb) return ka - kb;
    return a.localeCompare(b);
  });
}

/**
 * The gate a section's units ENTER at — the denominator for that section.
 *
 * Gates inside a section are sequential: each one only ever sees what the
 * previous gate passed, so the entry gate necessarily holds the LARGEST checked
 * count. That physical fact is the rule, because it is the one that cannot be
 * corrupted by ordering. Process order is the tiebreak, and it decides nothing
 * on its own.
 *
 * Picking purely by order is what broke: with no verified catalog every stage is
 * derived from the ledger, the order became event-arrival order, and Assembly's
 * entry landed on Primary Pack Inspection (2,550 checked) instead of Visual
 * (681,945) — every rejection in the section then divided by 2,550.
 *
 * When the two disagree the data is already inconsistent (a gate cannot inspect
 * more than the one feeding it), and the larger denominator is the safe read: it
 * can only understate a rate, never invent a 3588% one. Rework re-entering a
 * gate under `reworkCountsAs: "checked"` can legitimately nudge a downstream
 * gate past its entry — that shifts the denominator by a percent or two, which
 * is the intended trade for making the catastrophic case unreachable.
 *
 * Returns null when nothing in the section recorded units.
 */
export function pickEntryGate(checkedByStage: Iterable<readonly [string, number]>): string | null {
  let best: { stageId: string; checked: number; key: number } | null = null;
  for (const [stageId, checked] of checkedByStage) {
    if (!(checked > 0)) continue;
    const key = stageSortKey(stageId);
    if (
      !best ||
      checked > best.checked ||
      // Ties break on process order, then on id, so the answer never depends on
      // iteration order — the property the old "first one seen" rule lacked.
      (checked === best.checked && (key < best.key || (key === best.key && stageId < best.stageId)))
    ) {
      best = { stageId, checked, key };
    }
  }
  return best?.stageId ?? null;
}

export type CatalogSection = { id: string; label: string };

/**
 * Authored shop-floor sections. These are the seed, not a lock — Data Schema
 * can rename, add or delete sections (password-gated). Ids stay stable so
 * existing stage.category values and analytics defaults keep matching.
 */
export const STAGE_CATEGORIES: { id: StageCategory; label: string }[] = [
  { id: "primary", label: "Production Dipping" },
  { id: "secondary", label: "Secondary (P10–P14)" },
  { id: "assembly", label: "Assembly (P15–P27)" },
];

/** Analytics default. The plant's own reports mean assembly when they say
 *  "rejection %", so primary/secondary are opt-in rather than silently mixed in. */
export const DEFAULT_STAGE_CATEGORIES: StageCategory[] = ["assembly"];

/** Sheet/column header spellings observed in the workbooks, per stage. The
 *  misspellings are stable and diagnostic — they identify the form. */
export const STAGE_ALIASES: Record<string, string[]> = {
  production: [
    "PRODUCTION",
    "DIPPING",
    "DIPPING QTY",
    "PRODUCTION DIPPING",
    "PRODUCTION-DIPPING",
    "SHOP FLOOR",
    "UNIT-01 (DEPARTMENT-DIPPING)",
  ],
  "eye-punching": ["EYE PUNCHING", "EYE PUNCHING QTY", "EP"],
  leaching: ["LEACHING"],
  chlorination: ["CHLORINATION"],
  hanging: ["HANGING"],
  gauge: ["GUAGE", "GAUGE"],
  trimming: ["TRIMMNG", "TRIMMING"],
  visual: ["VISUAL", "VISUAL INSPECTION", "VISUAL INSEPTION", "VISUAL QTY", "DAILY VISUAL INSPECTION REPORT"],
  balloon: ["BALLOON INSPECTION", "BALOON INSPECTION", "BALOON INSEPTION", "BALLOON ISPECTION REPORT - P17", "BALLOON CHKD QTY"],
  "valve-fixing": ["VALVE FIXING"],
  "valve-integrity": ["VALVE INTEGRITY", "VALVE INT", "VALVE INTY", "VALVE INT CHKD QTY"],
  final: ["FINAL INSPECTION", "FINAL Inspe  REJECTION", "FINAL INSPECTION REJECTION", "FINAL CHECKED QTY"],
  "balloon-production": ["BALLLOON PRODUCTION", "BALLOON PRODUCTION"],
  "primary-pack-inspection": ["100% INSPECTION AFTER PRIMARY PACKING"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Defects — FOUR separate vocabularies. A code is scoped to the stages that
// report it; COAG exists at both dipping and visual and means different things
// to the operator, but the plant treats it as one code, so it is one entry with
// two stages and two different targets.
// ─────────────────────────────────────────────────────────────────────────────

/** [code, label, targetVisual, targetFinal] — the 21 assembly codes, in the
 *  sheet's own column order (COAG first). Targets from the per-stage target
 *  rows; `null` = no target set at that stage. */
const ASSEMBLY_21: [string, string, number | null, number | null][] = [
  ["COAG", "Coagulum", 0.5, 0.1],
  ["SD", "Surface Defect", 0.5, 0.1],
  ["TT", "Thin Tip", 0.1, null],
  ["BL", "Blister", 0.2, null],
  ["PS", "Ply Separation", 0.2, 0.1],
  ["SB", "Step Balloon", 0.1, null],
  ["PW", "Projected Wire", 0.1, null],
  ["FP", "Foreign Particle", 0.1, null],
  ["RW", "Raised Wire", 0.1, 0.2],
  ["BEP", "Bad Eye Punching", 0.4, 0.1],
  ["DEC", "Decolorisation", 0.4, null],
  ["BM", "Black Mark", 1.0, 0.1],
  ["WEB", "Webbing", 0.1, null],
  ["BT", "Bad Trimming", 0.1, 0.1],
  ["SF", "Short Funnel", 0.1, null],
  ["BIC", "Bend In Catheter", 0.1, null],
  ["WK", "Wrinkle", 0.2, 0.1],
  ["BMP", "Bump", 0.3, null],
  ["TF", "Torn Funnel", 0.1, null],
  ["PH", "Pin Hole", 0.1, null],
  ["BST", "Bad Stripping", 0.2, 0.1],
];

/** Codes the old resolver minted that mean the same thing as an authored code.
 *  Without these, merging a previously-inferred catalog leaves TWO columns for
 *  one defect (PINH and PH both "Pin Hole"). */
const LEGACY_CODE_ALIASES: Record<string, string[]> = {
  PH: ["PINH", "PIN HOLE", "PINHOLE"],
  BMP: ["BP", "BUMP"],
  OL: ["OG", "OVERLAPPING", "OVER LAPPING"],
};

/** Dipping shop floor — 8 codes, counted over trolleys, unrelated to the 21. */
const DIPPING_8: [string, string, string[]][] = [
  ["COAG", "Coagulum", ["COAG", "COAGULANT", "COAGULUM"]],
  ["RW", "Raised Wire", ["Raised Wire", "RW", "RW/PW"]],
  ["SD", "Surface Defect", ["Surface Defect", "SD"]],
  ["OL", "Overlapping", ["Overlaping", "Overlapping", "OL", "OG"]],
  ["BM", "Black Mark", ["Black Mark", "BM"]],
  ["WEB", "Webbing", ["Webbing", "WEB"]],
  ["MF", "Missing Formers", ["Missing Formers", "Missing formers", "MF"]],
  ["OTH", "Others", ["Others", "Other", "OTHERS"]],
];

const BALLOON_4: [string, string, string[]][] = [
  ["STBL", "Struck Balloon", ["STRUCK BALLOON", "STBL"]],
  ["BLBR", "Balloon Burst", ["BALLOOM BRUST", "BALLOON BRUST", "BALLOON BURST", "BLBR"]],
  ["LEAK", "Leakage", ["LEAKAGE", "LEAK"]],
  ["OTH", "Others", ["OTHERS", "Others"]],
];

const VALVE_5: [string, string, string[]][] = [
  ["LEAK", "Leakage", ["LEAKAGE", "LEAK"]],
  ["90/10", "90/10 Ratio Fail", ["90/10", "90-10"]],
  ["BUB", "Bubble", ["BUBBLE", "BUB"]],
  ["THSP", "Thin Spot", ["THIN SPOD", "THIN SPOT", "THSP"]],
  ["OTH", "Others", ["OTHERS", "Others"]],
];

export const DEFECT_TARGETS: Record<string, DefectTarget[]> = {};

/**
 * Column order PER STAGE, in the plant's own sheet order.
 *
 * A flat defect list cannot express this: COAG, SD, RW, BM, WEB, LEAK and OTH
 * each appear in more than one vocabulary, so whichever stage happens to create
 * the entry first would dictate the order everywhere else. Balloon's sheet reads
 * STRUCK BALLOON, BALLOOM BRUST, LEAKAGE, OTHERS — and must render that way.
 */
export const DEFECT_ORDER: Record<string, string[]> = {};

function buildDefects(): Defect[] {
  const byCode = new Map<string, Defect>();
  const add = (code: string, label: string, aliases: string[], stage: string) => {
    (DEFECT_ORDER[stage] ??= []).push(code);
    const hit = byCode.get(code);
    if (hit) {
      if (!hit.stages.includes(stage)) hit.stages.push(stage);
      for (const a of aliases) if (!hit.aliases.includes(a)) hit.aliases.push(a);
      return;
    }
    byCode.set(code, {
      defectCode: code,
      label,
      aliases: [...new Set([code, ...aliases, ...(LEGACY_CODE_ALIASES[code] ?? [])])],
      stages: [stage],
    });
  };

  for (const [code, label, tVisual, tFinal] of ASSEMBLY_21) {
    add(code, label, [code, label, label.toUpperCase()], "visual");
    add(code, label, [], "final");
    const t: DefectTarget[] = [];
    if (tVisual != null) t.push({ stageId: "visual", pct: tVisual });
    if (tFinal != null) t.push({ stageId: "final", pct: tFinal });
    if (t.length) DEFECT_TARGETS[code] = [...(DEFECT_TARGETS[code] ?? []), ...t];
  }
  for (const [code, label, aliases] of DIPPING_8) add(code, label, aliases, "production");
  for (const [code, label, aliases] of BALLOON_4) add(code, label, aliases, "balloon");
  for (const [code, label, aliases] of VALVE_5) add(code, label, aliases, "valve-integrity");
  return [...byCode.values()];
}

export const DEFECTS: Defect[] = buildDefects();

/** authored alias (upper-cased) → authored defect code. */
const ALIAS_TO_CODE = new Map<string, string>();
for (const d of DEFECTS) for (const a of d.aliases) ALIAS_TO_CODE.set(a.toUpperCase(), d.defectCode);

/** Resolve a spelling seen in the wild to its authored code, if we know it. */
export function canonicalDefectCode(raw: string): string | null {
  return ALIAS_TO_CODE.get(raw.trim().toUpperCase()) ?? null;
}

/** A label that is just a code restyled carries no human intent — the old
 *  resolver emitted "Ph" for PINH, "Bmp" for BMP. Don't let it beat a real name.
 *  Checked against both the stored code and the authored one it folds into. */
function isPlaceholderLabel(label: string, ...codes: string[]): boolean {
  const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return codes.some((c) => norm(label) === norm(c));
}

// ─────────────────────────────────────────────────────────────────────────────
// Product dimensions.
//
// `sizeId` stays the French size ("Fr16") because that is what every event in
// the ledger already carries (lib/entry/batch-id.ts toCanonicalSize). Balloon
// capacity and variant are SEPARATE dimensions — the production report's column
// header "16FR/30CC" is (Fr16, 30CC, two-way), and "12FR/15CC" appears under
// BOTH the standard and female blocks, so no single field identifies a SKU.
// ─────────────────────────────────────────────────────────────────────────────

export const SIZES: Size[] = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]
  .map((n) => ({ sizeId: `Fr${n}`, label: `${n} FR` }));

export const CAPACITIES = ["1.5CC", "3-5CC", "15CC", "30CC", "50CC"] as const;

export const VARIANTS = [
  { id: "two-way", label: "2 Way", aliases: ["2 way", "2WAY", "STANDARD"] },
  { id: "three-way", label: "3 Way", aliases: ["3way", "3 WAY", "3WAY"] },
  { id: "female", label: "Female", aliases: ["FEMALE"] },
] as const;

/** Fiscal year starts in April (every "2025-26" workbook runs Apr→Mar). */
export const FISCAL_YEAR_START_MONTH = 4;

/** The catalog as the rest of the app consumes it. */
export function plantCatalog(): CompanyCatalog {
  return {
    stages: STAGES,
    defects: DEFECTS,
    sizes: SIZES,
    sections: STAGE_CATEGORIES.map((s) => ({ ...s })),
    fiscalYearStartMonth: FISCAL_YEAR_START_MONTH,
    updatedAt: null,
    lastMergedFrom: null,
  };
}

/**
 * Merge the authored catalog into whatever is already stored.
 *
 * Split of authority — the reason this is a merge and not a replace:
 *   · LABELS belong to the plant. If someone renamed "Coagulum" to "Coagulant"
 *     on Data Schema, that rename survives.
 *   · STRUCTURE belongs to this file. `captures`, `upstream` and
 *     `isQualityGate` are re-asserted, because the stored values were inferred
 *     from workbook layout and that is exactly what was wrong with them (a
 *     5-stage catalog with no cascade).
 *   · Nothing is ever removed. A stage the plant added by hand stays.
 */
export function mergePlantCatalog(existing: CompanyCatalog): CompanyCatalog {
  const authored = plantCatalog();

  const stageById = new Map(existing.stages.map((s) => [s.stageId, s]));
  const stages = authored.stages.map((a) => {
    const cur = stageById.get(a.stageId);
    stageById.delete(a.stageId);
    return cur ? { ...a, label: cur.label } : a;
  });
  // Hand-added stages we don't know about keep their place at the end.
  stages.push(...stageById.values());

  // Index stored defects by the AUTHORED code they resolve to, so a legacy
  // spelling (PINH) folds into its authored twin (PH) instead of becoming a
  // second pin-hole column on the grid.
  const defectByCode = new Map<string, CompanyCatalog["defects"][number]>();
  for (const d of existing.defects) {
    defectByCode.set(canonicalDefectCode(d.defectCode) ?? d.defectCode, d);
  }
  const defects = authored.defects.map((a) => {
    const cur = defectByCode.get(a.defectCode);
    defectByCode.delete(a.defectCode);
    if (!cur) return a;
    return {
      ...a,
      // Keep the plant's label — unless it is just the code restyled ("Ph" for
      // PINH), which is the resolver's placeholder, not a human's choice.
      label: isPlaceholderLabel(cur.label, cur.defectCode, a.defectCode) ? a.label : cur.label,
      aliases: [...new Set([...a.aliases, ...cur.aliases, cur.defectCode])],
      // Union: a code the plant scoped to an extra stage keeps that scope.
      stages: [...new Set([...a.stages, ...cur.stages])],
    };
  });
  defects.push(...defectByCode.values());

  const sizeById = new Map(existing.sizes.map((s) => [s.sizeId, s]));
  const sizes = authored.sizes.map((a) => sizeById.get(a.sizeId) ?? a);
  for (const s of existing.sizes) if (!sizes.some((x) => x.sizeId === s.sizeId)) sizes.push(s);

  const sectionById = new Map(
    (existing.sections ?? []).map((s) => [s.id, s]),
  );
  const sections: CatalogSection[] = STAGE_CATEGORIES.map((a) => {
    const cur = sectionById.get(a.id);
    sectionById.delete(a.id);
    return cur ? { id: a.id, label: cur.label } : { id: a.id, label: a.label };
  });
  sections.push(...sectionById.values());

  return {
    stages,
    defects,
    sizes,
    sections,
    fiscalYearStartMonth: existing.fiscalYearStartMonth || FISCAL_YEAR_START_MONTH,
    updatedAt: new Date().toISOString(),
    lastMergedFrom: "plant-catalog",
  };
}
