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
