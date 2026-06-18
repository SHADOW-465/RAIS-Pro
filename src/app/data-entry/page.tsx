"use client";

// Data Entry (manual entry form, mockup 2). Per registry stage: Input / Good /
// Rework / Rejected → recomputed Rejection % → emit canonical events on
// Submit & Lock → dashboard. Live Quick Stats + Data Quality Check.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import Icon from "@/components/editorial/Icon";
import { DISPOSAFE_REGISTRY, activeStageIds } from "@/lib/registry/disposafe";
import { checkRecord } from "@/lib/entry/validate-entry";
import type { StageDayRecord } from "@/lib/ingest/emit";

interface RowState { input: string; good: string; rework: string; rejected: string; by: string }
const blank: RowState = { input: "", good: "", rework: "", rejected: "", by: "" };
const num = (s: string) => { const n = Number(s); return s.trim() !== "" && Number.isFinite(n) ? n : null; };
const label = (id: string) => DISPOSAFE_REGISTRY.stages.find((s) => s.stageId === id)?.label ?? id;
const today = () => new Date().toISOString().slice(0, 10);

export default function DataEntryPage() {
  const router = useRouter();
  const [date, setDate] = useState(today());
  const [hdr, setHdr] = useState({ shift: "Day Shift", operator: "", supervisor: "", product: "FBC", size: "All", machine: "All Machines", batch: "" });
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [openRemark, setOpenRemark] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageIds = useMemo(() => activeStageIds(date), [date]);
  const row = (id: string) => rows[id] ?? blank;
  const setCell = (id: string, k: keyof RowState, v: string) =>
    setRows((r) => ({ ...r, [id]: { ...(r[id] ?? blank), [k]: v } }));

  // live totals
  const totals = useMemo(() => {
    let input = 0, good = 0, rework = 0, rejected = 0;
    for (const id of stageIds) {
      const r = row(id);
      input += num(r.input) ?? 0; good += num(r.good) ?? 0; rework += num(r.rework) ?? 0; rejected += num(r.rejected) ?? 0;
    }
    return { input, good, rework, rejected, rejPct: input ? (rejected / input) * 100 : 0, fpy: input ? (good / input) * 100 : 0, netGood: good };
  }, [rows, stageIds]);

  // build records (one per stage with any input)
  const buildRecords = (ingestionId: string): StageDayRecord[] =>
    stageIds.map((id) => ({ id, r: row(id) }))
      .filter(({ r }) => num(r.input) != null || num(r.rejected) != null)
      .map(({ id, r }) => ({
        occurredOn: { kind: "day" as const, start: date, end: date },
        stageId: id,
        source: { file: "Manual Entry", fileHash: `manual-${date}-${hdr.shift}`, sheet: hdr.shift, tableId: "entry" },
        checked: num(r.input) != null ? { value: num(r.input)!, cell: `ENTRY!${id}.input`, header: "Input Qty" } : null,
        acceptedGood: num(r.good) != null ? { value: num(r.good)!, cell: `ENTRY!${id}.good`, header: "Good" } : null,
        rework: num(r.rework) != null ? { value: num(r.rework)!, cell: `ENTRY!${id}.rework`, header: "Rework" } : null,
        rejected: num(r.rejected) != null ? { value: num(r.rejected)!, cell: `ENTRY!${id}.rejected`, header: "Rejected" } : null,
        defects: [],
        statedPct: null,
        extractedBy: "direct-entry",
        ingestionId,
      }));

  // data-quality checks (live)
  const dq = useMemo(() => {
    const recs = buildRecords("dq");
    const issues = recs.flatMap(checkRecord);
    const missing = stageIds.some((id) => { const r = row(id); return num(r.input) != null && (num(r.good) == null && num(r.rejected) == null); });
    const balanceOff = recs.some((r) => {
      const i = r.checked?.value, g = r.acceptedGood?.value, w = r.rework?.value, j = r.rejected?.value;
      return i != null && (g != null || w != null || j != null) && i !== (g ?? 0) + (w ?? 0) + (j ?? 0);
    });
    const logical = issues.some((x) => x.code === "V-001" || x.code === "V-013");
    return [
      { label: "Missing Values", state: missing ? "Warning" : "Passed" },
      { label: "Logical Validation", state: logical ? "Failed" : "Passed" },
      { label: "Formula Check", state: balanceOff ? "Warning" : "Passed" },
      { label: "Outlier Detection", state: "Passed" },
    ] as { label: string; state: "Passed" | "Warning" | "Failed" }[];
  }, [rows, stageIds, date, hdr.shift]);

  // Concrete blocking errors (with location) — wrong arithmetic + required fields
  // must be fixed before Submit. This is what makes invalid data un-submittable.
  const blockingErrors = useMemo(() => {
    const errs: string[] = [];
    if (!hdr.operator.trim()) errs.push("Operator name is required.");
    for (const id of stageIds) {
      const r = row(id);
      const input = num(r.input), good = num(r.good), rework = num(r.rework), rej = num(r.rejected);
      const name = label(id);
      if (rej != null && input != null && rej > input) errs.push(`${name}: Rejected (${rej}) cannot exceed Input (${input}).`);
      if (good != null && input != null && good > input) errs.push(`${name}: Good (${good}) cannot exceed Input (${input}).`);
      // Full balance: when good is recorded, Input must equal Good + Rework + Rejected.
      if (input != null && good != null && (good + (rework ?? 0) + (rej ?? 0)) !== input)
        errs.push(`${name}: Good + Rework + Rejected (${good + (rework ?? 0) + (rej ?? 0)}) must equal Input (${input}).`);
      // A stage with Input must record an outcome.
      if (input != null && good == null && rej == null)
        errs.push(`${name}: enter Good and/or Rejected for the ${input} units checked.`);
    }
    return errs;
  }, [rows, stageIds, hdr.operator]);

  const dqBad = dq.some((d) => d.state === "Failed") || blockingErrors.length > 0;

  async function submit() {
    if (blockingErrors.length > 0) { setError(blockingErrors[0]); return; }
    setBusy(true); setError(null);
    const ingestionId = globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}`;
    const records = buildRecords(ingestionId);
    if (records.length === 0) { setError("Enter at least one stage's quantities."); setBusy(false); return; }
    try {
      const res = await fetch("/api/ingest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestionId, fileName: `Manual Entry ${date} ${hdr.shift}`, records, comments: remarks }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Submit failed");
      await res.json();
      router.push("/");
    } catch (e: any) { setError(e?.message ?? "Submit failed"); setBusy(false); }
  }
  const reset = () => { setRows({}); setRemarks({}); setNotes(""); setError(null); };

  return (
    <AppShell active="data-entry">
      <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 16 }}>
        <label className="muted" style={{ fontSize: 11 }}>Report Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inp, width: 160 }} /></label>
        <label className="muted" style={{ fontSize: 11 }}>Shift<select value={hdr.shift} onChange={(e) => setHdr({ ...hdr, shift: e.target.value })} style={{ ...inp, width: 140 }}><option>Day Shift</option><option>Night Shift</option></select></label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>Data Entry</h1>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 20px" }}>Enter daily production, rejection and inspection data for each stage.</p>

          {error && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", color: "var(--status-bad)", fontSize: 13 }}>{error}</div>}

          {/* header fields */}
          <Section title="Data Entry Form">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <Field label="Operator *"><input style={{ ...inp, borderColor: hdr.operator.trim() ? "var(--border)" : "var(--status-bad)" }} value={hdr.operator} onChange={(e) => setHdr({ ...hdr, operator: e.target.value })} placeholder="Required" /></Field>
              <Field label="Supervisor"><input style={inp} value={hdr.supervisor} onChange={(e) => setHdr({ ...hdr, supervisor: e.target.value })} placeholder="Name" /></Field>
              <Field label="Product"><input style={inp} value={hdr.product} onChange={(e) => setHdr({ ...hdr, product: e.target.value })} /></Field>
              <Field label="Size (French)"><input style={inp} value={hdr.size} onChange={(e) => setHdr({ ...hdr, size: e.target.value })} /></Field>
              <Field label="Machine"><input style={inp} value={hdr.machine} onChange={(e) => setHdr({ ...hdr, machine: e.target.value })} /></Field>
              <Field label="Batch / Lot No."><input style={inp} value={hdr.batch} onChange={(e) => setHdr({ ...hdr, batch: e.target.value })} placeholder="LOT-…" /></Field>
            </div>
          </Section>

          {/* stage table */}
          <Section title="Production & Rejection Details">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--text-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <th style={{ ...eth, textAlign: "left" }}>Stage</th><th style={eth}>Input</th><th style={eth}>Good</th><th style={eth}>Rework</th><th style={eth}>Rejected</th><th style={eth}>Rej %</th><th style={eth}>Inspection By</th><th style={eth}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {stageIds.map((id, i) => {
                  const r = row(id); const input = num(r.input), rej = num(r.rejected);
                  const pct = input && rej != null ? (rej / input) * 100 : null;
                  const bad = input != null && rej != null && rej > input;
                  return (
                    <tr key={id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={etd}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Dot n={i + 1} /> {label(id)}</span></td>
                      <td style={etd}><NumCell v={r.input} onChange={(v) => setCell(id, "input", v)} /></td>
                      <td style={etd}><NumCell v={r.good} onChange={(v) => setCell(id, "good", v)} /></td>
                      <td style={etd}><NumCell v={r.rework} onChange={(v) => setCell(id, "rework", v)} /></td>
                      <td style={etd}><NumCell v={r.rejected} onChange={(v) => setCell(id, "rejected", v)} /></td>
                      <td style={{ ...etd, fontFamily: "var(--font-mono)", color: bad ? "var(--status-bad)" : pct != null && pct > 5 ? "var(--status-warn)" : "var(--text)" }}>{pct != null ? `${pct.toFixed(2)}%` : "—"}</td>
                      <td style={etd}><input style={{ ...inp, width: 110 }} value={r.by} onChange={(e) => setCell(id, "by", e.target.value)} placeholder="Initials" /></td>
                      <td style={etd}>
                        <button onClick={() => setOpenRemark(openRemark === id ? null : id)} style={{ background: remarks[id]?.trim() ? "var(--accent)" : "var(--surface-2)", color: remarks[id]?.trim() ? "#fff" : "var(--text-2)", border: "none", borderRadius: 7, width: 28, height: 28, cursor: "pointer" }}><Icon name="comment" size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td style={etd}>TOTAL</td>
                  <td style={{ ...etd, fontFamily: "var(--font-mono)" }}>{totals.input.toLocaleString()}</td>
                  <td style={{ ...etd, fontFamily: "var(--font-mono)", color: "var(--status-good)" }}>{totals.good.toLocaleString()}</td>
                  <td style={{ ...etd, fontFamily: "var(--font-mono)", color: "var(--status-warn)" }}>{totals.rework.toLocaleString()}</td>
                  <td style={{ ...etd, fontFamily: "var(--font-mono)", color: "var(--status-bad)" }}>{totals.rejected.toLocaleString()}</td>
                  <td style={{ ...etd, fontFamily: "var(--font-mono)", color: "var(--status-bad)" }}>{totals.rejPct.toFixed(2)}%</td>
                  <td style={etd}>-</td><td style={etd}>-</td>
                </tr>
              </tbody>
            </table>
            {openRemark && (
              <textarea autoFocus value={remarks[openRemark] ?? ""} onChange={(e) => setRemarks((c) => ({ ...c, [openRemark]: e.target.value }))}
                placeholder={`Remark for ${label(openRemark)}…`} style={{ width: "100%", marginTop: 10, minHeight: 56, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />
            )}
          </Section>

          <Section title="Additional Information">
            <Field label="Remarks"><textarea style={{ ...inp, minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter remarks if any…" /></Field>
          </Section>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 24 }}>
            <button onClick={reset} style={ghost}>Reset</button>
            <button onClick={() => { try { localStorage.setItem(`moid_draft_${date}`, JSON.stringify({ hdr, rows, remarks })); } catch {} }} style={{ ...ghost, color: "var(--accent)", borderColor: "var(--accent)" }}>Save as Draft</button>
            <button onClick={submit} disabled={busy || dqBad} style={{ ...primary, opacity: busy || dqBad ? 0.5 : 1, cursor: busy || dqBad ? "not-allowed" : "pointer" }} title={dqBad ? "Fix logical errors first" : ""}>{busy ? "Saving…" : "Submit & Lock"}</button>
          </div>
        </div>

        {/* right rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Section title="Quick Stats">
            <Stat label="Total Input" value={totals.input.toLocaleString()} />
            <Stat label="Total Rejected" value={totals.rejected.toLocaleString()} tone="bad" />
            <Stat label="Overall Rejection %" value={`${totals.rejPct.toFixed(2)}%`} tone="bad" />
            <Stat label="First Pass Yield" value={`${totals.fpy.toFixed(2)}%`} tone="good" />
            <Stat label="Total Rework" value={totals.rework.toLocaleString()} tone="warn" />
            <Stat label="Net Good Output" value={totals.netGood.toLocaleString()} tone="good" />
          </Section>
          <Section title="Data Quality Check">
            {dq.map((d) => (
              <div key={d.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 13 }}>
                <span className="muted">{d.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: d.state === "Passed" ? "var(--status-good)" : d.state === "Warning" ? "var(--status-warn)" : "var(--status-bad)", background: `color-mix(in srgb, ${d.state === "Passed" ? "var(--status-good)" : d.state === "Warning" ? "var(--status-warn)" : "var(--status-bad)"} 14%, transparent)` }}>{d.state}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>Overall Status</span>
              <span style={{ color: dqBad ? "var(--status-bad)" : "var(--status-good)", fontWeight: 700 }}>{dqBad ? "Needs fix" : "All Good"}</span>
            </div>
            {blockingErrors.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-bad)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Fix before submitting
                </span>
                {blockingErrors.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11.5, color: "var(--text-2)" }}>
                    <span style={{ color: "var(--status-bad)", flexShrink: 0 }}>•</span>
                    <span>{e}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

/* ── bits ───────────────────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block" }}><div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>{children}</label>;
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const c = tone === "bad" ? "var(--status-bad)" : tone === "warn" ? "var(--status-warn)" : tone === "good" ? "var(--status-good)" : "var(--text)";
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}><span className="muted">{label}</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: c }}>{value}</span></div>;
}
function NumCell({ v, onChange }: { v: string; onChange: (v: string) => void }) {
  return <input type="number" value={v} onChange={(e) => onChange(e.target.value)} style={{ ...inp, width: 90, fontFamily: "var(--font-mono)" }} />;
}
function Dot({ n }: { n: number }) {
  return <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{n}</span>;
}
const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" };
const primary: React.CSSProperties = { background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 9, padding: "10px 22px", fontSize: 14, fontWeight: 700 };
const ghost: React.CSSProperties = { background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 22px", fontSize: 14, cursor: "pointer" };
const eth: React.CSSProperties = { padding: "8px 8px", textAlign: "center", fontWeight: 600 };
const etd: React.CSSProperties = { padding: "6px 8px", textAlign: "center", color: "var(--text)" };
