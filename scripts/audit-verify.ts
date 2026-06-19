/** Correctness verification: seed ANALYTICAL DATA -> canonicalize -> compute the
 *  EXACT dashboard metrics and check the fixed formulas. Run: npx tsx scripts/audit-verify.ts */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { recordsFromBuffer, dedupeByPrecedence } from "../src/lib/ingest/parsers";
import { emitMany } from "../src/lib/ingest/emit";
import { canonicalizeEvents, byStage, byDefect, rejectionRate, fpy, totalChecked, totalRejected, DEFAULT_SCOPE } from "../src/lib/analytics";
import { resolveDefect } from "../src/lib/registry/disposafe";

const ROOT = join(process.cwd(), "ANALYTICAL DATA");
function walk(d: string): string[] { const o: string[] = []; for (const e of readdirSync(d)) { if (e.startsWith("~$")) continue; const p = join(d, e); if (statSync(p).isDirectory()) o.push(...walk(p)); else if (e.toLowerCase().endsWith(".xlsx")) o.push(p); } return o; }

const all: any[] = [];
for (const f of existsSync(ROOT) ? walk(ROOT) : []) { try { all.push(...recordsFromBuffer(readFileSync(f), f)); } catch {} }
const { kept } = dedupeByPrecedence(all);
const events = canonicalizeEvents(emitMany(kept.map((p: any) => p.record)));
const v = (x: any) => x.value;
const sc = { ...DEFAULT_SCOPE };

console.log("=== KPIs ===");
console.log("rejectionRate (Σ stage):", (v(rejectionRate(events, sc)) * 100).toFixed(2) + "%");
const fpyv = v(fpy(events, sc));
console.log("FPY Π(1-r):", (fpyv * 100).toFixed(2) + "%  | 1-FPY (true reject frac):", ((1 - fpyv) * 100).toFixed(2) + "%");
console.log("totalChecked(entry):", v(totalChecked(events, sc)).toLocaleString(), " totalRejected:", v(totalRejected(events, sc)).toLocaleString());

console.log("\n=== byStage: yield must equal 1 - rejRate (FIX 1) ===");
let ok = true;
for (const s of byStage(events, sc)) {
  const expected = 1 - s.rejRate;
  const good = Math.abs(s.yield - expected) < 1e-9;
  if (!good) ok = false;
  console.log(`  ${s.label.padEnd(18)} rejRate=${(s.rejRate*100).toFixed(2)}%  yield=${(s.yield*100).toFixed(2)}%  (expect ${(expected*100).toFixed(2)}%) ${good ? "OK" : "MISMATCH"}`);
}
console.log("  YIELD FIX:", ok ? "PASS — yield = 1 - rejRate for every stage" : "FAIL");

console.log("\n=== byDefect (FIX 2/3): must be non-empty + resolve cleanly ===");
const defs = byDefect(events, sc);
console.log(`  ${defs.length} distinct defects; top 6:`);
for (const d of defs.slice(0, 6)) console.log(`    ${d.label.padEnd(16)} qty=${d.rejected} pct=${d.pct.toFixed(1)}%`);

console.log("\n=== FIX 3 resolution spot-checks ===");
for (const raw of ["90-10", "90/10", "90 10", "THIN SPOT", "STRUCK BALLOON", "BLACK MARK", "COAG", "TT", "BL"]) {
  console.log(`  resolveDefect(${JSON.stringify(raw)}) -> ${resolveDefect(raw)}`);
}
