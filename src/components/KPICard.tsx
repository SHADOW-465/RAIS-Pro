// src/components/KPICard.tsx
"use client";

import { forwardRef } from "react";
import type { KPI } from "@/types/dashboard";
import Icon, { type IconName } from "@/components/editorial/Icon";
import { Sparkline } from "@/components/editorial/EditorialCharts";

interface KPICardProps {
  kpi: KPI;
  isActive?: boolean;
  onClick?: () => void;
}

const KPICard = forwardRef<HTMLDivElement, KPICardProps>(function KPICard(
  { kpi, isActive, onClick },
  ref,
) {
  const { label, value, unit, trend, context, delta, history, source, sourceColumn } = kpi;

  const getKpiIcon = (label: string): IconName => {
    const l = label.toLowerCase();
    if (l.includes("rate")) return "tally";
    if (l.includes("rejected")) return "alert";
    if (l.includes("checked")) return "table";
    if (l.includes("accepted")) return "check";
    if (l.includes("hold")) return "minus";
    return "file";
  };

  let trendBg = "var(--surface-2)";
  let trendText = "var(--text-3)";
  let trendWord = "stable";
  let arrowIcon: IconName = "minus";

  if (trend === 1) {
    trendBg = "var(--positive-weak)";
    trendText = "var(--positive)";
    trendWord = delta ?? "improving";
    arrowIcon = "chevron-down";
  } else if (trend === -1) {
    trendBg = "var(--critical-weak)";
    trendText = "var(--critical)";
    trendWord = delta ?? "declining";
    arrowIcon = "chevron-up";
  } else if (delta) {
    trendWord = delta;
  }

  const srcTag = source ?? sourceColumn ?? "—";

  return (
    <div
      ref={ref}
      data-kpi-id={kpi.label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      className={`card ${onClick ? "card-hover" : ""}`}
      style={{
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        borderWidth: isActive ? 2 : 1,
        borderColor: isActive ? "var(--accent)" : "var(--border)",
        background: isActive ? "var(--accent-weak)" : "var(--surface)",
        outline: isActive ? "2px solid var(--accent)" : undefined,
        outlineOffset: isActive ? "-2px" : undefined,
      }}
    >
      <div className="between" style={{ alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--accent-weak)",
              color: "var(--accent-text)",
            }}
          >
            <Icon name={getKpiIcon(label)} size={14} />
          </div>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--text-2)",
            }}
          >
            {label}
          </span>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            borderRadius: "var(--radius-pill)",
            backgroundColor: trendBg,
            color: trendText,
            fontSize: "0.75rem",
            fontWeight: 600,
          }}
        >
          <Icon name={arrowIcon} size={12} />
          <span>{trendWord}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          className="num"
          style={{
            fontSize: "3.25rem",
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            className="num"
            style={{
              fontSize: "1.25rem",
              fontWeight: 500,
              color: "var(--text-3)",
              marginLeft: 4,
            }}
          >
            {unit}
          </span>
        )}
      </div>

      <div className="between" style={{ marginTop: 18, alignItems: "flex-end" }}>
        <div className="eyebrow muted" style={{ fontSize: 10, fontWeight: 700 }}>
          {context ? context : `SRC · ${srcTag}`}
        </div>
        {history && history.length > 1 && (
          <Sparkline
            values={history}
            trend={trend === -1 ? "up-bad" : "up-good"}
            width={110}
            height={28}
          />
        )}
      </div>
    </div>
  );
});

export default KPICard;
