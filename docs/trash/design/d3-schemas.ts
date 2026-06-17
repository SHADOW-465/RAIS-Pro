/**
 * D3 — Findings, Adjudication & Rulebook: Zod definitions (v1.0)
 *
 * Companion to D3-findings-rulebook.md. Design artifact; moves into src/
 * during B2/B3 per D4. Builds on the frozen D1 contract.
 *
 * Append-only discipline: Finding rows are immutable; lifecycle state is
 * DERIVED from adjudication/rulebook records referencing them.
 */
import { z } from "zod";
import { CellRef, Confidence, Period, Provenance } from "./d1-contract";

export const D3_SCHEMA_VERSION = "1.0.0";

/* ------------------------------------------------------------------ */
/* Findings                                                            */
/* ------------------------------------------------------------------ */

export const RuleId = z.enum([
  "V-001", "V-002", "V-003", "V-004", "V-005", "V-006", "V-007",
  "V-008", "V-009", "V-010", "V-011", "V-012", "V-013",
]);

export const Severity = z.enum(["critical", "warning", "info"]);

export const HypothesisKind = z.enum([
  "mistake",
  "intentional-practice",
  "unknown",
]);

export const Hypothesis = z.object({
  kind: HypothesisKind,
  text: z.string().min(1), // plain language, no engineer jargon
});

/** Evidence snapshot: cards render without re-opening the workbook. */
export const FindingEvidence = z.object({
  eventIds: z.array(z.string()).min(1),
  cells: z.array(CellRef).min(1),
  provenance: Provenance, // representative provenance (file/sheet/table)
  statedValue: z.union([z.number(), z.string()]).nullable(),
  computedValue: z.union([z.number(), z.string()]).nullable(),
  magnitude: z.number().nullable(), // |Δ|, for sorting the queue
});

export const Finding = z.object({
  findingId: z.string().min(1), // hash(ruleId, subtype, sorted eventIds)
  schemaVersion: z.string().min(1),
  ingestionId: z.string().min(1), // first ingestion that raised it
  ruleId: RuleId,
  subtype: z.string().nullable(), // e.g. V-009 "a".."e"
  severity: Severity,
  question: z.string().min(1),    // plain-language card headline
  detail: z.string(),             // card body
  evidence: FindingEvidence,
  hypotheses: z.array(Hypothesis).max(3),
  requiresGmAuthority: z.boolean(), // per D3 §5 escalation matrix (precomputed)
  occurredOn: Period,             // business period the finding is about
  recordedAt: z.string().datetime(),
});
export type Finding = z.infer<typeof Finding>;

/** Derived, never stored: computed from adjudications + rulebook matches. */
export const FindingState = z.enum([
  "open",
  "adjudicated",
  "rule-compiled",
  "dismissed",
]);

/* ------------------------------------------------------------------ */
/* Adjudication (refines D1 AnnotationEvent semantics)                  */
/* ------------------------------------------------------------------ */

export const Verdict = z.enum(["mistake", "intentional", "unsure"]);
export const AuthorRole = z.enum(["steward", "gm"]);

export const Adjudication = z.object({
  adjudicationId: z.string().min(1),
  findingId: z.string().min(1),
  verdict: Verdict,
  why: z.string(), // mandatory free text when verdict = "intentional" (enforced below)
  author: AuthorRole,
  /** steward recommendation on a GM-authority finding; non-settling */
  isRecommendation: z.boolean(),
  /** optional confirmed Correction event spawned by a "mistake" verdict */
  correctionEventId: z.string().nullable(),
  recordedAt: z.string().datetime(),
}).refine(
  (a) => a.verdict !== "intentional" || a.why.trim().length > 0,
  "verdict 'intentional' requires a why"
);
export type Adjudication = z.infer<typeof Adjudication>;

/* ------------------------------------------------------------------ */
/* Rulebook                                                            */
/* ------------------------------------------------------------------ */

export const RuleScope = z.object({
  clientId: z.string().min(1),
  fileFamily: z.string().nullable(),  // e.g. "SHOPFLOOR" — null = client-wide
  sheetPattern: z.string().nullable(),// regex over sheet names
  stageId: z.string().nullable(),
  defectCode: z.string().nullable(),
  periodFrom: z.string().nullable(),  // ISO date bounds, null = unbounded
  periodTo: z.string().nullable(),
});

export const RulePredicate = z.object({
  ruleId: RuleId,
  subtype: z.string().nullable(),
  scope: RuleScope,
  /** optional structural matcher, e.g. omitted column letter for V-006 */
  paramEquals: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .nullable(),
});

export const RuleAction = z.union([
  z.object({
    kind: z.literal("auto-adjudicate"),
    verdict: Verdict,
    note: z.string().min(1),
  }),
  z.object({
    kind: z.literal("suppress"), // benign noise, e.g. idle-day #DIV/0!
    note: z.string().min(1),
  }),
]);

export const RulebookRuleStatus = z.enum(["draft", "active", "retired"]);

export const RulebookRule = z.object({
  rulebookRuleId: z.string().min(1),
  version: z.number().int().positive(),
  status: RulebookRuleStatus, // drafts never act
  predicate: RulePredicate,
  action: RuleAction,
  rationale: z.string().min(1), // human-readable why, shown wherever it acts
  bornFromAdjudicationIds: z.array(z.string()).min(1),
  draftedBy: z.string().min(1),   // "llm:<model>" — the only LLM write-path
  activatedBy: AuthorRole.nullable(), // null while draft
  createdAt: z.string().datetime(),
  retiredAt: z.string().datetime().nullable(),
});
export type RulebookRule = z.infer<typeof RulebookRule>;

/** Record of a rule acting on a finding during a validation run. */
export const RuleApplication = z.object({
  rulebookRuleId: z.string().min(1),
  ruleVersion: z.number().int().positive(),
  findingId: z.string().min(1),
  ingestionId: z.string().min(1),
  appliedAt: z.string().datetime(),
});

/* ------------------------------------------------------------------ */
/* Lineage (consumed by B4 dashboard)                                   */
/* ------------------------------------------------------------------ */

export const LineageState = z.enum(["verified", "assumed", "unresolved"]);

export const MetricLineage = z.object({
  state: LineageState, // worst of contributors: unresolved > assumed > verified
  contributingEventIds: z.array(z.string()),
  openFindingIds: z.array(z.string()),
  appliedRuleIds: z.array(z.string()),
  confidenceFloor: Confidence.nullable(), // lowest contributor confidence
});

/* ------------------------------------------------------------------ */
/* LLM-facing draft shapes (cross-provider rules per D1 §7)             */
/* ------------------------------------------------------------------ */

export const CandidateHypothesis = z.object({
  kind: HypothesisKind,
  text: z.string().min(1),
});

export const CandidateRuleDraft = z.object({
  ruleId: z.string().min(1), // validated against RuleId by code after
  subtype: z.string().nullable(),
  fileFamily: z.string().nullable(),
  sheetPattern: z.string().nullable(),
  stageId: z.string().nullable(),
  defectCode: z.string().nullable(),
  actionKind: z.enum(["auto-adjudicate", "suppress"]),
  verdict: z.enum(["mistake", "intentional", "unsure"]).nullable(),
  note: z.string().min(1),
  rationale: z.string().min(1),
});
export type CandidateRuleDraft = z.infer<typeof CandidateRuleDraft>;
