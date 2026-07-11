// src/core/ontology/global-ontology.ts
// Cross-company manufacturing concepts (ADD §12) — SEED DATA, not behavior.
// The resolver's rung-3 ranks raw headers against match_terms. Extending the
// ontology means adding rows (here + the SQL seed), never code.

export interface OntologyConcept {
  conceptId: string;
  kind: "measure" | "entity-class" | "dimension";
  matchTerms: string[];
  description: string;
}

export const GLOBAL_ONTOLOGY_SEED: OntologyConcept[] = [
  { conceptId: "CHECKED_QTY",  kind: "measure",      matchTerms: ["checked", "chk", "qty checked", "quantity", "input", "rec", "received", "inspected"], description: "Units entering an inspection gate (denominator)." },
  { conceptId: "ACCEPTED_QTY", kind: "measure",      matchTerms: ["accepted", "accept", "acpt", "good", "ok", "pass"], description: "Units accepted as good." },
  { conceptId: "REWORK_QTY",   kind: "measure",      matchTerms: ["rework", "hold", "rw qty"], description: "Units held or sent to rework." },
  { conceptId: "REJECTED_QTY", kind: "measure",      matchTerms: ["rejected", "reject", "rej", "rejection"], description: "Units rejected at a gate." },
  { conceptId: "PRODUCED_QTY", kind: "measure",      matchTerms: ["produced", "production", "output", "dispatch"], description: "Units produced/dispatched." },
  { conceptId: "STAGE",        kind: "entity-class", matchTerms: ["stage", "station", "process", "gate", "inspection"], description: "A process/inspection stage on the line." },
  { conceptId: "DEFECT",       kind: "entity-class", matchTerms: ["defect", "reason", "rejection reason", "fault"], description: "A rejection reason code; columns tallying one reason each." },
  { conceptId: "SIZE",         kind: "dimension",    matchTerms: ["size", "fr", "french"], description: "Product size dimension (e.g. French catheter sizes)." },
  { conceptId: "DATE",         kind: "dimension",    matchTerms: ["date", "day", "month", "period", "week"], description: "The record's time axis." },
  { conceptId: "BATCH",        kind: "dimension",    matchTerms: ["batch", "lot", "trolley"], description: "Production batch/lot identifier." },
  { conceptId: "OPERATOR",     kind: "dimension",    matchTerms: ["operator", "inspector", "supervisor"], description: "Person performing/overseeing the operation." },
  { conceptId: "MACHINE",      kind: "dimension",    matchTerms: ["machine", "m/c", "equipment"], description: "Machine/equipment identifier." },
  { conceptId: "SHIFT",        kind: "dimension",    matchTerms: ["shift"], description: "Work shift." },
  { conceptId: "STATED_PCT",   kind: "measure",      matchTerms: ["%", "pct", "percent", "rate", "rej %"], description: "A stated percentage — an aggregate CLAIM to verify, never an input." },
];
