"use client";

import React, { useState } from "react";
import Select from "@/components/ui/Select";
import type { ShiftBatchRecord } from "@/lib/entry/disposafe-matrix";
import {
  CATHETER_CATEGORIES,
  CATHETER_TYPES,
  categoryAndTypeFrom,
} from "@/lib/entry/disposafe-matrix";

interface ShiftQueueTableProps {
  saved: ShiftBatchRecord[];
  onEditRow: (rec: ShiftBatchRecord) => void;
  onDeleteRow: (id: string) => void;
  onSyncSingleRow?: (rec: ShiftBatchRecord) => void;
  onSyncAllPending?: () => void;
  isSyncingAll?: boolean;
  onExportCSV: () => void;
  canEraseLedger: boolean;
  editingId: string | null;
}

export default function ShiftQueueTable({
  saved,
  onEditRow,
  onDeleteRow,
  onSyncSingleRow,
  onSyncAllPending,
  isSyncingAll,
  onExportCSV,
  canEraseLedger,
  editingId,
}: ShiftQueueTableProps) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<
    "newest" | "oldest" | "batch-asc" | "batch-desc" | "volume-desc" | "rejection-desc"
  >("newest");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const pendingCount = saved.filter((b) => !b.synced).length;
  const syncedCount = saved.filter((b) => b.synced).length;

  const filteredSaved = React.useMemo(() => {
    let list = saved;
    if (categoryFilter !== "all" || typeFilter !== "all") {
      list = list.filter((b) => {
        const { category, type } = categoryAndTypeFrom(b.productType || "2 way");
        if (categoryFilter !== "all" && category !== categoryFilter) return false;
        if (typeFilter !== "all" && type !== typeFilter) return false;
        return true;
      });
    }
    return [...list].sort((a, b) => {
      if (sortOrder === "newest") return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
      if (sortOrder === "oldest") return new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime();
      if (sortOrder === "batch-asc") return a.batchId.localeCompare(b.batchId);
      if (sortOrder === "batch-desc") return b.batchId.localeCompare(a.batchId);
      if (sortOrder === "volume-desc") return b.checked - a.checked;
      if (sortOrder === "rejection-desc") return b.reject - a.reject;
      return 0;
    });
  }, [saved, categoryFilter, typeFilter, sortOrder]);

  return (
    <section
      aria-label="Current Shift Operational Queue"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg, 12px)",
        padding: "20px",
        marginTop: 24,
        boxShadow: "var(--shadow-1)",
      }}
    >
      {/* Header with Metrics & Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Current Shift Log
            </h2>
            <div style={{ display: "flex", gap: 6 }}>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "var(--positive-weak)",
                  color: "var(--positive)",
                  border: "1px solid color-mix(in srgb, var(--positive) 30%, transparent)",
                }}
              >
                {syncedCount} on ledger
              </span>
              {pendingCount > 0 && (
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "var(--warning-weak)",
                    color: "var(--status-warn, #d97706)",
                    border: "1px solid color-mix(in srgb, var(--status-warn, #d97706) 30%, transparent)",
                  }}
                >
                  {pendingCount} pending sync
                </span>
              )}
            </div>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            Ledger-confirmed records are immutable. Unsynced local rows push automatically at shift end.
          </span>
        </div>

        {/* Action Controls & Filters */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {pendingCount > 0 && onSyncAllPending && (
            <button
              type="button"
              onClick={onSyncAllPending}
              disabled={isSyncingAll}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--radius-sm, 6px)",
                background: "var(--accent)",
                color: "var(--text-invert)",
                border: "none",
                fontSize: 12,
                fontWeight: 700,
                cursor: isSyncingAll ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>⚡</span>
              <span>{isSyncingAll ? "Syncing All…" : `Sync All Pending (${pendingCount})`}</span>
            </button>
          )}

          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "all", label: "Category: All" },
              ...CATHETER_CATEGORIES.map((c) => ({ value: c, label: `Category: ${c}` })),
            ]}
            block={false}
            size="sm"
            ariaLabel="Filter queue by category"
          />

          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: "Type: All" },
              ...CATHETER_TYPES.map((t) => ({ value: t, label: `Type: ${t}` })),
            ]}
            block={false}
            size="sm"
            ariaLabel="Filter queue by type"
          />

          <Select
            value={sortOrder}
            onChange={(v) => setSortOrder(v as any)}
            options={[
              { value: "newest", label: "Sort: Newest" },
              { value: "oldest", label: "Sort: Oldest" },
              { value: "batch-asc", label: "Sort: Batch A–Z" },
              { value: "batch-desc", label: "Sort: Batch Z–A" },
              { value: "volume-desc", label: "Sort: Qty High–Low" },
              { value: "rejection-desc", label: "Sort: Reject High–Low" },
            ]}
            block={false}
            size="sm"
            ariaLabel="Sort queue"
          />

          <button
            type="button"
            onClick={onExportCSV}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-sm, 6px)",
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border-strong)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Export Session CSV
          </button>
        </div>
      </div>

      {/* Table */}
      {saved.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "32px",
            color: "var(--text-3)",
            fontSize: 13,
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius-md, 8px)",
          }}
        >
          No batches entered during this shift session yet.
        </div>
      ) : filteredSaved.length === 0 ? (
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
          No records match the active filter criteria.
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: "var(--radius-md, 8px)", border: "1px solid var(--border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "var(--text-3)" }}>Operator & Status</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "var(--text-3)" }}>Station</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "var(--text-3)" }}>Type</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "var(--text-3)" }}>Batch ID</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>Checked</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>Trolleys</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>Bin</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>Accept</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>Hold</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>Reject</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>Yield</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "var(--text-3)" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSaved.map((rec) => {
                const primaryRow = rec.macro === "primary";
                const secondaryRow = rec.macro === "secondary";
                const yieldPct =
                  secondaryRow || rec.checked <= 0
                    ? "—"
                    : ((rec.accept / rec.checked) * 100).toFixed(1) + "%";
                const defLog = Object.entries(rec.defects || {})
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(", ");
                const open = previewId === rec.id;
                const isEditing = editingId === rec.id;

                return (
                  <React.Fragment key={rec.id}>
                    <tr
                      onClick={() => setPreviewId(open ? null : rec.id)}
                      style={{
                        borderBottom: open ? "none" : "1px solid var(--border)",
                        cursor: "pointer",
                        background: open
                          ? "var(--surface-2)"
                          : isEditing
                            ? "var(--accent-weak)"
                            : undefined,
                      }}
                      title="Click to preview record details"
                    >
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>{rec.operator}</div>
                        {rec.synced ? (
                          <div style={{ color: "var(--positive)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                            <span>●</span> On ledger
                          </div>
                        ) : (
                          <div style={{ color: "var(--status-warn, #d97706)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                            <span>●</span> Not on ledger yet
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600 }}>{rec.processName}</div>
                        <div style={{ color: "var(--text-3)", fontSize: 11 }}>{rec.stageName}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>{rec.productType || "2 way"}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                        {rec.batchId}
                        {rec.duplicateConfirmedOf && (
                          <div
                            style={{
                              display: "inline-block",
                              marginLeft: 6,
                              padding: "1px 6px",
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 700,
                              color: "var(--accent)",
                              background: "var(--accent-weak)",
                              border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                            }}
                          >
                            Confirmed distinct
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{rec.checked}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>{primaryRow ? (rec.trolleys ?? 0) : "—"}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>{secondaryRow ? (rec.bin || "—") : "—"}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "var(--positive)", fontFamily: "var(--font-mono)" }}>
                        {secondaryRow ? "—" : rec.accept}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", color: "var(--status-warn, #d97706)", fontFamily: "var(--font-mono)" }}>
                        {primaryRow || secondaryRow ? "—" : rec.hold}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontFamily: "var(--font-mono)" }}>
                        {secondaryRow ? (
                          "—"
                        ) : (
                          <>
                            <span style={{ color: rec.reject > 0 ? "var(--critical)" : "var(--text-3)", fontWeight: 700 }}>
                              {rec.reject}
                            </span>
                            {defLog && <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>{defLog}</div>}
                          </>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                        {yieldPct}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                          {!rec.synced && onSyncSingleRow && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSyncSingleRow(rec);
                              }}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 4,
                                background: "var(--accent)",
                                color: "var(--text-invert)",
                                border: "none",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Sync
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditRow(rec);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 4,
                              background: "var(--surface-2)",
                              color: "var(--text)",
                              border: "1px solid var(--border)",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>

                          {rec.synced && !canEraseLedger ? (
                            <span style={{ fontSize: 11, color: "var(--text-3)" }}>Locked</span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteRow(rec.id);
                              }}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 4,
                                background: "var(--critical-weak)",
                                color: "var(--critical)",
                                border: "1px solid color-mix(in srgb, var(--critical) 30%, transparent)",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {rec.synced ? "Erase" : "Remove"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Preview details expansion */}
                    {open && (
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                        <td colSpan={12} style={{ padding: "14px 18px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 12, fontSize: 12.5 }}>
                            <div>
                              <span style={{ color: "var(--text-3)" }}>Date: </span>
                              <strong style={{ fontFamily: "var(--font-mono)" }}>{rec.date}</strong>
                            </div>
                            <div>
                              <span style={{ color: "var(--text-3)" }}>Shift: </span>
                              <strong>{rec.shift}</strong>
                            </div>
                            <div>
                              <span style={{ color: "var(--text-3)" }}>Saved At: </span>
                              <strong style={{ fontFamily: "var(--font-mono)" }}>{new Date(rec.savedAt).toLocaleString()}</strong>
                            </div>
                            <div>
                              <span style={{ color: "var(--text-3)" }}>Pass: </span>
                              <strong>{rec.pass || 1}</strong>
                            </div>
                          </div>

                          {defLog && (
                            <div style={{ marginBottom: 10, fontSize: 12 }}>
                              <span style={{ color: "var(--text-3)" }}>Logged Defects: </span>
                              <strong style={{ fontFamily: "var(--font-mono)" }}>{defLog}</strong>
                            </div>
                          )}

                          {rec.remarks && (
                            <div style={{ fontSize: 12 }}>
                              <span style={{ color: "var(--text-3)" }}>Remarks: </span>
                              <span>{rec.remarks}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
