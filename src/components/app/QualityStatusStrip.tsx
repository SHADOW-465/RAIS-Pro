"use client";

import { useState } from "react";
import type { QualityStatusT } from "@/lib/analytics";
import Icon from "@/components/editorial/Icon";

export default function QualityStatusStrip({ status }: { status: QualityStatusT }) {
  const [expanded, setExpanded] = useState(false);

  const isBlocked = status.state === "blocked";
  const isWatch = status.state === "watch" || status.state === "at-risk";

  const tone = isBlocked
    ? "var(--status-bad)"
    : isWatch
    ? "var(--status-warn)"
    : "var(--status-good)";

  const badgeText = isBlocked
    ? "BLOCKED"
    : isWatch
    ? "WATCH"
    : "NORMAL";

  const issuesCount = status.integrityIssues?.length ?? 0;
  const criticalCount = status.integrityIssues?.filter((i) => i.severity === "critical").length ?? 0;

  const titleText = isBlocked
    ? "Data integrity blocked — ledger is not OK"
    : isWatch
    ? "Quality Watch Alert — threshold exceeded"
    : "All quality status gates normal";

  const subtitleText = isBlocked
    ? `${issuesCount} open issue${issuesCount !== 1 ? "s" : ""} · ${criticalCount} critical · click to ${expanded ? "collapse" : "expand"}`
    : status.reason;

  return (
    <div
      style={{
        border: `1.5px solid ${tone}`,
        borderRadius: "var(--radius-lg)",
        background: `color-mix(in srgb, ${tone} 6%, var(--surface))`,
        boxShadow: "var(--shadow-1)",
        overflow: "hidden",
        transition: "all 0.15s ease",
      }}
    >
      <div
        onClick={() => issuesCount > 0 && setExpanded(!expanded)}
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          cursor: issuesCount > 0 ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <span
            style={{
              color: tone,
              fontSize: 10,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14,
              height: 14,
            }}
          >
            {isBlocked ? "▶" : isWatch ? "▲" : "✓"}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: tone,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>{titleText}</span>
            </div>
            <div
              className="muted"
              style={{
                fontSize: 12.5,
                marginTop: 2,
                color: "var(--text-2)",
                fontFamily: isBlocked ? "var(--font-sans)" : "inherit",
              }}
            >
              {subtitleText}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              color: tone,
              border: `1.5px solid ${tone}`,
              borderRadius: 9999,
              padding: "3px 12px",
              background: `color-mix(in srgb, ${tone} 12%, transparent)`,
            }}
          >
            {badgeText}
          </span>
        </div>
      </div>

      {expanded && status.integrityIssues && status.integrityIssues.length > 0 && (
        <div
          style={{
            borderTop: `1px solid color-mix(in srgb, ${tone} 30%, var(--border))`,
            padding: "12px 18px 16px",
            background: "var(--surface)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-3)",
              marginBottom: 4,
            }}
          >
            Open Data Integrity Issues ({status.integrityIssues.length})
          </div>
          {status.integrityIssues.map((issue, idx) => {
            const detail = [
              issue.batch && `Batch ${issue.batch}`,
              issue.stageId,
              issue.date,
              issue.stated != null && issue.computed != null
                ? `stated ${issue.stated} vs computed ${issue.computed}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
            <div
              key={`${issue.code}-${idx}`}
              style={{
                fontSize: 12.5,
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{issue.message}</span>
                {detail && (
                  <span className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
                    {detail}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: issue.severity === "critical" ? "var(--status-bad)" : "var(--status-warn)",
                  background: `color-mix(in srgb, ${issue.severity === "critical" ? "var(--status-bad)" : "var(--status-warn)"} 15%, transparent)`,
                  padding: "2px 6px",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                {issue.severity}
              </span>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
