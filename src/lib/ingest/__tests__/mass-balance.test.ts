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
});
