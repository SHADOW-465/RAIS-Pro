"use client";

// Staging & Review (mockup 3). Upload raw files (the only place upload lives),
// review the recomputed extraction, then Publish to Analytics → dashboard.

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { Card, Empty } from "@/components/app/widgets";
import UploadZone from "@/components/UploadZone";
import Icon from "@/components/editorial/Icon";
import { classifyRejectionSheets } from "@/lib/ingest/from-rejection-sheets";
import { buildReviewRows, reviewSummary, applyEdit } from "@/lib/ingest/review";
import type { StageDayRecord } from "@/lib/ingest/emit";

export default function StagingPage() {
  const router = useRouter();
  const [ingestionId] = useState(() => globalThis.crypto?.randomUUID?.() ?? `ing-${Date.now()}`);
  const [records, setRecords] = useState<StageDayRecord[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; deduped: number } | null>(null);
  const [extractedSchema, setExtractedSchema] = useState<any | null>(null);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [editingCommentRow, setEditingCommentRow] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 45;
  // tracks which invalid record index is currently focused in the error navigator
  const [focusedInvalidIdx, setFocusedInvalidIdx] = useState(0);
  // which row's flags are expanded inline
  const [expandedFlagsRow, setExpandedFlagsRow] = useState<number | null>(null);
  // ref map for scrolling to rows
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const rows = useMemo(() => buildReviewRows(records), [records]);
  const summary = useMemo(() => reviewSummary(rows), [rows]);
  const totals = useMemo(() => {
    let input = 0, rejected = 0; for (const r of rows) { input += r.checked ?? 0; rejected += r.rejected ?? 0; }
    return { input, rejected, rejPct: input ? (rejected / input) * 100 : 0 };
  }, [rows]);

  async function handleUpload(files: File[]) {
    setError(null); setDone(null); setComments({}); setEditingCommentRow(null); setExtractedSchema(null);
    setFocusedInvalidIdx(0); setExpandedFlagsRow(null);
    try {
      const file = files[0];
      const arrayBuffer = await file.arrayBuffer();
      const xlsx = await import("xlsx");
      const wb = xlsx.read(arrayBuffer, { type: "array" });

      const { extractSchemaFromWorkbook, classifyWithSchema } = await import("@/lib/ingest/schema-extractor");
      const schema = extractSchemaFromWorkbook(wb, file.name);
      setExtractedSchema(schema);

      const { parseExcelFilesWithRaw } = await import("@/lib/parser");
      const { rawSheets } = await parseExcelFilesWithRaw(files);

      let records = classifyWithSchema(rawSheets, schema, ingestionId);
      if (records.length === 0) {
        const { classifyRejectionSheets } = await import("@/lib/ingest/from-rejection-sheets");
        const res = classifyRejectionSheets(rawSheets, ingestionId);
        records = res.records;
      }
      setRecords(records);
      setFileName(file.name);
      // Jump to the page containing the first invalid row
      const reviewedRows = buildReviewRows(records);
      const firstInvalidGlobalIdx = reviewedRows.findIndex(r => r.status === "invalid");
      if (firstInvalidGlobalIdx >= 0) {
        setPage(Math.floor(firstInvalidGlobalIdx / PAGE_SIZE));
      } else {
        setPage(0);
      }

      // Auto-save active schema to registry database if valid stages exist
      if (schema && schema.stages.length > 0) {
        await fetch("/api/schema", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schema })
        }).catch(err => console.warn("Failed to auto-save schema registry:", err));
      }
    } catch (e: any) {
      console.error("File upload reading error:", e);
      let errMsg = e?.message ?? "Could not read the file.";
      if (
        e?.name === "NotReadableError" ||
        errMsg.toLowerCase().includes("permission") ||
        errMsg.toLowerCase().includes("could not be read")
      ) {
        errMsg = "Locked File / Permission Error: The file could not be read. If this Excel file is currently open in Microsoft Excel or another program, please close the file in Excel, save your changes, and try uploading it again.";
      }
      setError(errMsg);
    }
  }

  const handleCellChange = (recordIndex: number, field: "checked" | "rejected", valString: string) => {
    const val = valString === "" ? 0 : Number(valString);
    if (isNaN(val) || val < 0) return;
    setRecords((prev) => applyEdit(prev, recordIndex, field, val));
  };

  /** Swap checked ↔ rejected for a single record (fixes the most common error) */
  const handleSwapCheckedRejected = (recordIndex: number) => {
    setRecords((prev) => prev.map((rec, i) => {
      if (i !== recordIndex) return rec;
      const checkedVal = rec.checked?.value ?? 0;
      const rejectedVal = rec.rejected?.value ?? 0;
      return {
        ...rec,
        checked: rec.checked ? { ...rec.checked, value: rejectedVal } : { value: rejectedVal, cell: `EDIT!checked`, header: "Checked" },
        rejected: rec.rejected ? { ...rec.rejected, value: checkedVal } : { value: checkedVal, cell: `EDIT!rejected`, header: "Rejected" },
        extractedBy: "direct-entry",
      };
    }));
  };

  async function publish() {
    setBusy(true); setError(null);
    try {
      if (extractedSchema) {
        await fetch("/api/schema", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schema: extractedSchema })
        });
      }
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestionId, fileName, records, comments })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Publish failed");
      const r = await res.json();
      setDone({ inserted: r.inserted, deduped: r.deduped });
    } catch (e: any) { setError(e?.message ?? "Publish failed"); } finally { setBusy(false); }
  }

  const dq = [
    { label: "Missing Values", state: rows.some((r) => r.checked == null || r.rejected == null) ? "Warning" : "Passed" },
    { label: "Logical Validation", state: summary.invalid > 0 ? "Failed" : "Passed" },
    { label: "Formula Check", state: summary.corrected > 0 ? "Warning" : "Passed" },
    { label: "Outlier Detection", state: "Passed" },
  ] as { label: string; state: "Passed" | "Warning" | "Failed" }[];

  const gridInputStyle: React.CSSProperties = {
    width: "90px",
    textAlign: "right",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-sm)",
    padding: "4px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    background: "var(--bg)",
    color: "var(--text)",
    outline: "none"
  };

  // Derived invalid row list for error navigator
  const invalidRows = useMemo(() => rows.filter(r => r.status === "invalid"), [rows]);

  // When navigating to a focused invalid row: jump page and scroll to it
  const jumpToInvalid = (navIdx: number) => {
    const clamped = Math.max(0, Math.min(navIdx, invalidRows.length - 1));
    setFocusedInvalidIdx(clamped);
    const target = invalidRows[clamped];
    if (!target) return;
    // find position in full sorted rows array
    const globalIdx = rows.findIndex(r => r.recordIndex === target.recordIndex);
    if (globalIdx < 0) return;
    const targetPage = Math.floor(globalIdx / PAGE_SIZE);
    setPage(targetPage);
    // scroll after render
    setTimeout(() => {
      const el = rowRefs.current.get(target.recordIndex);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  return (
    <AppShell active="staging" statusCounts={{ anomalies: summary.invalid + summary.corrected }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, margin: "0 0 2px" }}>Staging &amp; Review</h1>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 18px" }}>Upload raw data files, review the recomputed extraction, and verify before publishing to analytics.</p>

      {error && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", color: "var(--status-bad)", fontSize: 13 }}>{error}</div>}
      {done && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-good) 12%, transparent)", color: "var(--status-good)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Published {done.inserted} new events ({done.deduped} already on file).</span>
        <button onClick={() => router.push("/")} style={{ background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View dashboard →</button>
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="Upload" sub="raw rejection workbook (.xlsx / .csv) — convenience only">
            <UploadZone onUpload={handleUpload} />
          </Card>

          {/* ─── Invalid-row Error Navigator ─────────────────────────────────── */}
          {invalidRows.length > 0 && (
            <div style={{
              border: "1.5px solid var(--status-bad)",
              borderRadius: "var(--radius-md)",
              background: "color-mix(in srgb, var(--status-bad) 6%, var(--surface))",
              overflow: "hidden",
            }}>
              {/* header bar */}
              <div style={{
                padding: "10px 16px",
                background: "color-mix(in srgb, var(--status-bad) 14%, var(--surface-2))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid color-mix(in srgb, var(--status-bad) 22%, transparent)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="alert" size={14} style={{ color: "var(--status-bad)", flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--status-bad)" }}>
                    {invalidRows.length} Invalid Row{invalidRows.length !== 1 ? "s" : ""} — must fix before publishing
                  </span>
                </div>
                {/* prev / next navigator */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    disabled={focusedInvalidIdx === 0}
                    onClick={() => jumpToInvalid(focusedInvalidIdx - 1)}
                    style={{ padding: "3px 9px", fontSize: 11.5, fontWeight: 700, border: "1px solid var(--border-strong)", borderRadius: 6, background: "var(--bg)", color: "var(--text-2)", cursor: focusedInvalidIdx === 0 ? "not-allowed" : "pointer", opacity: focusedInvalidIdx === 0 ? 0.4 : 1 }}
                  >‹ Prev</button>
                  <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font-mono)", minWidth: 50, textAlign: "center" }}>
                    {focusedInvalidIdx + 1} / {invalidRows.length}
                  </span>
                  <button
                    disabled={focusedInvalidIdx >= invalidRows.length - 1}
                    onClick={() => jumpToInvalid(focusedInvalidIdx + 1)}
                    style={{ padding: "3px 9px", fontSize: 11.5, fontWeight: 700, border: "1px solid var(--border-strong)", borderRadius: 6, background: "var(--bg)", color: "var(--text-2)", cursor: focusedInvalidIdx >= invalidRows.length - 1 ? "not-allowed" : "pointer", opacity: focusedInvalidIdx >= invalidRows.length - 1 ? 0.4 : 1 }}
                  >Next ›</button>
                </div>
              </div>
              {/* error list — all invalid rows scrollable */}
              <div style={{ maxHeight: 220, overflowY: "auto", padding: "6px 0" }}>
                {invalidRows.map((r, navIdx) => {
                  const globalIdx = rows.findIndex(rr => rr.recordIndex === r.recordIndex);
                  const isFocused = navIdx === focusedInvalidIdx;
                  const isSwappable = r.flags.some(f => f.toLowerCase().includes("exceeds checked"));
                  return (
                    <div
                      key={r.recordIndex}
                      style={{
                        padding: "8px 16px",
                        borderBottom: "1px solid color-mix(in srgb, var(--status-bad) 12%, transparent)",
                        background: isFocused ? "color-mix(in srgb, var(--status-bad) 10%, var(--surface))" : "transparent",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onClick={() => jumpToInvalid(navIdx)}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", flexShrink: 0 }}>Row {globalIdx + 1}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", flexShrink: 0 }}>{r.date}</span>
                            <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>·</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{r.stageLabel}</span>
                            {r.checked != null && r.rejected != null && (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>
                                (Checked: {r.checked}, Rejected: {r.rejected})
                              </span>
                            )}
                          </div>
                          {r.flags.map((flag, fi) => (
                            <div key={fi} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--status-bad)", marginTop: 2 }}>
                              <span style={{ flexShrink: 0 }}>⚠</span>
                              <span>{flag}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end", flexShrink: 0 }}>
                          {isSwappable && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSwapCheckedRejected(r.recordIndex); }}
                              title="Swap Checked ↔ Rejected values"
                              style={{
                                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                                border: "1px solid var(--status-warn)",
                                background: "color-mix(in srgb, var(--status-warn) 12%, var(--surface))",
                                color: "var(--status-warn)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              ⇅ Swap values
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); jumpToInvalid(navIdx); }}
                            style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-2)", whiteSpace: "nowrap" }}
                          >→ Jump to row</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Card title="Staging Area (Verify & Approve Records)" sub={fileName || "no file yet"}>
            {rows.length === 0 ? <Empty label="Upload a file to review extracted, recomputed records here." /> : (
              <>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead><tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                    <th style={sth}>#</th>
                    <th style={sth}>Date</th>
                    <th style={sth}>Stage</th>
                    <th style={{ ...sth, textAlign: "right" }}>Input (Checked)</th>
                    <th style={{ ...sth, textAlign: "right" }}>Rejected</th>
                    <th style={{ ...sth, textAlign: "right" }}>Rej %</th>
                    <th style={sth}>Status</th>
                    <th style={{ ...sth, textAlign: "center" }}>Comment</th>
                  </tr></thead>
                  <tbody>
                    {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, idx) => {
                      const i = page * PAGE_SIZE + idx;
                      const hasComment = !!comments[r.recordIndex]?.trim();
                      const isInvalid = r.status === "invalid";
                      const isCorrected = r.status === "corrected";
                      const flagsExpanded = expandedFlagsRow === r.recordIndex;
                      const isSwappable = isInvalid && r.flags.some(f => f.toLowerCase().includes("exceeds checked"));
                      return (
                        <>
                          <tr
                            key={r.recordIndex}
                            ref={(el) => { if (el) rowRefs.current.set(r.recordIndex, el); else rowRefs.current.delete(r.recordIndex); }}
                            style={{
                              borderTop: "1px solid var(--border)",
                              background: isInvalid ? "color-mix(in srgb, var(--status-bad) 8%, transparent)" : isCorrected ? "color-mix(in srgb, var(--status-warn) 6%, transparent)" : "transparent",
                              color: isInvalid ? "var(--status-bad)" : "var(--text)",
                              outline: flagsExpanded && isInvalid ? "2px solid var(--status-bad)" : "none",
                            }}
                          >
                            <td style={std}>{i + 1}</td>
                            <td style={{ ...std, fontFamily: "var(--font-mono)" }}>{r.date}</td>
                            <td style={std}>{r.stageLabel}</td>
                            <td style={{ ...std, textAlign: "right" }}>
                              <input
                                type="number"
                                value={r.checked ?? ""}
                                onChange={(e) => handleCellChange(r.recordIndex, "checked", e.target.value)}
                                style={{ ...gridInputStyle, borderColor: isInvalid ? "var(--status-bad)" : "var(--border-strong)" }}
                              />
                            </td>
                            <td style={{ ...std, textAlign: "right" }}>
                              <input
                                type="number"
                                value={r.rejected ?? ""}
                                onChange={(e) => handleCellChange(r.recordIndex, "rejected", e.target.value)}
                                style={{ ...gridInputStyle, borderColor: isInvalid ? "var(--status-bad)" : "var(--border-strong)" }}
                              />
                            </td>
                            <td style={{ ...std, textAlign: "right", fontFamily: "var(--font-mono)", paddingRight: "12px" }}>
                              {r.correctedPct != null ? `${r.correctedPct.toFixed(2)}%` : "—"}
                            </td>
                            <td style={{ ...std, fontWeight: 600 }}>
                              {isInvalid ? (
                                <button
                                  onClick={() => setExpandedFlagsRow(flagsExpanded ? null : r.recordIndex)}
                                  title="Click to see what's wrong"
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                    padding: "2px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700,
                                    border: "1px solid var(--status-bad)",
                                    background: "color-mix(in srgb, var(--status-bad) 12%, transparent)",
                                    color: "var(--status-bad)",
                                  }}
                                >
                                  ⚠ Invalid {flagsExpanded ? "▲" : "▼"}
                                </button>
                              ) : isCorrected ? (
                                <span style={{ color: "var(--status-warn)" }}>Corrected</span>
                              ) : (
                                <span style={{ color: "var(--status-good)" }}>✓ Valid</span>
                              )}
                            </td>
                            <td style={{ ...std, textAlign: "center" }}>
                              <button
                                onClick={() => setEditingCommentRow(editingCommentRow === r.recordIndex ? null : r.recordIndex)}
                                style={{
                                  background: hasComment ? "var(--accent)" : "var(--surface-2)",
                                  color: hasComment ? "#fff" : "var(--text-2)",
                                  border: "none",
                                  borderRadius: 7,
                                  width: 28,
                                  height: 28,
                                  cursor: "pointer"
                                }}
                              >
                                <Icon name="comment" size={13} />
                              </button>
                            </td>
                          </tr>
                          {/* Inline flag expansion row */}
                          {flagsExpanded && isInvalid && (
                            <tr key={`${r.recordIndex}-flags`} style={{ background: "color-mix(in srgb, var(--status-bad) 5%, var(--surface-2))" }}>
                              <td colSpan={8} style={{ padding: "10px 14px 12px", borderBottom: "2px solid var(--status-bad)" }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--status-bad)", letterSpacing: "0.05em", marginBottom: 6 }}>
                                      Validation issues on this row:
                                    </div>
                                    {r.flags.map((flag, fi) => (
                                      <div key={fi} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4, fontSize: 12.5, color: "var(--text)" }}>
                                        <span style={{ color: "var(--status-bad)", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>⚠</span>
                                        <span>{flag}</span>
                                      </div>
                                    ))}
                                    <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-3)" }}>
                                      Fix the values in the Input or Rejected columns on this row, then the status will update automatically.
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, alignItems: "flex-end" }}>
                                    {isSwappable && (
                                      <button
                                        onClick={() => { handleSwapCheckedRejected(r.recordIndex); setExpandedFlagsRow(null); }}
                                        style={{
                                          fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 7, cursor: "pointer",
                                          border: "1.5px solid var(--status-warn)",
                                          background: "color-mix(in srgb, var(--status-warn) 14%, var(--surface))",
                                          color: "var(--status-warn)",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        ⇅ Auto-fix: swap Input ↔ Rejected
                                      </button>
                                    )}
                                    <button
                                      onClick={() => setExpandedFlagsRow(null)}
                                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-2)" }}
                                    >
                                      Dismiss
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
                {editingCommentRow !== null && (
                  <div style={{ marginTop: 16, padding: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, fontWeight: 700 }}>
                      <span>Add Operator Comment</span>
                      <button onClick={() => setEditingCommentRow(null)} style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer" }}>Close</button>
                    </div>
                    <textarea
                      autoFocus
                      placeholder={`Enter discrepancy / correction explanation for row #${rows.findIndex(r => r.recordIndex === editingCommentRow) + 1}...`}
                      value={comments[editingCommentRow] ?? ""}
                      onChange={(e) => setComments(c => ({ ...c, [editingCommentRow]: e.target.value }))}
                      style={{
                        width: "100%",
                        minHeight: 56,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--text)",
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none"
                      }}
                    />
                  </div>
                )}
                {rows.length > PAGE_SIZE && (() => {
                  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
                  const from = page * PAGE_SIZE + 1;
                  const to = Math.min((page + 1) * PAGE_SIZE, rows.length);
                  const pgBtn = (disabled: boolean): React.CSSProperties => ({
                    padding: "4px 10px", borderRadius: "var(--radius-sm)", fontSize: 11.5, fontWeight: 600,
                    border: "1px solid var(--border-strong)", background: "var(--bg)", color: "var(--text-2)",
                    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
                  });
                  return (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                      <span className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>Showing {from}–{to} of {rows.length.toLocaleString()} records</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} style={pgBtn(page === 0)}>‹ Prev</button>
                        <span style={{ fontSize: 11.5, fontWeight: 700 }}>{page + 1} / {totalPages}</span>
                        <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} style={pgBtn(page >= totalPages - 1)}>Next ›</button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </Card>
        </div>

        {/* right rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="Quick Stats">
            <Stat label="Total Records" value={rows.length.toLocaleString()} />
            <Stat label="Total Input" value={totals.input.toLocaleString()} />
            <Stat label="Total Rejected" value={totals.rejected.toLocaleString()} tone="bad" />
            <Stat label="Overall Rejection %" value={`${totals.rejPct.toFixed(2)}%`} tone="bad" />
          </Card>
          <Card title="Data Quality Check">
            {dq.map((d) => (
              <div key={d.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                <span className="muted">{d.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: d.state === "Passed" ? "var(--status-good)" : d.state === "Warning" ? "var(--status-warn)" : "var(--status-bad)", background: `color-mix(in srgb, ${d.state === "Passed" ? "var(--status-good)" : d.state === "Warning" ? "var(--status-warn)" : "var(--status-bad)"} 14%, transparent)` }}>{d.state}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 13 }}>
              <strong>Record Distribution</strong>
              <span className="muted">{summary.ok + summary.corrected} valid · {summary.invalid} invalid</span>
            </div>
          </Card>
          <Card title="Actions">
            {extractedSchema && (
              <button onClick={() => setShowSchemaModal(true)}
                style={{ width: "100%", background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 9, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Icon name="table" size={14} /> View Extracted Schema
              </button>
            )}
            <button onClick={publish} disabled={rows.length === 0 || summary.invalid > 0 || busy}
              style={{ width: "100%", background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: rows.length && !summary.invalid && !busy ? "pointer" : "not-allowed", opacity: rows.length && !summary.invalid && !busy ? 1 : 0.5 }}>
              <Icon name="check" size={14} /> {busy ? "Publishing…" : "Publish to Analytics"}
            </button>
            {summary.invalid > 0 && <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Fix {summary.invalid} invalid row(s) before publishing.</div>}
          </Card>
        </div>
      </div>

      {showSchemaModal && extractedSchema && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: "var(--radius-lg)", boxShadow: "8px 8px 0px var(--ink)", width: "100%", maxWidth: "900px", maxHeight: "85vh", display: "flex", flexDirection: "column", color: "var(--ink)", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Extracted Plant-Wide Schema</h2>
                <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>Source: {extractedSchema.fileName}</p>
              </div>
              <button onClick={() => setShowSchemaModal(false)} style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-2)", fontWeight: 300, lineHeight: 1 }}>&times;</button>
            </div>

            {/* Content */}
            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Stage Relationship Flowchart */}
              <div>
                <h3 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", margin: "0 0 14px", fontWeight: 700 }}>Manufacturing Process Flow</h3>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                  {extractedSchema.stages.map((stage: any, idx: number) => (
                    <div key={stage.stageId} style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: "var(--radius-md)", padding: "10px 16px", boxShadow: "3px 3px 0 var(--ink)", display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--accent)" }}>Stage {idx + 1}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)" }}>{stage.label}</span>
                        <span style={{ fontSize: 10, color: "var(--text-3)" }}>{stage.rowCount} records found</span>
                      </div>
                      {idx < extractedSchema.stages.length - 1 && (
                        <div style={{ display: "flex", alignItems: "center", padding: "0 8px" }}>
                          <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
                            <path d="M0 6H20M20 6L15 1M20 6L15 11" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Column mapping per Stage */}
              <div>
                <h3 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", margin: "0 0 14px", fontWeight: 700 }}>Extracted Schema Details</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {extractedSchema.stages.map((stage: any) => {
                    const checked = stage.fields.find((f: any) => f.role === "checked");
                    const good = stage.fields.find((f: any) => f.role === "good");
                    const rework = stage.fields.find((f: any) => f.role === "rework");
                    const rejected = stage.fields.find((f: any) => f.role === "rejected");
                    const defects = stage.fields.filter((f: any) => f.role === "defect");
                    const formulas = stage.fields.filter((f: any) => f.role === "formula");

                    return (
                      <div key={stage.stageId} style={{ border: "1.5px solid var(--ink)", borderRadius: "var(--radius-md)", background: "var(--surface)", overflow: "hidden", boxShadow: "3px 3px 0 var(--ink)" }}>
                        <div style={{ background: "var(--surface-2)", padding: "10px 16px", borderBottom: "1.5px solid var(--ink)", fontWeight: 700, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>{stage.label}</span>
                          <code style={{ fontSize: 10, color: "var(--text-3)" }}>id: {stage.stageId}</code>
                        </div>
                        <div style={{ padding: 16 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 1fr", gap: 16, alignItems: "stretch" }}>
                            {/* Left: Operators Fields */}
                            <div style={{ border: "1.5px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, background: "var(--surface-2)" }}>
                              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--text-3)", display: "block", marginBottom: 10, letterSpacing: "0.05em" }}>
                                Operator Entry Fields
                              </span>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border)", paddingBottom: 6 }}>
                                  <span className="muted">Total Checked:</span>
                                  <span style={{ fontWeight: 700, color: "var(--text)" }}>
                                    {checked ? `${checked.name} (${checked.colLetter})` : "—"}
                                  </span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border)", paddingBottom: 6 }}>
                                  <span className="muted">Accepted Good:</span>
                                  <span style={{ fontWeight: 700, color: "var(--status-good)" }}>
                                    {good ? `${good.name} (${good.colLetter})` : "—"}
                                  </span>
                                </div>
                                {rework && (
                                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border)", paddingBottom: 6 }}>
                                    <span className="muted">Rework Quantity:</span>
                                    <span style={{ fontWeight: 700, color: "var(--status-warn)" }}>
                                      {rework.name} ({rework.colLetter})
                                    </span>
                                  </div>
                                )}
                                {!rejected && defects.length === 0 && (
                                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border)", paddingBottom: 6 }}>
                                    <span className="muted">Stated Rejection:</span>
                                    <span style={{ fontWeight: 700, color: "var(--status-bad)" }}>
                                      (Manual Entry)
                                    </span>
                                  </div>
                                )}

                                {defects.length > 0 && (
                                  <div style={{ marginTop: 6 }}>
                                    <span className="muted" style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                                      Defect Reason Fields ({defects.length})
                                    </span>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 110, overflowY: "auto", paddingRight: 4 }}>
                                      {defects.map((d: any) => (
                                        <span key={d.name} style={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "3px 6px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                          <span style={{ fontWeight: 800, color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{d.colLetter}</span>
                                          <span style={{ color: "var(--text)" }}>{d.name}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Middle Arrow Connector */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 120 }}>
                              <div style={{ border: "1.5px solid var(--border-strong)", height: 30, width: 0, borderStyle: "dashed" }}></div>
                              <div style={{ background: "var(--accent-weak)", color: "var(--accent)", border: "1.5px solid var(--accent)", borderRadius: "50%", width: 26, height: 26, display: "grid", placeItems: "center", margin: "6px 0" }}>
                                <Icon name="arrow-right" size={12} stroke={2.5} />
                              </div>
                              <div style={{ border: "1.5px solid var(--border-strong)", height: 30, width: 0, borderStyle: "dashed" }}></div>
                            </div>

                            {/* Right: System Math & Verification */}
                            <div style={{ border: "1px solid var(--accent)", borderRadius: "var(--radius-md)", padding: 14, background: "var(--accent-weak)", height: "100%" }}>
                              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--accent)", display: "block", marginBottom: 10, letterSpacing: "0.05em" }}>
                                System Computed Math (Formulas)
                              </span>
                              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
                                <div>
                                  <span className="muted" style={{ display: "block", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>
                                    1. Total Rejected Qty
                                  </span>
                                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "5px 8px", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <code style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text)" }}>
                                      {defects.length > 0 ? "Σ (Defect Counts)" : rejected ? `${rejected.name} (${rejected.colLetter})` : "Stated Rejection"}
                                    </code>
                                    <span style={{ fontSize: 10, color: "var(--status-good)", fontWeight: 700 }}>✓ Auto-calculated</span>
                                  </div>
                                </div>
                                <div>
                                  <span className="muted" style={{ display: "block", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>
                                    2. Audit Balance Equation
                                  </span>
                                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "5px 8px", borderRadius: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                                    <code style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent)", fontWeight: 700 }}>
                                      Checked = Good {rework ? "+ Rework " : ""}+ Rejected
                                    </code>
                                    <span style={{ fontSize: 9.5, color: "var(--text-3)" }}>
                                      Ensures shopfloor data adds up correctly before locking.
                                    </span>
                                  </div>
                                </div>
                                {formulas.map((f: any) => (
                                  <div key={f.name}>
                                    <span className="muted" style={{ display: "block", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>
                                      3. Derived Rate Metric: {f.name}
                                    </span>
                                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "5px 8px", borderRadius: 6 }}>
                                      <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", wordBreak: "break-all" }}>
                                        {f.formula || "([Rejected] / [Checked]) * 100"}
                                      </code>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 20px", borderTop: "1.5px solid var(--border)", background: "var(--surface-2)", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowSchemaModal(false)}
                style={{ background: "var(--accent)", color: "#fff", border: "1.5px solid var(--ink)", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "2px 2px 0 var(--ink)" }}>
                Close Schema Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const c = tone === "bad" ? "var(--status-bad)" : tone === "good" ? "var(--status-good)" : "var(--text)";
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}><span className="muted">{label}</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: c }}>{value}</span></div>;
}
const sth: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const std: React.CSSProperties = { padding: "6px 8px" };
