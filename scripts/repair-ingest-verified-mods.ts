/**
 * One-shot repair: for every verified non-seed MOD with a snapshot, extract
 * StageDayRecords and POST them through emit+append into the events ledger.
 *
 * Fixes the production gap where mappings were published but "Publish to
 * Analytics" never wrote events (events count stayed 0).
 *
 * Usage: npx tsx scripts/repair-ingest-verified-mods.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { extractFromMod } from "../src/core/ingest/extract-from-mod";
import { emitMany } from "../src/lib/ingest/emit";
import { hashEvent } from "../src/lib/contract/hash";

function loadEnv() {
  for (const p of [".env.local", ".env"]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

function getPayload(e: any) {
  const envelope = new Set([
    "eventId", "schemaVersion", "ingestionId", "eventType", "occurredOn",
    "provenance", "confidence", "extractedBy", "recordedAt", "supersededBy",
  ]);
  const out: any = {};
  for (const [k, v] of Object.entries(e)) if (!envelope.has(k)) out[k] = v;
  return out;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(url, key);

  const { data: mods, error } = await db
    .from("mods")
    .select("mod_id, version, snapshot_id, document, status")
    .eq("status", "verified");
  if (error) throw error;

  const real = (mods ?? []).filter((m: any) => {
    const fn = m.document?.workbook?.fileName ?? "";
    return fn && !fn.startsWith("preset:") && !fn.startsWith("disposafe");
  });
  console.log(`Repairing ${real.length} verified real workbook MOD(s)…`);

  let totalInserted = 0;
  for (const mod of real) {
    const fn = mod.document.workbook.fileName;
    const { data: snap, error: se } = await db
      .from("workbook_snapshots")
      .select("snapshot_id, file_name, content")
      .eq("snapshot_id", mod.snapshot_id)
      .maybeSingle();
    if (se) throw se;
    if (!snap?.content?.sheets) {
      console.log(`  SKIP ${fn} — no snapshot`);
      continue;
    }
    const snapshot = { snapshotId: snap.snapshot_id, fileName: snap.file_name, sheets: snap.content.sheets };
    const ingestionId = `repair-${mod.mod_id.slice(0, 8)}-${Date.now()}`;
    const records = extractFromMod(mod.document, snapshot as any, ingestionId, {
      modId: mod.mod_id,
      modVersion: mod.version,
    });
    if (records.length === 0) {
      console.log(`  SKIP ${fn} — extract returned 0 records`);
      continue;
    }
    const events = emitMany(records);
    if (events.length === 0) {
      console.log(`  SKIP ${fn} — emit produced 0 events`);
      continue;
    }

    // Content-hash idempotent insert (same shape as SupabaseEventStore.append)
    const ids = events.map((e) => e.eventId);
    const { data: existing } = await db.from("events").select("event_id").in("event_id", ids);
    const have = new Set((existing ?? []).map((r: any) => r.event_id));
    const toInsert = events.filter((e) => !have.has(e.eventId));
    if (toInsert.length === 0) {
      console.log(`  OK ${fn} — ${events.length} events already present`);
      continue;
    }
    const rows = toInsert.map((e: any) => ({
      event_id: e.eventId,
      schema_version: e.schemaVersion,
      ingestion_id: e.ingestionId,
      event_type: e.eventType,
      occurred_on: e.occurredOn,
      provenance: e.provenance,
      confidence: e.confidence,
      extracted_by: e.extractedBy,
      recorded_at: e.recordedAt,
      superseded_by: e.supersededBy,
      provenance_file: e.provenance?.provenance_file ?? null,
      provenance_coordinate: e.provenance?.provenance_coordinate ?? null,
      provenance_hash: e.provenance?.provenance_hash ?? null,
      is_direct_entry: e.provenance?.is_direct_entry ?? false,
      payload: getPayload(e),
    }));
    const { error: insErr } = await db.from("events").upsert(rows, { onConflict: "event_id" });
    if (insErr) {
      console.log(`  FAIL ${fn}:`, insErr.message);
      continue;
    }
    totalInserted += toInsert.length;
    console.log(`  INGEST ${fn}: +${toInsert.length} events (of ${events.length} emitted from ${records.length} records)`);
  }

  const { count } = await db.from("events").select("*", { count: "exact", head: true });
  console.log(`\nDone. Inserted ${totalInserted}. events table count ≈ ${count}`);
  void hashEvent; // keep import if tree-shaken elsewhere
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
