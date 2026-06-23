// Content-addressed ids for the canonical ledger (MOID-SPEC §4, §7).
//
// eventId   = hash(eventType, payload, provenance)  → identical data re-ingests
//             to the SAME id → natural idempotent dedupe.
// findingId = hash(ruleId, subtype, sorted evidence eventIds) → a re-run
//             re-attaches to the same finding instead of asking twice.
//
// Hashing must be STABLE across runs and machines: we canonicalize objects by
// sorting keys before serializing, so field order never changes the id.

import { createHash } from "crypto";

/** Deterministic JSON: object keys sorted recursively; arrays kept in order. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Compute the eventId from the SEMANTIC identity of an event: its type, the
 * business period it describes, and its payload (stage, disposition, defect,
 * size, quantity, …). Everything else — eventId, recordedAt, ingestionId,
 * supersededBy, extractedBy, confidence, AND provenance — is excluded.
 *
 * Provenance is deliberately NOT hashed: the same fact (visual / 01-Dec / 824
 * rejected) must collide on its id no matter which file, sheet, or cell it was
 * read from. That is what makes re-uploading the same workbook — even renamed or
 * re-exported — idempotent instead of doubling the numbers. The full provenance
 * is still stored on the event for audit; it just doesn't change identity.
 */
export function hashEvent(parts: {
  eventType: string;
  occurredOn: unknown;
  payload: unknown;
}): string {
  return sha256(canonicalize(parts)).slice(0, 32);
}

/** findingId from the rule + its evidence (eventIds sorted so order is irrelevant). */
export function hashFinding(parts: {
  ruleId: string;
  subtype: string | null;
  evidenceEventIds: string[];
}): string {
  return sha256(
    canonicalize({
      ruleId: parts.ruleId,
      subtype: parts.subtype,
      evidenceEventIds: [...parts.evidenceEventIds].sort(),
    })
  ).slice(0, 32);
}
