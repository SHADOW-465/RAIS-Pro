import {
  ProductionEvent,
  RejectionEvent,
  CorrectionEvent,
  Period,
  Provenance,
} from "@/lib/contract/d1";
import { Finding, Adjudication, RulebookRule, RuleApplication } from "@/lib/contract/d3";
import { hashEvent, hashFinding, canonicalize } from "@/lib/contract/hash";
import {
  MemoryEventStore,
  MemoryFindingStore,
  MemoryRulebookStore,
} from "@/lib/store/memory";
import type { Event, FindingT } from "@/lib/store/types";
import { resolveDefect, activeStageIds, DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

// ── builders ──────────────────────────────────────────────────────────────
const occ = (start: string, end = start) =>
  Period.parse({ kind: "day", start, end });

const prov = (over: Partial<ReturnType<typeof baseProv>> = {}) =>
  Provenance.parse({ ...baseProv(), ...over });
function baseProv() {
  return {
    file: "ASSEMBLY REJECTION REPORT.xlsx",
    fileHash: "abc123",
    sheet: "APRIL 25",
    tableId: "t1",
    cells: ["B6"],
    headerPath: ["VISUAL QTY"],
    rowLabel: null,
    formulaText: null,
    cachedValue: null,
    externalRef: null,
  };
}

function production(opts: {
  start: string;
  stageId?: string;
  quantity?: number;
  cells?: string[];
  ingestionId?: string;
  recordedAt?: string;
}): Event {
  const occurredOn = occ(opts.start);
  const provenance = prov({ cells: opts.cells ?? ["B6"] });
  const payload = {
    stageId: opts.stageId ?? "visual",
    quantity: opts.quantity ?? 10982,
    unit: "pcs" as const,
    batchNo: null,
    size: null,
  };
  const eventId = hashEvent({ eventType: "production", occurredOn, provenance, payload });
  return ProductionEvent.parse({
    eventId,
    schemaVersion: "1.0.0",
    ingestionId: opts.ingestionId ?? "ing-1",
    occurredOn,
    provenance,
    confidence: { score: 1, basis: "exact" },
    extractedBy: "heuristic",
    recordedAt: opts.recordedAt ?? "2026-06-17T10:00:00.000Z",
    supersededBy: null,
    eventType: "production",
    ...payload,
  });
}

function rejection(opts: { start: string; stageId: string; defectCode: string | null; raw: string; quantity: number }): Event {
  const occurredOn = occ(opts.start);
  const provenance = prov({ cells: ["D6"], headerPath: [opts.raw] });
  const payload = {
    stageId: opts.stageId,
    defectCode: opts.defectCode,
    defectCodeRaw: opts.raw,
    quantity: opts.quantity,
    unit: "pcs" as const,
    batchNo: null,
    size: null,
  };
  const eventId = hashEvent({ eventType: "rejection", occurredOn, provenance, payload });
  return RejectionEvent.parse({
    eventId, schemaVersion: "1.0.0", ingestionId: "ing-1", occurredOn, provenance,
    confidence: { score: 0.9, basis: "heuristic" }, extractedBy: "heuristic",
    recordedAt: "2026-06-17T10:00:00.000Z", supersededBy: null,
    eventType: "rejection", ...payload,
  });
}

function correction(supersedesEventId: string): Event {
  const occurredOn = occ("2025-04-01");
  const provenance = prov();
  const payload = { supersedesEventId, replacementEventId: null, reason: "typo", authorisedBy: "adj-1" };
  const eventId = hashEvent({ eventType: "correction", occurredOn, provenance, payload });
  return CorrectionEvent.parse({
    eventId, schemaVersion: "1.0.0", ingestionId: "ing-1", occurredOn, provenance,
    confidence: { score: 1, basis: "exact" }, extractedBy: "direct-entry",
    recordedAt: "2026-06-17T10:00:00.000Z", supersededBy: null,
    eventType: "correction", ...payload,
  });
}

function finding(over: Partial<FindingT> = {}): FindingT {
  const evidenceEventIds = (over.evidence?.eventIds) ?? ["ev-1"];
  const base: FindingT = {
    findingId: hashFinding({ ruleId: "V-006", subtype: null, evidenceEventIds }),
    schemaVersion: "1.0.0",
    ingestionId: "ing-1",
    ruleId: "V-006",
    subtype: null,
    severity: "critical",
    question: "The April total skips a column.",
    detail: "Including it gives 1,626 not 1,550.",
    evidence: {
      eventIds: evidenceEventIds,
      cells: ["K30"],
      provenance: prov({ cells: ["K30"] }),
      statedValue: 1550,
      computedValue: 1626,
      magnitude: 76,
    },
    hypotheses: [{ kind: "mistake", text: "column added after the formula" }],
    requiresGmAuthority: true,
    occurredOn: occ("2025-04-01", "2025-04-30"),
    recordedAt: "2026-06-17T10:00:00.000Z",
  };
  return Finding.parse({ ...base, ...over });
}

// ── hash ────────────────────────────────────────────────────────────────────
describe("content hashing", () => {
  test("canonicalize is key-order independent", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  test("eventId is identity-based: same observation, different envelope → same id", () => {
    const a = production({ start: "2025-04-01", ingestionId: "ing-1", recordedAt: "2026-06-17T10:00:00.000Z" });
    const b = production({ start: "2025-04-01", ingestionId: "ing-99", recordedAt: "2027-01-01T00:00:00.000Z" });
    expect(a.eventId).toBe(b.eventId);
  });

  test("different cells → different eventId", () => {
    const a = production({ start: "2025-04-01", cells: ["B6"] });
    const b = production({ start: "2025-04-01", cells: ["B7"] });
    expect(a.eventId).not.toBe(b.eventId);
  });

  test("findingId is order-independent over evidence ids", () => {
    const x = hashFinding({ ruleId: "V-004", subtype: null, evidenceEventIds: ["a", "b"] });
    const y = hashFinding({ ruleId: "V-004", subtype: null, evidenceEventIds: ["b", "a"] });
    expect(x).toBe(y);
  });
});

// ── EventStore ────────────────────────────────────────────────────────────
describe("MemoryEventStore", () => {
  test("append is idempotent on identical content", async () => {
    const s = new MemoryEventStore();
    const e = production({ start: "2025-04-01" });
    const r1 = await s.append([e]);
    const r2 = await s.append([e]); // re-ingest same file
    expect(r1).toEqual({ inserted: 1, deduped: 0 });
    expect(r2).toEqual({ inserted: 0, deduped: 1 });
    expect(s.size).toBe(1);
  });

  test("effective() excludes events superseded by a Correction", async () => {
    const s = new MemoryEventStore();
    const e = production({ start: "2025-04-01" });
    await s.append([e]);
    expect((await s.effective({ eventType: "production" })).length).toBe(1);
    await s.append([correction(e.eventId)]);
    expect((await s.effective({ eventType: "production" })).length).toBe(0);
  });

  test("effective() filters by stage, defect, and date range", async () => {
    const s = new MemoryEventStore();
    await s.append([
      production({ start: "2025-04-01", stageId: "visual" }),
      production({ start: "2025-05-01", stageId: "balloon", cells: ["F6"] }),
      rejection({ start: "2025-04-01", stageId: "visual", defectCode: "THSP", raw: "THIN SPOD", quantity: 100 }),
    ]);
    expect((await s.effective({ stageId: "visual" })).length).toBe(2);
    expect((await s.effective({ defectCode: "THSP" })).length).toBe(1);
    expect((await s.effective({ from: "2025-05-01" })).length).toBe(1);
    expect((await s.effective({ eventType: "rejection" })).length).toBe(1);
  });

  test("byIds returns only existing events", async () => {
    const s = new MemoryEventStore();
    const e = production({ start: "2025-04-01" });
    await s.append([e]);
    expect((await s.byIds([e.eventId, "nope"])).map((x) => x.eventId)).toEqual([e.eventId]);
  });
});

// ── Registry ─────────────────────────────────────────────────────────────
describe("Disposafe registry (rejection-only)", () => {
  test("has exactly the 4 rejection stages", () => {
    expect(DISPOSAFE_REGISTRY.stages.map((s) => s.stageId)).toEqual([
      "visual", "balloon", "valve-integrity", "final",
    ]);
  });

  test("resolves defect aliases incl. real misspellings, unknown → null", () => {
    expect(resolveDefect("THIN SPOD")).toBe("THSP"); // sic, from the real sheets
    expect(resolveDefect("  balloon brust ")).toBe("BLBR");
    expect(resolveDefect("Others")).toBe("OTH");
    expect(resolveDefect("UNSEEN DEFECT")).toBeNull(); // → Finding V-007, never invented
  });

  test("activeStageIds respects effectiveFrom drift", () => {
    expect(activeStageIds("2025-04-01")).toContain("visual");
  });
});

// ── FindingStore ──────────────────────────────────────────────────────────
describe("MemoryFindingStore", () => {
  test("upsert is idempotent on findingId (no duplicate questions on re-ingest)", async () => {
    const fs = new MemoryFindingStore();
    const f = finding();
    await fs.upsert([f]);
    await fs.upsert([f]);
    expect((await fs.list()).length).toBe(1);
    expect((await fs.list())[0].state).toBe("open");
  });

  test("adjudicating mistake/intentional moves state open → adjudicated; unsure stays open", async () => {
    const fs = new MemoryFindingStore();
    const f = finding();
    await fs.upsert([f]);
    await fs.adjudicate(Adjudication.parse({
      adjudicationId: "adj-1", findingId: f.findingId, verdict: "unsure", why: "",
      author: "steward", isRecommendation: false, correctionEventId: null,
      recordedAt: "2026-06-17T10:00:00.000Z",
    }));
    expect((await fs.get(f.findingId))!.state).toBe("open"); // parked

    await fs.adjudicate(Adjudication.parse({
      adjudicationId: "adj-2", findingId: f.findingId, verdict: "mistake", why: "formula error",
      author: "steward", isRecommendation: false, correctionEventId: null,
      recordedAt: "2026-06-17T10:05:00.000Z",
    }));
    expect((await fs.get(f.findingId))!.state).toBe("adjudicated");
  });

  test("recommendations do not settle a finding", async () => {
    const fs = new MemoryFindingStore();
    const f = finding();
    await fs.upsert([f]);
    await fs.adjudicate(Adjudication.parse({
      adjudicationId: "adj-r", findingId: f.findingId, verdict: "mistake", why: "steward thinks so",
      author: "steward", isRecommendation: true, correctionEventId: null,
      recordedAt: "2026-06-17T10:00:00.000Z",
    }));
    expect((await fs.get(f.findingId))!.state).toBe("open"); // GM still must confirm
  });

  test("an active rule application marks the finding rule-compiled", async () => {
    const rb = new MemoryRulebookStore();
    const fs = new MemoryFindingStore(rb);
    const f = finding();
    await fs.upsert([f]);
    await rb.recordApplication(RuleApplication.parse({
      rulebookRuleId: "rule-1", ruleVersion: 1, findingId: f.findingId,
      ingestionId: "ing-2", appliedAt: "2026-06-17T11:00:00.000Z",
    }));
    expect((await fs.get(f.findingId))!.state).toBe("rule-compiled");
  });

  test("list sorts critical first then by magnitude, and filters by state", async () => {
    const fs = new MemoryFindingStore();
    const warn = finding({
      ruleId: "V-009", severity: "warning",
      evidence: { eventIds: ["w1"], cells: ["A1"], provenance: prov({ cells: ["A1"] }), statedValue: null, computedValue: null, magnitude: 5 },
      findingId: hashFinding({ ruleId: "V-009", subtype: null, evidenceEventIds: ["w1"] }),
    });
    const crit = finding(); // critical, magnitude 76
    await fs.upsert([warn, crit]);
    const all = await fs.list();
    expect(all[0].severity).toBe("critical");
    expect((await fs.list("open")).length).toBe(2);
  });
});

// ── schema sanity: rulebook rule round-trips ────────────────────────────────
test("RulebookRule + predicate/action parse", () => {
  const rule = RulebookRule.parse({
    rulebookRuleId: "rule-1", version: 1, status: "active",
    predicate: {
      ruleId: "V-006", subtype: null,
      scope: { clientId: "disposafe", fileFamily: "SHOPFLOOR", sheetPattern: null, stageId: null, defectCode: null, periodFrom: null, periodTo: null },
      paramEquals: [{ key: "omittedColumn", value: "I" }],
    },
    action: { kind: "auto-adjudicate", verdict: "mistake", note: "totals must include every defect column" },
    rationale: "Shopfloor grand totals must include every defect column.",
    bornFromAdjudicationIds: ["adj-2"], draftedBy: "llm:claude", activatedBy: "steward",
    createdAt: "2026-06-17T10:00:00.000Z", retiredAt: null,
  });
  expect(rule.action.kind).toBe("auto-adjudicate");
});
