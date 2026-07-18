"use client";

// Shop-floor Data Entry Matrix — single-batch form matching
// Disposafe_Data_Entry_System_Documentation.md.
// Saves to localStorage (shift buffer) and POSTs StageDayRecords to /api/ingest.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  MATRIX_STAGES,
  FRENCH_SIZES,
  DEFAULT_OPERATORS,
  SECONDARY_BINS,
  SHIFT_STORAGE_KEY,
  defectsFor,
  defectDisplayLabel,
  processLabel,
  resolveStageId,
  type MacroId,
  type ShiftBatchRecord,
} from "@/lib/entry/disposafe-matrix";
import {
  buildBatchId,
  isValidBatchId,
  parseBatchId,
  toCanonicalSize,
  toDisplaySize,
} from "@/lib/entry/batch-id";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { useEvents } from "@/components/app/EventsContext";

const today = () => new Date().toISOString().slice(0, 10);

type A12Choice = "set-reject" | "keep-incomplete" | null;

function loadShift(): ShiftBatchRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SHIFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShiftBatchRecord[]) : [];
  } catch {
    return [];
  }
}

function persistShift(rows: ShiftBatchRecord[]) {
  localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(rows));
}

function sv(value: number, cell: string, header: string) {
  return { value, cell, header };
}

function qtyHeaderFor(macro: MacroId): string {
  if (macro === "primary") return "Quantity Produced";
  if (macro === "secondary") return "Quantity";
  return "Checked Qty";
}

function toStageDayRecord(rec: ShiftBatchRecord, ingestionId: string): StageDayRecord {
  const isSecondary = rec.macro === "secondary";
  const isPrimary = rec.macro === "primary";

  // Secondary has no accept/hold/reject/defects — qty only + bin metadata.
  const defects = isSecondary
    ? []
    : Object.entries(rec.defects)
        .filter(([, v]) => v > 0)
        .map(([raw, value]) => ({
          raw,
          value,
          cell: `ENTRY!defect!${raw}`,
        }));

  return {
    occurredOn: { kind: "day", start: rec.date, end: rec.date },
    stageId: rec.stageId,
    size: rec.sizeCanonical,
    source: {
      file: "Manual Entry",
      fileHash: `manual-${rec.date}-${rec.batchId}-${rec.stageId}`,
      sheet: rec.shift || "Day Shift",
      tableId: "batch-matrix",
    },
    checked: rec.checked > 0 ? sv(rec.checked, "ENTRY!checked", qtyHeaderFor(rec.macro)) : null,
    acceptedGood:
      !isSecondary && rec.accept > 0 ? sv(rec.accept, "ENTRY!accept", "Good Qty") : null,
    // Hold only for Assembly (not Primary, not Secondary).
    rework:
      !isPrimary && !isSecondary && rec.hold > 0
        ? sv(rec.hold, "ENTRY!hold", "Rework Qty")
        : null,
    rejected:
      !isSecondary && rec.reject > 0 ? sv(rec.reject, "ENTRY!reject", "Rejected Qty") : null,
    defects,
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId,
    comment: rec.remarks || null,
    customFields: {
      operator: rec.operator,
      batch: rec.batchId,
      size: rec.size,
      shift: rec.shift,
      notes: rec.remarks,
      product: "FBC",
      macro: rec.macro,
      process: rec.processName,
      matrixId: rec.id,
      ...(isPrimary && rec.trolleys != null && rec.trolleys > 0
        ? { trolleysProduced: rec.trolleys, "No. of Trolleys Produced": rec.trolleys }
        : {}),
      ...(isSecondary && rec.bin
        ? { bin: rec.bin, Bin: rec.bin }
        : {}),
    },
  };
}

export default function BatchMatrixEntry({
  onSynced,
}: {
  onSynced?: () => void;
}) {
  const { refreshEvents } = useEvents();

  const [macro, setMacro] = useState<MacroId>("assembly");
  const [micro, setMicro] = useState("p15-visual");
  const [date, setDate] = useState(today);
  const [size, setSize] = useState("14Fr");
  const [operator, setOperator] = useState<string>(DEFAULT_OPERATORS[0]);
  const [shift, setShift] = useState("Day Shift");
  const [batchId, setBatchId] = useState(() => buildBatchId(today(), "14Fr") ?? "");
  const [batchManual, setBatchManual] = useState(false);
  const [checked, setChecked] = useState(0);
  const [trolleys, setTrolleys] = useState(0);
  const [bin, setBin] = useState("");
  const [accept, setAccept] = useState(0);
  const [hold, setHold] = useState(0);
  const [reject, setReject] = useState(0);
  const [defects, setDefects] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState("");
  const [saved, setSaved] = useState<ShiftBatchRecord[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [a12, setA12] = useState<{ defectSum: number; reject: number } | null>(null);
  const [a12Choice, setA12Choice] = useState<A12Choice>(null);

  useEffect(() => {
    setSaved(loadShift());
    const op = localStorage.getItem("rais_hdr_operator");
    if (op) setOperator(op);
    const sh = localStorage.getItem("rais_hdr_shift");
    if (sh) setShift(sh);
  }, []);

  // Form → Batch ID (unless operator is typing the ID manually)
  useEffect(() => {
    if (batchManual) return;
    const id = buildBatchId(date, size);
    if (id) setBatchId(id);
  }, [date, size, batchManual]);

  const isPrimary = macro === "primary";
  const isSecondary = macro === "secondary";
  const isAssembly = macro === "assembly";
  const activeDefects = useMemo(() => defectsFor(macro, micro), [macro, micro]);
  const hideDefects = MATRIX_STAGES[macro].hideDefects;
  const parsed = useMemo(() => parseBatchId(batchId), [batchId]);
  const defectSum = useMemo(
    () => Object.values(defects).reduce((a, b) => a + (Number(b) || 0), 0),
    [defects],
  );
  // Secondary: no Accept/Hold/Reject balance check.
  // Primary: Quantity Produced ≟ Accept + Reject (no Hold).
  // Assembly: Checked ≟ Accept + Hold + Reject.
  const qtySumParts = isPrimary ? accept + reject : accept + hold + reject;
  const qtyMismatch = isSecondary
    ? false
    : checked !== qtySumParts || checked === 0;
  const qtyLabel = isPrimary ? "Quantity Produced" : isSecondary ? "Quantity" : "Checked";
  const qtyMismatchLabel = isPrimary
    ? `Quantity Produced: ${checked}, Accept+Reject: ${qtySumParts}`
    : `Checked: ${checked}, Accept+Hold+Reject: ${qtySumParts}`;

  const fieldGridColumns = isPrimary
    ? "minmax(140px, 1.2fr) minmax(90px, 0.7fr) minmax(140px, 1.1fr) minmax(100px, 0.85fr) minmax(100px, 0.85fr) minmax(80px, 0.7fr) minmax(80px, 0.7fr)"
    : isSecondary
      ? "minmax(140px, 1.2fr) minmax(90px, 0.7fr) minmax(140px, 1.1fr) minmax(100px, 0.85fr) minmax(120px, 1fr)"
      : "minmax(140px, 1.2fr) minmax(90px, 0.7fr) minmax(140px, 1.1fr) minmax(90px, 0.75fr) minmax(80px, 0.7fr) minmax(80px, 0.7fr) minmax(80px, 0.7fr)";

  const resetQtys = useCallback(() => {
    setChecked(0);
    setTrolleys(0);
    setBin("");
    setAccept(0);
    setHold(0);
    setReject(0);
    setDefects({});
    setRemarks("");
  }, []);

  const selectMacro = (id: MacroId) => {
    setMacro(id);
    setMicro(id === "assembly" ? "p15-visual" : "");
    resetQtys();
  };

  const selectMicro = (id: string) => {
    if (macro !== "assembly") return;
    setMicro(id);
    resetQtys();
  };

  const onBatchInput = (raw: string) => {
    const upper = raw.toUpperCase();
    setBatchId(upper);
    setBatchManual(true);
    const p = parseBatchId(upper);
    if (p) {
      setDate(p.date);
      if (p.sizeFr) {
        const display = toDisplaySize(p.sizeFr);
        if (display) setSize(display);
      }
    }
  };

  const setDefect = (key: string, raw: string) => {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    setDefects((prev) => {
      const next = { ...prev };
      if (n === 0) delete next[key];
      else next[key] = n;
      const sum = Object.values(next).reduce((a, b) => a + b, 0);
      // Docs: auto-lift Reject when defect sum exceeds it (typing aid).
      // A12 dialog still applies on save if they diverge the other way.
      setReject((r) => (sum > r ? sum : r));
      return next;
    });
  };

  const clearFormKeepContext = () => {
    resetQtys();
    setBatchManual(false);
    const id = buildBatchId(date, size);
    if (id) setBatchId(id);
  };

  async function commitRecord(rec: ShiftBatchRecord): Promise<boolean> {
    const ingestionId = globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}`;
    const payload = [toStageDayRecord(rec, ingestionId)];
    const res = await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingestionId,
        fileName: `Batch Entry ${rec.batchId}`,
        records: payload,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Ingest failed");
    }
    return true;
  }

  function buildPendingRecord(overrideReject?: number): ShiftBatchRecord | null {
    if (!isValidBatchId(batchId)) {
      setErr("Please enter a valid Batch ID (e.g. 26F27-14).");
      return null;
    }
    if (!operator.trim()) {
      setErr("Operator name is required.");
      return null;
    }
    const canon = toCanonicalSize(size);
    if (!canon) {
      setErr("Select a valid French size.");
      return null;
    }

    const stageId = resolveStageId(macro, micro);
    const stageName = MATRIX_STAGES[macro].name;
    const procName = processLabel(macro, micro);

    if (isSecondary) {
      if (checked <= 0) {
        setErr("Quantity is required for Secondary Production.");
        return null;
      }
      if (!bin.trim()) {
        setErr("Bin is required for Secondary Production.");
        return null;
      }
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      operator: operator.trim(),
      macro,
      micro,
      stageId,
      stageName,
      processName: procName,
      size: toDisplaySize(size) ?? size,
      sizeCanonical: canon,
      batchId: batchId.trim().toUpperCase(),
      checked,
      accept: isSecondary ? 0 : accept,
      hold: isPrimary || isSecondary ? 0 : hold,
      reject: isSecondary ? 0 : (overrideReject ?? reject),
      trolleys: isPrimary ? trolleys : undefined,
      bin: isSecondary ? bin.trim() : undefined,
      defects: isSecondary ? {} : { ...defects },
      remarks: remarks.trim(),
      shift,
      savedAt: new Date().toISOString(),
      synced: false,
    };
  }

  async function finalizeSave(rec: ShiftBatchRecord) {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await commitRecord(rec);
      const withSync = { ...rec, synced: true };
      const next = [withSync, ...saved];
      setSaved(next);
      persistShift(next);
      localStorage.setItem("rais_hdr_operator", rec.operator);
      localStorage.setItem("rais_hdr_shift", rec.shift);
      clearFormKeepContext();
      setMsg(`Batch ${rec.batchId} saved and synced to the ledger.`);
      refreshEvents().catch(console.error);
      onSynced?.();
    } catch (e: any) {
      // Still keep local shift buffer even if sync fails
      const next = [rec, ...saved];
      setSaved(next);
      persistShift(next);
      clearFormKeepContext();
      setErr(`Saved locally, but ledger sync failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setSaving(false);
      setA12(null);
      setA12Choice(null);
    }
  }

  async function submitForm() {
    setErr(null);
    setMsg(null);

    // Secondary: Quantity + Bin only — no Accept/Hold/Reject balance.
    if (!isSecondary && qtyMismatch) {
      if (
        !confirm(
          `Warning: Quantity sums do not match (${qtyMismatchLabel}). Do you still wish to save?`,
        )
      ) {
        return;
      }
    }

    // Defect reconciliation — Primary + Assembly only (Secondary has no defects).
    if (!isSecondary && !hideDefects && reject > 0 && defectSum !== reject) {
      // Grain A12: always present both options; never silent fix.
      setA12({ defectSum, reject });
      setA12Choice(null);
      return;
    }

    const rec = buildPendingRecord();
    if (!rec) return;
    await finalizeSave(rec);
  }

  async function applyA12AndSave() {
    if (!a12 || !a12Choice) {
      setErr("Choose how to resolve the defect / reject mismatch.");
      return;
    }
    let nextReject = reject;
    let nextDefects = { ...defects };
    if (a12Choice === "set-reject") {
      nextReject = a12.defectSum;
      setReject(nextReject);
    }
    // keep-incomplete: leave reject as-is, defects may not sum
    const rec = buildPendingRecord(nextReject);
    if (!rec) return;
    rec.defects = nextDefects;
    rec.remarks =
      (rec.remarks ? rec.remarks + " | " : "") +
      (a12Choice === "set-reject"
        ? `A12: Rejected set to defect sum (${a12.defectSum})`
        : `A12: Kept Rejected=${a12.reject}; defects incomplete (sum ${a12.defectSum})`);
    await finalizeSave(rec);
  }

  function deleteLocal(id: string) {
    if (!confirm("Remove this batch record from the current shift list?")) return;
    const next = saved.filter((b) => b.id !== id);
    setSaved(next);
    persistShift(next);
  }

  function exportCSV() {
    if (saved.length === 0) {
      alert("No logged batches to export.");
      return;
    }
    const uniqueDefects = new Set<string>();
    saved.forEach((b) => Object.keys(b.defects || {}).forEach((d) => uniqueDefects.add(d)));
    const defectHeaders = Array.from(uniqueDefects);

    let csv =
      "Date,Operator,Stage,Process,Size,Batch ID,Quantity/Checked,Trolleys,Bin,Accept,Hold,Reject,Yield %,Remarks,Synced";
    defectHeaders.forEach((dh) => {
      csv += `,Defect_${dh}`;
    });
    csv += "\r\n";

    saved.forEach((b) => {
      const isSec = b.macro === "secondary";
      const isPri = b.macro === "primary";
      const yieldPct =
        isSec || b.checked <= 0 ? "" : ((b.accept / b.checked) * 100).toFixed(2);
      const escRem = `"${String(b.remarks || "").replace(/"/g, '""')}"`;
      const trolleyVal = isPri ? (b.trolleys ?? 0) : "";
      const binVal = isSec ? `"${String(b.bin || "").replace(/"/g, '""')}"` : "";
      const acceptVal = isSec ? "" : b.accept;
      const holdVal = isPri || isSec ? "" : b.hold;
      const rejectVal = isSec ? "" : b.reject;
      let row = `${b.date},${b.operator},"${b.stageName}","${b.processName}",${b.size},${b.batchId},${b.checked},${trolleyVal},${binVal},${acceptVal},${holdVal},${rejectVal},${yieldPct},${escRem},${b.synced ? "yes" : "no"}`;
      defectHeaders.forEach((dh) => {
        row += `,${isSec ? 0 : b.defects[dh] || 0}`;
      });
      csv += row + "\r\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `disposafe-session-matrix-${date || "export"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={panel}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ height: 32, width: 32, borderRadius: 6, background: "var(--accent)", color: "var(--text-invert)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>
            D
          </div>
          <div>
            <div className="h3" style={{ margin: 0 }}>Data Entry Matrix</div>
            <div className="small" style={{ color: "var(--accent)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Disposafe Manufacturing Systems
            </div>
          </div>
        </div>
        <div className="small" style={{ color: "var(--text-2)", fontWeight: 600 }}>{todayLabel}</div>
      </div>

      {/* Tier 1 + Tier 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div>
          <div style={sectionLabel}>Stage Selection (Tier 1)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(Object.keys(MATRIX_STAGES) as MacroId[]).map((id) => (
              <button key={id} type="button" onClick={() => selectMacro(id)} style={macro === id ? chipOn : chipOff}>
                {MATRIX_STAGES[id].shortLabel}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={sectionLabel}>Process Branch (Tier 2)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MATRIX_STAGES[macro].processes.map((p) => {
              const interactive = macro === "assembly";
              const on = interactive && micro === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!interactive}
                  onClick={() => interactive && selectMicro(p.id)}
                  style={
                    interactive
                      ? on
                        ? chipOn
                        : chipOff
                      : chipBadge
                  }
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Core production inputs — tier-specific layouts */}
      <div style={{ borderRadius: 10, border: "1px solid var(--border)", marginBottom: 16, background: "var(--surface-2)", padding: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: fieldGridColumns,
            gap: 12,
            alignItems: "start",
          }}
          className="batch-matrix-fields"
        >
          <FieldCol label="Operator / Shift">
            <select value={operator} onChange={(e) => setOperator(e.target.value)} style={inp}>
              {DEFAULT_OPERATORS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <input
              style={{ ...inp, marginTop: 6 }}
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="Or type name"
            />
            <label className="small" style={{ display: "block", marginTop: 8, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", fontSize: 9 }}>
              Production Date
              <input type="date" value={date} onChange={(e) => { setBatchManual(false); setDate(e.target.value); }} style={{ ...inp, marginTop: 4 }} />
            </label>
            <label className="small" style={{ display: "block", marginTop: 8, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", fontSize: 9 }}>
              Shift
              <select value={shift} onChange={(e) => setShift(e.target.value)} style={{ ...inp, marginTop: 4 }}>
                <option>Day Shift</option>
                <option>Night Shift</option>
              </select>
            </label>
          </FieldCol>

          <FieldCol label="Catheter Size">
            <select value={size} onChange={(e) => { setBatchManual(false); setSize(e.target.value); }} style={{ ...inp, fontWeight: 700 }}>
              {FRENCH_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </FieldCol>

          <FieldCol label="Batch ID Generation">
            <input
              value={batchId}
              onChange={(e) => onBatchInput(e.target.value)}
              maxLength={10}
              placeholder="26F27-14"
              style={{ ...inp, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em", textTransform: "uppercase" }}
            />
            {parsed && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                <span style={badge("blue")}>Yr: {parsed.year2}</span>
                <span style={badge("green")}>Mo: {parsed.monthName}</span>
                <span style={badge("amber")}>Day: {parsed.day}</span>
                {parsed.sizeFr && <span style={badge("purple")}>Sz: {parsed.sizeFr} FR</span>}
              </div>
            )}
            <p className="small" style={{ marginTop: 6, color: "var(--text-3)", lineHeight: 1.35, fontSize: 9 }}>
              YY + A–L + DD + &quot;-&quot; + FR
            </p>
          </FieldCol>

          {/* ── Secondary: Quantity + Bin only ── */}
          {isSecondary && (
            <>
              <FieldCol label="Quantity *" align="center">
                <input
                  type="number"
                  min={0}
                  required
                  value={checked || ""}
                  placeholder="0"
                  onChange={(e) => setChecked(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{ ...inp, textAlign: "center", fontWeight: 600 }}
                />
              </FieldCol>
              <FieldCol label="Bin *">
                <input
                  list="secondary-bin-options"
                  value={bin}
                  onChange={(e) => setBin(e.target.value)}
                  placeholder="e.g. Bin A"
                  style={{ ...inp, fontWeight: 600 }}
                />
                <datalist id="secondary-bin-options">
                  {SECONDARY_BINS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
                <p className="small" style={{ marginTop: 6, color: "var(--text-3)", fontSize: 9 }}>
                  Production / storage bin
                </p>
              </FieldCol>
            </>
          )}

          {/* ── Primary: Qty Produced · Trolleys · Accept · Reject ── */}
          {isPrimary && (
            <>
              <FieldCol label={qtyLabel} align="center">
                <input type="number" min={0} value={checked || ""} placeholder="0" onChange={(e) => setChecked(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ ...inp, textAlign: "center", fontWeight: 600 }} />
                {qtyMismatch && checked > 0 && (
                  <div className="small" style={{ marginTop: 6, color: "var(--status-warn, #d97706)", fontWeight: 700, textAlign: "center", fontSize: 9 }}>Mismatch</div>
                )}
              </FieldCol>
              <FieldCol label="No. of Trolleys Produced" align="center">
                <input type="number" min={0} value={trolleys || ""} placeholder="0" onChange={(e) => setTrolleys(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ ...inp, textAlign: "center", fontWeight: 600 }} />
              </FieldCol>
              <FieldCol label="Accept" align="center">
                <input type="number" min={0} value={accept || ""} placeholder="0" onChange={(e) => setAccept(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ ...inp, textAlign: "center", fontWeight: 600, color: "var(--status-good)" }} />
              </FieldCol>
              <FieldCol label="Reject" align="center">
                <input type="number" min={0} value={reject || ""} placeholder="0" onChange={(e) => setReject(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ ...inp, textAlign: "center", fontWeight: 600, color: "var(--status-bad)" }} />
              </FieldCol>
            </>
          )}

          {/* ── Assembly: Checked · Accept · Hold · Reject ── */}
          {isAssembly && (
            <>
              <FieldCol label={qtyLabel} align="center">
                <input type="number" min={0} value={checked || ""} placeholder="0" onChange={(e) => setChecked(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ ...inp, textAlign: "center", fontWeight: 600 }} />
                {qtyMismatch && checked > 0 && (
                  <div className="small" style={{ marginTop: 6, color: "var(--status-warn, #d97706)", fontWeight: 700, textAlign: "center", fontSize: 9 }}>Mismatch</div>
                )}
              </FieldCol>
              <FieldCol label="Accept" align="center">
                <input type="number" min={0} value={accept || ""} placeholder="0" onChange={(e) => setAccept(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ ...inp, textAlign: "center", fontWeight: 600, color: "var(--status-good)" }} />
              </FieldCol>
              <FieldCol label="Hold" align="center">
                <input type="number" min={0} value={hold || ""} placeholder="0" onChange={(e) => setHold(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ ...inp, textAlign: "center", fontWeight: 600, color: "var(--status-warn, #d97706)" }} />
              </FieldCol>
              <FieldCol label="Reject" align="center">
                <input type="number" min={0} value={reject || ""} placeholder="0" onChange={(e) => setReject(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ ...inp, textAlign: "center", fontWeight: 600, color: "var(--status-bad)" }} />
              </FieldCol>
            </>
          )}
        </div>
        <style>{`
          @media (max-width: 960px) {
            .batch-matrix-fields {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
          }
          @media (max-width: 520px) {
            .batch-matrix-fields {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>

      {/* Defect grid */}
      {!hideDefects && (
        <div style={{ marginBottom: 16, padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--status-bad)", display: "inline-block" }} />
                Log Rejection Defects
              </div>
              <div className="small" style={{ color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontSize: 10 }}>
                {processLabel(macro, micro)}
              </div>
            </div>
            <span
              style={{
                ...badge(defectSum === reject ? "green" : "amber"),
                animation: defectSum === reject ? undefined : "pulse 1.5s ease infinite",
              }}
            >
              {defectSum === reject
                ? `Fully reconciled (${defectSum} of ${reject})`
                : `Unreconciled (${defectSum} of ${reject})`}
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            {activeDefects.map((d) => {
              const val = defects[d.key] || 0;
              const active = val > 0;
              const title = defectDisplayLabel(d);
              return (
                <div
                  key={d.key}
                  style={{
                    padding: "12px 10px",
                    borderRadius: 8,
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: active ? "var(--accent-weak, rgba(59,130,246,.08))" : "var(--surface)",
                    display: "grid",
                    gridTemplateRows: "40px auto",
                    gap: 8,
                    minHeight: 96,
                    boxSizing: "border-box",
                  }}
                >
                  <div
                    title={title}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text)",
                      lineHeight: 1.25,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      overflow: "hidden",
                      wordBreak: "break-word",
                    }}
                  >
                    {title}
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={val || ""}
                    placeholder="0"
                    aria-label={title}
                    onChange={(e) => setDefect(d.key, e.target.value)}
                    style={{
                      ...inp,
                      textAlign: "center",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      borderColor: active ? "var(--accent)" : "var(--border)",
                      height: 36,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Remarks */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionLabel}>Remarks / Notes</div>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Enter session comments / hand-over notes..."
          style={{ ...inp, minHeight: 72, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      {/* A12 dialog */}
      {a12 && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, border: "1px solid var(--status-warn, #d97706)", background: "var(--surface)" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Defect sum ({a12.defectSum}) ≠ Rejected ({a12.reject})
          </div>
          <p className="small" style={{ color: "var(--text-2)", marginBottom: 10 }}>
            Choose how to resolve before saving (Grain A12 — never auto-applied):
          </p>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="radio" name="a12" checked={a12Choice === "set-reject"} onChange={() => setA12Choice("set-reject")} />
            Set Rejected = {a12.defectSum} (match defect columns)
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, fontSize: 13, cursor: "pointer" }}>
            <input type="radio" name="a12" checked={a12Choice === "keep-incomplete"} onChange={() => setA12Choice("keep-incomplete")} />
            Keep Rejected = {a12.reject} (treat defects as incomplete)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={applyA12AndSave} disabled={saving || !a12Choice} style={btnPrimary}>
              Apply after I confirm
            </button>
            <button type="button" onClick={() => { setA12(null); setA12Choice(null); }} style={btnGhost}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && (
        <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "var(--negative-weak, #fee2e2)", color: "var(--status-bad)", fontSize: 13 }}>{err}</div>
      )}
      {msg && (
        <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "var(--positive-weak)", color: "var(--positive)", fontSize: 13 }}>{msg}</div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 20 }}>
        <button type="button" onClick={submitForm} disabled={saving || !!a12} style={btnPrimary}>
          {saving ? "Saving…" : "Save Batch Entry"}
        </button>
      </div>

      {/* Shift list */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Saved Batches (This Shift)</div>
            <div className="small" style={{ color: "var(--text-3)" }}>Logged this session — kept in local storage; synced rows are in the event ledger.</div>
          </div>
          <button type="button" onClick={exportCSV} style={btnGhost}>Export Session CSV</button>
        </div>

        {saved.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-3)", fontSize: 12, border: "1px dashed var(--border)", borderRadius: 10 }}>
            No entries logged in this shift yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={thRow}>
                  <th style={th}>Operator</th>
                  <th style={th}>Stage & Process</th>
                  <th style={th}>Batch ID</th>
                  <th style={{ ...th, textAlign: "center" }}>Qty</th>
                  <th style={{ ...th, textAlign: "center" }}>Trolleys</th>
                  <th style={th}>Bin</th>
                  <th style={{ ...th, textAlign: "center" }}>Accept</th>
                  <th style={{ ...th, textAlign: "center" }}>Hold</th>
                  <th style={{ ...th, textAlign: "center" }}>Reject</th>
                  <th style={{ ...th, textAlign: "center" }}>Yield</th>
                  <th style={{ ...th, textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((rec) => {
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
                  return (
                    <tr key={rec.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={tdCell}>
                        {rec.operator}
                        {rec.synced && (
                          <div className="small" style={{ color: "var(--positive)", fontSize: 9, fontWeight: 700 }}>SYNCED</div>
                        )}
                      </td>
                      <td style={tdCell}>
                        <div style={{ fontWeight: 600 }}>{rec.processName}</div>
                        <div className="small" style={{ color: "var(--text-3)", fontSize: 9, textTransform: "uppercase" }}>{rec.stageName}</div>
                      </td>
                      <td style={{ ...tdCell, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent)" }}>{rec.batchId}</td>
                      <td style={{ ...tdCell, textAlign: "center" }}>{rec.checked}</td>
                      <td style={{ ...tdCell, textAlign: "center" }}>{primaryRow ? (rec.trolleys ?? 0) : "—"}</td>
                      <td style={tdCell}>{secondaryRow ? (rec.bin || "—") : "—"}</td>
                      <td style={{ ...tdCell, textAlign: "center", color: "var(--status-good)", fontWeight: 600 }}>
                        {secondaryRow ? "—" : rec.accept}
                      </td>
                      <td style={{ ...tdCell, textAlign: "center" }}>
                        {primaryRow || secondaryRow ? "—" : rec.hold}
                      </td>
                      <td style={{ ...tdCell, textAlign: "center" }}>
                        {secondaryRow ? (
                          "—"
                        ) : (
                          <>
                            <span style={{ color: "var(--status-bad)", fontWeight: 600 }}>{rec.reject}</span>
                            {defLog && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginTop: 2 }}>{defLog}</div>}
                          </>
                        )}
                      </td>
                      <td style={{ ...tdCell, textAlign: "center", fontWeight: 700 }}>{yieldPct}</td>
                      <td style={{ ...tdCell, textAlign: "right" }}>
                        <button type="button" onClick={() => deleteLocal(rec.id)} style={{ background: "transparent", border: "none", color: "var(--status-bad)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── styles (token-driven) ─────────────────────────────────────────────── */
function FieldCol({
  label,
  children,
  align,
}: {
  label: string;
  children: React.ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 6,
          textAlign: align ?? "left",
          lineHeight: 1.3,
          minHeight: 28,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: align === "center" ? "center" : "flex-start",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const panel: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-3)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 8,
};

const chipOn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "var(--accent)",
  color: "var(--text-invert)",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};

const chipOff: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-2)",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
};

const chipBadge: React.CSSProperties = {
  ...chipOff,
  cursor: "default",
  opacity: 0.75,
  fontSize: 11,
};

const thRow: React.CSSProperties = {
  background: "var(--surface-2)",
  borderBottom: "1px solid var(--border)",
};

const th: React.CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-3)",
};

const tdCell: React.CSSProperties = {
  padding: "10px 12px",
  color: "var(--text-2)",
};

const inp: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert)",
  border: "none",
  borderRadius: 8,
  padding: "10px 22px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function badge(tone: "blue" | "green" | "amber" | "purple"): React.CSSProperties {
  const map = {
    blue: { bg: "var(--accent-weak, rgba(59,130,246,.12))", fg: "var(--accent)" },
    green: { bg: "var(--positive-weak)", fg: "var(--positive)" },
    amber: { bg: "rgba(217,119,6,.12)", fg: "var(--status-warn, #d97706)" },
    purple: { bg: "rgba(139,92,246,.12)", fg: "#8b5cf6" },
  }[tone];
  return {
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: map.bg,
    color: map.fg,
    border: `1px solid ${map.fg}33`,
  };
}
