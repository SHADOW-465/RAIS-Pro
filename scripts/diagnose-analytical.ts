/**
 * DIAGNOSTIC (throwaway) — runs the REAL live ingestion pipeline over the
 * "ANALYTICAL DATA" folder exactly like seedFromDisk(), then computes the
 * dashboard KPIs via the analytics selectors, and compares them to the
 * ground-truth summary sheets embedded in the workbooks.
 *
 * Run: npx tsx scripts/diagnose-analytical.ts
 */
import * as XLSX from "xlsx";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { recordsFromBuffer } from "../src/lib/store/seed";
import { dedupeByPrecedence } from "../src/lib/ingest/parsers";
import { emitMany } from "../src/lib/ingest/emit";
import {
  aggregate,
  rejectionRate,
  totalChecked,
  totalRejected,
  fpy,
  byStage,
  byDefect,
  canonicalizeEvents,
  DEFAULT_SCOPE,
} from "../src/lib/analytics";

const ROOT = join(process.cwd(), "ANALYTICAL DATA");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e.startsWith("~$")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.toLowerCase().endsWith(".xlsx")) out.push(p);
  }
  return out;
}

// ── 1. Run the live seed pipeline ────────────────────────────────────────────
const files = existsSync(ROOT) ? walk(ROOT) : [];
console.log(`Found ${files.length} xlsx files under ANALYTICAL DATA\n`);

const all: any[] = [];
const perFamily = new Map<string, number>();
for (const f of files) {
  try {
    const recs = recordsFromBuffer(readFileSync(f), f);
    all.push(...recs);
    for (const r of recs) perFamily.set(r.family, (perFamily.get(r.family) ?? 0) + 1);
  } catch (e) {
    console.log(`  skip ${f.split(/[\\/]/).pop()}: ${(e as Error).message}`);
  }
}
console.log("Records parsed by family:", Object.fromEntries(perFamily));

const { kept, shadowed, claims } = dedupeByPrecedence(all);
console.log(`Dedupe: kept=${kept.length} shadowed=${shadowed.length} claims=${claims.length}`);

const events = emitMany(kept.map((p: any) => p.record));
const byType = new Map<string, number>();
for (const ev of events) byType.set(ev.eventType, (byType.get(ev.eventType) ?? 0) + 1);
console.log("Events by type:", Object.fromEntries(byType), "\n");

// ── 2. Compute dashboard KPIs (all-data scope) ───────────────────────────────
const scope = { ...DEFAULT_SCOPE };
const agg = aggregate(events);
const v = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x);
console.log("=== WHAT THE DASHBOARD COMPUTES (analytics selectors) ===");
console.log("aggregate:", agg);
console.log("rejectionRate:", (v(rejectionRate(events, scope)) * 100).toFixed(3) + "%");
console.log("totalChecked:", v(totalChecked(events, scope)).toLocaleString());
console.log("totalRejected:", v(totalRejected(events, scope)).toLocaleString());
console.log("fpy:", (v(fpy(events, scope)) * 100).toFixed(3) + "%");
console.log("byStage:");
for (const s of byStage(events, scope)) {
  const { checked, rejected, rejRate, label } = s as any;
  console.log(`    ${label}: checked=${checked?.toLocaleString?.()} rejected=${rejected} rejRate=${(rejRate * 100).toFixed(2)}%`);
}
console.log("byDefect (top 6):");
for (const d of byDefect(events, scope).slice(0, 6)) {
  const { label, rejected, pct } = d as any;
  console.log(`    ${label}: rejected=${rejected} pct=${pct?.toFixed?.(1)}%`);
}

// monthly Σ-stage rate computed by the system → should match YEARLY sheet
console.log("\nSystem monthly Total Rejection % (Σ stage rate, should match YEARLY below):");
const months = [...new Set(events.map((e: any) => e.occurredOn.start.slice(0, 7)))].sort();
for (const mo of months) {
  const sc = { grain: "month" as const, dateFrom: mo + "-01", dateTo: mo + "-31" };
  console.log(`    ${mo}: ${(v(rejectionRate(events, sc)) * 100).toFixed(2)}%`);
}

// ── 3. Double-count probe: same stage+date with size=null AND size=FrN ────────
const keyNull = new Set<string>();
const keySized = new Set<string>();
for (const p of all) {
  const r = p.record;
  const k = `${r.stageId}|${r.occurredOn.start}`;
  if (r.size) keySized.add(k);
  else keyNull.add(k);
}
let overlap = 0;
for (const k of keySized) if (keyNull.has(k)) overlap++;
console.log(`\nDouble-count probe: stage+date combos present BOTH unsized and per-size = ${overlap}`);
console.log(`  (these survive dedupe because key includes size → checked/rejected counted twice)`);

// ── 3b. ROBUSTNESS: canonicalizer must hold the line vs raw overlaps & dupes ──
console.log("\n=== ROBUSTNESS: read-side canonicalizer (no seed dedup) ===");
const rawEvents = emitMany(all.map((p: any) => p.record)); // EVERY record, overlaps included
const kpi = (evts: any[]) => {
  const sc = { ...DEFAULT_SCOPE };
  return {
    rate: +(v(rejectionRate(evts, sc)) * 100).toFixed(4),
    checked: v(totalChecked(evts, sc)),
    rejected: v(totalRejected(evts, sc)),
    fpy: +(v(fpy(evts, sc)) * 100).toFixed(4),
  };
};
const canonOnce = kpi(canonicalizeEvents(rawEvents));
const canonDoubled = kpi(canonicalizeEvents([...rawEvents, ...rawEvents])); // ledger doubled
console.log("raw events:", rawEvents.length, "→ canonical:", canonicalizeEvents(rawEvents).length);
console.log("KPIs on canonical(raw)    :", JSON.stringify(canonOnce));
console.log("KPIs on canonical(raw×2)  :", JSON.stringify(canonDoubled));
console.log("STABLE under doubling?    :", JSON.stringify(canonOnce) === JSON.stringify(canonDoubled) ? "✅ YES (no double-count)" : "❌ NO");
console.log("Matches seed-dedup path?  :", canonOnce.checked === v(totalChecked(events, scope)) ? "✅ YES" : `⚠ differs (canon=${canonOnce.checked} seed=${v(totalChecked(events, scope))})`);

// ── 4. GROUND TRUTH from the embedded summary sheets ─────────────────────────
console.log("\n=== GROUND TRUTH (embedded summary sheets) ===");

// 4a. YEARLY ANALYSIS — the client's own FY monthly trend (Total% = sum of stage %s)
const yearly = files.find((f) => /YEARLY ANALYSIS/i.test(f));
if (yearly) {
  const wb = XLSX.read(readFileSync(yearly));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
  console.log("YEARLY ANALYSIS monthly Total Rejection % (client definition = Σ stage %):");
  for (const row of grid.slice(1)) {
    if (typeof row[0] === "number") {
      const iso = new Date(Math.round((row[0] - 25569) * 86400000)).toISOString().slice(0, 7);
      console.log(`   ${iso}: total=${Number(row[5]).toFixed(2)}%  (V=${Number(row[1]).toFixed(2)} Bal=${Number(row[2]).toFixed(2)} Valve=${Number(row[3]).toFixed(2)} Final=${Number(row[4]).toFixed(2)})`);
    }
  }
}

// 4b. April raw stage sheets — true checked/rejected counts per stage
const april = files.find((f) => /01 REJECTION ANALYSIS-APRIL 2025/i.test(f));
if (april) {
  const wb = XLSX.read(readFileSync(april));
  console.log("\nAPRIL 2025 true per-stage totals (raw daily sheets, summing QUANTITY CHECKED / REJECTION):");
  for (const sn of ["VISUAL", "BALLOON INSPECTION", "VALVE INTEGRITY", "FINAL Inspe  REJECTION"]) {
    const ws = wb.Sheets[sn];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
    let chk = 0, rej = 0;
    for (const row of grid.slice(2)) {
      // col A=date serial, B=checked, C=rejection
      if (typeof row[0] === "number" && row[0] > 40000 && row[0] < 60000) {
        if (typeof row[1] === "number") chk += row[1];
        if (typeof row[2] === "number") rej += row[2];
      }
    }
    const rate = chk ? ((rej / chk) * 100).toFixed(3) : "n/a";
    console.log(`   ${sn.padEnd(22)} checked=${chk}  rejected=${rej}  stageRate=${rate}%`);
  }
}
