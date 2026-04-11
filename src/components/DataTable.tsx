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
  const exact = columns.find(c => normalizeColName(c) === t);
  if (exact) return exact;
  const partial = columns.find(c => {
    const n = normalizeColName(c);
    return n.includes(t) || t.includes(n);
  });
  return partial ?? null;
}

export default function DataTable({ sheets, highlightColumns, onColumnRef }: DataTableProps) {
  const [activeSheet, setActiveSheet] = useState(0);
  const sheet = sheets[activeSheet];

  // Scroll to first highlighted column when it changes
  const tableWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlightColumns.length === 0 || !tableWrapRef.current) return;
    const th = tableWrapRef.current.querySelector<HTMLTableCellElement>(
      `[data-col="${CSS.escape(highlightColumns[0])}"]`
    );
    if (th) {
      th.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [highlightColumns]);

  if (!sheet) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-text-muted">
        No source data available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex gap-1 px-4 pt-3 pb-2 border-b border-white/30 flex-shrink-0 overflow-x-auto">
          {sheets.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSheet(i)}
              className={`text-[10px] font-semibold px-3 py-1 rounded-full whitespace-nowrap transition-colors ${
                i === activeSheet
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "text-text-muted hover:text-text-primary border border-transparent"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Row count badge */}
      <div className="px-4 py-2 flex-shrink-0">
        <span className="text-[10px] text-text-muted">
          {sheet.rows.length.toLocaleString()} rows
          {sheet.rows.length === 500 ? " (first 500 shown)" : ""}
          {" · "}{sheet.columns.length} columns
        </span>
      </div>

      {/* Table */}
      <div ref={tableWrapRef} className="flex-1 overflow-auto px-2 pb-4">
        <table className="text-[11px] border-collapse w-max min-w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="bg-white/80 backdrop-blur-sm border border-white/60 px-3 py-2 text-text-muted font-mono text-center min-w-[48px] sticky left-0 z-20">
                #
              </th>
              {sheet.columns.map(col => {
                const isHighlighted = highlightColumns.includes(col);
                return (
                  <th
                    key={col}
                    data-col={col}
                    ref={el => onColumnRef(col, el)}
                    className={`border px-3 py-2 font-semibold text-left whitespace-nowrap transition-colors ${
                      isHighlighted
                        ? "bg-accent/20 border-accent/40 text-accent"
                        : "bg-white/80 backdrop-blur-sm border-white/60 text-text-primary"
                    }`}
                  >
                    {col}
                    {isHighlighted && (
                      <span className="ml-1.5 text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-bold">
                        SOURCE
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="hover:bg-white/40 transition-colors"
              >
                <td className="border border-white/40 px-3 py-1.5 text-text-muted font-mono text-center sticky left-0 bg-white/60 backdrop-blur-sm z-10">
                  {rowIdx + 1}
                </td>
                {sheet.columns.map(col => {
                  const isHighlighted = highlightColumns.includes(col);
                  return (
                    <td
                      key={col}
                      className={`border px-3 py-1.5 whitespace-nowrap transition-colors ${
                        isHighlighted
                          ? "bg-accent/8 border-accent/20 text-text-primary"
                          : "border-white/40 text-text-secondary"
                      }`}
                    >
                      {String(row[col] ?? "")}
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
