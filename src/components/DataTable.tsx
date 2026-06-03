// src/components/DataTable.tsx
// Presentational table for ONE sheet. Navigation (file / month switching) is
// owned by VerifyPanel. Highlights a single source column and shows its
// reconciliation total.
"use client";

import { useEffect, useRef } from "react";
import type { RawSheet } from "@/types/dashboard";
import { columnTotal } from "@/lib/verify-nav";

// Re-exported for backward compatibility with existing imports.
export { findColumn, normalizeColName } from "@/lib/verify-nav";

interface DataTableProps {
  sheet: RawSheet;
  /** Exact column name to highlight (already resolved), or null. */
  highlightColumn: string | null;
  /** Expose the highlighted column's header cell for beam drawing. */
  onColumnRef: (column: string, el: HTMLTableCellElement | null) => void;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function DataTable({ sheet, highlightColumn, onColumnRef }: DataTableProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Scroll the highlighted column into view whenever it changes.
  useEffect(() => {
    if (!highlightColumn || !wrapRef.current) return;
    const th = wrapRef.current.querySelector<HTMLTableCellElement>(
      `[data-col="${CSS.escape(highlightColumn)}"]`,
    );
    if (th) th.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [highlightColumn, sheet.name]);

  const total = highlightColumn ? columnTotal(sheet, highlightColumn) : null;

  // Scan rows to determine which columns are numeric (>= 60% numeric values in non-blank rows)
  const numericColumns = new Set<string>();
  sheet.columns.forEach((c) => {
    let numCount = 0;
    let nonBlank = 0;
    sheet.rows.forEach((row) => {
      const val = row[c];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        nonBlank++;
        if (!isNaN(Number(String(val).trim()))) {
          numCount++;
        }
      }
    });
    if (nonBlank > 0 && numCount / nonBlank > 0.6) {
      numericColumns.add(c);
    }
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Meta strip */}
      <div
        style={{
          padding: "8px 20px",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: "var(--text-3)",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.06em",
          flexShrink: 0,
        }}
      >
        <span>{sheet.rows.length} rows · {sheet.columns.length} cols</span>
        {highlightColumn && (
          <span style={{ color: "var(--accent-text)", fontWeight: 700, display: "inline-flex", gap: 6 }}>
            <span>◆ {highlightColumn}</span>
            {total != null && <span>· Σ = {fmt(total)}</span>}
          </span>
        )}
      </div>

      {/* Table */}
      <div ref={wrapRef} style={{ flex: 1, overflow: "auto", padding: "12px 20px 20px" }}>
        <style dangerouslySetInnerHTML={{ __html: `
          .verify-table tr:nth-child(even) td:not(.highlighted-cell) {
            background-color: var(--surface-2);
          }
          .verify-table tr:hover td:not(.highlighted-cell) {
            background-color: var(--surface-3) !important;
          }
          .verify-table tr:hover td.highlighted-cell {
            background-color: var(--accent-weak) !important;
            filter: brightness(0.97);
          }
        `}} />
        <table
          className="verify-table"
          style={{
            borderCollapse: "collapse",
            width: "100%",
            fontSize: 12,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "left",
                  background: "var(--surface-2)",
                  borderBottom: "2px solid var(--border-strong)",
                  borderRight: "1px solid var(--border-strong)",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  width: 36,
                  position: "sticky",
                  top: 0,
                  zIndex: 4,
                }}
              >
                #
              </th>
              {sheet.columns.map((c) => {
                const isHighlight = c === highlightColumn;
                const isNum = numericColumns.has(c);
                return (
                  <th
                    key={c}
                    data-col={c}
                    ref={(el) => onColumnRef(c, el)}
                    style={{
                      padding: "10px 12px",
                      textAlign: isNum ? "right" : "left",
                      background: isHighlight ? "var(--accent)" : "var(--surface)",
                      color: isHighlight ? "var(--text-invert)" : "var(--text)",
                      borderBottom: isHighlight ? "2px solid var(--accent)" : "2px solid var(--border-strong)",
                      fontFamily: "var(--font-sans)",
                      fontWeight: 800,
                      fontSize: 11,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      transition: "background 0.25s ease, color 0.25s ease",
                      position: "sticky",
                      top: 0,
                      borderLeft: isHighlight ? "2px solid var(--accent)" : "none",
                      borderRight: isHighlight ? "2px solid var(--accent)" : "none",
                      zIndex: isHighlight ? 3 : 1,
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
              <tr key={ri} style={{ borderBottom: "1px solid var(--border)" }}>
                <td
                  style={{
                    padding: "10px 12px",
                    color: "var(--text-3)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    borderRight: "1px solid var(--border)",
                    backgroundColor: "var(--surface-2)",
                    textAlign: "center",
                  }}
                >
                  {String(ri + 1).padStart(3, "0")}
                </td>
                {sheet.columns.map((c, ci) => {
                  const isHighlight = c === highlightColumn;
                  const isNum = numericColumns.has(c);
                  return (
                    <td
                      key={`${ri}-${ci}`}
                      className={isHighlight ? "highlighted-cell" : ""}
                      style={{
                        padding: "10px 12px",
                        background: isHighlight ? "var(--accent-weak)" : "transparent",
                        color: "var(--text)",
                        fontFamily: isNum ? "var(--font-mono)" : "var(--font-sans)",
                        fontWeight: isHighlight ? 700 : 400,
                        textAlign: isNum ? "right" : "left",
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
      </div>
    </div>
  );
}
