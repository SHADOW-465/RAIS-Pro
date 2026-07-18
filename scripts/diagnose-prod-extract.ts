/**
 * Pull a verified MOD + snapshot from Supabase and run extractFromMod.
 * Usage: npx tsx scripts/diagnose-prod-extract.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { extractFromMod } from "../src/core/ingest/extract-from-mod";

// Minimal .env.local loader (no dotenv dep required)
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  console.log("url", url.slice(0, 40) + "…");

  const db = createClient(url, key);
  const { data: mods, error: me } = await db
    .from("mods")
    .select("mod_id, version, status, snapshot_id, document")
    .eq("status", "verified")
    .order("created_at", { ascending: false })
    .limit(30);
  if (me) throw me;

  const real = (mods ?? []).filter((m: any) => {
    const fn = m.document?.workbook?.fileName ?? "";
    return fn && !fn.startsWith("preset:") && !fn.startsWith("disposafe");
  });
  console.log("verified real mods:", real.length);
  for (const mod of real.slice(0, 3)) {
    const fn = mod.document?.workbook?.fileName;
    console.log("\n===", fn, "v" + mod.version, "mod", mod.mod_id.slice(0, 12));
    const { data: snap, error: se } = await db
      .from("workbook_snapshots")
      .select("snapshot_id, file_name, content")
      .eq("snapshot_id", mod.snapshot_id)
      .maybeSingle();
    if (se) throw se;
    if (!snap) {
      console.log("  NO SNAPSHOT");
      continue;
    }
    const sheets = snap.content?.sheets ?? [];
    console.log("  snap sheets", sheets.length, "content keys", Object.keys(snap.content || {}));

    const ents = mod.document.entities || [];
    const stages = ents.filter((e: any) => e.kind === "stage");
    console.log(
      "  stages",
      stages.map((e: any) => `${e.original?.header}→${e.canonical} v=${e.verified}`),
    );
    console.log(
      "  DATE",
      ents.filter((e: any) => e.canonical === "DATE").length,
      "CHECKED",
      ents.filter((e: any) => e.canonical === "CHECKED_QTY").length,
      "REJECTED",
      ents.filter((e: any) => e.canonical === "REJECTED_QTY").length,
    );

    const snapshot = { snapshotId: snap.snapshot_id, fileName: snap.file_name, sheets };
    try {
      const records = extractFromMod(mod.document, snapshot as any, "diag");
      const withQ = records.filter((r) => r.checked || r.rejected);
      console.log("  EXTRACT records=", records.length, "with qty=", withQ.length);
      if (records[0]) {
        console.log("  sample", {
          stage: records[0].stageId,
          date: records[0].occurredOn.start,
          checked: records[0].checked?.value,
          rejected: records[0].rejected?.value,
          sheet: records[0].source.sheet,
        });
      }
      if (records.length === 0) {
        // diagnose skip reasons
        let noStage = 0, noDate = 0, ok = 0;
        for (const layout of mod.document.layout || []) {
          const tableId = layout.tableId ?? "t1";
          const here = ents.filter(
            (e: any) =>
              e.original?.sheet === layout.sheet &&
              (e.original?.tableId ?? "t1") === tableId &&
              e.verified &&
              e.canonical,
          );
          const stage = here.find((e: any) => e.kind === "stage" && String(e.canonical).startsWith("STAGE:"));
          const dateCol = here.find((e: any) => e.original?.colLetter && e.canonical === "DATE");
          if (!stage) noStage++;
          else if (!dateCol) noDate++;
          else ok++;
        }
        console.log("  layout skip noStage=", noStage, "noDate=", noDate, "ok=", ok, "layouts=", (mod.document.layout || []).length);
      }
    } catch (e: any) {
      console.log("  EXTRACT ERROR", e?.message || e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
