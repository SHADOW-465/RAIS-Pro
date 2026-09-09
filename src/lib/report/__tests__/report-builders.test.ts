import { buildReport, modelContainsForbiddenClaim, reportFilename } from "../report-builders";
import { REPORT_DATE_BASIS } from "../date-basis";
import { totalChecked, totalRejected, rejectionRate } from "@/lib/analytics/rejection";
import type { Event } from "@/lib/store/types";
import type { ReportScopeInput } from "../report-scope";

const REGISTRY = {
  stages: [
    { stageId: "visual", label: "Visual" },
    { stageId: "balloon", label: "Balloon" },
    { stageId: "final", label: "Final" },
  ],
  defects: [{ defectCode: "flash", label: "Flash", aliases: ["flash"], stages: ["visual"] }],
  sizes: [],
  fiscalYearStartMonth: 4,
};

let n = 0;
function ev(partial: {
  recordedAt: string;
  occurredOn?: string;
  eventType?: Event["eventType"];
  stageId?: string | null;
  qty?: number;
  disposition?: string;
  defectCode?: string | null;
  defectCodeRaw?: string;
  size?: string | null;
  batchNo?: string | null;
}): Event {
  const day = partial.occurredOn ?? partial.recordedAt.slice(0, 10);
  n += 1;
  return {
    eventId: `e${n}`,
    schemaVersion: "1.0.0",
    ingestionId: "ing",
    eventType: partial.eventType ?? "production",
    occurredOn: { kind: "day", start: day, end: day },
    provenance: {
      file: "ASSEMBLY.xlsx",
      fileHash: "h",
      sheet: "S",
      tableId: "t1",
      cells: ["A1"],
      headerPath: [],
      rowLabel: null,
      formulaText: null,
      cachedValue: null,
      externalRef: null,
    },
    confidence: { score: 1, basis: "exact" },
    extractedBy: "mod-extract",
    recordedAt: partial.recordedAt,
    supersededBy: null,
    stageId: partial.stageId === null ? undefined : (partial.stageId ?? "visual"),
    size: partial.size === undefined ? "Fr14" : partial.size,
    quantity: partial.qty ?? 100,
    unit: "pcs",
    batchNo: partial.batchNo ?? "26G01-14",
    disposition: partial.disposition,
    defectCode: partial.defectCode,
    defectCodeRaw: partial.defectCodeRaw,
  } as unknown as Event;
}

const LEDGER: Event[] = [
  ev({ recordedAt: "2025-04-10T08:00:00.000Z", eventType: "production", stageId: "visual", qty: 1000 }),
  ev({ recordedAt: "2025-04-10T08:00:00.000Z", eventType: "inspection", stageId: "visual", qty: 80, disposition: "rejected" }),
  ev({ recordedAt: "2025-04-10T08:00:00.000Z", eventType: "rejection", stageId: "visual", qty: 50, defectCode: "flash", defectCodeRaw: "Flash" }),
  ev({ recordedAt: "2025-04-10T08:00:00.000Z", eventType: "rejection", stageId: "visual", qty: 20, defectCode: null, defectCodeRaw: "Overlaping" }),
  ev({ recordedAt: "2025-04-10T08:00:00.000Z", eventType: "rejection", stageId: "visual", qty: 10, defectCode: null, defectCodeRaw: "" }),
  ev({ recordedAt: "2025-05-12T08:00:00.000Z", eventType: "production", stageId: "balloon", qty: 800 }),
  ev({ recordedAt: "2025-05-12T08:00:00.000Z", eventType: "inspection", stageId: "balloon", qty: 40, disposition: "rejected" }),
  ev({ recordedAt: "2025-05-12T08:00:00.000Z", eventType: "rejection", stageId: "balloon", qty: 40, defectCode: "flash", defectCodeRaw: "Flash" }),
  ev({ recordedAt: "2025-06-01T08:00:00.000Z", eventType: "production", stageId: "visual", qty: 200, size: null }),
  // Lot in March 2026, entered 2 April 2026 — FY 2026–27 by Date of Entry
  ev({
    recordedAt: "2026-04-02T08:00:00.000Z",
    occurredOn: "2026-03-31",
    batchNo: "26C31-14",
    eventType: "production",
    stageId: "visual",
    qty: 9999,
  }),
];

function input(over: Partial<ReportScopeInput> = {}): ReportScopeInput {
  return {
    reportType: "fy-audit-pack",
    periodMode: "financial-year",
    financialYearStartYear: 2025,
    dateBasis: REPORT_DATE_BASIS,
    generatedAt: "2026-09-02T12:00:00.000Z",
    ...over,
  };
}

describe("report builders", () => {
  it("checked/rejected/rate match existing analytics on the Date-of-Entry population", () => {
    const built = buildReport(LEDGER, input(), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const included = LEDGER.filter((e) => {
      const d = e.recordedAt.slice(0, 10);
      return d >= "2025-04-01" && d <= "2026-03-31";
    });
    const scope = built.scope.analyticsScope;
    expect(built.model.fundamentals?.checked.kind).toBe("number");
    if (built.model.fundamentals?.checked.kind !== "number") return;
    expect(built.model.fundamentals.checked.value).toBe(totalChecked(included, scope, REGISTRY).value);
    if (built.model.fundamentals.rejected.kind !== "number") return;
    expect(built.model.fundamentals.rejected.value).toBe(totalRejected(included, scope).value);
    if (built.model.fundamentals.rejectionRate.kind !== "ratio") return;
    expect(built.model.fundamentals.rejectionRate.value).toBe(rejectionRate(included, scope, REGISTRY).value);
    // Sequential assembly gates must not inflate plant checked (Visual + Balloon + …).
    expect(built.model.fundamentals.checked.value).toBeLessThan(1000 + 800 + 200);
  });

  it("does not include the April 2026 entry (lot in March) in FY 2025–26", () => {
    const built = buildReport(LEDGER, input(), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.fundamentals?.checked.kind).toBe("number");
    if (built.model.fundamentals?.checked.kind !== "number") return;
    expect(built.model.fundamentals.checked.value).not.toBeGreaterThanOrEqual(9999);
  });

  it("accepted is unavailable, not checked minus rejected", () => {
    const built = buildReport(LEDGER, input(), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const acc = built.model.fundamentals?.accepted;
    expect(acc?.kind).toBe("unavailable");
    if (acc?.kind !== "unavailable") return;
    expect(acc.display).toBe("Needs company confirmation");
    expect(acc.policyGap.toLowerCase()).toMatch(/company/);
  });

  it("April-to-March monthly sequence includes empty months as no-qualifying-records", () => {
    const built = buildReport(LEDGER, input(), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const months = built.model.fundamentals?.monthly ?? [];
    expect(months.map((m) => m.key)).toEqual([
      "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09",
      "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
    ]);
    const july = months.find((m) => m.key === "2025-07")!;
    expect(july.status).toBe("no-qualifying-records");
    expect(july.checked).toBeNull();
    expect(july.rejected).toBeNull();
    expect(july.rejectionRate).toBeNull();
    const april = months.find((m) => m.key === "2025-04")!;
    expect(april.status).toBe("has-records");
    expect(april.checked).not.toBeNull();
  });

  it("FY audit pack includes all four analysis areas", () => {
    const built = buildReport(LEDGER, input({ reportType: "fy-audit-pack" }), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.fundamentals).not.toBeNull();
    expect(built.model.stage).not.toBeNull();
    expect(built.model.defect).not.toBeNull();
    expect(built.model.size).not.toBeNull();
  });

  it("split reports include only their subject", () => {
    const fund = buildReport(LEDGER, input({ reportType: "fundamentals" }), REGISTRY);
    const stage = buildReport(LEDGER, input({ reportType: "stage" }), REGISTRY);
    const defect = buildReport(LEDGER, input({ reportType: "defect" }), REGISTRY);
    const size = buildReport(LEDGER, input({ reportType: "size" }), REGISTRY);
    expect(fund.ok && fund.model.fundamentals && !fund.model.stage && !fund.model.defect && !fund.model.size).toBe(true);
    expect(stage.ok && stage.model.stage && !stage.model.fundamentals && !stage.model.defect && !stage.model.size).toBe(true);
    expect(defect.ok && defect.model.defect && !defect.model.fundamentals && !defect.model.stage && !defect.model.size).toBe(true);
    expect(size.ok && size.model.size && !size.model.fundamentals && !size.model.stage && !size.model.defect).toBe(true);
  });

  it("header includes exact dates and Date of Entry", () => {
    const built = buildReport(LEDGER, input(), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.identity.dateFrom).toBe("2025-04-01");
    expect(built.model.identity.dateTo).toBe("2026-03-31");
    expect(built.model.identity.dateBasisLabel).toBe("Date of Entry");
    expect(built.model.identity.periodCaption).toBe("FY 2025–26");
  });

  it("preview and print share one resolved model (same generatedAt)", () => {
    const built = buildReport(LEDGER, input({ generatedAt: "2026-09-02T12:00:00.000Z" }), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.identity.generatedAt).toBe("2026-09-02T12:00:00.000Z");
    expect(built.scope.dateFrom).toBe(built.model.identity.dateFrom);
  });

  it("contains no hardcoded forensic claims", () => {
    const built = buildReport(LEDGER, input(), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(modelContainsForbiddenClaim(built.model)).toBeNull();
    const blob = JSON.stringify(built.model);
    expect(blob).not.toMatch(/CAPA-P01-26/);
    expect(blob).not.toMatch(/COMPLIANT/);
    expect(blob).not.toMatch(/simulated leak/i);
    expect(blob).not.toMatch(/automatically escalated/i);
  });

  it("empty reports cannot export as audit evidence", () => {
    const built = buildReport([], input(), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.validation.canExport).toBe(false);
    expect(built.model.validation.blockers.length).toBeGreaterThan(0);
  });

  it("stage contribution uses cumulative rejected as denominator", () => {
    const built = buildReport(LEDGER, input({ reportType: "stage" }), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const rows = built.model.stage!.rows.filter((r) => r.status === "has-records" && !r.unmapped);
    const denom = built.model.stage!.rejectedDenominator;
    const sum = rows.reduce((a, r) => a + (r.contributionPct ?? 0), 0);
    expect(denom).toBeGreaterThan(0);
    expect(sum).toBeGreaterThan(99);
    expect(sum).toBeLessThan(101);
    expect(rows.some((r) => r.stageId === "visual")).toBe(true);
  });

  it("unknown stages are not dropped", () => {
    const extra = ev({
      recordedAt: "2025-04-20T08:00:00.000Z",
      eventType: "production",
      stageId: "mystery-gate",
      qty: 5,
    });
    const built = buildReport([...LEDGER, extra], input({ reportType: "stage" }), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.stage!.rows.some((r) => r.stageId === "mystery-gate")).toBe(true);
  });

  it("defect Pareto includes Unclassified and unresolved raw codes", () => {
    const built = buildReport(LEDGER, input({ reportType: "defect" }), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const rows = built.model.defect!.rows;
    expect(rows.some((r) => r.kind === "unclassified")).toBe(true);
    expect(rows.some((r) => r.kind === "unresolved-raw" && r.label === "Overlaping")).toBe(true);
    expect(rows.every((r) => r.label !== "DEF-UNKNOWN" && r.defectCode !== "UNKNOWN")).toBe(true);
    const last = rows[rows.length - 1];
    expect(last.cumPct).toBeGreaterThan(99.9);
    expect(last.cumPct).toBeLessThan(100.1);
  });

  it("size unclassified row and no fabricated default size", () => {
    const built = buildReport(LEDGER, input({ reportType: "size" }), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.size!.rows.some((r) => r.unclassified)).toBe(true);
    expect(built.model.size!.rows.every((r) => r.size !== "DEFAULT" && r.size !== "N/A")).toBe(true);
    expect(built.model.size!.missingSizeEventCount).toBeGreaterThan(0);
  });

  it("zero rejection contribution is safe", () => {
    const onlyProd = [
      ev({ recordedAt: "2025-08-01T08:00:00.000Z", eventType: "production", qty: 50 }),
    ];
    const built = buildReport(onlyProd, input({ reportType: "stage" }), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.model.stage!.rejectedDenominator).toBe(0);
    for (const r of built.model.stage!.rows) {
      expect(r.contributionPct === 0 || r.contributionPct == null).toBe(true);
    }
  });

  it("filename includes type, FY, and generation date", () => {
    const built = buildReport(LEDGER, input(), REGISTRY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const name = reportFilename(built.model);
    expect(name).toMatch(/FY-Audit-Pack/);
    expect(name).toMatch(/FY-2025-26/);
    expect(name).toMatch(/2026-09-02/);
    expect(name).not.toMatch(/\s/);
  });

  it("custom reversed range is rejected before build", () => {
    const built = buildReport(
      LEDGER,
      input({ periodMode: "custom", dateFrom: "2026-01-01", dateTo: "2025-01-01" }),
      REGISTRY,
    );
    expect(built.ok).toBe(false);
  });
});
