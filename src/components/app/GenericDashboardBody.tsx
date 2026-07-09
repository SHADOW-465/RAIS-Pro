"use client";

import { useState } from "react";
import { Card, Kpi, LineChart, BarsH, Empty } from "@/components/app/widgets";
import ParetoChart from "@/components/ParetoChart";
import FloatingDetailModal, { type SourceRow } from "@/components/FloatingDetailModal";
import { calculatePareto } from "@/lib/dashboard-builder";
import type { GenericDashboard } from "@/lib/dataset/dashboard";
import type { Dataset, DatasetRow } from "@/lib/dataset/types";

const fmtNum = (n: number) => Math.round(n).toLocaleString("en-IN");

// widgets.tsx's Kpi/LineChart consume @/lib/analytics's SeriesPoint, which
// carries a `period` key (used for grain-aware label thinning) alongside
// {label, value}. buildGenericDashboard's trend points are {label, value}
// only (no calendar-grain concept for an arbitrary Dataset), so adapt here
// rather than widen the shared widget type for this one caller.
const toWidgetSeries = (pts: { label: string; value: number }[]) =>
  pts.map((p) => ({ period: p.label, label: p.label, value: p.value }));

export interface PublishBannerProps {
  stageLabel: string;
  publishing: boolean;
  onPublish: () => void;
  message: { tone: "ok" | "err"; text: string } | null;
}

/** Every persisted DatasetRow that feeds `columnName` — the audit trail for a
 *  generic-dashboard tile. `cell` is the sheet row (rowIndex is 0-based). */
function columnSourceRows(dataset: Dataset, rows: DatasetRow[], columnName: string, label: string): SourceRow[] {
  const dateCol = dataset.columns.find((c) => c.role === "dimension-date")?.name;
  return rows
    .filter((r) => r.values[columnName] != null && r.values[columnName] !== "")
    .map((r) => ({
      date: dateCol ? String(r.values[dateCol] ?? "—") : "—",
      stage: dataset.title,
      size: null,
      type: label,
      qty: typeof r.values[columnName] === "number" ? (r.values[columnName] as number) : String(r.values[columnName]),
      file: r.fileName,
      sheet: r.sheetName,
      cell: `${r.sheetName}!R${r.rowIndex + 1}`,
    }));
}

/** Renders one GenericDashboard's KPIs / trends / breakdowns / defect Pareto —
 *  the shared presentational core of GenericDatasetView, reused by the
 *  /workbooks L2 (file/section) and L3 (sheet) views so both render the exact
 *  same dashboard body for a (dataset, rows) pair rather than duplicating this
 *  JSX. Pure rendering: all data comes in via `d` (already built by
 *  buildGenericDashboard against whatever row subset the caller filtered to).
 *
 *  `caption` renders a small "Source: ..." line above the dashboard (B3 —
 *  cheap provenance for workbook-scoped views). `publishBanner`, when given,
 *  renders the existing "Recognized as: ... / Publish to Cumulative Dashboard"
 *  banner — optional so callers that don't want a publish action (e.g. a
 *  read-only section) can omit it.
 *
 *  When `dataset` + `rows` are provided, every tile becomes clickable and
 *  opens the same FloatingDetailModal used on the main dashboard — enlarged
 *  chart plus a "View Source" trace to the exact file/sheet/row each number
 *  came from. Omit them for a static render. */
export default function GenericDashboardBody({
  d,
  caption,
  publishBanner,
  dataset,
  rows,
}: {
  d: GenericDashboard;
  caption?: string;
  publishBanner?: PublishBannerProps;
  dataset?: Dataset;
  rows?: DatasetRow[];
}) {
  const trendKpis = d.kpis.filter((k) => k.trend.length > 0);
  const hasPareto = !!d.defectPareto && d.defectPareto.length > 0;
  const auditable = !!dataset && !!rows && rows.length > 0;

  const [modal, setModal] = useState<{
    title: string;
    insight: string | string[];
    content: React.ReactNode;
    source?: { rows: SourceRow[]; value: string };
  } | null>(null);

  const openAudit = (
    title: string,
    columnName: string,
    label: string,
    value: string,
    content: React.ReactNode,
    insight: string | string[],
  ) => {
    if (!auditable) return;
    const src = columnSourceRows(dataset!, rows!, columnName, label);
    setModal({ title, insight, content, source: src.length ? { rows: src, value } : undefined });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
      {caption && (
        <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.02em" }}>
          {caption}
        </div>
      )}

      {publishBanner && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
          background: "var(--surface-2)", padding: "10px 14px",
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-2)" }}>
            Recognized as: <span style={{ color: "var(--accent)" }}>{publishBanner.stageLabel}</span>
          </span>
          <button
            onClick={publishBanner.onPublish}
            disabled={publishBanner.publishing}
            style={{
              fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12,
              cursor: publishBanner.publishing ? "wait" : "pointer", color: "var(--paper)",
              background: "var(--accent)", border: "none", padding: "6px 14px",
              borderRadius: "var(--radius-sm)", opacity: publishBanner.publishing ? 0.6 : 1,
            }}
          >
            {publishBanner.publishing ? "Publishing…" : "Publish to Cumulative Dashboard →"}
          </button>
          {publishBanner.message && (
            <span style={{ fontSize: 12, fontWeight: 600, color: publishBanner.message.tone === "ok" ? "var(--positive)" : "var(--critical)" }}>
              {publishBanner.message.text}
            </span>
          )}
        </div>
      )}

      {d.kpis.length === 0 ? (
        <Empty label="This dataset has no measure columns to summarize — it may be a derived or summary sheet." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(d.kpis.length, 5)}, 1fr)`, gap: "var(--gap-grid)" }}>
          {d.kpis.map((k) => (
            <Kpi
              key={k.columnName}
              label={k.label}
              value={fmtNum(k.total)}
              spark={k.trend.length ? toWidgetSeries(k.trend) : undefined}
              onClick={auditable ? () => openAudit(
                k.label,
                k.columnName,
                k.label,
                fmtNum(k.total),
                k.trend.length > 1
                  ? <LineChart points={toWidgetSeries(k.trend)} fmt={fmtNum} />
                  : <Empty label="No date column in this sheet — value is a straight column total." />,
                `Total ${k.label} is ${fmtNum(k.total)}, summed from the "${k.columnName}" column of the staged sheet rows. Open View Source for the exact rows.`,
              ) : undefined}
            />
          ))}
        </div>
      )}

      {trendKpis.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--gap-grid)" }}>
          {trendKpis.map((k) => (
            <Card
              key={k.columnName}
              title={`${k.label} — Trend`}
              onClick={auditable ? () => openAudit(
                `${k.label} — Trend`,
                k.columnName,
                k.label,
                fmtNum(k.total),
                <LineChart points={toWidgetSeries(k.trend)} fmt={fmtNum} />,
                `${k.trend.length} periods plotted; total ${fmtNum(k.total)}. Every point is a per-date sum of the "${k.columnName}" column.`,
              ) : undefined}
            >
              <LineChart points={toWidgetSeries(k.trend)} fmt={fmtNum} />
            </Card>
          ))}
        </div>
      )}

      {d.breakdowns.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--gap-grid)" }}>
          {d.breakdowns.map((b) => (
            <Card
              key={b.columnName}
              title={`${b.label} Breakdown`}
              onClick={auditable ? () => openAudit(
                `${b.label} Breakdown`,
                b.columnName,
                b.label,
                b.bars.length ? `${b.bars[0].label}: ${fmtNum(b.bars[0].value)}` : "—",
                <BarsH rows={b.bars} fmt={fmtNum} />,
                `Rows grouped by the "${b.columnName}" column — ${b.bars.length} distinct values.`,
              ) : undefined}
            >
              <BarsH rows={b.bars} fmt={fmtNum} />
            </Card>
          ))}
        </div>
      )}

      {hasPareto && (
        <Card
          title="Defect Pareto"
          onClick={auditable ? () => {
            // Pareto aggregates many defect columns; trace every defect-role column.
            const defectCols = dataset!.columns.filter((c) => c.role === "defect");
            const src = defectCols.flatMap((c) => columnSourceRows(dataset!, rows!, c.name, c.name));
            const total = d.defectPareto!.reduce((s, x) => s + x.value, 0);
            setModal({
              title: "Defect Pareto",
              insight: `${fmtNum(total)} defect units across ${d.defectPareto!.length} defect classes, read from ${defectCols.length} defect columns in the staged sheet.`,
              content: (
                <ParetoChart
                  analysis={
                    calculatePareto(d.defectPareto!) || {
                      items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0,
                      criticalAreaText: "No defect data available.",
                    }
                  }
                />
              ),
              source: src.length ? { rows: src, value: fmtNum(total) } : undefined,
            });
          } : undefined}
        >
          <ParetoChart
            analysis={
              calculatePareto(d.defectPareto!) || {
                items: [],
                totalDefects: 0,
                vitalFewCount: 0,
                vitalFewContribution: 0,
                criticalAreaText: "No defect data available.",
              }
            }
          />
        </Card>
      )}

      {modal && (
        <FloatingDetailModal
          isOpen
          onClose={() => setModal(null)}
          title={modal.title}
          insight={modal.insight}
          sourceRows={modal.source?.rows}
          primaryValue={modal.source?.value}
        >
          {modal.content}
        </FloatingDetailModal>
      )}
    </div>
  );
}
