/**
 * DIAGNOSTIC (throwaway) — drill into why 2025-01 / 2025-02 / 2026-01 show
 * >100% "Σ-stage rejection rate" while every neighboring month is believable.
 * Run: npx tsx scripts/audit-month-anomaly.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { recordsFromBuffer } from "../src/lib/store/seed";
import { dedupeByPrecedence } from "../src/lib/ingest/parsers";
import { emitMany } from "../src/lib/ingest/emit";
import { canonicalizeEvents, byStage, DEFAULT_SCOPE } from "../src/lib/analytics";

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

const files = existsSync(ROOT) ? walk(ROOT) : [];
const all: any[] = [];
for (const f of files) {
  try {
    const recs = recordsFromBuffer(readFileSync(f), f);
    for (const r of recs) all.push({ ...r, __file: f });
  } catch {}
}

for (const targetMonth of ["2025-01", "2025-02", "2026-01"]) {
  console.log(`\n\n########## ${targetMonth} ##########`);
  const inMonth = all.filter((p) => p.record.occurredOn.start.startsWith(targetMonth));
  console.log(`raw preceded records touching this month: ${inMonth.length}`);

  const byFileFamily = new Map<string, number>();
  for (const p of inMonth) {
    const k = `${p.family} :: ${p.__file.split(/[\\/]/).pop()} :: sheet=${p.record.source.sheet}`;
    byFileFamily.set(k, (byFileFamily.get(k) ?? 0) + 1);
  }
  console.log("by file/sheet/family:");
  for (const [k, n] of byFileFamily) console.log(`  ${n.toString().padStart(4)}  ${k}`);

  const byStageRaw = new Map<string, { checked: number; rejected: number; recs: number }>();
  for (const p of inMonth) {
    const r = p.record;
    const s = byStageRaw.get(r.stageId) ?? { checked: 0, rejected: 0, recs: 0 };
    s.checked += r.checked?.value ?? 0;
    s.rejected += r.rejected?.value ?? 0;
    s.recs += 1;
    byStageRaw.set(r.stageId, s);
  }
  console.log("raw per-stage sums (pre-dedup, pre-canonicalize):");
  for (const [stage, s] of byStageRaw) {
    console.log(`  ${stage.padEnd(20)} checked=${s.checked}  rejected=${s.rejected}  records=${s.recs}  rate=${s.checked ? ((s.rejected / s.checked) * 100).toFixed(1) : "n/a"}%`);
  }
}

// Now the FULL canonical pipeline's per-stage numbers for these months, to see
// what survives dedup/canonicalize into the number that produced the >100%.
const { kept } = dedupeByPrecedence(all);
const events = canonicalizeEvents(emitMany(kept.map((p: any) => p.record)));
for (const targetMonth of ["2025-01", "2025-02", "2026-01"]) {
  console.log(`\n\n=== CANONICAL byStage for ${targetMonth} ===`);
  const sc = { ...DEFAULT_SCOPE, dateFrom: targetMonth + "-01", dateTo: targetMonth + "-31" };
  for (const s of byStage(events, sc) as any[]) {
    if (s.checked === 0 && s.rejected === 0) continue;
    console.log(`  ${s.label.padEnd(20)} checked=${s.checked}  rejected=${s.rejected}  rejRate=${(s.rejRate * 100).toFixed(2)}%`);
  }
}
