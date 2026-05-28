// src/components/ChartContainer.tsx
"use client";

import type { ReactNode } from "react";
import {
  TrendLine,
  VerticalBars,
  HorizontalBars,
  Donut,
} from "@/components/editorial/EditorialCharts";

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
}

export default function ChartContainer({
  title,
  description,
  type,
  data,
  figNum,
  kicker,
  note,
}: ChartContainerProps) {
  const labels = data?.labels ?? [];
  const series = data?.datasets?.[0]?.data ?? [];

  const renderChart = (): ReactNode => {
    if (type === "line" || type === "area") {
      return <TrendLine cycles={labels} values={series} height={260} />;
    }
    if (type === "horizontalBar") {
      const rows = labels.map((l, i) => ({ label: l, value: series[i] ?? 0 }));
      return (
        <HorizontalBars
          data={rows}
          labelKey="label"
          valueKey="value"
          height={Math.max(180, rows.length * 42)}
        />
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
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ paddingBottom: 16 }}>
        <div className="between mb-3" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              {figNum && <span style={{ color: "var(--accent)" }}>Fig. {figNum}</span>}
              {figNum && kicker && <span style={{ marginLeft: 10, color: "var(--muted)" }}>· {kicker}</span>}
              {!figNum && kicker && <span style={{ color: "var(--muted)" }}>{kicker}</span>}
            </div>
            <h3 className="serif tracked-tight" style={{ fontSize: 20, margin: 0, fontWeight: 600 }}>
              {title}
            </h3>
          </div>
        </div>
      </div>
      <div>{renderChart()}</div>
      {sub && (
        <div
          style={{
            paddingTop: 14,
            fontSize: 12,
            color: "var(--muted)",
            fontStyle: "italic",
            borderTop: "1px dashed var(--hairline)",
            marginTop: 14,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function DonutLegend({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const palette = [
    "var(--accent)",
    "#1F1D18",
    "#3F3D34",
    "#615C50",
    "#85806F",
    "#A8A28F",
  ];
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
      {rows.map((r, i) => (
        <div key={r.label} className="flex gap-2" style={{ alignItems: "center", fontSize: 12 }}>
          <span style={{ width: 10, height: 10, background: palette[i] ?? "#999" }} />
          <span style={{ flex: 1 }}>{r.label}</span>
          <span className="mono muted">{((r.value / total) * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}
