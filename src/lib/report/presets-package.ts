// ZIP of every named report preset as a self-contained HTML report.
// Numbers come from lib/analytics under the current scope (Sources + range).

import {
  byStage,
  byDefect,
  bySize,
  rejectionRate,
  totalChecked,
  totalRejected,
  fpy,
  copq,
  type Scope,
} from "@/lib/analytics";
import { describeSourceFilter } from "@/lib/analytics/scope";
import type { Event } from "@/lib/store/types";
import { buildStoredZip } from "@/lib/audit-package";
import { listNamedPresets } from "@/lib/report/presets-store";
import { isForensicSpec, type ReportSpec, type ReportBlock } from "@/lib/report/blocks";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const num = (n: number) => n.toLocaleString("en-IN");

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "report";
}

function blockHtml(block: ReportBlock, events: Event[], scope: Scope): string {
  switch (block.kind) {
    case "cover":
      return "";
    case "kpi-row": {
      const cells = block.kpis.map((k) => {
        let v = "—";
        if (k === "rejectionRate") v = pct(rejectionRate(events, scope).value);
        else if (k === "totalChecked") v = num(totalChecked(events, scope).value);
        else if (k === "totalRejected") v = num(totalRejected(events, scope).value);
        else if (k === "fpy") v = pct(fpy(events, scope).value);
        else if (k === "copq") v = `₹ ${num(Math.round(copq(events, scope)?.value ?? 0))}`;
        return `<div class="kpi"><div class="kpi-l">${esc(k)}</div><div class="kpi-v">${esc(v)}</div></div>`;
      });
      return `<section><h2>${esc(block.title)}</h2><div class="kpis">${cells.join("")}</div></section>`;
    }
    case "table": {
      let rows: { label: string; value: string; sub?: string }[] = [];
      if (block.table === "by-stage") {
        rows = byStage(events, scope).map((s) => ({
          label: s.label || s.stageId,
          value: pct(s.rejRate),
          sub: `${num(s.rejected)} of ${num(s.checked)}`,
        }));
      } else if (block.table === "by-defect") {
        rows = byDefect(events, scope).map((d) => ({
          label: d.label || d.defectCode || "Unnamed",
          value: num(d.rejected),
          sub: `${d.pct.toFixed(1)}%`,
        }));
      } else if (block.table === "by-size") {
        rows = bySize(events, scope).map((s) => ({
          label: s.size,
          value: pct(s.rejRate),
          sub: `${num(s.rejected)} of ${num(s.checked)}`,
        }));
      } else {
        rows = [{ label: block.table, value: "See app for this section", sub: "" }];
      }
      const tr = rows
        .slice(0, 40)
        .map(
          (r) =>
            `<tr><td>${esc(r.label)}</td><td class="r">${esc(r.value)}</td><td class="m">${esc(r.sub ?? "")}</td></tr>`,
        )
        .join("");
      return `<section><h2>${esc(block.title)}</h2><table><thead><tr><th>Item</th><th class="r">Value</th><th>Detail</th></tr></thead><tbody>${tr}</tbody></table></section>`;
    }
    case "chart":
      return `<section><h2>${esc(block.title)}</h2><p class="note">Chart: ${esc(block.spec.metric)} by ${esc(block.spec.group)} (open the app Print view for the live SVG chart).</p></section>`;
    case "text":
      return `<section><h2>${esc(block.title)}</h2><p>${esc(block.body || "—")}</p></section>`;
    case "evidence":
      return `<section><h2>${esc(block.title)}</h2><p class="note">Provenance appendix — use the in-app print view for full cell lineage.</p></section>`;
    case "forensic-book":
      return `<section><h2>${esc(block.title)}</h2><p class="note">This layout referenced a retired forensic package. It is not included. Use the Financial Year Audit Pack in Reports.</p></section>`;
    default:
      return "";
  }
}

function renderHtml(spec: ReportSpec, events: Event[], scope: Scope, periodLabel: string): string {
  const cover = spec.blocks.find((b) => b.kind === "cover");
  const body = spec.blocks.filter((b) => b.kind !== "cover");
  const title = cover && cover.kind === "cover" ? cover.title : spec.title;
  const sources = describeSourceFilter(scope);

  if (isForensicSpec(spec)) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#14181f} .note{color:#555}</style></head>
<body><h1>${esc(title)}</h1><p>${esc(periodLabel)}</p><p>Sources: ${esc(sources)}</p>
<p class="note">The forensic package has been retired and is not exported. Generate a Financial Year Audit Pack from Reports.</p>
</body></html>`;
  }

  const sections = body.map((b) => blockHtml(b, events, scope)).join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:28px;color:#14181f;max-width:900px;margin:0 auto}
  h1{font-size:28px;margin:0 0 8px}
  h2{font-size:15px;margin:24px 0 10px;border-bottom:1px solid #ddd;padding-bottom:6px}
  .meta{color:#555;font-size:13px;margin:4px 0}
  .kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
  .kpi{border:1px solid #e5e5e5;border-radius:8px;padding:12px}
  .kpi-l{font-size:11px;color:#666;text-transform:uppercase}
  .kpi-v{font-size:20px;font-weight:700;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{padding:6px 4px;border-bottom:1px solid #eee;text-align:left}
  th{color:#666;font-size:11px}
  .r{text-align:right}
  .m{color:#777;font-size:11px}
  .note{color:#666;font-size:12px}
  @media print{body{padding:12mm}}
</style></head><body>
  <h1>${esc(title)}</h1>
  <p class="meta">${esc(periodLabel)}</p>
  <p class="meta">Sources: ${esc(sources)}</p>
  <p class="meta">Generated ${esc(new Date().toLocaleString())} · MOID report pack</p>
  ${sections}
</body></html>`;
}

/**
 * Bundle every named preset (built-in + user) as HTML under the current scope.
 */
export async function buildPresetsZip(
  events: Event[],
  scope: Scope,
  periodLabel: string,
): Promise<{ blob: Blob; fileName: string }> {
  const presets = listNamedPresets();
  const enc = new TextEncoder();
  const entries: { name: string; data: Uint8Array }[] = [];
  const used = new Set<string>();

  for (const p of presets) {
    let name = `${slug(p.name)}.html`;
    let i = 2;
    while (used.has(name)) {
      name = `${slug(p.name)}-${i}.html`;
      i++;
    }
    used.add(name);
    const html = renderHtml(p.spec, events, scope, periodLabel);
    entries.push({ name, data: enc.encode(html) });
  }

  const index = [
    "# MOID report preset pack",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Period: ${periodLabel}`,
    `Sources: ${describeSourceFilter(scope)}`,
    `Presets: ${presets.length}`,
    "",
    ...presets.map((p) => `- ${p.name}${p.builtIn ? " (built-in)" : ""}`),
    "",
    "Open each HTML file in a browser, or use Print / Save as PDF in the app for live SVG charts.",
  ].join("\n");
  entries.unshift({ name: "README.txt", data: enc.encode(index) });

  const zip = buildStoredZip(entries);
  const ab = new ArrayBuffer(zip.byteLength);
  new Uint8Array(ab).set(zip);
  const blob = new Blob([ab], { type: "application/zip" });
  const fileName = `moid-report-presets-${new Date().toISOString().slice(0, 10)}.zip`;
  return { blob, fileName };
}
