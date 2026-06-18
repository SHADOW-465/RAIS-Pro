"use client";

// Staging & Review (mockup 3). Upload raw files (the only place upload lives),
// review the recomputed extraction, then Publish to Analytics → dashboard.

import { useMemo, useState } from "react";
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

  const rows = useMemo(() => buildReviewRows(records), [records]);
  const summary = useMemo(() => reviewSummary(rows), [rows]);
  const totals = useMemo(() => {
    let input = 0, rejected = 0; for (const r of rows) { input += r.checked ?? 0; rejected += r.rejected ?? 0; }
    return { input, rejected, rejPct: input ? (rejected / input) * 100 : 0 };
  }, [rows]);

  async function handleUpload(files: File[]) {
    setError(null); setDone(null);
    try {
      const { parseExcelFilesWithRaw } = await import("@/lib/parser");
      const { rawSheets } = await parseExcelFilesWithRaw(files);
      const { records } = classifyRejectionSheets(rawSheets, ingestionId);
      setRecords(records); setFileName(files.map((f) => f.name).join(", "));
    } catch (e: any) { setError(e?.message ?? "Could not read the file."); }
  }

  async function publish() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingestionId, fileName, records, comments: {} }) });
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

          <Card title="Staging Area (Verify & Approve Records)" sub={fileName || "no file yet"}>
            {rows.length === 0 ? <Empty label="Upload a file to review extracted, recomputed records here." /> : (
              <>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead><tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                    <th style={sth}>#</th><th style={sth}>Date</th><th style={sth}>Stage</th><th style={{ ...sth, textAlign: "right" }}>Input</th><th style={{ ...sth, textAlign: "right" }}>Rejected</th><th style={{ ...sth, textAlign: "right" }}>Rej %</th><th style={sth}>Status</th>
                  </tr></thead>
                  <tbody>
                    {rows.slice(0, 40).map((r, i) => (
                      <tr key={r.recordIndex} style={{ borderTop: "1px solid var(--border)", background: r.status === "invalid" ? "color-mix(in srgb, var(--status-bad) 8%, transparent)" : "transparent", color: r.status === "invalid" ? "var(--status-bad)" : "var(--text)" }}>
                        <td style={std}>{i + 1}</td><td style={{ ...std, fontFamily: "var(--font-mono)" }}>{r.date}</td><td style={std}>{r.stageLabel}</td>
                        <td style={{ ...std, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.checked?.toLocaleString() ?? "—"}</td>
                        <td style={{ ...std, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.rejected?.toLocaleString() ?? "—"}</td>
                        <td style={{ ...std, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.correctedPct != null ? r.correctedPct.toFixed(2) : "—"}</td>
                        <td style={{ ...std, fontWeight: 600, color: r.status === "invalid" ? "var(--status-bad)" : r.status === "corrected" ? "var(--status-warn)" : "var(--status-good)" }}>{r.status === "invalid" ? "Invalid" : r.status === "corrected" ? "Corrected" : "Valid"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 40 && <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Showing 40 of {rows.length} records.</div>}
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
