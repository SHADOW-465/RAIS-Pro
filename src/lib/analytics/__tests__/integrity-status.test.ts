import {
  scopeIntegrityIssues,
  hasOpenCriticalIntegrity,
  integrityAuditHref,
  integrityFixHref,
  integrityIssueId,
  parseIntegrityFocus,
  rowMatchesIntegrityFocus,
} from "../integrity";
import { qualityStatus, priorPeriodScope } from "../status";
import {
  parseInvestigationState,
  serializeInvestigationState,
  investigationKey,
  investigationHref,
  investigationToTweaksPatch,
} from "../investigation-state";
import type { Event } from "@/lib/store/types";

function base(opts: {
  eventType: Event["eventType"];
  eventId: string;
  quantity?: number;
  stageId?: string;
  size?: string | null;
  disposition?: string;
  day?: string;
  batch?: string;
}): Event {
  const day = opts.day ?? "2026-07-01";
  return {
    eventId: opts.eventId,
    schemaVersion: "1.0.0",
    ingestionId: "ing-1",
    eventType: opts.eventType,
    occurredOn: { kind: "day", start: day, end: day },
    provenance: {
      file: "t.xlsx",
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
    extractedBy: "direct-entry",
    recordedAt: "2026-07-01T00:00:00.000Z",
    supersededBy: null,
    stageId: opts.stageId,
    size: opts.size ?? null,
    quantity: opts.quantity ?? 0,
    unit: "pcs",
    batchNo: opts.batch ?? null,
    disposition: opts.disposition,
    customFields: opts.batch ? { batch: opts.batch } : undefined,
  } as unknown as Event;
}

describe("scopeIntegrityIssues", () => {
  it("flags V-004 when defect sum ≠ rejected", () => {
    const events = [
      base({
        eventId: "r1",
        eventType: "inspection",
        stageId: "visual",
        disposition: "rejected",
        quantity: 15,
      }),
      base({
        eventId: "d1",
        eventType: "rejection",
        stageId: "visual",
        quantity: 10,
      }),
      base({
        eventId: "d2",
        eventType: "rejection",
        stageId: "visual",
        quantity: 2,
      }),
    ];
    const issues = scopeIntegrityIssues(events, { grain: "month" });
    expect(issues.some((i) => i.code === "V-004" && i.severity === "critical")).toBe(true);
    expect(hasOpenCriticalIntegrity(events, { grain: "month" })).toBe(true);
  });

  it("passes when defect sum matches rejected", () => {
    const events = [
      base({
        eventId: "r1",
        eventType: "inspection",
        stageId: "visual",
        disposition: "rejected",
        quantity: 12,
      }),
      base({
        eventId: "d1",
        eventType: "rejection",
        stageId: "visual",
        quantity: 12,
      }),
    ];
    expect(scopeIntegrityIssues(events, { grain: "month" })).toEqual([]);
  });

  it("flags V-014 mass-balance hop", () => {
    const events = [
      base({
        eventId: "p1",
        eventType: "production",
        stageId: "visual",
        quantity: 1000,
      }),
      base({
        eventId: "rj1",
        eventType: "inspection",
        stageId: "visual",
        disposition: "rejected",
        quantity: 100,
      }),
      // available 900; balloon checks 960
      base({
        eventId: "p2",
        eventType: "production",
        stageId: "balloon",
        quantity: 960,
      }),
    ];
    const issues = scopeIntegrityIssues(events, { grain: "month" });
    expect(issues.some((i) => i.code === "V-014" && i.stageId === "balloon")).toBe(true);
  });

  it("includes open critical findings when provided", () => {
    const issues = scopeIntegrityIssues([], { grain: "month" }, {
      openFindings: [
        {
          ruleId: "V-010",
          severity: "critical",
          state: "open",
          question: "Value conflict on visual for 2026-07-01",
          occurredOn: { start: "2026-07-01", end: "2026-07-01" },
        },
      ],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("V-010");
  });
});

describe("integrity deep-link focus", () => {
  const sample = {
    code: "V-004" as const,
    severity: "critical" as const,
    message: "Defect reasons add up to 12, not the 15 rejected at visual on 2026-07-01.",
    stageId: "visual",
    date: "2026-07-01",
    size: "16FR",
    batch: "25A28",
    stated: 15,
    computed: 12,
  };

  it("builds audit href with coordinates", () => {
    const href = integrityAuditHref(sample);
    expect(href.startsWith("/audit?")).toBe(true);
    const q = new URLSearchParams(href.split("?")[1]);
    expect(q.get("view")).toBe("batch");
    expect(q.get("range")).toBe("all");
    expect(q.get("code")).toBe("V-004");
    expect(q.get("stage")).toBe("visual");
    expect(q.get("date")).toBe("2026-07-01");
    expect(q.get("batch")).toBe("25A28");
    expect(q.get("size")).toBe("16FR");
  });

  it("builds data-entry fix href with batch", () => {
    expect(integrityFixHref(sample)).toBe("/data-entry?batch=25A28&date=2026-07-01&stage=visual");
  });

  it("round-trips parseIntegrityFocus", () => {
    const href = integrityAuditHref(sample);
    const q = new URLSearchParams(href.split("?")[1]);
    const focus = parseIntegrityFocus(q);
    expect(focus).not.toBeNull();
    expect(focus!.code).toBe("V-004");
    expect(focus!.batch).toBe("25A28");
    expect(focus!.stageId).toBe("visual");
    expect(focus!.date).toBe("2026-07-01");
  });

  it("matches rows by date·stage·size", () => {
    const focus = parseIntegrityFocus(new URLSearchParams(integrityAuditHref(sample).split("?")[1]))!;
    expect(
      rowMatchesIntegrityFocus(
        { date: "2026-07-01", size: "16FR", stageId: "visual", batch: "25A28" },
        focus
      )
    ).toBe(true);
    expect(
      rowMatchesIntegrityFocus(
        { date: "2026-07-02", size: "16FR", stageId: "visual", batch: "25A28" },
        focus
      )
    ).toBe(false);
  });

  it("stable issue id", () => {
    expect(integrityIssueId(sample)).toBe("V-004|visual|2026-07-01|16FR|25A28");
  });
});

describe("qualityStatus integrity gate", () => {
  it("returns blocked when critical integrity is open — never ok", () => {
    const events = [
      base({
        eventId: "p1",
        eventType: "production",
        stageId: "visual",
        quantity: 1000,
      }),
      base({
        eventId: "r1",
        eventType: "inspection",
        stageId: "visual",
        disposition: "rejected",
        quantity: 15,
      }),
      base({
        eventId: "d1",
        eventType: "rejection",
        stageId: "visual",
        quantity: 10,
      }),
    ];
    // Low rejection rate (1.5%) would be "ok" without integrity gate
    const status = qualityStatus(events, { grain: "month" }, {
      targetLimit: 0.10,
      watchLimit: 0.05,
    });
    expect(status.state).toBe("blocked");
    expect(status.integrityIssues.length).toBeGreaterThan(0);
    expect(status.reason).toMatch(/integrity blocked/i);
  });

  it("returns ok when clean and rate within watch", () => {
    const events = [
      base({
        eventId: "p1",
        eventType: "production",
        stageId: "visual",
        quantity: 1000,
      }),
      base({
        eventId: "r1",
        eventType: "inspection",
        stageId: "visual",
        disposition: "rejected",
        quantity: 20,
      }),
      base({
        eventId: "d1",
        eventType: "rejection",
        stageId: "visual",
        quantity: 20,
      }),
    ];
    const status = qualityStatus(events, { grain: "month" }, {
      targetLimit: 0.10,
      watchLimit: 0.05,
    });
    expect(status.state).toBe("ok");
    expect(status.rate).toBeCloseTo(0.02, 5);
  });

  it("returns at-risk when rate exceeds target and integrity is clean", () => {
    const events = [
      base({
        eventId: "p1",
        eventType: "production",
        stageId: "visual",
        quantity: 100,
      }),
      base({
        eventId: "r1",
        eventType: "inspection",
        stageId: "visual",
        disposition: "rejected",
        quantity: 20,
      }),
      base({
        eventId: "d1",
        eventType: "rejection",
        stageId: "visual",
        quantity: 20,
      }),
    ];
    const status = qualityStatus(events, { grain: "month" }, {
      targetLimit: 0.10,
      watchLimit: 0.05,
    });
    expect(status.state).toBe("at-risk");
  });

  it("includes prior-period comparison when multiple periods exist", () => {
    const events = [
      base({
        eventId: "p-jun",
        eventType: "production",
        stageId: "visual",
        quantity: 1000,
        day: "2026-06-15",
      }),
      base({
        eventId: "r-jun",
        eventType: "inspection",
        stageId: "visual",
        disposition: "rejected",
        quantity: 100,
        day: "2026-06-15",
      }),
      base({
        eventId: "d-jun",
        eventType: "rejection",
        stageId: "visual",
        quantity: 100,
        day: "2026-06-15",
      }),
      base({
        eventId: "p-jul",
        eventType: "production",
        stageId: "visual",
        quantity: 1000,
        day: "2026-07-15",
      }),
      base({
        eventId: "r-jul",
        eventType: "inspection",
        stageId: "visual",
        disposition: "rejected",
        quantity: 30,
        day: "2026-07-15",
      }),
      base({
        eventId: "d-jul",
        eventType: "rejection",
        stageId: "visual",
        quantity: 30,
        day: "2026-07-15",
      }),
    ];
    const prior = priorPeriodScope(events, {
      grain: "month",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });
    expect(prior).not.toBeNull();
    const status = qualityStatus(
      events,
      { grain: "month", dateFrom: "2026-07-01", dateTo: "2026-07-31" },
      { targetLimit: 0.10, watchLimit: 0.05 }
    );
    expect(status.priorRate).not.toBeNull();
    expect(status.reason).toMatch(/prior period/i);
  });
});

describe("investigation state", () => {
  it("round-trips parse/serialize", () => {
    const q = serializeInvestigationState({
      grain: "month",
      from: "2026-06-01",
      to: "2026-06-30",
      stage: "visual",
      size: "Fr16",
      batch: "25A28",
      metric: "rate",
    });
    const parsed = parseInvestigationState(q);
    expect(parsed).toMatchObject({
      grain: "month",
      from: "2026-06-01",
      to: "2026-06-30",
      stage: "visual",
      size: "Fr16",
      batch: "25A28",
      metric: "rate",
    });
    expect(investigationKey(parsed)).toContain("visual");
  });

  it("builds mid-path href with carried scope", () => {
    const href = investigationHref("/stage-analysis", {
      grain: "month",
      from: "2026-07-01",
      to: "2026-07-31",
      stage: "visual",
      metric: "stage",
    });
    expect(href).toContain("/stage-analysis?");
    expect(href).toContain("grain=month");
    expect(href).toContain("stage=visual");
    expect(href).toContain("from=2026-07-01");
  });

  it("maps investigation to tweaks patch", () => {
    expect(
      investigationToTweaksPatch({
        grain: "week",
        from: "2026-07-01",
        to: "2026-07-07",
        stage: "balloon",
      })
    ).toEqual({
      grain: "week",
      datePreset: "custom",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-07",
      stageView: "balloon",
    });
  });
});
