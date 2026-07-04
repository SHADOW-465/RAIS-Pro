/**
 * DIAGNOSTIC (throwaway) — scan the FULL corpus for any stage·month·family
 * bucket whose rejected/checked rate exceeds 100% (a mathematically
 * impossible value that only a context-loss / column-misalignment bug can
 * produce). Flags WHICH family+file+sheet is responsible, so a fix (if any
 * is warranted) targets exactly the right parser instead of guessing.
 * Run: npx tsx scripts/audit-impossible-rates.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { recordsFromBuffer } from "../src/lib/store/seed";

const ROOTS = [join(process.cwd(), "ANALYTICAL DATA"), join(process.cwd(), "DATA")];
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

const files = ROOTS.filter(existsSync).flatMap(walk);
const all: any[] = [];
for (const f of files) {
  try {
    for (const p of recordsFromBuffer(readFileSync(f), f)) all.push({ ...p, __file: f });
  } catch {}
}

// Bucket by family + stage + month (not file, so overlapping files in the
// same family for the same stage/month still get caught).
const buckets = new Map<string, { checked: number; rejected: number; files: Set<string> }>();
for (const p of all) {
  const r = p.record;
  if (!r.stageId || !r.occurredOn?.start) continue;
  const month = r.occurredOn.start.slice(0, 7);
  const key = `${p.family} | ${r.stageId} | ${month}`;
  const b = buckets.get(key) ?? { checked: 0, rejected: 0, files: new Set() };
  b.checked += r.checked?.value ?? 0;
  b.rejected += r.rejected?.value ?? 0;
  b.files.add(p.__file.split(/[\\/]/).pop());
  buckets.set(key, b);
}

console.log("Scanning", buckets.size, "family·stage·month buckets across", files.length, "files...\n");
let flagged = 0;
for (const [key, b] of [...buckets.entries()].sort()) {
  if (b.checked === 0) continue;
  const rate = b.rejected / b.checked;
  if (rate > 1) {
    flagged++;
    console.log(`IMPOSSIBLE  ${key.padEnd(45)} checked=${b.checked}  rejected=${b.rejected}  rate=${(rate * 100).toFixed(1)}%  files=[${[...b.files].join(", ")}]`);
  } else if (rate > 0.5) {
    console.log(`SUSPICIOUS  ${key.padEnd(45)} checked=${b.checked}  rejected=${b.rejected}  rate=${(rate * 100).toFixed(1)}%  files=[${[...b.files].join(", ")}]`);
  }
}
console.log(`\n${flagged} impossible (>100%) buckets found.`);
