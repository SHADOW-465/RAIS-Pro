"use client";

import { Card, Kpi, LineChart, BarsH, Empty } from "@/components/app/widgets";
import ParetoChart from "@/components/ParetoChart";
import { calculatePareto } from "@/lib/dashboard-builder";
import type { GenericDashboard } from "@/lib/dataset/dashboard";

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
 *  read-only section) can omit it. */
export default function GenericDashboardBody({
  d,
  caption,
  publishBanner,
}: {
  d: GenericDashboard;
  caption?: string;
  publishBanner?: PublishBannerProps;
}) {
  const trendKpis = d.kpis.filter((k) => k.trend.length > 0);
  const hasPareto = !!d.defectPareto && d.defectPareto.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(d.kpis.length, 5)}, 1fr)`, gap: 20 }}>
          {d.kpis.map((k) => (
            <Kpi key={k.columnName} label={k.label} value={fmtNum(k.total)} spark={k.trend.length ? toWidgetSeries(k.trend) : undefined} />
          ))}
        </div>
      )}

      {trendKpis.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {trendKpis.map((k) => (
            <Card key={k.columnName} title={`${k.label} — Trend`}>
              <LineChart points={toWidgetSeries(k.trend)} fmt={fmtNum} />
            </Card>
          ))}
        </div>
      )}

      {d.breakdowns.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {d.breakdowns.map((b) => (
            <Card key={b.columnName} title={`${b.label} Breakdown`}>
              <BarsH rows={b.bars} fmt={fmtNum} />
            </Card>
          ))}
        </div>
      )}

      {hasPareto && (
        <Card title="Defect Pareto">
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
    </div>
  );
}
