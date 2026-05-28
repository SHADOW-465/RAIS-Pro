// src/components/InsightSlide.tsx
"use client";

import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import Icon from "@/components/editorial/Icon";
import Pill from "@/components/editorial/Pill";
import {
  TrendLine,
  VerticalBars,
  HorizontalBars,
  Donut,
} from "@/components/editorial/EditorialCharts";
import type { InsightSlide as InsightSlideType, InsightChart } from "@/types/dashboard";

interface InsightSlideProps {
  slide: InsightSlideType;
  onRemove?: () => void;
}

function bolden(s: string): string {
  return s.replace(
    /([0-9]+(?:\.[0-9]+)?%?(?:\s*pt)?|LOT-[A-Z0-9-]+|Line-\d+|Line\s\d+)/g,
    '<strong style="font-weight:700; font-family:var(--mono); padding:1px 4px; background:var(--paper-deep);">$1</strong>',
  );
}

function renderInsightChart(chart: InsightChart) {
  const labels = chart.data?.labels ?? [];
  const series = chart.data?.datasets?.[0]?.data ?? [];

  if (chart.type === "line") {
    return <TrendLine cycles={labels} values={series} height={200} />;
  }
  if (chart.type === "doughnut") {
    const rows = labels.map((l, i) => ({ label: l, value: series[i] ?? 0 }));
    return <Donut data={rows} labelKey="label" valueKey="value" size={200} />;
  }
  // bar — choose horizontal vs vertical based on count
  const rows = labels.map((l, i) => ({ label: l, value: series[i] ?? 0 }));
  if (rows.length <= 6) {
    return (
      <HorizontalBars
        data={rows}
        labelKey="label"
        valueKey="value"
        height={Math.max(140, rows.length * 36)}
      />
    );
  }
  return <VerticalBars data={rows} labelKey="label" valueKey="value" height={220} />;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function InsightSlide({ slide, onRemove }: InsightSlideProps) {
  const slideRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!slideRef.current) return;
    try {
      const paper = getComputedStyle(document.body).getPropertyValue("--paper-soft").trim() || "#FAF8F2";
      const canvas = await html2canvas(slideRef.current, {
        backgroundColor: paper,
        scale: 2,
        useCORS: true,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      const slug = slide.question
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      const date = new Date().toISOString().slice(0, 10);
      a.download = `rais-insight-${slug}-${date}.png`;
      a.click();
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const charts = slide.charts ?? [];

  return (
    <article
      ref={slideRef}
      id={slide.id ? `slide-${slide.id}` : undefined}
      className="fade-up"
      style={{
        background: "var(--paper-soft)",
        border: "1px solid var(--hairline)",
        borderLeft: "4px solid var(--accent)",
        padding: 28,
        position: "relative",
      }}
    >
      {/* Top row */}
      <div className="between mb-4" style={{ alignItems: "flex-start", gap: 16 }}>
        <div className="flex gap-3" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <Pill tone="accent">Drill-down</Pill>
          <span
            className="serif"
            style={{ fontStyle: "italic", fontSize: 15, color: "var(--muted)" }}
          >
            &ldquo;{slide.question}&rdquo;
          </span>
        </div>
        <div className="flex gap-2">
          <button className="btn sm" onClick={handleSave}>
            <Icon name="save" size={12} />
            {saved ? "Saved!" : "Save as PNG"}
          </button>
          {onRemove && (
            <button className="btn ghost sm" onClick={onRemove} aria-label="Remove">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Headline */}
      <h3
        className="serif tracked-tight"
        style={{
          fontSize: 28,
          fontWeight: 500,
          margin: "8px 0 20px",
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          maxWidth: 900,
        }}
      >
        {slide.headline}
      </h3>

      {/* Charts + bullets */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: charts.length > 0 ? "1.1fr 1fr" : "1fr",
          gap: 32,
        }}
      >
        {charts.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minHeight: 200,
            }}
          >
            {charts.slice(0, 2).map((chart, i) => (
              <div key={i}>
                {chart.title && (
                  <div
                    className="eyebrow muted"
                    style={{ fontSize: 10, marginBottom: 6 }}
                  >
                    {chart.title}
                  </div>
                )}
                {renderInsightChart(chart)}
              </div>
            ))}
          </div>
        )}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {slide.bullets.map((b, i) => (
            <li
              key={i}
              className="flex gap-3"
              style={{
                padding: "10px 0",
                borderBottom:
                  i < slide.bullets.length - 1
                    ? "1px dashed var(--hairline)"
                    : "none",
                fontSize: 13,
                lineHeight: 1.55,
                alignItems: "flex-start",
              }}
            >
              <span
                className="mono"
                style={{
                  color: "var(--accent)",
                  fontWeight: 700,
                  fontSize: 11,
                  paddingTop: 2,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span dangerouslySetInnerHTML={{ __html: bolden(b) }} />
            </li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <div
        className="mt-6 between mono"
        style={{
          paddingTop: 14,
          borderTop: "1px solid var(--hairline)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        <span>RAIS · Insight slide{slide.id ? ` #${slide.id.slice(0, 6)}` : ""}</span>
        <span>generated {formatTime(slide.createdAt)}</span>
      </div>
    </article>
  );
}
