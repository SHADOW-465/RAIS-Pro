// Regression test for RC3 (see this session's /investigate report): rejectionRate,
// totalChecked, fpy, byStage, stageTrend, trend, weeklyTrend all defaulted their
// `registry` parameter to the hardcoded DISPOSAFE_REGISTRY, and no page ever
// passed a dynamic one in. perStageAgg() iterates registry.stages and filters
// ledger events by matching stageId — so an event whose stageId wasn't one of
// DISPOSAFE_REGISTRY's 13 hardcoded stages was silently invisible to every
// headline KPI, even though it was correctly stored in the canonical ledger.
import { rejectionRate, totalChecked, fpy, byStage, trend, weeklyTrend } from "../rejection";
import { DISPOSAFE_REGISTRY as REG } from "@/__tests__/fixtures/disposafe-registry";
import { DISPOSAFE_REGISTRY } from "@/__tests__/fixtures/disposafe-registry";
import { emitMany } from "@/lib/ingest/emit";
import type { StageDayRecord } from "@/lib/ingest/emit";
import type { Scope } from "../scope";

const CUSTOM_STAGE_ID = "custom-dip-line"; // deliberately NOT one of the 13 hardcoded stages

function customStageRecord(): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: "2026-04-01", end: "2026-04-01" },
    stageId: CUSTOM_STAGE_ID,
    size: null,
    source: { file: "Custom Workbook.xlsx", fileHash: "h", sheet: "Data", tableId: "t1" },
    checked: { value: 100, cell: "A1", header: "checked" },
    acceptedGood: { value: 80, cell: "A2", header: "acceptedGood" },
    rework: null,
    rejected: { value: 20, cell: "A3", header: "rejected" },
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "ing-1",
  };
}

// A registry that actually knows about the custom stage — what a real uploaded
// workbook's extracted-and-saved schema/preset would look like.
const customRegistry = {
  ...DISPOSAFE_REGISTRY,
  stages: [{ stageId: CUSTOM_STAGE_ID, label: "Custom Dip Line", effectiveFrom: null, effectiveTo: null, upstream: [], captures: ["checked", "accepted", "rejected"] as ("checked" | "accepted" | "hold" | "rejected")[] }],
};

const scope: Scope = { grain: "month" };

describe("registry-dependent selectors — custom (non-hardcoded) stage visibility", () => {
  const events = emitMany([customStageRecord()]);

  it("with the DEFAULT (hardcoded) registry, the custom stage's data is invisible", () => {
    expect(rejectionRate(events, scope, REG).value).toBe(0); // was silently 0 — the bug
    expect(totalChecked(events, scope, REG).value).toBe(0);
    expect(fpy(events, scope, REG).value).toBe(1); // "no stages" -> defaults to perfect yield
    expect(byStage(events, scope, REG)).toHaveLength(0); // event totally absent from the breakdown
  });

  it("with the ACTUAL active registry passed in, the custom stage's data is correctly visible", () => {
    expect(rejectionRate(events, scope, customRegistry).value).toBeCloseTo(0.2, 6); // 20/100
    expect(totalChecked(events, scope, customRegistry).value).toBe(100);
    expect(fpy(events, scope, customRegistry).value).toBeCloseTo(0.8, 6);
    const stages = byStage(events, scope, customRegistry);
    expect(stages).toHaveLength(1);
    expect(stages[0].stageId).toBe(CUSTOM_STAGE_ID);
    expect(stages[0].checked).toBe(100);
    expect(stages[0].rejected).toBe(20);
  });

  it("trend() and weeklyTrend() also see the custom stage once a registry is threaded through", () => {
    const withoutRegistry = trend(events, scope, "rejectionRate", REG);
    expect(withoutRegistry.every((p) => p.value === 0)).toBe(true);

    const withRegistry = trend(events, scope, "rejectionRate", customRegistry);
    expect(withRegistry.some((p) => p.value > 0)).toBe(true);

    const weekly = weeklyTrend(events, { grain: "month" }, customRegistry);
    expect(weekly.some((p) => p.value > 0)).toBe(true);
  });
});
