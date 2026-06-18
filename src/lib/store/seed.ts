// src/lib/store/seed.ts
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { emitMany } from "@/lib/ingest/emit";
import {
  routeFamily,
  parseAssemblyDaily,
  parseRejectionAnalysis,
  parseSizeWise,
  dedupeByPrecedence,
  type PrecededRecord,
} from "@/lib/ingest/parsers";
import type { EventStore } from "./types";

/** Parse one workbook buffer into precedence-tagged records (no synthetic data). */
export function recordsFromBuffer(buf: Buffer, file: string): PrecededRecord[] {
  const name = file.split(/[\\/]/).pop()!;
  const family = routeFamily(name);
  if (!family) return [];
  if (family === "assembly-daily") {
    return parseAssemblyDaily(buf, name).records.map((record) => ({ record, family }));
  }
  if (family === "rejection-analysis") {
    return parseRejectionAnalysis(buf, name);
  }
  if (family === "size-wise") {
    return parseSizeWise(buf, file).map((record) => ({ record, family }));
  }
  return [];
}

function walkXlsx(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e.startsWith("~$")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      out.push(...walkXlsx(p));
    } else if (e.toLowerCase().endsWith(".xlsx")) {
      out.push(p);
    }
  }
  return out;
}

function dataRoots(): string[] {
  const env = process.env.MOID_DATA_DIR;
  const roots = env ? [env] : [join(process.cwd(), "ANALYTICAL DATA"), join(process.cwd(), "DATA")];
  return roots.filter(existsSync);
}

/** Seed the durable store from real workbooks. Idempotent. */
export async function seedFromDisk(events: EventStore): Promise<void> {
  if (typeof window !== "undefined") return;
  
  // Early return if data is already seeded in the store
  const existing = await events.effective();
  if (existing.length > 0) return;

  console.log("[seed] starting disk seed of quality ledger...");
  const all: PrecededRecord[] = [];
  for (const root of dataRoots()) {
    for (const file of walkXlsx(root)) {
      try {
        const name = file.split(/[\\/]/).pop()!;
        const records = recordsFromBuffer(readFileSync(file), file);
        all.push(...records);
      } catch (e) {
        console.warn(`[seed] skip ${file}:`, (e as Error).message);
      }
    }
  }

  const { kept, shadowed, claims } = dedupeByPrecedence(all);
  const out = emitMany(kept.map((p) => p.record));
  if (out.length) {
    const { inserted } = await events.append(out);
    console.log(`[seed] ✓ seeded ${inserted} events from ${kept.length} records (${shadowed.length} shadowed, ${claims.length} claims) — no synthetic data`);
  } else {
    console.log("[seed] No events were produced to seed.");
  }
}
