"use client";

// src/components/MonthlyEntryGrid.tsx
// Spreadsheet-style entry surface for /data-entry — one row per calendar day
// of a selected month, for a chosen Stage (+ Size for size-wise stages).
// Mirrors the real Excel sheet shape. Reuses the exact same StageDayRecord
// model, applyEdit(), and buildReviewRows() the daily entry grid and /staging
// use, so a day entered here is indistinguishable from one entered anywhere
// else (see docs/superpowers/specs/2026-07-07-data-entry-unify-design.md).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { buildReviewRows, applyEdit } from "@/lib/ingest/review";
import { CAPTURE_LABEL, CAPTURE_FIELD, CAPTURE_TO_RECORD_FIELD, CORE_FIELD_BY_COL } from "@/lib/ingest/capture-fields";
import { useEvents } from "@/components/app/EventsContext";
import { type EntryGrain, resolvePeriod, stepPeriod, periodLabel } from "@/lib/entry/period";

export default function MonthlyEntryGrid({ onDirtyChange, customFields, grain, anchorDate, onAnchorChange, blockedReason, presetId }: {
  onDirtyChange?: (dirty: boolean) => void;
  customFields?: Record<string, any>;
  /** Which row range to render — see src/lib/entry/period.ts. */
  grain: EntryGrain;
  /** Any date inside the range currently being edited. */
  anchorDate: string;
  /** Fired when Prev/Next nav moves the anchor, so a parent tracking its own
   *  copy (e.g. the FY month-tabs row) can stay in sync. */
  onAnchorChange?: (next: string) => void;
  blockedReason?: string | null;
  /** Which Data Entry preset's registry to render the grid against. Omit for the default preset. */
  presetId?: string | null;
}) {
  const { refreshEvents } = useEvents();
  const [registry, setRegistry] = useState<any | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const { from, to } = useMemo(() => resolvePeriod(grain, anchorDate), [grain, anchorDate]);
  const { year, month } = useMemo(() => {
    const [y, m] = anchorDate.split("-").map(Number);
    return { year: y, month: m };
  }, [anchorDate]);

  const [records, setRecords] = useState<StageDayRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

  useEffect(() => {
    fetch(presetId ? `/api/schema?presetId=${encodeURIComponent(presetId)}` : "/api/schema")
      .then((res) => res.json())
      .then((data) => setRegistry(data.registry ?? null))
      .catch(() => setRegistry(null));
  }, [presetId]);

  const activeRegistry = registry || DISPOSAFE_REGISTRY;

  const stageIds: string[] = useMemo(() => {
    return activeRegistry.stages
      .filter((s: any) => (s.effectiveFrom == null || s.effectiveFrom <= to) &&
                     (s.effectiveTo == null || from <= s.effectiveTo))
      .map((s: any) => s.stageId);
  }, [activeRegistry, from, to]);

  useEffect(() => {
    if (activeStageId && stageIds.includes(activeStageId)) return;
    setActiveStageId(stageIds[0] ?? null);
  }, [stageIds, activeStageId]);

  const activeStage = useMemo(
    () => activeRegistry.stages.find((s: any) => s.stageId === activeStageId) || null,
    [activeRegistry, activeStageId],
  );

  const sizes: { sizeId: string; label: string }[] = useMemo(
    () => (activeRegistry.sizes && activeRegistry.sizes.length ? activeRegistry.sizes : []),
    [activeRegistry],
  );
  const isSizeWise = !!activeStage?.sizeWise && sizes.length > 0;

  useEffect(() => {
    if (!isSizeWise) { setActiveSize(null); return; }
    if (activeSize && sizes.some((s) => s.sizeId === activeSize)) return;
    setActiveSize(sizes[0]?.sizeId ?? null);
  }, [isSizeWise, sizes, activeSize]);

  const activeCaptures: string[] = useMemo(
    () => activeStage?.captures ?? ["checked", "accepted", "hold", "rejected"],
    [activeStage],
  );
  const activeDefects = useMemo(
    () => (activeRegistry.defects || []).filter((d: any) => d.stages.includes(activeStageId)),
    [activeRegistry, activeStageId],
  );

  const rowKey = isSizeWise ? activeSize : "__line__";

  const blankRecord = (date: string): StageDayRecord => ({
    occurredOn: { kind: "day", start: date, end: date },
    stageId: activeStageId!,
    size: rowKey === "__line__" ? null : rowKey,
    source: { file: "Manual Entry", fileHash: `manual-${date}`, sheet: "Data Entry", tableId: "entry" },
    checked: null, acceptedGood: null, rework: null, rejected: null,
    defects: [], statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "pending",
  });

  const getFieldPropertyForCol = (colName: string) => {
    const field = activeStage?.fields?.find((f: any) => f.name === colName);
    if (field) {
      if (field.role === "checked") return "checked";
      if (field.role === "good") return "acceptedGood";
      if (field.role === "rework") return "rework";
      if (field.role === "rejected") return "rejected";
      if (field.role === "defect") return colName;
      return null;
    }
    return CORE_FIELD_BY_COL[colName] ?? colName;
  };

  const isCustomPreset = !!(activeStage?.headerRows && activeStage?.columns);

  const updateCell = (date: string, colName: string, val: string) => {
    const prop = getFieldPropertyForCol(colName);
    if (!prop) return; // ignore read-only columns

    setDirty(true);
    setRecords((prev) => {
      let idx = prev.findIndex((r) => r.occurredOn.start === date && (r.size ?? "__line__") === rowKey);
      let next = prev;
      if (idx < 0) {
        if (val === "") return prev;
        next = [...prev, blankRecord(date)];
        idx = next.length - 1;
      }
      if (val === "") {
        return next.map((r, i) => {
          if (i !== idx) return r;
          if (prop === "checked" || prop === "acceptedGood" || prop === "rework" || prop === "rejected") {
            return { ...r, [prop]: null, extractedBy: "direct-entry" };
          }
          return { ...r, defects: r.defects.filter((d) => d.raw !== colName), extractedBy: "direct-entry" };
        });
      }
      const num = Number(val);
      if (isNaN(num) || num < 0) return next;
      return applyEdit(next, idx, prop, num);
    });
  };

  const loadRange = useCallback(async () => {
    if (!activeStageId) return;
    setLoading(true); setError(null);
    const params = new URLSearchParams({ from, to, stageId: activeStageId });
    if (isSizeWise && activeSize) params.set("size", activeSize);
    try {
      const res = await fetch(`/api/day-records?${params.toString()}`);
      const data = await res.json();
      setRecords(data.records ?? []);
      setDirty(false);
    } catch (err) {
      console.error("Error loading range:", err);
      setError("Failed to load this period's data.");
      setRecords([]);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [activeStageId, activeSize, from, to, isSizeWise]);

  useEffect(() => {
    loadRange();
  }, [loadRange]);

  const days = useMemo(() => {
    const out: string[] = [];
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    for (let t = start; t <= end; t += 86400000) {
      out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
  }, [from, to]);

  const reviewByDate = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildReviewRows>[number]>();
    records.forEach((r, i) => {
      const [row] = buildReviewRows([r]);
      if (row) map.set(`${r.occurredOn.start}|${(r.size ?? "__line__")}`, { ...row, recordIndex: i });
    });
    return map;
  }, [records]);

  const recordFor = (date: string): StageDayRecord | undefined =>
    records.find((r) => r.occurredOn.start === date && (r.size ?? "__line__") === rowKey);

  const rangeLabel = periodLabel(grain, anchorDate);

  const confirmDiscardIfDirty = (actionLabel: string): boolean => {
    if (!dirty) return true;
    return confirm(`You have unsaved changes for ${rangeLabel} that haven't been submitted yet. ${actionLabel} will discard them. Continue?`);
  };

  const goToPeriod = (delta: number) => {
    const label = grain === "day" ? "Changing the day" : grain === "week" ? "Changing the week" : "Changing the month";
    if (!confirmDiscardIfDirty(label)) return;
    const next = stepPeriod(grain, anchorDate, delta);
    onAnchorChange?.(next);
  };

  const invalidCount = Array.from(reviewByDate.values()).filter((r) => r.status === "invalid").length;

  async function saveMonth() {
    if (blockedReason) {
      setError(blockedReason);
      return;
    }
    setSaving(true); setError(null); setSuccess(null);
    const ingestionId = globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}`;
    const payload = records
      .filter((r) => r.checked || r.acceptedGood || r.rework || r.rejected || r.defects.length > 0)
      .map((r) => ({
        ...r,
        ingestionId,
        customFields: { ...r.customFields, ...customFields, size: r.size ?? customFields?.size },
      }));

    if (payload.length === 0) {
      setError("Enter quantities for at least one day before saving.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestionId, fileName: `Data Entry ${rangeLabel}`, records: payload, presetId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      setSuccess(`${payload.length} day(s) saved for ${rangeLabel}.`);
      setDirty(false);
      await loadRange();
      refreshEvents().catch(console.error);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
        <button onClick={() => goToPeriod(-1)} style={ghost} aria-label="Previous period">‹ Prev</button>
        <div style={{ fontWeight: 700, minWidth: 160, textAlign: "center" }}>{rangeLabel}</div>
        <button onClick={() => goToPeriod(1)} style={ghost} aria-label="Next period">Next ›</button>
        {isSizeWise && (
          <select value={activeSize ?? ""} onChange={(e) => { if (confirmDiscardIfDirty("Switching size")) setActiveSize(e.target.value); }} style={{ ...inp, width: 100, marginLeft: 12 }}>
            {sizes.map((s) => <option key={s.sizeId} value={s.sizeId}>{s.label}</option>)}
          </select>
        )}
        {loading && <span className="muted" style={{ fontSize: 12 }}>Loading…</span>}
      </div>

      {error && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", color: "var(--status-bad)", fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {stageIds.map((id: string) => {
          const s = activeRegistry.stages.find((st: any) => st.stageId === id);
          const on = id === activeStageId;
          return (
            <button key={id} onClick={() => { if (confirmDiscardIfDirty("Switching stages")) setActiveStageId(id); }}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-strong)",
                background: on ? "var(--accent)" : "var(--surface-2)",
                color: on ? "var(--text-invert)" : "var(--text-2)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {s?.label ?? id}
            </button>
          );
        })}
      </div>

      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
          {isCustomPreset ? (
            <thead>
              {activeStage.headerRows.map((rowCells: any[], rIdx: number) => (
                <tr key={rIdx} style={{ color: "var(--text-3)", background: "var(--surface-2)", fontSize: 10, textTransform: "uppercase", borderBottom: "1.5px solid var(--border-strong)" }}>
                  {rowCells.map((cellVal: any, cIdx: number) => {
                    const merges = activeStage.merges || [];
                    const merge = merges.find((m: any) => 
                      rIdx >= m.s.r && rIdx <= m.e.r && cIdx >= m.s.c && cIdx <= m.e.c
                    );
                    if (merge) {
                      if (rIdx === merge.s.r && cIdx === merge.s.c) {
                        const rowSpan = merge.e.r - merge.s.r + 1;
                        const colSpan = merge.e.c - merge.s.c + 1;
                        return (
                          <th
                            key={cIdx}
                            rowSpan={rowSpan}
                            colSpan={colSpan}
                            style={{ ...eth, textAlign: "center" }}
                          >
                            {String(cellVal || "")}
                          </th>
                        );
                      }
                      return null;
                    }
                    return (
                      <th
                        key={cIdx}
                        rowSpan={1}
                        colSpan={1}
                        style={eth}
                      >
                        {String(cellVal || "")}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
          ) : (
            <thead>
              <tr style={{ color: "var(--text-3)", background: "var(--surface-2)", fontSize: 10, textTransform: "uppercase", borderBottom: "1.5px solid var(--border-strong)" }}>
                <th style={{ ...eth, textAlign: "left", minWidth: 90, position: "sticky", left: 0, zIndex: 2, background: "var(--surface-2)" }}>Date</th>
                {activeCaptures.map((c) => <th key={c} style={eth}>{CAPTURE_LABEL[c]}</th>)}
                {activeDefects.map((d: any) => <th key={d.defectCode} style={eth} title={d.label}>{d.defectCode}</th>)}
              </tr>
            </thead>
          )}
          {isCustomPreset ? (
            <tbody>
              {days.map((date) => {
                const rec = recordFor(date);
                return (
                  <tr key={date} style={{ borderBottom: "1px solid var(--border)" }}>
                    {activeStage.columns.map((colName: string, cIdx: number) => {
                      const field = activeStage.fields.find((f: any) => f.name === colName);
                      const role = field?.role;

                      if (role === "date") {
                        return (
                          <td
                            key={cIdx}
                            style={{
                              ...etd,
                              textAlign: "left",
                              fontWeight: 700,
                              background: "var(--surface)",
                              position: "sticky",
                              left: 0,
                              zIndex: 1,
                              fontFamily: "var(--font-mono)"
                            }}
                          >
                            {date}
                          </td>
                        );
                      }

                      const isEditable = ["checked", "good", "rework", "rejected", "defect"].includes(role || "");
                      if (isEditable) {
                        const val = (() => {
                          if (role === "defect") {
                            const df = rec?.defects.find((x) => x.raw === colName);
                            return df ? String(df.value) : "";
                          }
                          const prop = getFieldPropertyForCol(colName);
                          if (prop && prop !== colName) {
                            const sv = rec?.[prop as "checked" | "acceptedGood" | "rework" | "rejected"];
                            return sv != null ? String(sv.value) : "";
                          }
                          return "";
                        })();

                        const review = reviewByDate.get(`${date}|${rowKey}`);
                        const prop = getFieldPropertyForCol(colName);
                        const isCulprit = review?.invalidFields.includes(prop || "") || (role === "defect" && review?.invalidFields.includes(colName));

                        return (
                          <td key={cIdx} style={{ ...etd, padding: "3px 4px" }}>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={val}
                              onChange={(e) => updateCell(date, colName, e.target.value)}
                              style={{
                                ...inp,
                                width: 84,
                                padding: "4px 8px",
                                height: 30,
                                fontFamily: "var(--font-mono)",
                                textAlign: "right",
                                borderColor: isCulprit ? "var(--status-bad)" : "var(--border-strong)"
                              }}
                            />
                          </td>
                        );
                      }

                      // Formula or other read-only column
                      const displayVal = (() => {
                        if (role === "formula") {
                          if (/%|pct|percent|rate/i.test(colName)) {
                            const chkVal = rec?.checked?.value;
                            const rejVal = rec?.rejected?.value;
                            if (chkVal != null && chkVal > 0 && rejVal != null) {
                              return `${((rejVal / chkVal) * 100).toFixed(2)}%`;
                            }
                          }
                          return rec?.statedPct?.value != null ? `${rec.statedPct.value}%` : "—";
                        }
                        return "—";
                      })();

                      return (
                        <td
                          key={cIdx}
                          style={{
                            ...etd,
                            background: "var(--surface-2)",
                            color: "var(--text-3)",
                            fontFamily: "var(--font-mono)",
                            textAlign: "right"
                          }}
                        >
                          {displayVal}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          ) : (
            <tbody>
              {days.map((date) => {
                const rec = recordFor(date);
                const captureValue = (c: string): string => {
                  const field = CAPTURE_TO_RECORD_FIELD[c];
                  const sv = rec?.[field];
                  return sv != null ? String(sv.value) : "";
                };
                const defectValue = (label: string): string => {
                  const d = rec?.defects.find((x) => x.raw === label);
                  return d ? String(d.value) : "";
                };
                return (
                  <tr key={date} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ ...etd, textAlign: "left", fontWeight: 700, background: "var(--surface)", position: "sticky", left: 0, zIndex: 1, fontFamily: "var(--font-mono)" }}>{date}</td>
                    {activeCaptures.map((c) => {
                      const review = reviewByDate.get(`${date}|${rowKey}`);
                      const field = CAPTURE_TO_RECORD_FIELD[c];
                      const isCulprit = review?.invalidFields.includes(field === "acceptedGood" ? "acceptedGood" : field);
                      return (
                        <td key={c} style={{ ...etd, padding: "3px 4px" }}>
                          <input type="number" inputMode="numeric" value={captureValue(c)}
                            onChange={(e) => updateCell(date, CAPTURE_FIELD[c], e.target.value)}
                            style={{ ...inp, width: 84, padding: "4px 8px", height: 30, fontFamily: "var(--font-mono)", textAlign: "right",
                              borderColor: isCulprit ? "var(--status-bad)" : "var(--border-strong)" }} />
                        </td>
                      );
                    })}
                    {activeDefects.map((d: any) => {
                      const review = reviewByDate.get(`${date}|${rowKey}`);
                      const isCulprit = review?.invalidFields.includes(d.label) || review?.invalidFields.includes(d.defectCode);
                      return (
                        <td key={d.defectCode} style={{ ...etd, padding: "3px 4px" }}>
                          <input type="number" inputMode="numeric" value={defectValue(d.label)}
                            onChange={(e) => updateCell(date, d.label, e.target.value)}
                            style={{ ...inp, width: 64, padding: "4px 8px", height: 30, fontFamily: "var(--font-mono)", textAlign: "right",
                              borderColor: isCulprit ? "var(--status-bad)" : "var(--border-strong)" }} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      {invalidCount > 0 && (
        <p style={{ fontSize: 12, color: "var(--status-bad)", marginTop: 8 }}>
          {invalidCount} of {reviewByDate.size} entered day{reviewByDate.size === 1 ? "" : "s"} need{invalidCount === 1 ? "s" : ""} fixing before you can save.
        </p>
      )}

      {blockedReason && (
        <p style={{ fontSize: 12, color: "var(--status-bad)", marginTop: 8 }}>
          {blockedReason}
        </p>
      )}

      {success && (
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 9, background: "var(--positive-weak)", border: "1px solid var(--positive)", color: "var(--positive)", fontSize: 13 }}>
          {success}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <button onClick={saveMonth} disabled={saving || invalidCount > 0 || !!blockedReason}
          style={{ background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 9, padding: "10px 22px", fontSize: 14, fontWeight: 700,
            cursor: saving || invalidCount > 0 || blockedReason ? "not-allowed" : "pointer", opacity: saving || invalidCount > 0 || blockedReason ? 0.6 : 1 }}>
          {saving ? "Saving…" : grain === "day" ? "Save Day" : grain === "week" ? "Save Week" : "Save Month"}
        </button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none",
};
const ghost: React.CSSProperties = {
  background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)",
  borderRadius: 9, padding: "8px 14px", fontSize: 13, cursor: "pointer",
};
const eth: React.CSSProperties = { padding: "8px 8px", textAlign: "center", fontWeight: 600, borderRight: "1px solid var(--border)" };
const etd: React.CSSProperties = { padding: "6px 8px", textAlign: "center", color: "var(--text)", borderRight: "1px solid var(--border)" };
