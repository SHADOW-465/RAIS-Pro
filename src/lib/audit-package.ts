// Audit-ready export package (MOID-CANONICAL-SPEC §365, plans/07).
// Bundles the analytics extracts as CSVs + a manifest.json carrying a SHA-256
// hash of every file, so an auditor can prove data integrity (ALCOA+).
//
// Zero dependencies: a minimal "stored" (uncompressed) ZIP writer + the Web
// Crypto SHA-256 digest. Runs client-side from the live event ledger.

import {
  byStage, byDefect, bySize, rejectionRate, fpy, totalChecked, totalRejected,
  copq, savingsOpportunity, trend, periodLabel, type Scope,
} from "@/lib/analytics";
import type { Event } from "@/lib/store/types";

// ── CSV helpers ───────────────────────────────────────────────────────────────
const esc = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (headers: string[], rows: unknown[][]): string =>
  [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n") + "\r\n";

// ── CRC-32 (required by the ZIP format) ───────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Minimal stored ZIP writer ─────────────────────────────────────────────────
interface ZipEntry { name: string; data: Uint8Array; }
function makeZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // Fixed DOS timestamp (2026-06-20 12:00) — deterministic, audit-stable.
  const dosTime = (12 << 11) | (0 << 5) | 0;
  const dosDate = ((2026 - 1980) << 9) | (6 << 5) | 20;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);   // local file header sig
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0, true);             // flags
    lv.setUint16(8, 0, true);             // method = stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);         // compressed size
    lv.setUint32(22, size, true);         // uncompressed size
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);            // extra len
    local.set(name, 30);
    chunks.push(local, e.data);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);    // central dir sig
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);            // method
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);       // local header offset
    cen.set(name, 46);
    central.push(cen);

    offset += local.length + size;
  }

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);      // EOCD sig
  ev.setUint16(8, entries.length, true);  // entries on this disk
  ev.setUint16(10, entries.length, true); // total entries
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);         // central dir offset

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of [...chunks, ...central, end]) { out.set(c, p); p += c.length; }
  return out;
}

async function sha256hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Build the package ─────────────────────────────────────────────────────────
const pct = (n: number) => (n * 100).toFixed(2) + "%";

export async function buildAuditPackage(events: Event[], scope: Scope, registryVersion = "1.0.0"): Promise<{ blob: Blob; fileName: string }> {
  const stages = byStage(events, scope);
  const defects = byDefect(events, scope);
  const sizes = bySize(events, scope);

  const csvs: Record<string, string> = {};

  // 1. KPI / rejection summary (with explicit metric definitions — ALCOA+ legible)
  csvs["01-rejection-summary.csv"] = toCsv(
    ["metric", "value", "definition"],
    [
      ["Rejection Rate", pct(rejectionRate(events, scope).value), "Sum of per-stage rejection rates (client convention)"],
      ["First Pass Yield", pct(fpy(events, scope).value), "Rolled-throughput yield = product of (1 - stageRate)"],
      ["Total Checked (entry stage)", totalChecked(events, scope).value, "Units entering the line (Visual stage checked)"],
      ["Total Rejected (all stages)", totalRejected(events, scope).value, "Sum of rejected units across every stage"],
      ["COPQ", (copq(events, scope)?.value ?? 0).toFixed(0), "Cost of poor quality (INR) from stage rejects x unit cost x weight"],
      ["Annual Savings Opportunity", (savingsOpportunity(events, scope) ?? 0).toFixed(0), "Target-gap or 25% of COPQ, whichever is larger (INR)"],
    ]
  );

  // 2. Stage-wise breakdown
  csvs["02-stage-wise.csv"] = toCsv(
    ["stage", "checked", "rejected", "rejection_rate", "yield", "contribution_pct"],
    stages.map((s) => [s.label, s.checked, s.rejected, pct(s.rejRate), pct(s.yield), s.contributionPct.toFixed(1) + "%"])
  );

  // 3. Defect Pareto
  csvs["03-defect-pareto.csv"] = toCsv(
    ["defect", "code", "rejected", "pct_of_total", "cumulative_pct"],
    defects.map((d) => [d.label, d.defectCode ?? "(unmapped)", d.rejected, d.pct.toFixed(2) + "%", d.cumPct.toFixed(2) + "%"])
  );

  // 4. Size-wise
  csvs["04-size-wise.csv"] = toCsv(
    ["size", "checked", "rejected", "rejection_rate"],
    sizes.map((s) => [s.size, s.checked, s.rejected, pct(s.rejRate)])
  );

  // 5. Monthly trend (Σ-stage rejection %)
  csvs["05-monthly-trend.csv"] = toCsv(
    ["period", "label", "total_rejection_pct"],
    trend(events, { ...scope, grain: "month" }, "rejectionRate").map((p) => [p.period, periodLabel(p.period), pct(p.value)])
  );

  // 6. Full canonical ledger (raw provenance — attributable & traceable)
  csvs["06-event-ledger.csv"] = toCsv(
    ["eventId", "eventType", "date", "stageId", "size", "defectCodeRaw", "defectCode", "quantity", "disposition", "file", "cell", "extractedBy", "recordedAt"],
    events.map((e: any) => [
      e.eventId, e.eventType, e.occurredOn?.start, e.stageId ?? "", e.size ?? "",
      e.defectCodeRaw ?? "", e.defectCode ?? "", e.quantity ?? e.statedValue ?? "", e.disposition ?? "",
      e.provenance?.file ?? "", e.provenance?.cells?.[0] ?? "", e.extractedBy ?? "", e.recordedAt ?? "",
    ])
  );

  // Hash each file + build manifest
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [];
  const manifestFiles: { file: string; sha256: string; bytes: number }[] = [];
  for (const [name, content] of Object.entries(csvs)) {
    const data = enc.encode(content);
    entries.push({ name, data });
    manifestFiles.push({ file: name, sha256: await sha256hex(data), bytes: data.length });
  }

  const manifest = {
    package: "MO!D Audit Pack",
    standard: "ALCOA+ (Attributable, Legible, Contemporaneous, Original, Accurate)",
    generatedAt: new Date().toISOString(),
    registryVersion,
    hashAlgorithm: "SHA-256",
    eventCount: events.length,
    scope: { dateFrom: scope.dateFrom ?? "all", dateTo: scope.dateTo ?? "all", grain: scope.grain },
    files: manifestFiles,
  };
  const manifestData = enc.encode(JSON.stringify(manifest, null, 2));
  entries.push({ name: "manifest.json", data: manifestData });

  const zip = makeZip(entries);
  // Copy into a fresh ArrayBuffer to satisfy BlobPart typing across runtimes.
  const ab = new ArrayBuffer(zip.byteLength);
  new Uint8Array(ab).set(zip);
  const blob = new Blob([ab], { type: "application/zip" });
  const fileName = `moid-audit-pack-${new Date().toISOString().slice(0, 10)}.zip`;
  return { blob, fileName };
}
