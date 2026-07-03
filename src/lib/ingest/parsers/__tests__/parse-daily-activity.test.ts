import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseDailyActivity } from "../parse-daily-activity";

const FILE = join(process.cwd(), "ANALYTICAL DATA", "SIZE WISE REJECTION", "FINAL", "DAILY ACTIVITY REPORT 2026.xlsx");
const has = existsSync(FILE);

(has ? describe : describe.skip)("parseDailyActivity", () => {
  const records = has ? parseDailyActivity(readFileSync(FILE), FILE).records : [];

  it("extracts the full process chain", () => {
    expect(records.length).toBeGreaterThan(0);
    const stageIds = new Set(records.map(r => r.stageId));
    for (const s of ["production","eye-punching","leaching","visual","balloon","valve-integrity","final","balloon-production"]) {
      expect(stageIds.has(s)).toBe(true);
    }
  });

  it("emits whole-line records (size=null) with valid dates", () => {
    expect(records.every(r => r.size === null)).toBe(true);
    expect(records.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.occurredOn.start))).toBe(true);
  });

  it("captures hold for the inspection gates", () => {
    const visual = records.find(r => r.stageId === "visual" && r.rework != null);
    expect(visual).toBeDefined();
  });

  it("skips SUNDAY / WEEKLY marker rows", () => {
    // 2026-04-05 is a Sunday in the source; no record should exist for it.
    expect(records.some(r => r.occurredOn.start === "2026-04-05")).toBe(false);
  });
});

// The client's OWN template changed mid-corpus: early-2025 sheets have no
// HOLD column for Visual/Balloon (3-col CHKD/ACPT/REJ block, not 4-col) and
// no Final/Balloon-Production sections at all — a fixed column-index map
// (the pre-fix implementation) silently read Balloon's CHKD QTY into
// Visual's REJ field on these sheets, producing checked≈rejected nonsense
// (>100% "rejection rates"). This corpus + the exact cell values below are
// the regression anchor for that bug class.
const FILE_2025 = join(process.cwd(), "ANALYTICAL DATA", "SIZE WISE REJECTION", "FINAL", "DAILY ACTIVITY REPORT 2025.xlsx");
const has2025 = existsSync(FILE_2025);

(has2025 ? describe : describe.skip)("parseDailyActivity — pre-July25 3-column template (JAN25)", () => {
  const records = has2025 ? parseDailyActivity(readFileSync(FILE_2025), FILE_2025).records : [];
  const jan25 = records.filter(r => r.source.sheet === "JAN25");

  it("reads Visual's own REJ column, not Balloon's CHKD QTY — 2025-01-02 anchor row", () => {
    // Hand-verified against the raw sheet: row for serial 45659 (2025-01-02),
    // Visual block cols 13/14/15 = CHKD 3228, ACPT 2962, REJ 270. The old
    // fixed map instead read col 16 (Balloon's CHKD QTY, 1204) as Visual's REJ.
    const visual = jan25.find(r => r.stageId === "visual" && r.occurredOn.start === "2025-01-02");
    expect(visual?.checked?.value).toBe(3228);
    expect(visual?.rejected?.value).toBe(270);
  });

  it("reads Balloon's own CHKD/REJ columns, not Valve Integrity's — same anchor row", () => {
    // Balloon block cols 16/17/18 = CHKD 1204, ACPT 1112, REJ 92. The old
    // fixed map instead read col 17 (Balloon's own ACPT) as checked and col
    // 20 (Valve Integrity's CHKD QTY, 776) as Balloon's REJ.
    const balloon = jan25.find(r => r.stageId === "balloon" && r.occurredOn.start === "2025-01-02");
    expect(balloon?.checked?.value).toBe(1204);
    expect(balloon?.rejected?.value).toBe(92);
  });

  it("never produces a stage·month rejection rate above 100% for this sheet", () => {
    const byStage = new Map<string, { checked: number; rejected: number }>();
    for (const r of jan25) {
      const s = byStage.get(r.stageId) ?? { checked: 0, rejected: 0 };
      s.checked += r.checked?.value ?? 0;
      s.rejected += r.rejected?.value ?? 0;
      byStage.set(r.stageId, s);
    }
    for (const [stageId, s] of byStage) {
      if (s.checked === 0) continue;
      expect(s.rejected / s.checked).toBeLessThan(1);
    }
  });

  it("does not silently drop Balloon Testing due to the client's 'INSEPTION' misspelling", () => {
    // JAN25's own header spells it "BALOON INSEPTION" (missing the C) — stage
    // matching must key off the stage-name stem, not the inspection suffix.
    expect(jan25.some(r => r.stageId === "balloon")).toBe(true);
  });
});

(has2025 ? describe : describe.skip)("parseDailyActivity — duplicate weekly-rollup sheets", () => {
  const records = has2025 ? parseDailyActivity(readFileSync(FILE_2025), FILE_2025).records : [];

  it("excludes '*WEEKLY REPORT*' sheets, which duplicate an already-present monthly sheet's dates", () => {
    // "JAN WEEKLY REPORT 25-26" covers the exact same 31 days as "JAN 2026" —
    // counting both would double every stage's checked/rejected for January.
    expect(records.some(r => r.source.sheet === "JAN WEEKLY REPORT 25-26")).toBe(false);
    expect(records.some(r => r.source.sheet === "WEEKLY REPORT 25-26")).toBe(false);
    expect(records.some(r => r.source.sheet === "JAN 2026")).toBe(true);
  });
});
