/** @jest-environment node */
// Phase 6: decision engine evaluates rules over canonical variables only.
// Numbers come from analytics/* fixtures — never from templates or the LLM.

import { decide, fillTemplate } from "@/core/decision/engine";
import { computeCanonicalVars } from "@/core/decision/canonical-vars";
import { SEED_DECISION_RULES } from "@/core/decision/seed-rules";
import { resetDecisionRuleStoreForTests } from "@/core/decision/rule-store";
import type { Event } from "@/lib/store/types";
import type { Scope } from "@/lib/analytics/scope";
import type { DecisionRuleT } from "@/shared/models/decision";

const SCOPE: Scope = { grain: "month", dateFrom: "2026-04-01", dateTo: "2026-04-30" };

const REG = {
  stages: [
    { stageId: "visual", label: "Visual Inspection", order: 1, qualityGate: true },
    { stageId: "valve-integrity", label: "Valve Integrity", order: 2, qualityGate: true },
  ],
  defects: [
    { defectCode: "THSP", label: "Thin Spot", aliases: ["THIN SPOD"] },
    { defectCode: "BLBR", label: "Balloon Burst", aliases: ["BALLOON BRUST"] },
  ],
  sizes: [],
  fiscalYearStartMonth: 4,
};

function prod(stageId: string, qty: number, day: string, id: string): Event {
  return {
    eventId: id,
    schemaVersion: "1.0.0",
    ingestionId: "t",
    eventType: "production",
    stageId,
    quantity: qty,
    unit: "pcs",
    batchNo: null,
    size: null,
    occurredOn: { kind: "day", start: day, end: day },
    provenance: {
      file: "fixture.xlsx",
      fileHash: "h",
      sheet: "s",
      tableId: "t1",
      cells: ["A1"],
      headerPath: [],
      rowLabel: null,
      formulaText: null,
      cachedValue: null,
      externalRef: null,
      modId: null,
      modVersion: null,
    },
    confidence: { score: 1, basis: "exact" },
    extractedBy: "mod",
    recordedAt: `${day}T00:00:00.000Z`,
    supersededBy: null,
  } as unknown as Event;
}

function rej(stageId: string, qty: number, day: string, id: string): Event {
  return {
    ...prod(stageId, qty, day, id),
    eventType: "inspection",
    disposition: "rejected",
  } as unknown as Event;
}

function defect(
  stageId: string,
  code: string | null,
  raw: string,
  qty: number,
  day: string,
  id: string,
): Event {
  return {
    ...prod(stageId, qty, day, id),
    eventType: "rejection",
    defectCode: code,
    defectCodeRaw: raw,
  } as unknown as Event;
}

/** Visual 10% rej, Valve 20% → headline 0.30; THSP dominates defects. */
function highRejectionCorpus(): Event[] {
  const day = "2026-04-10";
  return [
    prod("visual", 1000, day, "p-v"),
    rej("visual", 100, day, "r-v"),
    prod("valve-integrity", 900, day, "p-valve"),
    rej("valve-integrity", 180, day, "r-valve"),
    defect("visual", "THSP", "THIN SPOD", 70, day, "d-thsp"),
    defect("visual", "BLBR", "BALLOON BRUST", 30, day, "d-blbr"),
  ];
}

beforeEach(() => {
  resetDecisionRuleStoreForTests();
});

describe("computeCanonicalVars", () => {
  it("derives headline rate as sum of stage rates (client convention)", () => {
    const ctx = computeCanonicalVars(highRejectionCorpus(), SCOPE, REG as any);
    // visual 100/1000=0.1 + valve 180/900=0.2 → 0.3
    expect(ctx.vars.rejection_rate).toBeCloseTo(0.3, 5);
    expect(ctx.vars["stage_rate.visual"]).toBeCloseTo(0.1, 5);
    expect(ctx.vars["stage_rate.valve-integrity"]).toBeCloseTo(0.2, 5);
    expect(ctx.vars.max_stage_rate).toBeCloseTo(0.2, 5);
    expect(ctx.labels.max_stage_label).toBe("Valve Integrity");
    expect(ctx.vars.top_defect_share).toBeCloseTo(0.7, 5);
    expect(ctx.labels.top_defect_label).toBe("Thin Spot");
    expect(ctx.eventIds.length).toBeGreaterThan(0);
  });

  it("reports zeros when the ledger is empty", () => {
    const ctx = computeCanonicalVars([], SCOPE, REG as any);
    expect(ctx.vars.total_checked).toBe(0);
    expect(ctx.vars.rejection_rate).toBe(0);
  });
});

describe("fillTemplate", () => {
  it("interpolates labels and leaves unknown tokens", () => {
    const text = fillTemplate("Rate {{rejection_rate_pct}}% at {{max_stage_label}} {{missing}}", {
      vars: { rejection_rate: 0.12 },
      labels: { rejection_rate_pct: "12.00", max_stage_label: "Visual" },
      eventIds: [],
    });
    expect(text).toBe("Rate 12.00% at Visual {{missing}}");
  });
});

describe("decide", () => {
  it("fires critical + stage + defect rules on high-rejection fixture", async () => {
    const { recommendations, vars } = await decide(highRejectionCorpus(), SCOPE, {
      registry: REG as any,
      rules: SEED_DECISION_RULES,
    });

    expect(vars.rejection_rate).toBeCloseTo(0.3, 5);
    const ids = recommendations.map((r) => r.ruleId);
    expect(ids).toContain("D-001"); // rate > 10%
    expect(ids).toContain("D-002"); // max stage rate > 5%
    expect(ids).toContain("D-003"); // top defect share > 15%
    expect(ids).not.toContain("D-008"); // empty-ledger rule

    const d001 = recommendations.find((r) => r.ruleId === "D-001")!;
    expect(d001.severity).toBe("critical");
    expect(d001.ruleVersion).toBe(1);
    expect(d001.text).toMatch(/exceeds the/);
    expect(d001.vars.rejection_rate).toBeCloseTo(0.3, 5);
    expect(d001.eventIds.length).toBeGreaterThan(0);
    expect(d001.explanation).toBeNull();

    const d002 = recommendations.find((r) => r.ruleId === "D-002")!;
    expect(d002.text).toMatch(/Valve Integrity/);
    expect(d002.text).toMatch(/20\.0%/);

    const d003 = recommendations.find((r) => r.ruleId === "D-003")!;
    expect(d003.kind).toBe("capa-draft");
    expect(d003.text).toMatch(/Thin Spot/);
  });

  it("fires empty-ledger rule when no production", async () => {
    const { recommendations } = await decide([], SCOPE, {
      registry: REG as any,
      rules: SEED_DECISION_RULES,
    });
    expect(recommendations.map((r) => r.ruleId)).toEqual(["D-008"]);
    expect(recommendations[0].text).toMatch(/Upload quality records/);
  });

  it("orders critical before warning before info", async () => {
    const { recommendations } = await decide(highRejectionCorpus(), SCOPE, {
      registry: REG as any,
      rules: SEED_DECISION_RULES,
    });
    const ranks = { critical: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < recommendations.length; i++) {
      expect(ranks[recommendations[i].severity]).toBeGreaterThanOrEqual(
        ranks[recommendations[i - 1].severity],
      );
    }
  });

  it("ignores draft rules", async () => {
    const draft: DecisionRuleT = {
      ...SEED_DECISION_RULES[0],
      ruleId: "D-DRAFT",
      status: "draft",
      definition: {
        when: { all: [{ var: "total_checked", op: "gte", value: 0 }], any: null },
        then: {
          kind: "alert",
          severity: "critical",
          template: "SHOULD NOT FIRE",
          ownerRole: null,
        },
      },
    };
    const { recommendations } = await decide(highRejectionCorpus(), SCOPE, {
      registry: REG as any,
      rules: [draft, ...SEED_DECISION_RULES],
    });
    expect(recommendations.map((r) => r.ruleId)).not.toContain("D-DRAFT");
  });

  it("lineage always carries rule version + event ids on hits with data", async () => {
    const { recommendations } = await decide(highRejectionCorpus(), SCOPE, {
      registry: REG as any,
      rules: SEED_DECISION_RULES,
    });
    for (const r of recommendations.filter((x) => x.ruleId !== "D-008")) {
      expect(r.ruleVersion).toBeGreaterThan(0);
      expect(r.eventIds.length).toBeGreaterThan(0);
    }
  });
});
