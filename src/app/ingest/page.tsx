"use client";

// Data ingestion pipeline (MOID-SPEC §13). Upload Excel → human-verifiable
// mapping (with per-row comments) → commit to the canonical ledger.

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UploadZone from "@/components/UploadZone";
import EditorialHeader from "@/components/editorial/EditorialHeader";
import Icon from "@/components/editorial/Icon";
import { classifyRejectionSheets, type MappingRow } from "@/lib/ingest/from-rejection-sheets";
import { buildReviewRows, reviewSummary, applyEdit, type ReviewRow } from "@/lib/ingest/review";
import type { StageDayRecord } from "@/lib/ingest/emit";

type Phase = "upload" | "parsing" | "review" | "committing" | "done";

interface CommitResult {
  fileName: string;
  eventsEmitted: number;
  inserted: number;
  deduped: number;
  commentCount: number;
  byStage: Record<string, { checked: number; rejected: number; days: number }>;
  issues: { code: string; severity: string; message: string; stageId: string; date: string }[];
}

const STATUS_COLOR: Record<string, string> = {
  critical: "var(--status-bad, #c0392b)",
  warning: "var(--status-warn, #d98a0b)",
  info: "var(--status-good, #1a9d6e)",
};

export default function IngestPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("upload");
  const [ingestionId] = useState(() => (globalThis.crypto?.randomUUID?.() ?? `ing-${Date.now()}`));
  const [records, setRecords] = useState<StageDayRecord[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [skipped, setSkipped] = useState<{ sheet: string; reason: string }[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [openComment, setOpenComment] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(files: File[]) {
    setPhase("parsing");
    setError(null);
    try {
      const { parseExcelFilesWithRaw } = await import("@/lib/parser");
      const { rawSheets } = await parseExcelFilesWithRaw(files);
      const { records, mappings, skipped } = classifyRejectionSheets(rawSheets, ingestionId);
      setFileName(files.map((f) => f.name).join(", "));
      setRecords(records);
      setMappings(mappings);
      setSkipped(skipped);
      setPhase("review");
    } catch (e: any) {
      setError(e?.message ?? "Could not read the file.");
      setPhase("upload");
    }
  }

  async function commit() {
    setPhase("committing");
    setError(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestionId, fileName, records, comments }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Commit failed");
      await res.json();
      // Saved → automatically generate the dashboard.
      router.push("/");
    } catch (e: any) {
      setError(e?.message ?? "Commit failed");
      setPhase("review");
    }
  }

  const totalDays = mappings.reduce((a, m) => a + m.dayCount, 0);
  const reviewRows = useMemo(() => buildReviewRows(records), [records]);
  const summary = useMemo(() => reviewSummary(reviewRows), [reviewRows]);
  const editCell = (index: number, field: "checked" | "rejected", value: number) =>
    setRecords((rs) => applyEdit(rs, index, field, value));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <EditorialHeader />
      <div className="shell" style={{ paddingTop: 40, paddingBottom: 80, flex: 1 }}>
        <div style={{ maxWidth: 920, margin: "0 auto", width: "100%" }}>
          {/* heading */}
          <button onClick={() => router.push("/")} className="muted" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 16 }}>
            <Icon name="arrow-right" size={12} /> Back to dashboard
          </button>
          <div className="eyebrow accent" style={{ fontSize: 11, fontWeight: 700 }}>Data Ingestion</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, margin: "6px 0 24px", letterSpacing: "-0.02em", color: "var(--text)" }}>
            Bring in rejection data
          </h1>

          {error && (
            <div className="fade-up" style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 10, background: "color-mix(in srgb, #c0392b 10%, transparent)", color: "#c0392b", fontSize: 14 }}>
              {error}
            </div>
          )}

          {/* UPLOAD */}
          {phase === "upload" && (
            <div className="fade-up">
              <p className="muted" style={{ fontSize: 14, marginBottom: 20, maxWidth: 600 }}>
                Drop a rejection workbook (.xlsx / .csv). MO!D reads it, shows you exactly how it
                understood each sheet, and lets you correct anything with a comment before it&apos;s recorded.
              </p>
              <UploadZone onUpload={handleUpload} />
            </div>
          )}

          {phase === "parsing" && <Pending label="Reading the workbook…" />}
          {phase === "committing" && <Pending label="Recording to the ledger…" />}

          {/* REVIEW / VERIFY — recomputed-from-scratch, in the sheet's own format */}
          {phase === "review" && (
            <div className="fade-up">
              <p className="muted" style={{ fontSize: 14, margin: "0 0 6px" }}>
                MO!D recomputed every % from the raw counts (it does <strong style={{ color: "var(--text)" }}>not</strong> trust the
                sheet&apos;s formulas). Review the corrected figures, fix any flagged rows, then save.
              </p>
              <div className="between" style={{ marginBottom: 16, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 14, fontSize: 13, flexWrap: "wrap" }}>
                  <Chip dot="var(--status-good)" text={`${summary.ok} clean`} />
                  <Chip dot="var(--status-warn)" text={`${summary.corrected} corrected`} />
                  <Chip dot="var(--status-bad)" text={`${summary.invalid} need fixing`} />
                  <span className="muted">· {fileName}</span>
                </div>
                <button onClick={commit} disabled={totalDays === 0 || summary.invalid > 0}
                  title={summary.invalid > 0 ? "Fix the impossible rows first" : "Save the corrected data and build the dashboard"}
                  style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: totalDays && !summary.invalid ? "pointer" : "not-allowed", opacity: totalDays && !summary.invalid ? 1 : 0.5 }}>
                  Save &amp; build dashboard →
                </button>
              </div>

              <ReviewGrids
                rows={reviewRows}
                onEdit={editCell}
                comments={comments}
                setComments={setComments}
                openComment={openComment}
                setOpenComment={setOpenComment}
              />

              {skipped.length > 0 && (
                <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                  Skipped {skipped.length} sheet(s): {skipped.map((s) => s.sheet).join(", ")} (summaries / no stage detected — kept as claims, not analytics).
                </p>
              )}
            </div>
          )}

          {/* DONE */}
          {phase === "done" && result && (
            <div className="fade-up">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--status-good, #1a9d6e)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={18} /></span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text)", fontFamily: "var(--font-display)" }}>Recorded to the ledger</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {result.inserted} new events · {result.deduped} already on file (idempotent) · {result.commentCount} comment(s) saved
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
                {Object.entries(result.byStage).map(([stage, s]) => (
                  <div key={stage} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                    <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 14, textTransform: "capitalize" }}>{stage.replace("-", " ")}</div>
                    <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13, color: "var(--text-2,#555)", marginTop: 6 }}>
                      {s.checked.toLocaleString()} checked · {s.rejected.toLocaleString()} rejected
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>{s.days} days · {s.checked ? ((s.rejected / s.checked) * 100).toFixed(2) : "0"}% rejection</div>
                  </div>
                ))}
              </div>

              {result.issues.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div className="eyebrow accent" style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>MO!D wants to clarify ({result.issues.length})</div>
                  {result.issues.slice(0, 8).map((iss, i) => (
                    <div key={i} style={{ borderLeft: `3px solid ${STATUS_COLOR[iss.severity] ?? "#999"}`, padding: "8px 14px", marginBottom: 8, background: "var(--surface, #faf8f4)", borderRadius: "0 8px 8px 0" }}>
                      <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, color: STATUS_COLOR[iss.severity] }}>{iss.code} · {iss.stageId} · {iss.date}</span>
                      <div style={{ fontSize: 13, color: "var(--text)" }}>{iss.message}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => router.push("/")} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>View dashboard →</button>
                <button onClick={() => { setPhase("upload"); setRecords([]); setMappings([]); setResult(null); setComments({}); }} style={{ background: "transparent", color: "var(--text-2,#555)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}>Ingest another file</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ dot, text }: { dot: string; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot }} /> {text}
    </span>
  );
}

const rowTint = (s: ReviewRow["status"]) =>
  s === "invalid" ? "color-mix(in srgb, var(--status-bad) 9%, transparent)" :
  s === "corrected" ? "color-mix(in srgb, var(--status-warn) 9%, transparent)" : "transparent";

function ReviewGrids({ rows, onEdit, comments, setComments, openComment, setOpenComment }: {
  rows: ReviewRow[];
  onEdit: (index: number, field: "checked" | "rejected", value: number) => void;
  comments: Record<string, string>;
  setComments: (fn: (c: Record<string, string>) => Record<string, string>) => void;
  openComment: string | null;
  setOpenComment: (id: string | null) => void;
}) {
  const groups = new Map<string, ReviewRow[]>();
  for (const r of rows) (groups.get(r.stageLabel) ?? groups.set(r.stageLabel, []).get(r.stageLabel)!).push(r);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {[...groups.entries()].map(([stage, stageRows]) => (
        <div key={stage} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", fontWeight: 700, fontSize: 14, color: "var(--text)", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>{stage}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={gth}>Date</th><th style={gth}>Checked</th><th style={gth}>Rejected</th>
                <th style={gth}>Sheet %</th><th style={gth}>Corrected %</th><th style={gth}>Status</th><th style={{ ...gth, textAlign: "right" }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {stageRows.map((r) => {
                const cid = `r${r.recordIndex}`;
                const corrected = r.status === "corrected";
                return (
                  <Fragment key={cid}>
                    <tr style={{ borderTop: "1px solid var(--border)", background: rowTint(r.status) }}>
                      <td style={gtd}><span style={{ fontFamily: "var(--font-mono)" }}>{r.date}</span></td>
                      <td style={gtd}><EditNum value={r.checked} onCommit={(v) => onEdit(r.recordIndex, "checked", v)} /></td>
                      <td style={gtd}><EditNum value={r.rejected} onCommit={(v) => onEdit(r.recordIndex, "rejected", v)} /></td>
                      <td style={{ ...gtd, fontFamily: "var(--font-mono)", color: "var(--text-3)", textDecoration: corrected ? "line-through" : "none" }}>{r.statedPct != null ? r.statedPct.toFixed(2) : "—"}</td>
                      <td style={{ ...gtd, fontFamily: "var(--font-mono)", fontWeight: 700, color: r.status === "invalid" ? "var(--status-bad)" : corrected ? "var(--status-warn)" : "var(--text)" }}>{r.correctedPct != null ? r.correctedPct.toFixed(2) : "—"}</td>
                      <td style={{ ...gtd, fontSize: 11, color: "var(--text-2)" }}>{r.flags[0] ?? "ok"}</td>
                      <td style={{ ...gtd, textAlign: "right" }}>
                        <button onClick={() => setOpenComment(openComment === cid ? null : cid)} title="Add a note"
                          style={{ background: comments[cid]?.trim() ? "var(--accent)" : "var(--surface-2)", color: comments[cid]?.trim() ? "#fff" : "var(--text-2)", border: "none", borderRadius: 7, width: 26, height: 26, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="comment" size={13} />
                        </button>
                      </td>
                    </tr>
                    {openComment === cid && (
                      <tr><td colSpan={7} style={{ padding: "0 12px 12px", background: rowTint(r.status) }}>
                        <textarea autoFocus value={comments[cid] ?? ""} onChange={(e) => setComments((c) => ({ ...c, [cid]: e.target.value }))}
                          placeholder="Note / correction for this row…"
                          style={{ width: "100%", minHeight: 48, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
const gth: React.CSSProperties = { padding: "8px 12px", fontWeight: 600 };
const gtd: React.CSSProperties = { padding: "7px 12px", color: "var(--text)" };

function EditNum({ value, onCommit }: { value: number | null; onCommit: (v: number) => void }) {
  return (
    <input
      type="number"
      defaultValue={value ?? ""}
      onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onCommit(n); }}
      style={{ width: 84, padding: "4px 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12 }}
    />
  );
}

function ColMap({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 12, fontFamily: "var(--font-mono, monospace)", color: value ? "var(--text)" : "var(--status-warn, #d98a0b)" }}>{value ?? "— missing —"}</div>
    </div>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <div className="fade-up" style={{ textAlign: "center", padding: "80px 0" }}>
      <div className="pulse-ring" style={{ width: 40, height: 40, margin: "0 auto 16px", borderRadius: "50%", border: "3px solid var(--accent)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <p className="muted" style={{ fontSize: 14 }}>{label}</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
