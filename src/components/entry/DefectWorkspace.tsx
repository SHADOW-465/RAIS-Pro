"use client";

import React, { useState, useMemo } from "react";
import QtyInput from "@/components/entry/QtyInput";
import type { DefectDef } from "@/lib/entry/disposafe-matrix";

interface DefectWorkspaceProps {
  activeDefects: DefectDef[];
  defects: Record<string, number>;
  onSetDefectQty: (key: string, n: number | null) => void;
  onClearAllDefects: () => void;
  reject: number;
}

export default function DefectWorkspace({
  activeDefects,
  defects,
  onSetDefectQty,
  onClearAllDefects,
  reject,
}: DefectWorkspaceProps) {
  const [filter, setFilter] = useState("");

  const defectSum = useMemo(
    () => Object.values(defects).reduce((a, b) => a + (Number(b) || 0), 0),
    [defects],
  );

  const unexplained = Math.max(0, reject - defectSum);
  const overDefect = Math.max(0, defectSum - reject);
  const activeDefectCount = Object.values(defects).filter((v) => v > 0).length;

  const visibleDefects = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return activeDefects
      .map((d, index) => ({ d, index }))
      .filter(
        ({ d }) =>
          !q ||
          d.key.toLowerCase().includes(q) ||
          (d.name ?? "").toLowerCase().includes(q),
      );
  }, [activeDefects, filter]);

  if (activeDefects.length === 0) return null;

  return (
    <section
      aria-label="Defect Breakdown Matrix"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg, 12px)",
        padding: "20px",
        marginBottom: 20,
        boxShadow: "var(--shadow-1)",
      }}
    >
      {/* Header & Filter Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
          borderBottom: "1px solid var(--border)",
          paddingBottom: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Defect Breakdown (Itemized Causes)
            </h2>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: "var(--text-3)",
                background: "var(--surface-2)",
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              {activeDefectCount} active / {activeDefects.length} codes
            </span>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            Defects explain rejected pieces — balance must match total Rejected ({reject}).
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Quick Search */}
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search defect code/name…"
            aria-label="Filter defect tiles"
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: "var(--radius-sm, 6px)",
              border: "1px solid var(--border-strong)",
              background: "var(--surface-2)",
              color: "var(--text)",
              fontSize: 12.5,
              width: 190,
              outline: "none",
            }}
          />

          {activeDefectCount > 0 && (
            <button
              type="button"
              onClick={onClearAllDefects}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-3)",
                fontSize: 12,
                fontWeight: 600,
                padding: "0 10px",
                height: 34,
                borderRadius: "var(--radius-sm, 6px)",
                cursor: "pointer",
              }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Defect Coverage Tally Strip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "10px 14px",
          borderRadius: "var(--radius-md, 8px)",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          marginBottom: 16,
          fontSize: 12.5,
          fontFamily: "var(--font-mono)",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span>
            Rejected Target: <strong>{reject}</strong>
          </span>
          <span>
            Itemized Defect Sum: <strong>{defectSum}</strong>
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {reject === 0 && defectSum === 0 && (
            <span style={{ color: "var(--text-3)" }}>No rejections logged</span>
          )}
          {reject > 0 && defectSum === reject && (
            <span style={{ color: "var(--positive)", fontWeight: 700 }}>
              ✓ All {reject} rejected items fully accounted for
            </span>
          )}
          {reject > 0 && defectSum < reject && (
            <span style={{ color: "var(--status-warn, #d97706)", fontWeight: 700 }}>
              ⚠ {unexplained} of {reject} missing defect reasons
            </span>
          )}
          {defectSum > reject && (
            <span style={{ color: "var(--critical)", fontWeight: 700 }}>
              ✕ Overcounted by +{overDefect} (Defect sum {defectSum} &gt; Reject {reject})
            </span>
          )}
        </div>
      </div>

      {/* Defect Code Tiles Grid */}
      {visibleDefects.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "24px",
            color: "var(--text-3)",
            fontSize: 13,
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius-md, 8px)",
          }}
        >
          No defect codes match "{filter}".
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(105px, 1fr))",
            gap: 10,
          }}
        >
          {visibleDefects.map(({ d, index }) => {
            const val = defects[d.key] || 0;
            const active = val > 0;
            const title = d.name || d.key;

            return (
              <div
                key={d.key}
                style={{
                  background: active
                    ? "color-mix(in srgb, var(--accent) 8%, var(--surface))"
                    : "var(--surface-2)",
                  border: active
                    ? "1.5px solid var(--accent)"
                    : "1px solid var(--border)",
                  borderRadius: "var(--radius-md, 8px)",
                  padding: "8px 6px 6px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  position: "relative",
                  boxShadow: active ? "0 1px 3px rgba(200, 66, 28, 0.1)" : "none",
                  transition: "all var(--duration-fast, 120ms) ease",
                }}
              >
                {/* Index tag */}
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 6,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-3)",
                  }}
                >
                  {index + 1}
                </span>

                {/* Defect Code Header */}
                <div
                  title={`${d.key}${d.name ? ` — ${d.name}` : ""}`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: active ? 800 : 600,
                    color: active ? "var(--accent)" : "var(--text)",
                    textAlign: "center",
                    marginBottom: 6,
                    lineHeight: 1.2,
                    width: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    padding: "0 12px 0 16px",
                  }}
                >
                  {d.key}
                </div>

                {/* Qty Input */}
                <QtyInput
                  value={val || null}
                  onChange={(n) => onSetDefectQty(d.key, n)}
                  aria-label={`Defect count for ${d.key} (${title})`}
                  placeholder="0"
                  style={{
                    width: "100%",
                    height: 36,
                    textAlign: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: 14,
                    fontWeight: 700,
                    background: "var(--surface)",
                    border: active
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border-strong)",
                    borderRadius: "var(--radius-sm, 6px)",
                    color: active ? "var(--accent)" : "var(--text)",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
