// src/components/ChartContainer.tsx
"use client";

import type { ReactNode } from "react";
import {
  TrendLine,
  VerticalBars,
  Donut,
} from "@/components/editorial/EditorialCharts";
import ParetoChart from "@/components/ParetoChart";
import { calculatePareto } from "@/lib/dashboard-builder";
import { getTargetRejectionRate } from "@/lib/analytics";

type ChartType = "line" | "bar" | "horizontalBar" | "area" | "pie" | "doughnut" | "radar";

interface ChartData {
  labels: string[];
  datasets: Array<{
    label?: string;
    data: number[];
  }>;
}

interface ChartContainerProps {
  title: string;
  description?: string;
  type: ChartType;
  data: ChartData;
  /** Optional figure number prefix e.g. "01" — rendered as "Fig. 01" */
  figNum?: string;
  /** Optional kicker line above the title */
  kicker?: string;
  /** Optional bottom note in italic */
  note?: string;
  onClick?: () => void;
}

export default function ChartContainer({
  title,
  description,
  type,
  data,
  figNum,
  kicker,
  note,
  onClick,
}: ChartContainerProps) {
  const labels = data?.labels ?? [];
  const series = data?.datasets?.[0]?.data ?? [];

  const seriesSum = series.reduce((sum, v) => sum + v, 0);
  const seriesMax = series.length > 0 ? Math.max(...series) : 0;
  const seriesAvg = series.length > 0 ? seriesSum / series.length : 0;

  const isRate = title.toLowerCase().includes("rate") || (data.datasets?.[0]?.label ?? "").toLowerCase().includes("rate");
  const formatVal = (v: number) => {
    return isRate ? `${v.toFixed(1)}%` : String(Math.round(v));
  };

  const renderChart = (): ReactNode => {
    if (type === "line" || type === "area") {
      const targetVal = isRate ? getTargetRejectionRate() * 100 : undefined;
      return <TrendLine cycles={labels} values={series} height={260} target={targetVal} />;
    }
    if (type === "horizontalBar") {
      const seriesPoints = labels.map((l, i) => ({ label: l, value: series[i] ?? 0 }));
      const paretoAnalysis = calculatePareto(seriesPoints);
      if (paretoAnalysis) {
        return <ParetoChart analysis={paretoAnalysis} />;
      }

      const rows = labels.map((l, i) => ({ label: l, value: series[i] ?? 0 }));
      const maxVal = Math.max(...series, 1);
      const totalVal = series.reduce((sum, val) => sum + val, 0) || 1;

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {rows.map((row, idx) => {
            const percentage = (row.value / totalVal) * 100;
            const barWidth = (row.value / maxVal) * 100;
            const rank = String(idx + 1).padStart(2, "0");
            const barColor = `var(--viz-${(idx % 8) + 1})`;
            return (
              <div key={row.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div className="between" style={{ fontSize: 13, fontWeight: 500 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="num" style={{ fontWeight: 700, color: "var(--text-3)", fontSize: 12 }}>
                      {rank}
                    </span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{row.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="num" style={{ color: "var(--text)" }}>{row.value}</span>
                    <span className="num muted" style={{ color: "var(--text-3)", fontSize: 11 }}>
                      ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
                {/* Thin proportion bar */}
                <div style={{ height: 6, width: "100%", backgroundColor: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${barWidth}%`,
                      backgroundColor: barColor,
                      borderRadius: 3,
                      transition: "width 0.4s ease-out",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    if (type === "bar" || type === "radar") {
      const rows = labels.map((l, i) => ({ label: l, value: series[i] ?? 0 }));
      return <VerticalBars data={rows} labelKey="label" valueKey="value" height={240} />;
    }
    if (type === "pie" || type === "doughnut") {
      const rows = labels.map((l, i) => ({ label: l, value: series[i] ?? 0 }));
      return (
        <div className="flex gap-6" style={{ alignItems: "center" }}>
          <div style={{ flex: "0 0 220px" }}>
            <Donut data={rows} labelKey="label" valueKey="value" size={220} />
          </div>
          <DonutLegend rows={rows} />
        </div>
      );
    }
    return null;
  };

  const sub = description ?? note;

  return (
    <div 
      onClick={onClick}
      className={`card ${onClick ? "card-hover" : ""}`} 
      style={{ overflow: "hidden", cursor: onClick ? "pointer" : "default" }}
    >
      <div style={{ paddingBottom: 16 }}>
        <div className="between" style={{ alignItems: "flex-start", gap: 16 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              {figNum && <span style={{ color: "var(--accent)" }}>Fig. {figNum}</span>}
              {figNum && kicker && <span style={{ marginLeft: 8, color: "var(--text-3)" }}>· {kicker}</span>}
              {!figNum && kicker && <span style={{ color: "var(--text-3)" }}>{kicker}</span>}
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0, fontWeight: 800, color: "var(--text)" }}>
              {title}
            </h3>
            {/* Calculated Mini-Stats */}
            {series.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <div style={{ fontSize: 11, padding: "2px 6px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--surface-2)", color: "var(--text-2)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" }}>Avg</span>
                  <span className="num" style={{ fontWeight: 700 }}>{formatVal(seriesAvg)}</span>
                </div>
                <div style={{ fontSize: 11, padding: "2px 6px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--surface-2)", color: "var(--text-2)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" }}>Peak</span>
                  <span className="num" style={{ fontWeight: 700 }}>{formatVal(seriesMax)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ marginTop: 4 }}>
            {type === "bar" ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
                  <span style={{ width: 8, height: 8, backgroundColor: "var(--viz-1)", borderRadius: "50%" }} />
                  <span>Normal</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
                  <span style={{ width: 8, height: 8, backgroundColor: "var(--critical)", borderRadius: "50%" }} />
                  <span>Worst Stage</span>
                </div>
              </div>
            ) : data.datasets?.[0]?.label && type !== "pie" && type !== "doughnut" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-2)" }}>
                <span style={{ width: 8, height: 8, backgroundColor: "var(--viz-1)", borderRadius: "50%" }} />
                <span>{data.datasets[0].label}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div>{renderChart()}</div>
      {sub && (
        <div
          style={{
            paddingTop: 14,
            fontSize: 12,
            color: "var(--text-3)",
            fontStyle: "italic",
            borderTop: "1px dashed var(--border)",
            marginTop: 14,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function getSegmentColor(label: string, i: number): string {
  const l = label.toLowerCase();
  if (l.includes("reject") || l.includes("defect") || l.includes("fail")) {
    return "var(--critical)";
  }
  if (l.includes("accept") || l.includes("pass") || l.includes("ok") || l.includes("good")) {
    return "var(--positive)";
  }
  if (l.includes("hold")) {
    return "var(--warning)";
  }
  return `var(--viz-${(i % 8) + 1})`;
}

function DonutLegend({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr", gap: "6px" }}>
      {rows.map((r, i) => (
        <div key={r.label} className="flex gap-2" style={{ alignItems: "center", fontSize: 12, color: "var(--text)" }}>
          <span style={{ width: 10, height: 10, background: getSegmentColor(r.label, i), borderRadius: "2px" }} />
          <span style={{ flex: 1 }}>{r.label}</span>
          <span className="num muted" style={{ color: "var(--text-3)" }}>{((r.value / total) * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}
