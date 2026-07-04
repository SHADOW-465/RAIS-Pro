// src/lib/ingest/parsers/__tests__/parse-assembly-daily.test.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseAssemblyDaily } from "../parse-assembly-daily";

const FILE = join(process.cwd(), "DATA", "ASSEMBLY REJECTION REPORT.xlsx");
const maybe = existsSync(FILE) ? describe : describe.skip;

maybe("parseAssemblyDaily (golden, APRIL 25)", () => {
  const { records } = parseAssemblyDaily(readFileSync(FILE), "ASSEMBLY REJECTION REPORT.xlsx");
  const april = records.filter((r) => r.occurredOn.start.startsWith("2025-04"));

  const sum = (stage: string, pick: (r: any) => number | null) =>
    april.filter((r) => r.stageId === stage).reduce((s, r) => s + (pick(r) ?? 0), 0);

  it("totals visual rejected to the sheet's total row", () => {
    expect(sum("visual", (r) => r.rejected?.value)).toBe(19271);
    expect(sum("visual", (r) => r.checked?.value)).toBe(247767);
  });
  it("totals balloon + valve + final rejected", () => {
    expect(sum("balloon", (r) => r.rejected?.value)).toBe(1910);
    expect(sum("valve-integrity", (r) => r.rejected?.value)).toBe(6101);
    expect(sum("final", (r) => r.rejected?.value)).toBe(5900);
  });
  it("skips SUNDAY/WEEK/Total marker rows (no record on those)", () => {
    expect(april.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.occurredOn.start))).toBe(true);
  });
});

// Nov/Dec 2025 and Jan 2026 sheets insert an "EYE PUNCHING QTY/ACPT/REJ"
// block before Visual — shifting every later stage's columns right by 4. A
// fixed column-index map (the pre-fix implementation) read Eye-Punching's
// data as Visual's, Visual's as Balloon's, Balloon's as Valve Integrity's,
// and — worse — Valve Integrity's ACCEPT column as Final's REJECTED count.
// This regression anchor is hand-verified against the sheet's own embedded
// per-day REJ% values and its TOTAL REJ QTY cross-check (265+824+244+99+639
// = 2071, matching the sheet's own total exactly).
maybe("parseAssemblyDaily — shifted layout (DECEMBER 25)", () => {
  const { records } = parseAssemblyDaily(readFileSync(FILE), "ASSEMBLY REJECTION REPORT.xlsx");
  const dec1 = (stageId: string) => records.find((r) => r.stageId === stageId && r.occurredOn.start === "2025-12-01");

  it("reads Visual's own block, not Eye-Punching's", () => {
    const visual = dec1("visual");
    expect(visual?.checked?.value).toBe(6742);
    expect(visual?.rejected?.value).toBe(824);
  });

  it("reads Balloon's own block, not Visual's", () => {
    const balloon = dec1("balloon");
    expect(balloon?.checked?.value).toBe(5518);
    expect(balloon?.rejected?.value).toBe(244);
  });

  it("reads Valve Integrity's own block, not Balloon's", () => {
    const valve = dec1("valve-integrity");
    expect(valve?.checked?.value).toBe(5276);
    expect(valve?.rejected?.value).toBe(99);
  });

  it("reads Final's own REJECTION column, not Valve Integrity's ACCEPT column", () => {
    const final = dec1("final");
    expect(final?.checked?.value).toBe(5806);
    expect(final?.rejected?.value).toBe(639); // pre-fix this read 5177 (Valve's ACCEPT QTY)
  });

  it("never produces a stage·month rejection rate above 100% for this sheet", () => {
    const dec = records.filter((r) => r.occurredOn.start.startsWith("2025-12"));
    const byStage = new Map<string, { checked: number; rejected: number }>();
    for (const r of dec) {
      const s = byStage.get(r.stageId) ?? { checked: 0, rejected: 0 };
      s.checked += r.checked?.value ?? 0;
      s.rejected += r.rejected?.value ?? 0;
      byStage.set(r.stageId, s);
    }
    for (const [, s] of byStage) {
      if (s.checked === 0) continue;
      expect(s.rejected / s.checked).toBeLessThan(1);
    }
  });
});
