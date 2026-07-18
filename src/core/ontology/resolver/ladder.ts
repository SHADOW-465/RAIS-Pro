// src/core/ontology/resolver/ladder.ts
// The hybrid entity resolver (ADD §11). Rungs 1–4 are deterministic and pure
// (rung 2 reads the knowledge store); rung 5 (LLM) lives in ./llm.ts and is
// injected as an optional callback so this ladder is testable without AI.
//
// The ladder PROPOSES. It never applies. First rung with a hit wins; every
// other rung's hit becomes an alternative shown in the verification UI.
// Every profiled column and every sheet gets a proposal — nothing is omitted.

import type { ColumnProfile } from "@/core/profiler/types";
import type { MappingProposalT } from "@/shared/models/entities";
import type { OntologyConcept } from "@/core/ontology/global-ontology";
import type { KnowledgeStore } from "@/core/ontology/store/knowledge-store";
import { normalizeKey } from "@/core/ontology/store/knowledge-store";
import { collapseKey } from "@/core/ontology/normalize";

export interface ResolverSheet {
  fileName: string;
  sheetName: string;
  /** Table region within the sheet ("t1", "t2", …). Absent ⇒ "t1". */
  tableId?: string;
  /** Group-header text spanning this region (e.g. "VALVE INTEGRITY") — the
   *  strongest stage signal a multi-table sheet carries. */
  regionLabel?: string | null;
  columns: ColumnProfile[];
}

/** Verbatim mappings already verified in THIS company's MODs (rung 1).
 *  Keyed by normalizeKey(original header / sheet name). */
export type ExactIndex = Map<string, { canonical: string; kind: MappingProposalT["kind"] }>;

export interface ResolverContext {
  companyId: string;
  exact: ExactIndex;
  knowledge: KnowledgeStore;
  concepts: OntologyConcept[];
  /** Rung 5, injected. Receives the still-unresolved proposals; returns LLM
   *  refinements keyed by entityId. Absent → ladder stops at rung 4. */
  llm?: (unresolved: MappingProposalT[], sheets: ResolverSheet[]) => Promise<Map<string, { canonical: string; kind: MappingProposalT["kind"]; confidence: number; reason: string }>>;
}

type Hit = { canonical: string | null; kind: MappingProposalT["kind"]; confidence: number; resolvedBy: MappingProposalT["resolvedBy"]; reason: string };

const SIZE_SHEET_RE = /^(\d+)\s*FR\.?\s*$/i;

/**
 * When sheet tabs are calendar months ("APRIL 25") the stage lives in the
 * *file name*, not the tab. Without this, cold resolve leaves STAGE canonical
 * null → extractFromMod skips every region → 0 ledger events.
 */
const FILE_STAGE_RULES: { re: RegExp; stageId: string; label: string }[] = [
  { re: /visual\s*inspection|visual\s*insp/i, stageId: "visual", label: "Visual Inspection" },
  { re: /valve\s*integrity|balloon\s*&\s*valve|balloon\s+and\s+valve/i, stageId: "valve-integrity", label: "Valve Integrity" },
  { re: /balloon\s*(inspection|testing|test)/i, stageId: "balloon", label: "Balloon Testing" },
  { re: /final\s*inspection|final\s*insp/i, stageId: "final", label: "Final Inspection" },
  { re: /rejection\s*analysis/i, stageId: "final", label: "Final Inspection" },
  { re: /assembly\s*rejection/i, stageId: "visual", label: "Visual Inspection" },
];

/** Infer STAGE:* from workbook file name when sheet/region labels don't name a gate. */
export function stageFromFileName(fileName: string): { canonical: string; reason: string } | null {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  for (const rule of FILE_STAGE_RULES) {
    if (rule.re.test(base)) {
      return {
        canonical: `STAGE:${rule.stageId}`,
        reason: `file name matches ${rule.label} book pattern ("${base.slice(0, 48)}")`,
      };
    }
  }
  return null;
}

/** Concept id → entity kind for column-level global-ontology hits. */
const CONCEPT_KIND: Record<string, MappingProposalT["kind"]> = {
  CHECKED_QTY: "measure", ACCEPTED_QTY: "measure", REWORK_QTY: "measure",
  REJECTED_QTY: "measure", PRODUCED_QTY: "measure", STATED_PCT: "derived",
  DATE: "date", SIZE: "dimension", BATCH: "dimension", OPERATOR: "dimension",
  MACHINE: "dimension", SHIFT: "dimension",
};

const PCTISH_RE = /%|percent|\brate\b|\bfpy\b|\byield\b/i;

/** Which concepts a column of a given profiler role may match (guards against
 *  "REJ %" resolving to REJECTED_QTY instead of STATED_PCT). */
function conceptsForRole(role: ColumnProfile["role"], header: string, concepts: OntologyConcept[]): OntologyConcept[] {
  switch (role) {
    case "derived":
      // A percent/rate column is a stated CLAIM. But a row-derived QUANTITY
      // (e.g. "REJ. QTY" = SUM of the defect columns) is the stage's real
      // rejected count — the classic "formula-linked raw measurement gets
      // discarded" bug. Non-pct derived columns may resolve as measures.
      return PCTISH_RE.test(header)
        ? concepts.filter((c) => c.conceptId === "STATED_PCT")
        : concepts.filter((c) => c.kind === "measure" && c.conceptId !== "STATED_PCT");
    case "measure":        return concepts.filter((c) => c.kind === "measure" && c.conceptId !== "STATED_PCT");
    case "dimension-date": return concepts.filter((c) => c.conceptId === "DATE");
    case "dimension":      return concepts.filter((c) => c.kind === "dimension");
    default:               return []; // defect/meta names are company-specific — rules/knowledge territory
  }
}

/** Rung 3: rank a header against concept match terms. Longest matched term wins. */
function globalHit(header: string, role: ColumnProfile["role"], concepts: OntologyConcept[]): Hit | null {
  const h = header.toLowerCase();
  let best: { concept: OntologyConcept; len: number } | null = null;
  for (const concept of conceptsForRole(role, header, concepts)) {
    for (const term of concept.matchTerms) {
      const found = /\w/.test(term)
        ? new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(h)
        : h.includes(term); // "%" and friends have no word boundary
      if (found && (!best || term.length > best.len)) best = { concept, len: term.length };
    }
  }
  if (!best) return null;
  return {
    canonical: best.concept.conceptId,
    kind: CONCEPT_KIND[best.concept.conceptId] ?? "dimension",
    confidence: 0.8,
    resolvedBy: "ontology",
    reason: `matches global concept ${best.concept.conceptId} ("${best.concept.matchTerms.find((t) => header.toLowerCase().includes(t)) ?? best.concept.matchTerms[0]}")`,
  };
}

/** Rung 4: structural rules over the profiler's deterministic column profile. */
function ruleHit(col: ColumnProfile): Hit | null {
  if (col.role === "dimension-date") {
    return { canonical: "DATE", kind: "date", confidence: 0.75, resolvedBy: "rule", reason: "column typed as the table's date axis" };
  }
  if (col.role === "defect") {
    return { canonical: `DEFECT:${collapseKey(col.name)}`, kind: "defect", confidence: 0.65, resolvedBy: "rule", reason: "numeric short-code column — reads as a per-reason tally" };
  }
  if (col.role === "derived") {
    return { canonical: null, kind: "derived", confidence: 0.7, resolvedBy: "rule", reason: "row-wise formula / rate column — derived, not a raw measure" };
  }
  if (col.role === "meta") {
    return { canonical: null, kind: "meta", confidence: 0.6, resolvedBy: "rule", reason: "serial/remarks/doc-control column — no analytical signal" };
  }
  if (col.role === "measure") {
    return { canonical: null, kind: "measure", confidence: 0.5, resolvedBy: "rule", reason: "numeric measure column; meaning unresolved" };
  }
  if (col.role === "dimension") {
    return { canonical: null, kind: "dimension", confidence: 0.5, resolvedBy: "rule", reason: "low-cardinality label column; meaning unresolved" };
  }
  return null;
}

function toProposal(entityId: string, original: MappingProposalT["original"], hits: Hit[]): MappingProposalT {
  // First rung with a CANONICAL wins; kind-only hits fill in when nothing names
  // a canonical. Everything else surfaces as an alternative.
  const winner = hits.find((h) => h.canonical !== null) ?? hits[0] ?? {
    canonical: null, kind: "meta" as const, confidence: 0, resolvedBy: "rule" as const,
    reason: "no rung produced a hit — needs verification",
  };
  return {
    entityId,
    kind: winner.kind,
    original,
    canonical: winner.canonical,
    subcategory: null,
    confidence: winner.confidence,
    resolvedBy: winner.resolvedBy,
    reason: winner.reason,
    alternatives: hits
      .filter((h) => h !== winner && h.canonical !== null)
      .map((h) => ({ canonical: h.canonical as string, confidence: h.confidence, resolvedBy: h.resolvedBy })),
  };
}

/** Resolve every sheet + column of a workbook into mapping proposals. */
export async function resolveWorkbook(sheets: ResolverSheet[], ctx: ResolverContext): Promise<MappingProposalT[]> {
  const proposals: MappingProposalT[] = [];

  for (const sheet of sheets) {
    const tableId = sheet.tableId ?? "t1";
    const idSuffix = tableId === "t1" ? "" : `#${tableId}`; // t1 keeps the pre-region id shape
    // The region label ("VALVE INTEGRITY") is the region's own name — the
    // verbatim label learned/matched for stages; falls back to the sheet name.
    const stageLabel = sheet.regionLabel?.trim() || sheet.sheetName;

    // ---- Region-level entities: what does this SHEET/REGION represent? ----
    const sizeMatch = sheet.sheetName.trim().match(SIZE_SHEET_RE);
    if (sizeMatch && tableId === "t1") {
      // A per-size tab ("16FR"): the sheet IS a size slice; its stage comes
      // from the file name (same precedence recognize.ts proved out).
      proposals.push(toProposal(`sheet:${sheet.sheetName}`,
        { sheet: sheet.sheetName, tableId, colLetter: null, header: sheet.sheetName },
        [{ canonical: `SIZE:Fr${sizeMatch[1]}`, kind: "size", confidence: 0.9, resolvedBy: "rule", reason: "sheet named as a French size tab" }],
      ));
    }

    const stageHits: Hit[] = [];
    const exactStage = ctx.exact.get(`stage|${normalizeKey(stageLabel)}`)
      ?? ctx.exact.get(`stage|${normalizeKey(sheet.sheetName)}`)
      ?? ctx.exact.get(`stage|${normalizeKey(sheet.fileName)}`);
    if (exactStage) {
      stageHits.push({ canonical: exactStage.canonical, kind: "stage", confidence: 1, resolvedBy: "exact", reason: "verbatim match against a previously verified MOD" });
    }
    const aliasHit = (await ctx.knowledge.lookup(ctx.companyId, "stage-alias", stageLabel))
      ?? (await ctx.knowledge.lookup(ctx.companyId, "stage-alias", sheet.sheetName))
      ?? (await ctx.knowledge.lookup(ctx.companyId, "stage-alias", sheet.fileName));
    if (aliasHit) {
      stageHits.push({ canonical: aliasHit.canonicalId, kind: "stage", confidence: aliasHit.confidence, resolvedBy: "knowledge", reason: `learned company alias (from MOD ${aliasHit.learnedFrom ?? "unknown"})` });
    }
    // Month-tab books (APRIL 25, …): stage is in the file name, not the tab.
    if (stageHits.length === 0 || stageHits.every((h) => h.canonical == null)) {
      const fromFile = stageFromFileName(sheet.fileName);
      if (fromFile) {
        stageHits.unshift({
          canonical: fromFile.canonical,
          kind: "stage",
          confidence: 0.85,
          resolvedBy: "rule",
          reason: fromFile.reason,
        });
      }
    }
    if (stageHits.length === 0) {
      stageHits.push({ canonical: null, kind: "stage", confidence: 0.3, resolvedBy: "rule", reason: "region carries data but its stage is unknown — name it once and the company learns it" });
    }
    // EVERY region gets a stage proposal (possibly unresolved) — nothing is
    // omitted; a size tab's stage usually resolves via the file-name alias.
    proposals.push(toProposal(`stage:${sheet.sheetName}${idSuffix}`,
      { sheet: sheet.sheetName, tableId, colLetter: null, header: stageLabel }, stageHits));

    // ---- Column entities ----
    for (const col of sheet.columns) {
      const hits: Hit[] = [];
      const exactCol = ctx.exact.get(`col|${normalizeKey(col.name)}`);
      if (exactCol) {
        hits.push({ canonical: exactCol.canonical, kind: exactCol.kind, confidence: 1, resolvedBy: "exact", reason: "verbatim match against a previously verified MOD" });
      }
      const known = await ctx.knowledge.lookup(ctx.companyId, "column-mapping", col.name);
      if (known) {
        hits.push({ canonical: known.canonicalId, kind: (CONCEPT_KIND[known.canonicalId] ?? (known.canonicalId.startsWith("DEFECT:") ? "defect" : "dimension")), confidence: known.confidence, resolvedBy: "knowledge", reason: `learned company mapping (from MOD ${known.learnedFrom ?? "unknown"})` });
      }
      const g = globalHit(col.name, col.role, ctx.concepts);
      if (g) hits.push(g);
      const r = ruleHit(col);
      if (r) hits.push(r);

      proposals.push(toProposal(`col:${sheet.sheetName}${idSuffix}:${col.colLetter}`,
        { sheet: sheet.sheetName, tableId, colLetter: col.colLetter, header: col.name }, hits));
    }
  }

  // ---- Rung 5: LLM refinement of whatever is still unresolved ----
  if (ctx.llm) {
    const unresolved = proposals.filter((p) => p.canonical === null);
    if (unresolved.length > 0) {
      try {
        const refined = await ctx.llm(unresolved, sheets);
        for (const p of proposals) {
          const hit = refined.get(p.entityId);
          if (!hit) continue;
          p.alternatives = [{ canonical: hit.canonical, confidence: hit.confidence, resolvedBy: "llm" }, ...p.alternatives];
          p.canonical = hit.canonical;
          p.kind = hit.kind;
          p.confidence = hit.confidence;
          p.resolvedBy = "llm";
          p.reason = hit.reason;
        }
      } catch {
        // LLM unavailability never blocks the pipeline — unresolved proposals
        // simply reach the user unresolved (rung 6 is the authority anyway).
      }
    }
  }

  return proposals;
}
