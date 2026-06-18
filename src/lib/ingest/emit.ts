// Emit canonical events from a normalized per-stage-per-day record (MOID-SPEC §5).
//
// This is the SHARED transform: both the Excel pipeline (after classify maps
// columns→roles and reads the cell values) AND direct entry (typed form) produce
// `StageDayRecord`s and call here. Deterministic — it never invents numbers; it
// only wraps already-read values in canonical events with provenance + ids.
//
//   checked   → ProductionEvent
//   rejected  → InspectionEvent(disposition=rejected)   (the stated stage total)
//   defects[] → RejectionEvent per defect               (resolved against registry)
//   statedPct → AggregateClaimEvent(percentage)         (a claim to verify, NOT an input)

import { z } from "zod";
import {
  ProductionEvent,
  InspectionEvent,
  RejectionEvent,
  AggregateClaimEvent,
  AnnotationEvent,
  Period,
} from "@/lib/contract/d1";
import { hashEvent } from "@/lib/contract/hash";
import { resolveDefect } from "@/lib/registry/disposafe";
import type { Event } from "@/lib/store/types";

type ConfidenceBasis = "exact" | "heuristic" | "llm" | "external-cached";

/** A single value read from one source cell (Excel) or typed in a form (direct entry). */
export interface SourcedValue {
  value: number;
  cell: string;        // A1 ref, or a synthetic ref for direct entry e.g. "ENTRY!checked"
  header: string;      // verbatim header / field label
}

export interface DefectValue {
  raw: string;         // verbatim defect label
  value: number;
  cell: string;
}

export interface StageDayRecord {
  occurredOn: z.infer<typeof Period>;
  stageId: string;
  size?: string | null;                // Added size field
  source: { file: string; fileHash: string; sheet: string; tableId: string };
  checked: SourcedValue | null;        // Input qty (denominator)
  acceptedGood: SourcedValue | null;   // Accepted — Good
  rework: SourcedValue | null;         // Accepted — Rework
  rejected: SourcedValue | null;
  defects: DefectValue[];
  statedPct: { value: number | string; cell: string; formula: string | null } | null;
  extractedBy: string;       // "heuristic" | "llm:<model>" | "direct-entry"
  ingestionId: string;
  comment?: string | null;
}

const SCHEMA_VERSION = "1.0.0";

function basisFor(extractedBy: string): ConfidenceBasis {
  if (extractedBy === "direct-entry") return "exact";
  if (extractedBy.startsWith("llm")) return "llm";
  return "heuristic";
}

function scoreFor(basis: ConfidenceBasis): number {
  return basis === "exact" ? 1 : basis === "heuristic" ? 0.9 : 0.85;
}

function envelope(rec: StageDayRecord, cells: string[], header: string, formulaText: string | null, cachedValue: number | string | null) {
  const basis = basisFor(rec.extractedBy);
  return {
    schemaVersion: SCHEMA_VERSION,
    ingestionId: rec.ingestionId,
    occurredOn: rec.occurredOn,
    provenance: {
      file: rec.source.file,
      fileHash: rec.source.fileHash,
      sheet: rec.source.sheet,
      tableId: rec.source.tableId,
      cells,
      headerPath: [header],
      rowLabel: rec.occurredOn.start,
      formulaText,
      cachedValue,
      externalRef: null,
    },
    confidence: { score: scoreFor(basis), basis },
    extractedBy: rec.extractedBy,
    recordedAt: new Date().toISOString(),
    supersededBy: null,
  };
}

/** Emit all canonical events for one stage-day record. Pure (modulo recordedAt). */
export function emitStageDay(rec: StageDayRecord): Event[] {
  const out: Event[] = [];

  if (rec.checked && Number.isInteger(rec.checked.value) && rec.checked.value >= 0) {
    const payload = { stageId: rec.stageId, quantity: rec.checked.value, unit: "pcs" as const, batchNo: null, size: rec.size ?? null };
    const env = envelope(rec, [rec.checked.cell], rec.checked.header, null, null);
    const eventId = hashEvent({ eventType: "production", occurredOn: rec.occurredOn, provenance: env.provenance, payload });
    out.push(ProductionEvent.parse({ eventId, eventType: "production", ...env, ...payload }));
  }

  const inspection = (sv: SourcedValue | null, disposition: "rejected" | "accepted" | "rework") => {
    if (!sv || !Number.isInteger(sv.value) || sv.value < 0) return;
    const payload = { stageId: rec.stageId, disposition, quantity: sv.value, unit: "pcs" as const, batchNo: null, size: rec.size ?? null };
    const env = envelope(rec, [sv.cell], sv.header, null, null);
    const eventId = hashEvent({ eventType: "inspection", occurredOn: rec.occurredOn, provenance: env.provenance, payload });
    out.push(InspectionEvent.parse({ eventId, eventType: "inspection", ...env, ...payload }));
  };
  inspection(rec.rejected, "rejected");
  inspection(rec.acceptedGood, "accepted");
  inspection(rec.rework, "rework");

  for (const d of rec.defects) {
    if (!Number.isInteger(d.value) || d.value < 0) continue;
    const payload = {
      stageId: rec.stageId,
      defectCode: resolveDefect(d.raw), // null when unknown → V-007 finding downstream
      defectCodeRaw: d.raw,
      quantity: d.value,
      unit: "pcs" as const,
      batchNo: null,
      size: rec.size ?? null,
    };
    const env = envelope(rec, [d.cell], d.raw, null, null);
    const eventId = hashEvent({ eventType: "rejection", occurredOn: rec.occurredOn, provenance: env.provenance, payload });
    out.push(RejectionEvent.parse({ eventId, eventType: "rejection", ...env, ...payload }));
  }

  if (rec.statedPct) {
    const payload = {
      claimKind: "percentage" as const,
      statedValue: rec.statedPct.value,
      aggregation: "daily" as const,
      aboutStageId: rec.stageId,
      aboutDefectCode: null,
    };
    const env = envelope(rec, [rec.statedPct.cell], "REJ %", rec.statedPct.formula, rec.statedPct.value);
    const eventId = hashEvent({ eventType: "aggregate-claim", occurredOn: rec.occurredOn, provenance: env.provenance, payload });
    out.push(AggregateClaimEvent.parse({ eventId, eventType: "aggregate-claim", ...env, ...payload }));
  }

  if (rec.comment && rec.comment.trim()) {
    const targetEventIds = out.map(e => e.eventId);
    const targetCells = [
      rec.checked?.cell,
      rec.rejected?.cell,
      rec.statedPct?.cell
    ].filter((c): c is string => !!c);

    const env = envelope(rec, targetCells, "User Comment", null, null);
    const payload = {
      targetEventIds,
      targetCells,
      text: rec.comment.trim(),
      author: "steward" as const,
      findingId: null,
      verdict: null,
    };
    const eventId = hashEvent({ eventType: "annotation", occurredOn: rec.occurredOn, provenance: env.provenance, payload });
    out.push(AnnotationEvent.parse({ eventId, eventType: "annotation", ...env, ...payload }));
  }

  return out;
}

export function emitMany(records: StageDayRecord[]): Event[] {
  return records.flatMap(emitStageDay);
}
