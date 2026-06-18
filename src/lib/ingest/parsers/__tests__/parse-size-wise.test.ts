// src/lib/ingest/parsers/__tests__/parse-size-wise.test.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseSizeWise } from "../parse-size-wise";

const VALVE_FILE = join(process.cwd(), "ANALYTICAL DATA", "SIZE WISE REJECTION", "VALVE INTEGRITY", "1 APRIL 26.xlsx");
const VISUAL_FILE = join(process.cwd(), "ANALYTICAL DATA", "SIZE WISE REJECTION", "VISUAL", "1 APRIL 26.xlsx");

const hasValve = existsSync(VALVE_FILE);
const hasVisual = existsSync(VISUAL_FILE);

describe("parseSizeWise", () => {
  if (hasValve) {
    it("parses VALVE INTEGRITY side-by-side cumulative sheet", () => {
      const records = parseSizeWise(readFileSync(VALVE_FILE), VALVE_FILE);
      expect(records.length).toBeGreaterThan(0);
      const balloon = records.filter(r => r.stageId === "balloon");
      const valve = records.filter(r => r.stageId === "valve-integrity");
      expect(balloon.length).toBeGreaterThan(0);
      expect(valve.length).toBeGreaterThan(0);
      expect(records.every(r => r.occurredOn.start.startsWith("2026-04-"))).toBe(true);
      expect(records.every(r => r.size != null)).toBe(true);
    });
  }

  if (hasVisual) {
    it("parses VISUAL per-size sheets", () => {
      const records = parseSizeWise(readFileSync(VISUAL_FILE), VISUAL_FILE);
      expect(records.length).toBeGreaterThan(0);
      expect(records.every(r => r.stageId === "visual")).toBe(true);
      expect(records.every(r => r.occurredOn.start.startsWith("2026-04-"))).toBe(true);
      expect(records.every(r => r.size != null)).toBe(true);
    });
  }
});
