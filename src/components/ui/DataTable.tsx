"use client";

// Sortable, pageable table with optional expandable rows and a CSV export
// button. Sort lives in the column header; no per-page reinvention.

import React, { useMemo, useState } from "react";
import Icon from "@/components/editorial/Icon";
import { EmptyState, GhostButton } from "./primitives";
import { pageSlice, sortRows, toCsv, type SortDir } from "./shared-logic";

export interface Column<T> {
  id: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Sort key + CSV value. Omit to make the column unsortable and CSV-blank. */
  value?: (row: T) => string | number | null | undefined;
  mono?: boolean;
  align?: "left" | "right";
}

export default function DataTable<T>({
  columns, rows, rowKey, pageSize = 25, expand, onRowClick, exportName, empty = "Nothing to show.",
}: {
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (r: T) => string;
  pageSize?: number;
  /** Renders the panel under an expanded row; adds a chevron column. */
  expand?: (r: T) => React.ReactNode;
  onRowClick?: (r: T) => void;
  /** Shows the Export CSV button and names the file. */
  exportName?: string;
  empty?: string;
}) {
  const [sort, setSort] = useState<{ id: string; dir: SortDir } | null>(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.id === sort?.id);
    return col?.value && sort ? sortRows(rows, col.value, sort.dir) : [...rows];
  }, [rows, columns, sort]);
  const view = pageSlice(sorted, page, pageSize);

  const exportCsv = () => {
    const cols = columns.filter((c) => c.value);
    const csv = toCsv(cols.map((c) => c.header), sorted.map((r) => cols.map((c) => c.value!(r))));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${exportName}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const th: React.CSSProperties = {
    textAlign: "left", padding: "8px 12px", fontSize: "var(--text-xs)", fontWeight: 600,
    color: "var(--text-3)", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  };

  if (rows.length === 0) return <EmptyState title={empty} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {exportName && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <GhostButton onClick={exportCsv}><Icon name="table" size={16} aria-hidden />Export CSV</GhostButton>
        </div>
      )}
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-md)" }}>
          <thead>
            <tr>
              {expand && <th style={{ ...th, width: 32 }} aria-label="Expand" />}
              {columns.map((c) => {
                const active = sort?.id === c.id;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    style={{ ...th, textAlign: c.align ?? "left" }}
                  >
                    {c.value ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSort(active && sort!.dir === "asc" ? { id: c.id, dir: "desc" } : { id: c.id, dir: "asc" });
                          setPage(0);
                        }}
                        style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        {c.header}
                        {active && <Icon name={sort!.dir === "asc" ? "chevron-up" : "chevron-down"} size={12} aria-hidden />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => {
              const k = rowKey(r);
              const isOpen = open.has(k);
              return (
                <React.Fragment key={k}>
                  <tr
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    style={{ borderBottom: "1px solid var(--border)", cursor: onRowClick ? "pointer" : "default" }}
                  >
                    {expand && (
                      <td style={{ padding: "8px 4px 8px 12px" }}>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "Collapse row" : "Expand row"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
                          }}
                          style={{ all: "unset", cursor: "pointer", display: "inline-flex", color: "var(--text-3)" }}
                        >
                          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={16} aria-hidden />
                        </button>
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        style={{ padding: "8px 12px", textAlign: c.align ?? "left", fontFamily: c.mono ? "var(--font-mono)" : undefined }}
                      >
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                  {expand && isOpen && (
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                      <td colSpan={columns.length + 1} style={{ padding: 16 }}>{expand(r)}</td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {view.pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, fontSize: "var(--text-sm)", color: "var(--text-3)" }}>
          <span style={{ fontFamily: "var(--font-mono)" }}>{view.page + 1} / {view.pages}</span>
          <GhostButton ariaLabel="Previous page" disabled={view.page === 0} onClick={() => setPage(view.page - 1)}>
            <Icon name="arrow-left" size={16} aria-hidden />
          </GhostButton>
          <GhostButton ariaLabel="Next page" disabled={view.page >= view.pages - 1} onClick={() => setPage(view.page + 1)}>
            <Icon name="arrow-right" size={16} aria-hidden />
          </GhostButton>
        </div>
      )}
    </div>
  );
}
