"use client";

// Work in progress — lots that entered the line and have not cleared Final.
//
// This was computable from the day batch-progress landed and visible nowhere:
// ~25 of 66 lots sit mid-line at any time, the oldest idle over a month, and
// the only surface was a small count inside a filter bar on a tab nobody opens
// first. It is a worklist, not a rate, so it gets its own band rather than a
// sixth executive KPI — and it names the actual lots, because "3 stalled" sends
// you hunting while "26G01-6, idle 38 days" is something you can act on.

import React from "react";
import { openWip, type BatchProgress } from "@/lib/analytics/batch-progress";
import type { AuditEventLike } from "@/lib/analytics/audit-sessions";
import { parseBatchId } from "@/lib/entry/batch-id";
import { sizeColorFor } from "@/lib/entry/size-color";

const NAMED = 3;

export default function OpenWipStrip({
  events,
  embedded,
}: {
  events: AuditEventLike[];
  /** Drop the outer top margin when this strip sits inside the dashboard board. */
  embedded?: boolean;
}) {
  const wip = React.useMemo(() => openWip(events), [events]);

  // Nothing open is genuinely good news on a shop floor, and an empty band
  // every day would train people to stop reading this row.
  if (wip.openCount === 0) return null;

  const worst = wip.lots.filter((l) => l.stalled).slice(0, NAMED);
  const hasStalled = wip.stalledCount > 0;

  return (
    <>
      <style>{`
        .lot-chip-hover:hover {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--warning) 60%, var(--border)) !important;
          background: color-mix(in srgb, var(--warning) 14%, var(--surface)) !important;
          box-shadow: var(--shadow-sm);
        }
        .wip-action-btn:hover {
          background: var(--accent-weak) !important;
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border)) !important;
          color: var(--accent-hover, var(--accent)) !important;
          box-shadow: var(--shadow-sm);
        }
        .wip-action-btn:hover .wip-arrow {
          transform: translateX(3px) !important;
        }
      `}</style>
      <section
        aria-label="Work in progress telemetry"
        style={{
          marginTop: embedded ? 0 : "var(--gap-grid)",
          padding: "14px 20px",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          borderLeft: hasStalled
            ? "4px solid var(--warning)"
            : "4px solid var(--positive)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-1)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "14px 24px",
          position: "relative",
          minHeight: 74,
        }}
      >
        {/* Status Anchor & Primary Telemetry Metrics */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
          {/* Identity Tag with Live Indicator */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingRight: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: hasStalled ? "var(--warning)" : "var(--positive)",
                  boxShadow: hasStalled
                    ? "0 0 0 3px color-mix(in srgb, var(--warning) 28%, transparent)"
                    : "0 0 0 3px color-mix(in srgb, var(--positive) 28%, transparent)",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-2)",
                }}
              >
                Line WIP
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, paddingLeft: 16 }}>
              Active Flow
            </span>
          </div>

          <div style={{ width: 1, height: 38, background: "var(--border)" }} />

          {/* Metric 1: Lots Open */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 78 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--text-3)",
                marginBottom: 2,
              }}
            >
              Lots Open
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: "var(--text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {wip.openCount}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>in line</span>
            </div>
          </div>

          <div style={{ width: 1, height: 38, background: "var(--border)" }} />

          {/* Metric 2: Stalled Lots */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 98 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: hasStalled ? "var(--warning)" : "var(--text-3)",
                }}
              >
                Stalled
              </span>
              {hasStalled && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: "var(--warning-weak)",
                    color: "var(--warning)",
                    border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
                    letterSpacing: "0.02em",
                    lineHeight: 1.1,
                  }}
                >
                  ALERT
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: hasStalled ? "var(--warning)" : "var(--text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {wip.stalledCount}
              </span>
              <span style={{ fontSize: 11.5, color: hasStalled ? "var(--warning)" : "var(--text-3)", fontWeight: 500 }}>
                {hasStalled ? "no gate in 3+ days" : "zero"}
              </span>
            </div>
          </div>

          <div style={{ width: 1, height: 38, background: "var(--border)" }} />

          {/* Metric 3: Units Waiting */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 110 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--text-3)",
                marginBottom: 2,
              }}
            >
              Units Waiting
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: "var(--text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {wip.unitsWaiting.toLocaleString("en-IN")}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>queued</span>
            </div>
          </div>
        </div>

        {/* Bottleneck Triage Section (fills middle space with crisp, legible badges) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flex: "1 1 340px",
            minWidth: 0,
            paddingLeft: 6,
          }}
        >
          {worst.length > 0 ? (
            <>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-3)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Bottlenecks:
              </span>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 2,
                  minWidth: 0,
                }}
              >
                {worst.map((l) => (
                  <LotChip key={l.batch} lot={l} />
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-2)", fontSize: 12.5, fontWeight: 500 }}>
              <span style={{ color: "var(--positive)", fontWeight: 700, fontSize: 14 }}>✓</span>
              <span>All active lots advancing smoothly across quality gates (&lt;3 days idle)</span>
            </div>
          )}
        </div>

        {/* Right Action CTA Button */}
        <a
          href="/open-lots"
          className="wip-action-btn"
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 16px",
            borderRadius: "var(--radius-pill)",
            border: "1px solid var(--border-strong)",
            background: "var(--surface-2)",
            color: "var(--accent)",
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
            transition: "all 0.15s ease",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <span>Review open lots</span>
          <span
            className="wip-arrow"
            style={{
              fontSize: 14,
              display: "inline-block",
              transition: "transform 0.15s ease",
            }}
          >
            →
          </span>
        </a>
      </section>
    </>
  );
}

/** One stalled lot, named, with size badge, gate progress, and idle duration. */
function LotChip({ lot }: { lot: BatchProgress }) {
  const sizeFr = parseBatchId(lot.batch)?.sizeFr;
  const swatch = sizeFr ? sizeColorFor(sizeFr) : null;
  const nextStage = lot.nextGate?.label;

  return (
    <a
      href={`/audit?batch=${encodeURIComponent(lot.batch)}`}
      title={`${lot.doneCount}/${lot.totalCount} gates cleared · currently waiting at ${nextStage ?? "next gate"} (${lot.daysIdle} days idle). Click to view batch audit trail.`}
      className="lot-chip-hover"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: "var(--radius-md)",
        border: "1px solid color-mix(in srgb, var(--warning) 38%, var(--border))",
        background: "color-mix(in srgb, var(--warning) 8%, var(--surface))",
        whiteSpace: "nowrap",
        textDecoration: "none",
        cursor: "pointer",
        transition: "all 0.15s ease",
        flexShrink: 0,
      }}
    >
      {swatch && (
        <span
          title={`${swatch.name} (${sizeFr}Fr)`}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: swatch.hex,
            flexShrink: 0,
            boxShadow: swatch.hex.toUpperCase() === "#FFFFFF" ? "inset 0 0 0 1px var(--border-strong)" : undefined,
          }}
        />
      )}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.01em",
        }}
      >
        {lot.batch}
      </span>
      {nextStage && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-2)",
            maxWidth: 110,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {nextStage}
        </span>
      )}
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          color: "var(--warning)",
          background: "var(--warning-weak)",
          padding: "2px 7px",
          borderRadius: 4,
          border: "1px solid color-mix(in srgb, var(--warning) 25%, transparent)",
          lineHeight: 1.2,
        }}
      >
        {lot.daysIdle}d idle
      </span>
    </a>
  );
}
