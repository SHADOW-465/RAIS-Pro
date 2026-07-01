"use client";

import { useEffect, useState } from "react";
import { Card, Kpi, LineChart, BarsH, Empty } from "@/components/app/widgets";
import PageLoader from "@/components/app/PageLoader";
import ParetoChart from "@/components/ParetoChart";
import { calculatePareto } from "@/lib/dashboard-builder";
import { buildGenericDashboard } from "@/lib/dataset/dashboard";
import type { Dataset, DatasetRow } from "@/lib/dataset/types";

const fmtNum = (n: number) => Math.round(n).toLocaleString("en-IN");

/** Renders any persisted Dataset generically — KPIs from measure columns, a
 *  trend per KPI when a date dimension exists, breakdowns per dimension column,
 *  and a defect Pareto when defect columns exist. Used for datasets that are
 *  NOT (yet) recognized as a known Disposafe stage — see spec component [F1].
 *  Fetches its own data (dataset metadata + rows) so it stays fully decoupled
 *  from AppShell's tab list, which only needs id/title to render the tab. */
export default function GenericDatasetView({ datasetId }: { datasetId: string }) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [rows, setRows] = useState<DatasetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataset(null);
    setRows(null);
    setError(null);
    setLoaded(false);
    Promise.all([
      fetch("/api/datasets").then((r) => {
        if (!r.ok) throw new Error(`Failed to load datasets (${r.status})`);
        return r.json();
      }),
      fetch(`/api/datasets?datasetId=${encodeURIComponent(datasetId)}`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load dataset rows (${r.status})`);
        return r.json();
      }),
    ])
      .then(([listJson, rowsJson]) => {
        if (cancelled) return;
        const found = ((listJson.datasets ?? []) as Dataset[]).find((d) => d.id === datasetId) ?? null;
        setDataset(found);
        setRows((rowsJson.rows ?? []) as DatasetRow[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load dataset");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  if (error) return <Empty label={`Could not load this dataset: ${error}`} />;
  if (!loaded) return <PageLoader message="Loading dataset..." minHeight="40vh" />;
  if (!dataset || rows === null) {
    return <Empty label="This dataset no longer exists — it may have been cleared. Try refreshing the View list." />;
  }

  const d = buildGenericDashboard(dataset, rows);
  const trendKpis = d.kpis.filter((k) => k.trend.length > 0);
  const hasPareto = !!d.defectPareto && d.defectPareto.length > 0;
  // widgets.tsx's Kpi/LineChart consume @/lib/analytics's SeriesPoint, which
  // carries a `period` key (used for grain-aware label thinning) alongside
  // {label, value}. buildGenericDashboard's trend points are {label, value}
  // only (no calendar-grain concept for an arbitrary Dataset), so adapt here
  // rather than widen the shared widget type for this one caller.
  const toWidgetSeries = (pts: { label: string; value: number }[]) =>
    pts.map((p) => ({ period: p.label, label: p.label, value: p.value }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {d.kpis.length === 0 ? (
        <Empty label="This dataset has no measure columns to summarize — it may be a derived or summary sheet." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(d.kpis.length, 5)}, 1fr)`, gap: 16 }}>
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
