"use client";

// Renders a ReportSpec as a dense printable document.
//
// Layout rules (locked for PDF quality):
// 1. Do NOT force page-break after every block — pack sections until full.
// 2. Cover is a compact header strip, not a mostly-blank first page.
// 3. KPIs sit under the cover on the same page when they fit.
// 4. Charts/tables avoid mid-section breaks only (break-inside: avoid).
// 5. Print uses ink-safe tokens (black text, solid strokes) — screen theme vars
//    often wash out on paper.

import { useMemo } from "react";
import { ChartBody } from "@/components/ChartBuilder";
import { BarsH, pct, num, rupee } from "@/components/app/widgets";
import {
  byStage,
  byDefect,
  bySize,
  rejectionRate,
  totalChecked,
  totalRejected,
  fpy,
  copq,
  toSourceRows,
  DERIVED_REGISTRY,
  scopeEvents,
  type Scope,
} from "@/lib/analytics";
import { useCapas } from "@/lib/capa-store";
import type { Event } from "@/lib/store/types";
import type { ReportSpec, ReportBlock, KpiId } from "@/lib/report/blocks";
import { KPI_LABEL, isForensicSpec } from "@/lib/report/blocks";
import type { Registry } from "@/lib/analytics/rejection";
import { describeSourceFilter } from "@/lib/analytics/scope";

export const REPORT_PRINT_CSS = `
/* Screen preview: paper-like card stack */
.rp-doc {
  color: var(--text);
}
.rp-doc .rp-section {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 18px;
  margin-bottom: 12px;
  background: var(--surface);
}
.rp-doc .rp-masthead {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px 20px 16px;
  margin-bottom: 12px;
  background: var(--surface);
}
.rp-doc .rp-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  width: 100%;
}
.rp-doc .rp-kpi-tile {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  background: var(--surface);
  min-width: 0;
}
.rp-doc .rp-kpi-tile .rp-kpi-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.rp-doc .rp-kpi-tile .rp-kpi-value {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;
  margin-top: 6px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.rp-doc .rp-section-title {
  font-size: 13px;
  font-weight: 700;
  margin: 0 0 10px;
  color: var(--text);
}

@media print {
  .rp-doc {
    width: 100% !important;
    max-width: none !important;
    color: #14181f !important;
    /* Ink tokens — override dark UI theme for paper */
    --text: #14181f;
    --text-2: #3a4450;
    --text-3: #5a6570;
    --border: #c8ced6;
    --border-strong: #9aa3ad;
    --surface: #ffffff;
    --surface-2: #eef1f4;
    --bg: #ffffff;
    --accent: #C8421C;
    --accent-weak: rgba(200, 66, 28, 0.14);
    --critical: #b42318;
    --positive: #067647;
  }
  .rp-doc .rp-masthead,
  .rp-doc .rp-section {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
    padding: 0 0 10px 0 !important;
    margin: 0 0 12px 0 !important;
  }
  .rp-doc .rp-section {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* Pack densely — never force a new page per block */
  .rp-doc .rp-masthead {
    break-after: avoid;
    page-break-after: avoid;
  }
  .rp-doc .rp-kpi-band {
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 14px !important;
  }
  .rp-doc .rp-kpi-tile {
    background: #fff !important;
    border: 1px solid #c8ced6 !important;
    box-shadow: none !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rp-doc .rp-kpi-tile .rp-kpi-label { color: #5a6570 !important; }
  .rp-doc .rp-kpi-tile .rp-kpi-value { color: #14181f !important; }
  .rp-doc .rp-section-title { color: #14181f !important; font-size: 12.5px !important; }
  .rp-doc .muted { color: #5a6570 !important; }
  .rp-doc svg {
    max-width: 100% !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rp-doc .chart-line-stroke {
    stroke-width: 2.5px !important;
  }
  .rp-doc table { width: 100% !important; }
}
`;

function kpiValue(id: KpiId, events: Event[], scope: Scope): string {
  const reg = DERIVED_REGISTRY;
  switch (id) {
    case "rejectionRate": return pct(rejectionRate(events, scope, reg).value);
    case "totalChecked": return num(totalChecked(events, scope, reg).value);
    case "totalRejected": return num(totalRejected(events, scope).value);
    case "fpy": return pct(fpy(events, scope, reg).value);
    case "copq": return rupee(copq(events, scope)?.value ?? 0);
  }
}

function KpiBand({ kpis, events, scope }: { kpis: KpiId[]; events: Event[]; scope: Scope }) {
  return (
    <div className="rp-kpi-grid">
      {kpis.map((id) => (
        <div key={id} className="rp-kpi-tile">
          <div className="rp-kpi-label">{KPI_LABEL[id]}</div>
          <div className="rp-kpi-value">{kpiValue(id, events, scope)}</div>
        </div>
      ))}
    </div>
  );
}

function ReportTable({ block, events, scope }: { block: Extract<ReportBlock, { kind: "table" }>; events: Event[]; scope: Scope }) {
  const capas = useCapas();
  const reg = DERIVED_REGISTRY;

  const rows = useMemo((): { label: string; value: number; sub?: string }[] => {
    switch (block.table) {
      case "by-stage":
        return byStage(events, scope, reg).map((s) => ({
          label: s.label || s.stageId,
          value: s.rejRate,
          sub: `${num(s.rejected)} of ${num(s.checked)}`,
        }));
      case "by-defect":
        return byDefect(events, scope, reg).map((d) => ({
          label: d.label || d.defectCode || "Unnamed",
          value: d.rejected,
          sub: `${d.pct.toFixed(1)}% of rejects`,
        }));
      case "by-size":
        return bySize(events, scope).map((s) => ({
          label: s.size,
          value: s.rejRate,
          sub: `${num(s.rejected)} of ${num(s.checked)}`,
        }));
      case "spc-violations":
        return []; // stub — rendered as Not evaluated below
      case "capa-open":
        return capas
          .filter((c) => c.status !== "Completed")
          .map((c) => ({ label: c.title, value: 0, sub: `${c.priority} · ${c.status}` }));
    }
  }, [block.table, events, scope, reg, capas]);

  if (block.table === "spc-violations") {
    return (
      <p className="muted" style={{ fontSize: 14, margin: 0 }}>
        Not evaluated — this table has no implemented SPC violation series.
      </p>
    );
  }

  if (rows.length === 0) {
    return <p className="muted" style={{ fontSize: 14, margin: 0 }}>No rows for the selected period.</p>;
  }

  if (block.table === "capa-open") {
    return (
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "5px 4px" }}>{r.label}</td>
              <td style={{ padding: "5px 4px", textAlign: "right", color: "var(--text-3)" }}>{r.sub}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const isRate = block.table !== "by-defect";
  return <BarsH rows={rows} fmt={(n) => (isRate ? pct(n) : num(n))} />;
}

function EvidenceBlock({ events, scope }: { events: Event[]; scope: Scope }) {
  const scoped = useMemo(() => scopeEvents(events, scope), [events, scope]);
  const all = useMemo(() => toSourceRows(scoped), [scoped]);
  const rows = all.slice(0, 40);
  return (
    <>
      <p className="muted" style={{ fontSize: 11.5, margin: "0 0 8px" }}>
        First {rows.length} of {num(all.length)} ledger rows (Sources filter applied).
      </p>
      <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse", fontFamily: "var(--font-mono)" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
            <th style={{ padding: "4px 3px" }}>Date</th>
            <th style={{ padding: "4px 3px" }}>Stage</th>
            <th style={{ padding: "4px 3px" }}>Type</th>
            <th style={{ padding: "4px 3px" }}>Qty</th>
            <th style={{ padding: "4px 3px" }}>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "3px" }}>{r.date}</td>
              <td style={{ padding: "3px" }}>{r.stage || r.stageId || "—"}</td>
              <td style={{ padding: "3px" }}>{r.type}</td>
              <td style={{ padding: "3px", textAlign: "right" }}>{r.qty ?? "—"}</td>
              <td style={{ padding: "3px", color: "var(--text-3)" }}>{r.file || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function BlockBody({ block, events, scope }: { block: ReportBlock; events: Event[]; scope: Scope }) {
  switch (block.kind) {
    case "cover":
    case "kpi-row":
    case "forensic-book":
      return null;
    case "chart":
      return (
        <ChartBody
          events={events}
          spec={block.spec}
          base={{
            dateFrom: scope.dateFrom,
            dateTo: scope.dateTo,
            stageIds: scope.stageIds,
            sourceChannels: scope.sourceChannels,
            sourceFiles: scope.sourceFiles,
          }}
        />
      );
    case "table":
      return <ReportTable block={block} events={events} scope={scope} />;
    case "text":
      return block.body.trim() ? (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", margin: 0 }}>{block.body}</p>
      ) : (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>— no notes —</p>
      );
    case "evidence":
      return <EvidenceBlock events={events} scope={scope} />;
  }
}

export default function ReportDocument({
  spec,
  events,
  scope,
  periodLabel,
  registry: _registry,
}: {
  spec: ReportSpec;
  events: Event[];
  scope: Scope;
  periodLabel: string;
  registry?: Registry | null;
}) {
  if (isForensicSpec(spec)) {
    return (
      <div className="rp-doc">
        <header className="rp-masthead">
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Retired forensic package</h1>
          <p className="body" style={{ marginTop: 8, color: "var(--text-2)" }}>
            The previous forensic book is not part of this product’s export path. It contained
            unsupported claims and is not generated. Open Reports and choose Financial Year Audit Pack.
          </p>
        </header>
      </div>
    );
  }

  const cover = spec.blocks.find((b) => b.kind === "cover") as Extract<ReportBlock, { kind: "cover" }> | undefined;
  const kpiBlock = spec.blocks.find((b) => b.kind === "kpi-row") as Extract<ReportBlock, { kind: "kpi-row" }> | undefined;
  const body = spec.blocks.filter(
    (b) => b.kind !== "cover" && b.kind !== "kpi-row" && b.kind !== "forensic-book",
  );

  return (
    <div className="rp-doc">
      <style dangerouslySetInnerHTML={{ __html: REPORT_PRINT_CSS }} />

      {/* Masthead + KPIs pack together — not separate blank-heavy pages */}
      <header className="rp-masthead">
        <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 700 }}>
          Disposafe · Quality
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 4px", lineHeight: 1.2, color: "var(--text)" }}>
          {cover?.title ?? spec.title}
        </h1>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
          <span>{periodLabel}</span>
          <span>Sources: {describeSourceFilter(scope)}</span>
        </div>
        {cover?.subtitle && (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--text-2)" }}>{cover.subtitle}</p>
        )}
        <div className="muted" style={{ marginTop: 8, fontSize: 10, fontFamily: "var(--font-mono)" }}>
          Generated {new Date().toLocaleString()} · event ledger
        </div>
      </header>

      {kpiBlock && (
        <section className="rp-section rp-kpi-band">
          <h2 className="rp-section-title">{kpiBlock.title}</h2>
          <KpiBand kpis={kpiBlock.kpis} events={events} scope={scope} />
        </section>
      )}

      {body.map((block) => (
        <section key={block.id} className="rp-section">
          <h2 className="rp-section-title">{block.title}</h2>
          <BlockBody block={block} events={events} scope={scope} />
        </section>
      ))}
    </div>
  );
}
