import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { extractFromMod } from "../src/core/ingest/extract-from-mod";
import { emitMany } from "../src/lib/ingest/emit";
import { buildReviewRows, reviewSummary } from "../src/lib/ingest/review";

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

async function main() {
  loadEnv();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: mods } = await db.from("mods").select("mod_id, version, snapshot_id, document").eq("status", "verified");
  const m = (mods ?? []).find((x: any) => (x.document?.workbook?.fileName || "").includes("REJECTION ANALYSIS-DECEMBER 2025 (2)"));
  if (!m) throw new Error("mod not found");
  const { data: snap } = await db.from("workbook_snapshots").select("*").eq("snapshot_id", m.snapshot_id).maybeSingle();
  const snapshot = { snapshotId: snap!.snapshot_id, fileName: snap!.file_name, sheets: snap!.content.sheets };
  const records = extractFromMod(m.document, snapshot as any, "t");
  const rows = buildReviewRows(records);
  const sum = reviewSummary(rows);
  console.log("records", records.length, "summary", sum);
  const invalid = rows.filter((r) => r.status === "invalid");
  console.log("invalid count", invalid.length);
  console.log(
    "invalid samples",
    invalid.slice(0, 8).map((r) => ({ stage: r.stageId, date: r.date, reasons: (r as any).reasons || (r as any).flags || r })),
  );
  // dump one invalid fully
  if (invalid[0]) console.log("first invalid keys", Object.keys(invalid[0]), JSON.stringify(invalid[0], null, 2).slice(0, 800));
  const events = emitMany(records);
  console.log("events emitted", events.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
