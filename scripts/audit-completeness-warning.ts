/**
 * DIAGNOSTIC (throwaway) — replicate staging/page.tsx's exact completeness
 * check against a real REJECTION ANALYSIS workbook, to confirm/deny whether
 * sheets reported as "not ingested" actually produced records + would reach
 * the ledger. Run: npx tsx scripts/audit-completeness-warning.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as xlsx from "xlsx";
import { recordsFromBuffer } from "../src/lib/ingest/parsers";

const FILE = join(process.cwd(), "ANALYTICAL DATA", "REJECTION ANALYSIS 2025-26", "10 REJECTION ANALYSIS-JANUARY 2026.xlsx");
const buf = readFileSync(FILE);
const wb = xlsx.read(buf, { type: "buffer" });

console.log("Raw wb.SheetNames (what staging/page.tsx compares against):");
console.log(" ", wb.SheetNames);

const preceded = recordsFromBuffer(buf, "10 REJECTION ANALYSIS-JANUARY 2026.xlsx");
console.log(`\nrecordsFromBuffer produced ${preceded.length} records.`);

const consumed = new Set(preceded.map((p: any) => p.record?.source?.sheet).filter(Boolean));
console.log("\nDistinct record.source.sheet values (what the checker builds 'consumed' from):");
console.log(" ", [...consumed]);

const unconsumed = wb.SheetNames.filter((n) => !consumed.has(n));
console.log("\nreplicated staging/page.tsx 'unconsumed' (would be reported as skipped):");
console.log(" ", unconsumed);

// Per-sheet record count, keyed by the ACTUAL raw sheet name (not source.sheet),
// to prove whether each "unconsumed" sheet genuinely produced ledger-bound records.
const byRawSheetGuess = new Map<string, number>();
for (const p of preceded) {
  const src = (p.record as any).source.sheet as string;
  // strip the "<file> - " prefix that from-rejection-sheets.ts's source.sheet carries
  const guess = src.includes(" - ") ? src.slice(src.indexOf(" - ") + 3) : src;
  byRawSheetGuess.set(guess, (byRawSheetGuess.get(guess) ?? 0) + 1);
}
console.log("\nRecords per sheet, keyed by de-prefixed guess of the true sheet name:");
for (const [k, v] of byRawSheetGuess) console.log(`  ${k}: ${v} records`);

console.log("\nCONCLUSION: for each 'unconsumed' (flagged) sheet, does a de-prefixed match exist with real records?");
for (const raw of unconsumed) {
  const n = byRawSheetGuess.get(raw) ?? 0;
  console.log(`  "${raw}": ${n > 0 ? `YES — ${n} records exist, false positive` : "no records at all — genuinely unrecognized"}`);
}
