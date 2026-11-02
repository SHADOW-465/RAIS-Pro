import type { PlantTotals } from "../plant-totals";
import type { ReportViewModel } from "@/lib/report/report-model";
import {
  headlineFigures,
  overlayReportModel,
  overlayStageRows,
  restoreCopqTrend,
  restoreTrend,
} from "../overlay-totals";

test("stage overlay keeps local order and extra fields, and appends a server-only stage", () => {
  const local = [
    { stageId: "visual", label: "Visual", note: "local", checked: 1, good: 1, rework: 0, rejected: 0, rejRate: 0, yield: 1, contributionPct: 0 },
    { stageId: "balloon", label: "Balloon", note: "keep", checked: 9, good: 8, rework: 0, rejected: 1, rejRate: 0.1, yield: 0.9, contributionPct: 100 },
  ];
  const server = [
    { stageId: "balloon", label: "Server balloon", note: "drop", checked: 10, good: 7, rework: 1, rejected: 2, rejRate: 0.2, yield: 0.8, contributionPct: 40 },
    { stageId: "packing", label: "Packing", note: "new", checked: 4, good: 4, rework: 0, rejected: 3, rejRate: 0.75, yield: 0.25, contributionPct: 60 },
  ];
  const rows = overlayStageRows(local, server);
  expect(rows.map((r) => r.stageId)).toEqual(["visual", "balloon", "packing"]);
  expect(rows[0]).toBe(local[0]);
  expect(rows[1]).toMatchObject({ label: "Balloon", note: "keep", checked: 10, good: 7, rework: 1, rejected: 2, rejRate: 0.2, yield: 0.8, contributionPct: 40 });
  expect(rows[2]).toMatchObject({ stageId: "packing", checked: 4, rejected: 3 });
});

test("restoreTrend turns a null no-production rate back into NaN and keeps a real rate", () => {
  const points = restoreTrend([
    { period: "2026-07", label: "Jul", value: null, noProduction: true, checked: 0, rejected: 0 },
    { period: "2026-08", label: "Aug", value: 0.25, checked: 8, rejected: 2 },
    { period: "2026-09", label: "Sep", value: null },
  ]);
  expect(Number.isNaN(points[0].value)).toBe(true);
  expect(points[0].noProduction).toBe(true);
  expect(points[1].value).toBe(0.25);
  expect(Number.isNaN(points[2].value)).toBe(true);
});

test("COPQ restore keeps a finite zero and turns null into zero", () => {
  const points = restoreCopqTrend([
    { period: "2026-07", label: "Jul", value: 0, noProduction: true },
    { period: "2026-08", label: "Aug", value: null },
    { period: "2026-09", label: "Sep", value: 12 },
  ]);
  expect(points.map((p) => p.value)).toEqual([0, 0, 12]);
  expect(points[0].noProduction).toBe(true);
});

test("headline figures recompute accepted from the server checked and rejected", () => {
  const figures = headlineFigures({
    rejectionRate: 0.1,
    totalRejected: 4,
    totalChecked: 10,
    fpy: 0.9,
    copq: null,
    savings: null,
  });
  expect(figures).toMatchObject({
    rate: 0.1,
    rejected: 4,
    checked: 10,
    accepted: 6,
    acceptedRate: 0.6,
    fpy: 0.9,
    copq: 0,
    savings: 0,
  });
});

test("an empty checked base uses one minus the rate", () => {
  expect(headlineFigures({
    rejectionRate: 0.2,
    totalRejected: 0,
    totalChecked: 0,
    fpy: 1,
    copq: 5,
    savings: 1,
  }).acceptedRate).toBeCloseTo(0.8);
});

function reportModel(): ReportViewModel {
  const monthly = [
    {
      key: "2026-07",
      label: "July 2026",
      shortLabel: "Jul",
      status: "has-records" as const,
      qualifyingEventCount: 2,
      checked: 10,
      rejected: 1,
      rejectionRate: 0.1,
    },
  ];
  return {
    identity: {
      reportType: "fy-audit-pack",
      title: "Pack",
      periodCaption: "FY",
      periodMode: "financial-year",
      dateFrom: "2026-04-01",
      dateTo: "2027-03-31",
      dateBasis: "entry",
      dateBasisLabel: "Date of Entry",
      sourceSummary: "All plant data",
      batchSummary: "All batches",
      plantWide: true,
      generatedAt: "2026-10-31T00:00:00.000Z",
      calculationBasis: "basis",
      policyReworkCountsAs: "excluded",
      notes: "",
    },
    validation: {
      qualifyingEventCount: 2,
      earliestEntryDate: "2026-07-01",
      latestEntryDate: "2026-07-02",
      monthsWithData: 1,
      monthsWithoutData: 0,
      canExport: true,
      blockers: [],
      warnings: [],
    },
    limitations: [],
    fundamentals: {
      checked: { kind: "number", value: 1, sourceEventIds: ["e1"] },
      rejected: { kind: "number", value: 1, sourceEventIds: ["e2"] },
      rejectionRate: { kind: "ratio", value: 1, sourceEventIds: ["e2"] },
      accepted: { kind: "unavailable", display: "Needs company confirmation", policyGap: "gap" },
      fpy: { kind: "ratio", value: 0, sourceEventIds: ["e1"] },
      monthly,
      patterns: [{ id: "old", title: "Old", value: "1", rule: "local" }],
    },
    stage: {
      rows: [],
      rejectedDenominator: 0,
      rejectedDenominatorNote: "stage rejected quantity / cumulative rejected quantity × 100",
      monthly: [{ key: "2026-07", label: "July 2026", shortLabel: "Jul", perStage: { visual: 1 } }],
      unmappedEventCount: 9,
    },
    defect: {
      rows: [],
      rejectedDenominator: 0,
      denominatorNote: "defect rejected quantity / total rejected quantity included in the defect analysis × 100",
      topN: [{ defectCode: "A", label: "A", rejected: 1, pct: 100, cumPct: 100, rank: 1, kind: "resolved" }],
      otherRejected: 0,
      monthly: [{ key: "2026-07", label: "July 2026", shortLabel: "Jul", perDefect: { A: 1 } }],
    },
    size: {
      rows: [],
      rejectedDenominator: 0,
      rejectedDenominatorNote: "size",
      checkedTaggedDenominator: 0,
      checkedDenominatorNote: "size",
      monthly: [],
      sizeTaggedEventCount: 0,
      missingSizeEventCount: 0,
    },
    evidence: { rows: [], total: 2, truncated: false, truncationNote: null },
    signOff: { label: "Sign", fields: [] },
  } as unknown as ReportViewModel;
}

test("report overlay replaces headline values and tables without touching monthly series or accepted", () => {
  const model = reportModel();
  const totals = {
    headlines: {
      rejectionRate: 0.2,
      totalRejected: 4,
      totalChecked: 20,
      fpy: 0.8,
      copq: null,
      savings: null,
    },
    stageAnalysis: {
      rows: [
        {
          stageId: "visual",
          label: "Visual",
          checked: 20,
          rejected: 4,
          rejRate: 0.2,
          yield: 0.8,
          contributionPct: 100,
          rank: 1,
          sourceEventCount: 2,
          status: "has-records",
        },
      ],
      rejectedDenominator: 4,
      unmappedEventCount: 0,
    },
    defectAnalysis: {
      rows: [
        { defectCode: "THSP", label: "Thin spot", rejected: 3, pct: 75, cumPct: 75, rank: 1, kind: "resolved" },
        { defectCode: null, label: "Unclassified", rejected: 1, pct: 25, cumPct: 100, rank: 2, kind: "unclassified" },
      ],
      rejectedDenominator: 4,
    },
  } as PlantTotals;

  const next = overlayReportModel(model, totals);
  expect(next.fundamentals?.checked).toEqual({ kind: "number", value: 20, sourceEventIds: ["e1"] });
  expect(next.fundamentals?.rejectionRate).toEqual({ kind: "ratio", value: 0.2, sourceEventIds: ["e2"] });
  expect(next.fundamentals?.fpy).toEqual({ kind: "ratio", value: 0.8, sourceEventIds: ["e1"] });
  expect(next.fundamentals?.accepted).toEqual(model.fundamentals?.accepted);
  expect(next.fundamentals?.monthly).toBe(model.fundamentals?.monthly);
  expect(next.stage?.monthly).toBe(model.stage?.monthly);
  expect(next.defect?.monthly).toBe(model.defect?.monthly);
  expect(next.stage?.rows.map((r) => r.stageId)).toEqual(["visual"]);
  expect(next.stage?.rejectedDenominator).toBe(4);
  expect(next.stage?.unmappedEventCount).toBe(0);
  expect(next.defect?.topN.map((r) => r.label)).toEqual(["Thin spot"]);
  expect(next.defect?.otherRejected).toBe(1);
  expect(next.size).toBe(model.size);
  expect(next.evidence).toBe(model.evidence);
  expect(next.fundamentals?.patterns).not.toBe(model.fundamentals?.patterns);
});
