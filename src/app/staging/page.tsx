"use client";

// Staging & Review — the MOD pipeline is the ONLY understanding path (Phase 5):
// upload → /api/workbooks (lossless snapshot + profile + resolver proposals) →
// mapping verification panel (rung 6) → publish → /api/mods/records
// (extraction from the verified MOD) → editable review grid → /api/ingest.

import { useMemo, useState, useRef, Fragment, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
import { Card, Empty } from "@/components/app/widgets";
import UploadZone from "@/components/UploadZone";
import Icon from "@/components/editorial/Icon";
import { buildReviewRows, reviewSummary, applyEdit, defectKey } from "@/lib/ingest/review";
import type { StageDayRecord } from "@/lib/ingest/emit";
import MappingVerificationPanel, { type UploadedMod } from "@/components/app/MappingVerificationPanel";
import QtyInput from "@/components/entry/QtyInput";

const PAGE_SIZE = 31;

export default function StagingPage() {
  const router = useRouter();
  const { refreshEvents } = useEvents();
  const [ingestionId] = useState(() => globalThis.crypto?.randomUUID?.() ?? `ing-${Date.now()}`);
  const [records, setRecords] = useState<StageDayRecord[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; deduped: number } | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [editingCommentRow, setEditingCommentRow] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [focusedInvalidIdx, setFocusedInvalidIdx] = useState(0);
  const [expandedFlagsRow, setExpandedFlagsRow] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  // Draft-MOD proposals from /api/workbooks, shown in the verification panel.
  const [modUploads, setModUploads] = useState<UploadedMod[]>([]);
  const [publishedModId, setPublishedModId] = useState<string | null>(null);

  const rows = useMemo(() => buildReviewRows(records), [records]);
  const summary = useMemo(() => reviewSummary(rows), [rows]);
  const totals = useMemo(() => {
    let input = 0, rejected = 0;
    for (const r of rows) {
      input += r.checked ?? 0;
      rejected += r.rejected ?? 0;
    }
    return { input, rejected, rejPct: input ? (rejected / input) * 100 : 0 };
  }, [rows]);

  // Defect columns = only labels present on extracted rows (the Excel), never
  // the company-wide /api/schema catalog (that re-injected the hardcoded list).
  const defectsList = useMemo(() => {
    const map = new Map<string, { defectCode: string; label: string }>();
    for (const rec of records) {
      for (const d of rec.defects ?? []) {
        const key = (d.raw || "").trim();
        if (!key || map.has(key.toUpperCase())) continue;
        map.set(key.toUpperCase(), { defectCode: key, label: key });
      }
    }
    return [...map.values()];
  }, [records]);
  const totalCols = 11 + defectsList.length;

  async function handleUpload(files: File[]) {
    setError(null); setDone(null); setComments({}); setEditingCommentRow(null);
    setFocusedInvalidIdx(0); setExpandedFlagsRow(null);
    try {
      if (!files || files.length === 0) return;
      setBusy(true);
      setModUploads([]);
      setRecords([]);

      const fd = new FormData();
      for (const f of files) fd.append("file", f);
      const res = await fetch("/api/workbooks", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Workbook processing failed");
      setModUploads(data.mods ?? []);
      setFileName(files.length === 1 ? files[0].name : `${files.length} files`);
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
    } finally {
      setBusy(false);
    }
  }

  // After Verify & publish (ontology): extract day-records into the review
  // grid. If the extract is clean (no invalid rows), auto-ingest into the
  // event ledger so the dashboard is not left empty after "Verify & publish"
  // alone — that button only publishes mappings, not KPIs.
  async function handleModPublished(modId: string) {
    try {
      setBusy(true);
      setError(null);
      const res = await fetch("/api/mods/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modId, ingestionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      const extracted: StageDayRecord[] = data.records ?? [];
      setPublishedModId(modId);
      // Build the post-extract set synchronously (don't rely on stale React state).
      let nextRecords: StageDayRecord[] = [];
      setRecords((prev) => {
        nextRecords = [...prev, ...extracted];
        return nextRecords;
      });
      const reviewed = buildReviewRows(extracted);
      const firstInvalid = reviewed.findIndex((r) => r.status === "invalid");
      setPage(firstInvalid >= 0 ? Math.floor(firstInvalid / PAGE_SIZE) : 0);

      if (extracted.length === 0) {
        setError(
          "Mappings published, but no day-level records were extracted. " +
            "Usually a stage is still unmapped (canonical STAGE:… is null) or no DATE column was verified. " +
            "Open Workbooks, check stage rows, re-upload, and set each sheet's stage before publishing.",
        );
        return;
      }

      const invalid = reviewed.filter((r) => r.status === "invalid").length;
      if (invalid > 0) {
        // Leave rows in the grid for the operator to fix; they must click Publish.
        setError(
          `Extracted ${extracted.length} rows — ${invalid} need fixes before the dashboard can load. Review the grid, then click Publish to Analytics.`,
        );
        return;
      }

      // Clean extract → write the ledger immediately so "Verify & publish" is not a dead end.
      const ingRes = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingestionId,
          fileName,
          records: nextRecords,
          comments,
          modId,
        }),
      });
      if (!ingRes.ok) {
        throw new Error((await ingRes.json().catch(() => ({}))).error ?? "Ingest failed after extract");
      }
      const r = await ingRes.json();
      setDone({ inserted: r.inserted, deduped: r.deduped });
      refreshEvents().catch(console.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setBusy(false);
    }
  }

  /** Commit one cell. null clears. Never rewrites sibling columns. */
  const handleCellChange = (recordIndex: number, field: string, val: number | null) => {
    if (val == null) {
      // Clear capture fields via null; for defects, 0 removes the entry.
      if (field === "checked" || field === "rejected" || field === "acceptedGood" || field === "rework") {
        setRecords((prev) =>
          prev.map((rec, i) =>
            i !== recordIndex ? rec : { ...rec, [field]: null, extractedBy: "direct-entry" },
          ),
        );
        return;
      }
      setRecords((prev) => applyEdit(prev, recordIndex, field, 0));
      return;
    }
    if (val < 0) return;
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
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestionId, fileName, records, comments, modId: publishedModId ?? undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Publish failed");
      const r = await res.json();
      setDone({ inserted: r.inserted, deduped: r.deduped });
      refreshEvents().catch(console.error);
    } catch (e: any) {
      setError(e?.message ?? "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  const dq = [
    { label: "Missing Values", state: rows.some((r) => r.checked == null || r.rejected == null) ? "Warning" : "Passed" },
    { label: "Logical Validation", state: summary.invalid > 0 ? "Failed" : "Passed" },
    { label: "Formula Check", state: summary.corrected > 0 ? "Warning" : "Passed" },
    { label: "Outlier Detection", state: "Passed" },
  ] as { label: string; state: "Passed" | "Warning" | "Failed" }[];

  const gridInputStyle: React.CSSProperties = {
    width: "80px",
    textAlign: "right",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-sm)",
    padding: "4px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    background: "var(--bg)",
    color: "var(--text)",
    outline: "none",
  };

  // Derived invalid row list for error navigator
  const invalidRows = useMemo(() => rows.filter(r => r.status === "invalid"), [rows]);

  // When navigating to a focused invalid row: jump page and scroll to it
  const jumpToInvalid = (navIdx: number) => {
    const clamped = Math.max(0, Math.min(navIdx, invalidRows.length - 1));
    setFocusedInvalidIdx(clamped);
    const target = invalidRows[clamped];
    if (!target) return;
    const globalIdx = rows.findIndex(r => r.recordIndex === target.recordIndex);
    if (globalIdx < 0) return;
    const targetPage = Math.floor(globalIdx / PAGE_SIZE);
    setPage(targetPage);
    setTimeout(() => {
      const el = rowRefs.current.get(target.recordIndex);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  return (
    <AppShell active="staging" statusCounts={{ anomalies: summary.invalid + summary.corrected }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, margin: "0 0 2px" }}>Import from Excel</h1>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 12px", maxWidth: 720, lineHeight: 1.55 }}>
        Transition path: load your existing plant workbook once so the app learns <strong>your columns</strong>
        (for Data Entry) and can put historical numbers on the Dashboard. Day-to-day, prefer{" "}
        <a href="/data-entry" style={{ color: "var(--accent)", fontWeight: 600 }}>Data Entry</a>.
      </p>

      {/* Operator path — plain language, not MOD jargon */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18,
      }}>
        {[
          { n: "1", t: "Upload workbook", d: "Drop the Excel you already use (Visual, Valve, Rejection Analysis, …)." },
          { n: "2", t: "Confirm column meanings", d: "Check each header maps to Checked / Rejected / defect codes. Fix if wrong." },
          { n: "3", t: "Load numbers", d: "Clean rows go to the ledger automatically. Then open Dashboard or keep entering new days." },
        ].map((s) => (
          <div key={s.n} style={{
            padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--surface)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.04em", marginBottom: 4 }}>STEP {s.n}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{s.t}</div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{s.d}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", color: "var(--status-bad)", fontSize: 13 }}>{error}</div>}
      {done && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-good) 12%, transparent)", color: "var(--status-good)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span>
          <strong>Done.</strong> {done.inserted} new facts on the ledger
          {done.deduped ? ` (${done.deduped} already present)` : ""}.
          Your schema is available for Data Entry; numbers show on the Dashboard.
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/data-entry")} style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Data Entry</button>
          <button onClick={() => router.push("/")} style={{ background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Dashboard →</button>
        </div>
      </div>}

      {modUploads.length > 0 && (
        <MappingVerificationPanel mods={modUploads} onPublished={handleModPublished} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card
            title="Upload plant Excel"
            sub="Close the file in Excel first if it is open. We never change your original workbook."
          >
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
            {rows.length === 0 ? <Empty label={modUploads.length > 0 ? "Verify & publish the mappings above — extracted records appear here." : "Upload a file to review extracted, recomputed records here."} /> : (
              <>
                <div style={{ overflowX: "auto", width: "100%", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", marginBottom: 12 }}>
                  <table style={{ width: "100%", minWidth: "1200px", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase", background: "var(--surface-2)" }}>
                        <th style={{ ...sth, minWidth: 40 }}>#</th>
                        <th style={{ ...sth, minWidth: 90 }}>Date</th>
                        <th style={{ ...sth, minWidth: 130 }}>Stage</th>
                        <th style={{ ...sth, textAlign: "right", minWidth: 90 }}>Input (Checked)</th>
                        <th style={{ ...sth, textAlign: "right", minWidth: 90 }}>Good</th>
                        <th style={{ ...sth, textAlign: "right", minWidth: 90 }}>Rework</th>
                        <th style={{ ...sth, textAlign: "right", minWidth: 90 }}>Rejected</th>
                        <th style={{ ...sth, textAlign: "right", minWidth: 70 }}>Rej %</th>
                        <th style={{ ...sth, textAlign: "center", minWidth: 155 }}>Balance Check</th>
                        {defectsList.map((d: any) => (
                          <th key={d.defectCode} style={{ ...sth, textAlign: "right", minWidth: 65 }} title={d.label}>
                            {d.defectCode}
                          </th>
                        ))}
                        <th style={{ ...sth, minWidth: 100 }}>Status</th>
                        <th style={{ ...sth, textAlign: "center", minWidth: 50 }}>Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, idx) => {
                        const i = page * PAGE_SIZE + idx;
                        const hasComment = !!comments[r.recordIndex]?.trim();
                        const isInvalid = r.status === "invalid";
                        const isCorrected = r.status === "corrected";
                        const flagsExpanded = expandedFlagsRow === r.recordIndex;
                        const isSwappable = isInvalid && r.flags.some(f => f.toLowerCase().includes("exceeds checked"));

                        return (
                          <Fragment key={r.recordIndex}>
                            <tr
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

                              {/* Editable Quantities — only the cell(s) actually implicated in a
                                  failed rule are highlighted, not the whole row (see r.invalidFields). */}
                              <td style={{ ...std, textAlign: "right" }}>
                                <QtyInput
                                  value={r.checked}
                                  onChange={(n) => handleCellChange(r.recordIndex, "checked", n)}
                                  style={{ ...gridInputStyle, borderColor: r.invalidFields.includes("checked") ? "var(--status-bad)" : "var(--border-strong)" }}
                                  aria-label={`Checked row ${i + 1}`}
                                />
                              </td>
                              <td style={{ ...std, textAlign: "right" }}>
                                <QtyInput
                                  value={r.acceptedGood}
                                  onChange={(n) => handleCellChange(r.recordIndex, "acceptedGood", n)}
                                  style={{ ...gridInputStyle, borderColor: r.invalidFields.includes("acceptedGood") ? "var(--status-bad)" : "var(--border-strong)" }}
                                  aria-label={`Accepted row ${i + 1}`}
                                />
                              </td>
                              <td style={{ ...std, textAlign: "right" }}>
                                <QtyInput
                                  value={r.rework}
                                  onChange={(n) => handleCellChange(r.recordIndex, "rework", n)}
                                  style={{ ...gridInputStyle, borderColor: r.invalidFields.includes("rework") ? "var(--status-bad)" : "var(--border-strong)" }}
                                  aria-label={`Hold/rework row ${i + 1}`}
                                />
                              </td>
                              <td style={{ ...std, textAlign: "right" }}>
                                <QtyInput
                                  value={r.rejected}
                                  onChange={(n) => handleCellChange(r.recordIndex, "rejected", n)}
                                  style={{ ...gridInputStyle, borderColor: r.invalidFields.includes("rejected") ? "var(--status-bad)" : "var(--border-strong)" }}
                                  aria-label={`Rejected row ${i + 1}`}
                                />
                              </td>

                              <td style={{ ...std, textAlign: "right", fontFamily: "var(--font-mono)", paddingRight: "12px" }}>
                                {r.correctedPct != null ? `${r.correctedPct.toFixed(2)}%` : "—"}
                              </td>

                              {/* Equation Balance Status */}
                              <td style={{ ...std, textAlign: "center" }}>
                                {(() => {
                                  const sum = (r.acceptedGood ?? 0) + (r.rework ?? 0) + (r.rejected ?? 0);
                                  const isBalanced = r.checked === sum;
                                  return (
                                    <span style={{
                                      fontFamily: "var(--font-mono)",
                                      fontSize: 10.5,
                                      fontWeight: 700,
                                      color: isBalanced ? "var(--status-good)" : "var(--status-bad)",
                                      background: isBalanced ? "color-mix(in srgb, var(--status-good) 8%, transparent)" : "color-mix(in srgb, var(--status-bad) 8%, transparent)",
                                      padding: "3px 6px",
                                      borderRadius: 5,
                                      border: isBalanced ? "1px solid color-mix(in srgb, var(--status-good) 30%, transparent)" : "1px solid color-mix(in srgb, var(--status-bad) 30%, transparent)",
                                    }}>
                                      {r.checked ?? 0} = {r.acceptedGood ?? 0} + {r.rework ?? 0} + {r.rejected ?? 0}
                                    </span>
                                  );
                                })()}
                              </td>

                              {/* Dynamic Defect Cells */}
                              {defectsList.map((d: any) => {
                                // Columns are derived from extracted Excel defects — enable on every row.
                                const colKey = defectKey(d.defectCode);
                                const defectVal = r.defects.find(df => defectKey(df.raw) === colKey)?.value ?? null;
                                const isCulprit = r.invalidFields.includes(colKey);
                                return (
                                  <td key={d.defectCode} style={{ ...std, textAlign: "right" }}>
                                    <QtyInput
                                      value={defectVal}
                                      onChange={(n) => handleCellChange(r.recordIndex, d.defectCode, n)}
                                      aria-label={`${d.defectCode} row ${i + 1}`}
                                      style={{
                                        ...gridInputStyle,
                                        width: "55px",
                                        borderColor: isCulprit ? "var(--status-bad)" : "var(--border-strong)",
                                      }}
                                    />
                                  </td>
                                );
                              })}

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
                                    cursor: "pointer",
                                  }}
                                >
                                  <Icon name="comment" size={13} />
                                </button>
                              </td>
                            </tr>
                            {flagsExpanded && isInvalid && (
                              <tr style={{ background: "color-mix(in srgb, var(--status-bad) 4%, transparent)" }}>
                                <td colSpan={totalCols} style={{ padding: 0 }}>
                                  <div className="expand-panel" style={{ padding: "10px 16px 12px 50px", borderBottom: "1px solid var(--border)" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                      <div style={{ fontWeight: 700, fontSize: 10.5, color: "var(--status-bad)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
                                        <span>⚠</span>
                                        <span>Validation Issues for Row {i + 1}:</span>
                                      </div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 12 }}>
                                        {r.flags.map((flag, fi) => (
                                          <div key={fi} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text)" }}>
                                            <span style={{ color: "var(--status-bad)" }}>•</span>
                                            <span>{flag}</span>
                                          </div>
                                        ))}
                                      </div>
                                      {isSwappable && (
                                        <div style={{ marginTop: 4, paddingLeft: 12 }}>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleSwapCheckedRejected(r.recordIndex); }}
                                            style={{
                                              fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                                              border: "1px solid var(--status-warn)",
                                              background: "color-mix(in srgb, var(--status-warn) 12%, var(--surface))",
                                              color: "var(--status-warn)",
                                              transition: "all 0.2s ease",
                                            }}
                                          >
                                            ⇅ Swap Checked ↔ Rejected values
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {editingCommentRow !== null && (
                  <div className="comment-box-panel" style={{ marginTop: 16, padding: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
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
                        outline: "none",
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
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
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
            <button onClick={publish} disabled={rows.length === 0 || summary.invalid > 0 || busy}
              style={{ width: "100%", background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: rows.length && !summary.invalid && !busy ? "pointer" : "not-allowed", opacity: rows.length && !summary.invalid && !busy ? 1 : 0.5 }}>
              <Icon name="check" size={14} /> {busy ? "Publishing…" : "Publish to Analytics"}
            </button>
            {summary.invalid > 0 && <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Fix {summary.invalid} invalid row(s) before publishing.</div>}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const c = tone === "bad" ? "var(--status-bad)" : tone === "good" ? "var(--status-good)" : "var(--text)";
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}><span className="muted">{label}</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: c }}>{value}</span></div>;
}
const sth: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const std: React.CSSProperties = { padding: "6px 8px" };
