"use client";

// src/components/MonthlyEntryGrid.tsx
// Spreadsheet-style entry surface for /data-entry — one row per calendar day
// of a selected period, for a chosen Stage (+ Size for size-wise stages).
//
// Grid definition comes from GET /api/entry-template (verified MOD layout +
// per-stage capture/defect columns). Never from a company-wide hardcoded
// defect catalog or /api/schema registry shim.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { buildReviewRows, applyEdit } from "@/lib/ingest/review";
import { useEvents } from "@/components/app/EventsContext";
import { type EntryGrain, resolvePeriod, stepPeriod, periodLabel } from "@/lib/entry/period";

type TemplateColumn = { key: string; label: string; type: "number"; required: boolean };
type TemplateDefect = { defectCode: string; label: string };
type TemplateStage = {
  stageId: string;
  label: string;
  sizeWise: boolean;
  isQualityGate: boolean;
  columns: TemplateColumn[];
  defects: TemplateDefect[];
  layout: {
    sheet: string;
    tableId: string;
    headerRows: (string | number | null)[][];
    merges: unknown[];
  } | null;
};
type EntryTemplate = {
  stages: TemplateStage[];
  sizes: { sizeId: string; label: string }[];
  generatedFrom?: { modId: string; version: number; fileName: string }[];
};

/** Record field keyed by entry-template column key. */
const COL_TO_RECORD: Record<string, "checked" | "acceptedGood" | "rework" | "rejected"> = {
  checked: "checked",
  acceptedGood: "acceptedGood",
  rework: "rework",
  rejected: "rejected",
};

export default function MonthlyEntryGrid({
  onDirtyChange,
  customFields,
  grain,
  anchorDate,
  onAnchorChange,
  blockedReason,
}: {
  onDirtyChange?: (dirty: boolean) => void;
  customFields?: Record<string, any>;
  grain: EntryGrain;
  anchorDate: string;
  onAnchorChange?: (next: string) => void;
  blockedReason?: string | null;
}) {
  const { refreshEvents } = useEvents();
  const [template, setTemplate] = useState<EntryTemplate | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const { from, to } = useMemo(() => resolvePeriod(grain, anchorDate), [grain, anchorDate]);

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
    setTemplateLoading(true);
    setTemplateError(null);
    fetch("/api/entry-template")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setTemplate(null);
          setTemplateError(data.error ?? "No entry template — upload and verify a workbook first.");
          return;
        }
        setTemplate(data.template ?? null);
        if (!data.template?.stages?.length) {
          setTemplateError("No stages in the verified ontology yet.");
        }
      })
      .catch(() => {
        setTemplate(null);
        setTemplateError("Failed to load entry template.");
      })
      .finally(() => setTemplateLoading(false));
  }, []);

  const stages = template?.stages ?? [];
  const sizes = template?.sizes ?? [];

  useEffect(() => {
    if (activeStageId && stages.some((s) => s.stageId === activeStageId)) return;
    setActiveStageId(stages[0]?.stageId ?? null);
  }, [stages, activeStageId]);

  const activeStage = useMemo(
    () => stages.find((s) => s.stageId === activeStageId) ?? null,
    [stages, activeStageId],
  );

  const isSizeWise = !!activeStage?.sizeWise && sizes.length > 0;

  useEffect(() => {
    if (!isSizeWise) {
      setActiveSize(null);
      return;
    }
    if (activeSize && sizes.some((s) => s.sizeId === activeSize)) return;
    setActiveSize(sizes[0]?.sizeId ?? null);
  }, [isSizeWise, sizes, activeSize]);

  /** Capture columns from the MOD stage (checked / good / rework / rejected). */
  const captureCols: TemplateColumn[] = activeStage?.columns ?? [];
  /**
   * Defect columns for THIS stage only — from the workbook MOD that defined the
   * stage (entity columns preferred). Never the merged company catalog.
   */
  const defectCols: TemplateDefect[] = activeStage?.defects ?? [];

  const rowKey = isSizeWise ? activeSize : "__line__";

  const blankRecord = (date: string): StageDayRecord => ({
    occurredOn: { kind: "day", start: date, end: date },
    stageId: activeStageId!,
    size: rowKey === "__line__" ? null : rowKey,
    source: { file: "Manual Entry", fileHash: `manual-${date}`, sheet: "Data Entry", tableId: "entry" },
    checked: null,
    acceptedGood: null,
    rework: null,
    rejected: null,
    defects: [],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "pending",
  });

  const updateCapture = (date: string, colKey: string, val: string) => {
    const prop = COL_TO_RECORD[colKey];
    if (!prop) return;
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
        return next.map((r, i) => (i !== idx ? r : { ...r, [prop]: null, extractedBy: "direct-entry" }));
      }
      const num = Number(val);
      if (isNaN(num) || num < 0) return next;
      return applyEdit(next, idx, prop, num);
    });
  };

  const updateDefect = (date: string, defectCode: string, val: string) => {
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
        return next.map((r, i) =>
          i !== idx
            ? r
            : {
                ...r,
                defects: r.defects.filter((d) => d.raw !== defectCode && d.raw.toUpperCase() !== defectCode.toUpperCase()),
                extractedBy: "direct-entry",
              },
        );
      }
      const num = Number(val);
      if (isNaN(num) || num < 0) return next;
      // Use defectCode as stable raw key (matches resolveEntity / catalog codes).
      return applyEdit(next, idx, defectCode, num);
    });
  };

  const loadRange = useCallback(async () => {
    if (!activeStageId) return;
    setLoading(true);
    setError(null);
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
      if (row) map.set(`${r.occurredOn.start}|${r.size ?? "__line__"}`, { ...row, recordIndex: i });
    });
    return map;
  }, [records]);

  const recordFor = (date: string): StageDayRecord | undefined =>
    records.find((r) => r.occurredOn.start === date && (r.size ?? "__line__") === rowKey);

  const rangeLabel = periodLabel(grain, anchorDate);

  const confirmDiscardIfDirty = (actionLabel: string): boolean => {
    if (!dirty) return true;
    return confirm(
      `You have unsaved changes for ${rangeLabel} that haven't been submitted yet. ${actionLabel} will discard them. Continue?`,
    );
  };

  const goToPeriod = (delta: number) => {
    const label =
      grain === "day" ? "Changing the day" : grain === "week" ? "Changing the week" : "Changing the month";
    if (!confirmDiscardIfDirty(label)) return;
    onAnchorChange?.(stepPeriod(grain, anchorDate, delta));
  };

  const invalidCount = Array.from(reviewByDate.values()).filter((r) => r.status === "invalid").length;

  async function saveMonth() {
    if (blockedReason) {
      setError(blockedReason);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
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
        body: JSON.stringify({ ingestionId, fileName: `Data Entry ${rangeLabel}`, records: payload }),
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

  const defectValue = (rec: StageDayRecord | undefined, d: TemplateDefect): string => {
    if (!rec) return "";
    const hit = rec.defects.find(
      (x) =>
        x.raw === d.defectCode ||
        x.raw === d.label ||
        x.raw.toUpperCase() === d.defectCode.toUpperCase() ||
        x.raw.toUpperCase() === d.label.toUpperCase(),
    );
    return hit != null ? String(hit.value) : "";
  };

  if (templateLoading) {
    return <div className="muted" style={{ padding: 48, textAlign: "center" }}>Loading entry template…</div>;
  }

  if (templateError || !template || stages.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          background: "var(--surface)",
          border: "1px dashed var(--border)",
          borderRadius: 12,
          color: "var(--text-2)",
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>
          No entry template yet
        </h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
          {templateError ??
            "Upload a workbook in Staging, verify column mappings, and publish a MOD. The data-entry grid is generated from that verified ontology — not a hardcoded defect list."}
        </p>
        <a
          href="/staging"
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: 6,
            background: "var(--accent)",
            color: "var(--text-invert)",
            fontWeight: 700,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Go to Staging
        </a>
      </div>
    );
  }

  const sourceHint =
    template.generatedFrom?.length
      ? template.generatedFrom.map((g) => g.fileName).slice(0, 3).join(", ")
      : null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          padding: 16,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
        }}
      >
        <button onClick={() => goToPeriod(-1)} style={ghost} aria-label="Previous period">
          ‹ Prev
        </button>
        <div style={{ fontWeight: 700, minWidth: 160, textAlign: "center" }}>{rangeLabel}</div>
        <button onClick={() => goToPeriod(1)} style={ghost} aria-label="Next period">
          Next ›
        </button>
        {isSizeWise && (
          <select
            value={activeSize ?? ""}
            onChange={(e) => {
              if (confirmDiscardIfDirty("Switching size")) setActiveSize(e.target.value);
            }}
            style={{ ...inp, width: 100, marginLeft: 12 }}
          >
            {sizes.map((s) => (
              <option key={s.sizeId} value={s.sizeId}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        {loading && (
          <span className="muted" style={{ fontSize: 12 }}>
            Loading…
          </span>
        )}
        {sourceHint && (
          <span className="muted" style={{ fontSize: 11, marginLeft: "auto", maxWidth: 280, textAlign: "right" }} title={sourceHint}>
            From: {sourceHint}
          </span>
        )}
      </div>

      {error && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: 9,
            background: "color-mix(in srgb, var(--status-bad) 12%, transparent)",
            color: "var(--status-bad)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {stages.map((s) => {
          const on = s.stageId === activeStageId;
          return (
            <button
              key={s.stageId}
              onClick={() => {
                if (confirmDiscardIfDirty("Switching stages")) setActiveStageId(s.stageId);
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-strong)",
                background: on ? "var(--accent)" : "var(--surface-2)",
                color: on ? "var(--text-invert)" : "var(--text-2)",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
        <table
          style={{
            width: "max-content",
            minWidth: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                color: "var(--text-3)",
                background: "var(--surface-2)",
                fontSize: 10,
                textTransform: "uppercase",
                borderBottom: "1.5px solid var(--border-strong)",
              }}
            >
              <th
                style={{
                  ...eth,
                  textAlign: "left",
                  minWidth: 90,
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  background: "var(--surface-2)",
                }}
              >
                Date
              </th>
              {captureCols.map((c) => (
                <th key={c.key} style={eth} title={c.label}>
                  {c.label}
                </th>
              ))}
              {defectCols.map((d) => (
                <th key={d.defectCode} style={eth} title={d.label}>
                  {d.defectCode}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((date) => {
              const rec = recordFor(date);
              const review = reviewByDate.get(`${date}|${rowKey}`);
              return (
                <tr key={date} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td
                    style={{
                      ...etd,
                      textAlign: "left",
                      fontWeight: 700,
                      background: "var(--surface)",
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {date}
                  </td>
                  {captureCols.map((c) => {
                    const field = COL_TO_RECORD[c.key];
                    const sv = field ? rec?.[field] : null;
                    const val = sv != null ? String(sv.value) : "";
                    const isCulprit =
                      !!field &&
                      (review?.invalidFields.includes(field) ||
                        review?.invalidFields.includes(field === "acceptedGood" ? "acceptedGood" : field));
                    return (
                      <td key={c.key} style={{ ...etd, padding: "3px 4px" }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={val}
                          onChange={(e) => updateCapture(date, c.key, e.target.value)}
                          style={{
                            ...inp,
                            width: 84,
                            padding: "4px 8px",
                            height: 30,
                            fontFamily: "var(--font-mono)",
                            textAlign: "right",
                            borderColor: isCulprit ? "var(--status-bad)" : "var(--border-strong)",
                          }}
                        />
                      </td>
                    );
                  })}
                  {defectCols.map((d) => {
                    const isCulprit =
                      !!review?.invalidFields.includes(d.defectCode) ||
                      !!review?.invalidFields.includes(d.label);
                    return (
                      <td key={d.defectCode} style={{ ...etd, padding: "3px 4px" }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={defectValue(rec, d)}
                          onChange={(e) => updateDefect(date, d.defectCode, e.target.value)}
                          style={{
                            ...inp,
                            width: 64,
                            padding: "4px 8px",
                            height: 30,
                            fontFamily: "var(--font-mono)",
                            textAlign: "right",
                            borderColor: isCulprit ? "var(--status-bad)" : "var(--border-strong)",
                          }}
                          title={d.label}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {defectCols.length === 0 && captureCols.length > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          This stage has no defect columns in the verified workbook — only capture measures (
          {captureCols.map((c) => c.label).join(", ")}).
        </p>
      )}

      {invalidCount > 0 && (
        <p style={{ fontSize: 12, color: "var(--status-bad)", marginTop: 8 }}>
          {invalidCount} of {reviewByDate.size} entered day{reviewByDate.size === 1 ? "" : "s"} need
          {invalidCount === 1 ? "s" : ""} fixing before you can save.
        </p>
      )}

      {blockedReason && (
        <p style={{ fontSize: 12, color: "var(--status-bad)", marginTop: 8 }}>{blockedReason}</p>
      )}

      {success && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: 9,
            background: "var(--positive-weak)",
            border: "1px solid var(--positive)",
            color: "var(--positive)",
            fontSize: 13,
          }}
        >
          {success}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <button
          onClick={saveMonth}
          disabled={saving || invalidCount > 0 || !!blockedReason}
          style={{
            background: "var(--status-good)",
            color: "#fff",
            border: "none",
            borderRadius: 9,
            padding: "10px 22px",
            fontSize: 14,
            fontWeight: 700,
            cursor: saving || invalidCount > 0 || blockedReason ? "not-allowed" : "pointer",
            opacity: saving || invalidCount > 0 || blockedReason ? 0.6 : 1,
          }}
        >
          {saving
            ? "Saving…"
            : grain === "day"
              ? "Save Day"
              : grain === "week"
                ? "Save Week"
                : "Save Month"}
        </button>
      </div>
    </div>
  );
}

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
const ghost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: 9,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};
const eth: React.CSSProperties = {
  padding: "8px 8px",
  textAlign: "center",
  fontWeight: 600,
  borderRight: "1px solid var(--border)",
};
const etd: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "center",
  color: "var(--text)",
  borderRight: "1px solid var(--border)",
};
