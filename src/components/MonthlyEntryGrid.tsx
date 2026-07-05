"use client";

// src/components/MonthlyEntryGrid.tsx
// "Monthly Entry" mode for /data-entry — one row per calendar day of a
// selected month, for a chosen Stage (+ Size for size-wise stages). Mirrors
// the real Excel sheet shape. Reuses the exact same StageDayRecord model,
// applyEdit(), and buildReviewRows() the daily entry grid and /staging use,
// so a day entered here is indistinguishable from one entered anywhere else
// (see docs/superpowers/specs/2026-07-05-monthly-data-entry-design.md).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { buildReviewRows, applyEdit } from "@/lib/ingest/review";
import { CAPTURE_LABEL, CAPTURE_FIELD, CAPTURE_TO_RECORD_FIELD, CORE_FIELD_BY_COL } from "@/lib/ingest/capture-fields";

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 }; // month: 1-12
}

/** Days in `month` (1-12) of `year` — day 0 of the next 0-indexed month is the
 *  last day of the target month. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function MonthlyEntryGrid() {
  const [registry, setRegistry] = useState<any | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());

  const [records, setRecords] = useState<StageDayRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/schema")
      .then((res) => res.json())
      .then((data) => setRegistry(data.registry ?? null))
      .catch(() => setRegistry(null));
  }, []);

  const activeRegistry = registry || DISPOSAFE_REGISTRY;

  const stageIds: string[] = useMemo(() => {
    const monthEnd = isoDate(year, month, daysInMonth(year, month));
    const monthStart = isoDate(year, month, 1);
    return activeRegistry.stages
      .filter((s: any) => (s.effectiveFrom == null || s.effectiveFrom <= monthEnd) &&
                     (s.effectiveTo == null || monthStart <= s.effectiveTo))
      .map((s: any) => s.stageId);
  }, [activeRegistry, year, month]);

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

  const updateCell = (date: string, colName: string, val: string) => {
    const coreField = CORE_FIELD_BY_COL[colName];
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
          if (coreField) return { ...r, [coreField]: null, extractedBy: "direct-entry" };
          return { ...r, defects: r.defects.filter((d) => d.raw !== colName), extractedBy: "direct-entry" };
        });
      }
      const num = Number(val);
      if (isNaN(num) || num < 0) return next;
      return applyEdit(next, idx, coreField ?? colName, num);
    });
  };

  const loadMonth = useCallback(async () => {
    if (!activeStageId) return;
    setLoading(true); setError(null);
    const from = isoDate(year, month, 1);
    const to = isoDate(year, month, daysInMonth(year, month));
    const params = new URLSearchParams({ from, to, stageId: activeStageId });
    if (isSizeWise && activeSize) params.set("size", activeSize);
    try {
      const res = await fetch(`/api/day-records?${params.toString()}`);
      const data = await res.json();
      setRecords(data.records ?? []);
      setDirty(false);
    } catch (err) {
      console.error("Error loading month:", err);
      setError("Failed to load this month's data.");
      setRecords([]);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [activeStageId, activeSize, year, month, isSizeWise]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, i) => isoDate(year, month, i + 1)),
    [year, month],
  );

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

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const confirmDiscardIfDirty = (actionLabel: string): boolean => {
    if (!dirty) return true;
    return confirm(`You have unsaved changes for ${monthLabel} that haven't been submitted yet. ${actionLabel} will discard them. Continue?`);
  };

  const goToMonth = (deltaMonths: number) => {
    if (!confirmDiscardIfDirty("Changing the month")) return;
    let m = month + deltaMonths;
    let y = year;
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    setYearMonth({ year: y, month: m });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
        <button onClick={() => goToMonth(-1)} style={ghost} aria-label="Previous month">‹ Prev</button>
        <div style={{ fontWeight: 700, minWidth: 140, textAlign: "center" }}>{monthLabel}</div>
        <button onClick={() => goToMonth(1)} style={ghost} aria-label="Next month">Next ›</button>
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
          <thead>
            <tr style={{ color: "var(--text-3)", background: "var(--surface-2)", fontSize: 10, textTransform: "uppercase", borderBottom: "1.5px solid var(--border-strong)" }}>
              <th style={{ ...eth, textAlign: "left", minWidth: 90, position: "sticky", left: 0, zIndex: 2, background: "var(--surface-2)" }}>Date</th>
              {activeCaptures.map((c) => <th key={c} style={eth}>{CAPTURE_LABEL[c]}</th>)}
              {activeDefects.map((d: any) => <th key={d.defectCode} style={eth} title={d.label}>{d.defectCode}</th>)}
            </tr>
          </thead>
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
        </table>
      </div>

      {(() => {
        const invalidCount = Array.from(reviewByDate.values()).filter((r) => r.status === "invalid").length;
        return invalidCount > 0 ? (
          <p style={{ fontSize: 12, color: "var(--status-bad)", marginTop: 8 }}>
            {invalidCount} of {reviewByDate.size} entered day{reviewByDate.size === 1 ? "" : "s"} need{invalidCount === 1 ? "s" : ""} fixing before you can save.
          </p>
        ) : null;
      })()}
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
