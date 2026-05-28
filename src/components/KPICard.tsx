// src/components/KPICard.tsx
"use client";

import { forwardRef } from "react";
import type { KPI } from "@/types/dashboard";
import Icon from "@/components/editorial/Icon";
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

  const trendIcon: "trend-up" | "trend-down" | "minus" =
    trend === 1 ? "trend-up" : trend === -1 ? "trend-down" : "minus";
  // For editorial palette: declining = bad → accent (orange); improving = good → positive.
  const trendColor = trend === -1 ? "var(--accent)" : trend === 1 ? "var(--positive)" : "var(--muted)";
  const trendLabel = delta ?? (trend === 1 ? "improving" : trend === -1 ? "declining" : "stable");
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
      className="card"
      style={{
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        transition: "transform 0.15s ease, border-color 0.15s ease",
        borderTop: isActive ? `3px solid var(--accent)` : undefined,
        marginTop: isActive ? -2 : 0,
      }}
    >
      <div className="between" style={{ alignItems: "flex-start", marginBottom: 16 }}>
        <div className="eyebrow" style={{ maxWidth: "70%" }}>
          {label}
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: trendColor,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          <Icon name={trendIcon} size={12} />
          <span className="mono">{trendLabel}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          className="serif tracked-tight"
          style={{
            fontSize: 56,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          {value}
        </span>
        {unit && (
          <span className="mono muted" style={{ fontSize: 14, fontWeight: 500 }}>
            {unit}
          </span>
        )}
      </div>
      <div className="between" style={{ marginTop: 18, alignItems: "flex-end" }}>
        <div className="eyebrow muted" style={{ fontSize: 10 }}>
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
      {isActive && (
        <div
          style={{
            position: "absolute",
            right: -10,
            top: "50%",
            width: 14,
            height: 14,
            background: "var(--accent)",
            transform: "translateY(-50%) rotate(45deg)",
            boxShadow: "1px -1px 0 var(--paper-deep)",
          }}
        />
      )}
    </div>
  );
});

export default KPICard;
