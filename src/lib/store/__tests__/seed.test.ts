// src/lib/store/__tests__/seed.test.ts
import { recordsFromBuffer } from "../seed";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "DATA", "ASSEMBLY REJECTION REPORT.xlsx");
const maybe = existsSync(FILE) ? it : it.skip;

maybe("recordsFromBuffer routes assembly file to real records (no synthetic sizes)", () => {
  const recs = recordsFromBuffer(readFileSync(FILE), "ASSEMBLY REJECTION REPORT.xlsx");
  expect(recs.length).toBeGreaterThan(0);
  expect(recs.every((p) => p.record.size == null)).toBe(true);
  expect(recs.every((p) => p.family === "assembly-daily")).toBe(true);
});
