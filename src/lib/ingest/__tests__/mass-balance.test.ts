import { massBalanceIssues } from "../mass-balance";
import type { StageDayRecord } from "../emit";

function rec(
  stageId: string,
  opts: { checked?: number; accepted?: number; rejected?: number; size?: string; batch?: string; date?: string }
): StageDayRecord {
  const sv = (value: number, f: string) => ({ value, cell: `ENTRY!${f}`, header: f });
  const date = opts.date ?? "2026-07-01";
  return {
    occurredOn: { kind: "day", start: date, end: date },
    stageId,
    size: opts.size ?? null,
    source: { file: "t.xlsx", fileHash: "h", sheet: "S", tableId: "t1" },
    checked: opts.checked != null ? sv(opts.checked, "checked") : null,
    acceptedGood: opts.accepted != null ? sv(opts.accepted, "acceptedGood") : null,
    rework: null,
    rejected: opts.rejected != null ? sv(opts.rejected, "rejected") : null,
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "ing-1",
    customFields: opts.batch ? { batch: opts.batch } : undefined,
  };
}

describe("massBalanceIssues", () => {
  it("passes a clean chain (checked(N+1) ≤ accepted(N))", () => {
    const issues = massBalanceIssues([
      rec("visual", { checked: 1000, accepted: 950, rejected: 50 }),
      rec("balloon", { checked: 950, accepted: 940, rejected: 10 }),
      rec("valve-integrity", { checked: 940, accepted: 930, rejected: 10 }),
      rec("final", { checked: 930, rejected: 5 }),
    ]);
    expect(issues).toEqual([]);
  });

  it("flags a stage checking more than upstream passed forward", () => {
    const issues = massBalanceIssues([
      rec("visual", { checked: 1000, accepted: 900, rejected: 100 }),
      rec("balloon", { checked: 960, rejected: 10 }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "V-014", severity: "critical", stageId: "balloon", stated: 960, computed: 900 });
  });

  it("derives available = checked − rejected when accepted is absent", () => {
    const issues = massBalanceIssues([
      rec("visual", { checked: 1000, rejected: 100 }),   // available 900
      rec("balloon", { checked: 901 }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].computed).toBe(900);
  });

  it("bridges a missing middle gate (data gap does not suppress the check)", () => {
    const issues = massBalanceIssues([
      rec("visual", { checked: 500, accepted: 400 }),
      // no balloon rows this day
      rec("valve-integrity", { checked: 450 }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].stageId).toBe("valve-integrity");
  });

  it("keeps date · size · batch groups independent", () => {
    const issues = massBalanceIssues([
      rec("visual", { checked: 100, accepted: 90, size: "Fr14", batch: "25A28" }),
      rec("balloon", { checked: 95, size: "Fr16", batch: "25A28" }),  // different size → no comparison
      rec("balloon", { checked: 95, size: "Fr14", batch: "25B01" }),  // different batch → no comparison
    ]);
    expect(issues).toEqual([]);
  });

  it("sums multiple rows for the same stage within a group before comparing", () => {
    const issues = massBalanceIssues([
      rec("visual", { checked: 500, accepted: 450 }),
      rec("visual", { checked: 500, accepted: 450 }),
      rec("balloon", { checked: 900 }),   // 900 ≤ 450+450 → fine
    ]);
    expect(issues).toEqual([]);
  });

  it("compares gates of the same lot even when they ran on different days", () => {
    // Balloon on the 4th must still be bounded by Visual accepted on the 1st.
    const issues = massBalanceIssues([
      rec("visual", { checked: 1000, accepted: 900, rejected: 100, date: "2026-08-01", size: "Fr18", batch: "26H01-18" }),
      rec("balloon", { checked: 960, date: "2026-08-04", size: "Fr18", batch: "26H01-18" }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "V-014", stageId: "balloon", stated: 960, computed: 900 });
  });

  it("sums split days at the upstream gate before comparing", () => {
    const issues = massBalanceIssues([
      rec("visual", { checked: 500, accepted: 450, date: "2026-08-01", size: "Fr18", batch: "26H01-18" }),
      rec("visual", { checked: 500, accepted: 450, date: "2026-08-02", size: "Fr18", batch: "26H01-18" }),
      rec("balloon", { checked: 900, date: "2026-08-03", size: "Fr18", batch: "26H01-18" }),
    ]);
    expect(issues).toEqual([]);
  });
});

// Direct entry submits ONE station per save, so the hop can only be checked
// against what the ledger already holds for the lot.
describe("mass balance against stored gates", () => {
  const rec = (stageId: string, checked: number, accepted: number): any => ({
    occurredOn: { kind: "day", start: "2026-08-08", end: "2026-08-08" },
    stageId,
    size: "Fr18",
    source: { file: "Manual Entry", fileHash: "h", sheet: "Day Shift", tableId: "t" },
    checked: { value: checked, cell: "ENTRY!checked", header: "Checked" },
    acceptedGood: accepted ? { value: accepted, cell: "ENTRY!accept", header: "Good" } : null,
    rework: null,
    rejected: null,
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "i1",
    customFields: { batch: "26H25-18" },
  });

  it("catches a gate that checked more than the previous gate passed forward", () => {
    const issues = massBalanceIssues(
      [rec("balloon", 1400, 1400)],
      undefined,
      [{ stageId: "visual", date: "2026-08-08", size: "Fr18", batch: "26H25-18", available: 1163 }],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("V-014");
    expect(issues[0].stageId).toBe("balloon");
    expect(issues[0].message).toContain("237");
  });

  it("stays quiet when the hop is consistent", () => {
    const issues = massBalanceIssues(
      [rec("balloon", 1100, 1100)],
      undefined,
      [{ stageId: "visual", date: "2026-08-08", size: "Fr18", batch: "26H25-18", available: 1163 }],
    );
    expect(issues).toEqual([]);
  });

  it("does not compare across different lots", () => {
    const issues = massBalanceIssues(
      [rec("balloon", 1400, 1400)],
      undefined,
      [{ stageId: "visual", date: "2026-08-08", size: "Fr18", batch: "26H26-18", available: 10 }],
    );
    expect(issues).toEqual([]);
  });

  it("lets a stage in the payload win over the same stage on the ledger", () => {
    const issues = massBalanceIssues(
      [rec("visual", 2000, 2000), rec("balloon", 1400, 1400)],
      undefined,
      [{ stageId: "visual", date: "2026-08-08", size: "Fr18", batch: "26H25-18", available: 10 }],
    );
    expect(issues).toEqual([]);
  });

  it("uses an upstream gate recorded on a different day as the prior", () => {
    const issues = massBalanceIssues(
      [rec("balloon", 1400, 1400)],
      undefined,
      [{ stageId: "visual", date: "2026-08-01", size: "Fr18", batch: "26H25-18", available: 1163 }],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].computed).toBe(1163);
  });

  it("sums earlier days of the same receiving gate with the payload day", () => {
    // Visual passed 1000 forward. Balloon already checked 500 on day 1;
    // day 2 checking 600 would take 1100 through the gate.
    const issues = massBalanceIssues(
      [{ ...rec("balloon", 600, 600), occurredOn: { kind: "day", start: "2026-08-09", end: "2026-08-09" } }],
      undefined,
      [
        { stageId: "visual", date: "2026-08-08", size: "Fr18", batch: "26H25-18", available: 1000, checked: 1000 },
        { stageId: "balloon", date: "2026-08-08", size: "Fr18", batch: "26H25-18", available: 500, checked: 500 },
      ],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].stated).toBe(1100);
    expect(issues[0].computed).toBe(1000);
  });

  it("a restatement of one day does not double-count that day from the ledger", () => {
    const issues = massBalanceIssues(
      [rec("balloon", 400, 400)],
      undefined,
      [
        { stageId: "visual", date: "2026-08-08", size: "Fr18", batch: "26H25-18", available: 1000 },
        { stageId: "balloon", date: "2026-08-08", size: "Fr18", batch: "26H25-18", available: 900 },
      ],
    );
    expect(issues).toEqual([]);
  });
});
