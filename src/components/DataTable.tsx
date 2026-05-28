// src/components/DataTable.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { RawSheet } from "@/types/dashboard";

interface DataTableProps {
  sheets: RawSheet[];
  /** Exact column names to highlight (from matched sourceColumn) */
  highlightColumns: string[];
  /** Callback to expose column header DOM elements for beam drawing */
  onColumnRef: (column: string, el: HTMLTableCellElement | null) => void;
}

/** Normalize a string for fuzzy column matching */
export function normalizeColName(s: string): string {
  return s.toLowerCase().replace(/[\s_\-().]/g, "");
}

/** Find best matching column name in a list */
export function findColumn(target: string, columns: string[]): string | null {
  const t = normalizeColName(target);
  const exact = columns.find((c) => normalizeColName(c) === t);
  if (exact) return exact;
  const partial = columns.find((c) => {
    const n = normalizeColName(c);
    return n.includes(t) || t.includes(n);
  });
  return partial ?? null;
}

export default function DataTable({ sheets, highlightColumns, onColumnRef }: DataTableProps) {
  const [activeSheet, setActiveSheet] = useState(0);
  const sheet = sheets[activeSheet];
  const wrapRef = useRef<HTMLDivElement>(null);

  // Scroll first highlighted column into view
  useEffect(() => {
    if (highlightColumns.length === 0 || !wrapRef.current) return;
    const th = wrapRef.current.querySelector<HTMLTableCellElement>(
      `[data-col="${CSS.escape(highlightColumns[0])}"]`,
    );
    if (th) th.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [highlightColumns]);

  if (!sheet) {
    return (
      <div
        className="muted"
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          fontSize: 13,
        }}
      >
        No source data available.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div
          style={{
            borderBottom: "1px solid var(--ink)",
            padding: "12px 20px 0",
            display: "flex",
            gap: 4,
            background: "var(--paper-soft)",
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          {sheets.map((s, i) => {
            const isActive = i === activeSheet;
            return (
              <button
                key={`${s.fileName}-${s.name}-${i}`}
                onClick={() => setActiveSheet(i)}
                style={{
                  padding: "10px 14px",
                  background: isActive ? "var(--ink)" : "transparent",
                  color: isActive ? "var(--paper-soft)" : "var(--ink)",
                  border: isActive ? "1px solid var(--ink)" : "1px solid transparent",
                  borderBottom: "none",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  fontFamily: "var(--sans)",
                  position: "relative",
                  top: 1,
                  whiteSpace: "nowrap",
                }}
                title={`${s.fileName} :: ${s.name}`}
              >
                <span className="mono">{s.fileName.replace(/\.[^.]+$/, "")}</span>
                <span style={{ opacity: 0.5, margin: "0 6px" }}>·</span>
                <span>{s.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sheet meta strip */}
      <div
        style={{
          padding: "8px 20px",
          background: "var(--paper)",
          borderBottom: "1px solid var(--hairline)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: "var(--muted)",
          fontFamily: "var(--mono)",
          letterSpacing: "0.06em",
          flexShrink: 0,
        }}
      >
        <span>
          {sheet.rows.length} of {sheet.rows.length} rows shown
        </span>
        <span className="flex gap-3">
          <span>{sheet.columns.length} cols</span>
          {highlightColumns[0] && (
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>
              ◆ {highlightColumns[0]} highlighted
            </span>
          )}
        </span>
      </div>

      {/* Table */}
      <div ref={wrapRef} style={{ flex: 1, overflow: "auto", padding: "12px 20px 20px" }}>
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            fontFamily: "var(--mono)",
            fontSize: 11,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "8px 6px",
                  textAlign: "left",
                  background: "var(--paper)",
                  borderBottom: "2px solid var(--ink)",
                  fontFamily: "var(--sans)",
                  fontWeight: 600,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  width: 28,
                  position: "sticky",
                  top: 0,
                }}
              >
                #
              </th>
              {sheet.columns.map((c) => {
                const isHighlight = highlightColumns.includes(c);
                return (
                  <th
                    key={c}
                    data-col={c}
                    ref={(el) => onColumnRef(c, el)}
                    style={{
                      padding: "8px 10px",
                      textAlign: "left",
                      background: isHighlight ? "var(--accent)" : "var(--paper)",
                      color: isHighlight ? "var(--paper-soft)" : "var(--ink)",
                      borderBottom: "2px solid var(--ink)",
                      fontFamily: "var(--sans)",
                      fontWeight: 600,
                      fontSize: 11,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      transition: "background 0.25s ease",
                      position: "sticky",
                      top: 0,
                      borderLeft: isHighlight ? "2px solid var(--accent)" : "none",
                      borderRight: isHighlight ? "2px solid var(--accent)" : "none",
                    }}
                  >
                    {c}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: "1px solid var(--hairline)" }}>
                <td style={{ padding: "6px 6px", color: "var(--muted)", fontSize: 10 }}>
                  {String(ri + 1).padStart(3, "0")}
                </td>
                {sheet.columns.map((c, ci) => {
                  const isHighlight = highlightColumns.includes(c);
                  return (
                    <td
                      key={`${ri}-${ci}`}
                      style={{
                        padding: "6px 10px",
                        background: isHighlight ? "var(--accent-soft)" : "transparent",
                        color: "var(--ink)",
                        fontWeight: isHighlight ? 600 : 400,
                        whiteSpace: "nowrap",
                        borderLeft: isHighlight ? "2px solid var(--accent)" : "none",
                        borderRight: isHighlight ? "2px solid var(--accent)" : "none",
                        transition: "background 0.25s ease",
                      }}
                    >
                      {String(row[c] ?? "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div
          className="mt-6 mono muted"
          style={{
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          ↑ Showing {sheet.rows.length} rows · click a KPI on the left to trace its origin
        </div>
      </div>
    </div>
  );
}
