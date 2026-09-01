"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DatePicker from "@/components/ui/DatePicker";
import { useConfirm } from "@/components/ui/ConfirmContext";
import AuditReportDocument from "./AuditReportDocument";
import type { Event } from "@/lib/store/types";
import type { Registry } from "@/lib/analytics/rejection";
import {
  listExcelSourceFiles,
  listBatchIds,
  type SourceChannel,
} from "@/lib/analytics/scope";
import {
  REPORT_TYPES,
  type ReportType,
  type ReportPeriodMode,
  defaultFyStartYear,
  listFinancialYearsFromEvents,
} from "@/lib/report/report-scope";
import { REPORT_DATE_BASIS, REPORT_DATE_BASIS_LABEL } from "@/lib/report/date-basis";
import { buildReport, reportFilename } from "@/lib/report/report-builders";
import { buildEvidenceManifest } from "@/lib/report/evidence-manifest";
import {
  listWorkspacePresets,
  saveWorkspacePreset,
  deleteWorkspacePreset,
  type WorkspacePreset,
} from "@/lib/report/workspace-presets";
import { financialYear, fyLabel } from "@/lib/report/financial-year";
import type { CalculationPolicyT } from "@/core/policy/policy";

const PRINT_CSS = `
.rp-print-surface {
  position: fixed !important;
  left: -10000px !important;
  top: 0 !important;
  width: 190mm !important;
  max-width: 190mm !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
  z-index: -1 !important;
  background: #fff !important;
  color: #14181f !important;
}
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body {
    background: #fff !important; color: #14181f !important;
    margin: 0 !important; padding: 0 !important; height: auto !important;
    overflow: visible !important;
  }
  body.rp-printing > *:not(.rp-print-surface) { display: none !important; }
  body.rp-printing .rp-print-surface {
    display: block !important; position: static !important;
    left: auto !important; top: auto !important; width: 100% !important;
    max-width: none !important; overflow: visible !important;
    pointer-events: auto !important; z-index: auto !important;
    background: #fff !important;
  }
  body.rp-printing .rp-print-surface, body.rp-printing .rp-print-surface * {
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
  }
  body.rp-printing .no-print { display: none !important; }
}
`;

const WORKSPACE_CSS = `
.rw { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.rw-grid {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(280px, 360px) minmax(0, 1fr);
  gap: 0;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--surface);
  height: min(78vh, 880px);
  min-height: 0;
  overflow: hidden;
}
.rw-col { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
.rw-col-types, .rw-scope, .rw-preview {
  display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; overflow: hidden;
  border-right: 1px solid var(--border);
}
.rw-preview { border-right: none; }
.rw-lock {
  font-size: 14px;
  color: var(--text-2);
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
}
.rw-hd { padding: 14px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.rw-scroll { flex: 1; min-height: 0; overflow: auto; padding: 12px; }
.rw-type {
  width: 100%; text-align: left; padding: 12px 12px; margin-bottom: 8px;
  min-height: 44px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); cursor: pointer; font: inherit; font-size: 14px;
}
.rw-type[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-weak); }
.rw-seg { display: flex; gap: 6px; }
.rw-seg button {
  flex: 1; min-height: 44px; border-radius: 10px; border: 1px solid var(--border-strong);
  background: var(--surface); color: var(--text); font: inherit; font-size: 14px; cursor: pointer;
}
.rw-seg button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-weak); font-weight: 600; }
.rw-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.rw-field label, .rw-check { font-size: 14px; color: var(--text); }
.rw-select, .rw-input, .rw-area {
  min-height: 44px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-strong);
  background: var(--surface); color: var(--text); font: inherit; font-size: 14px; width: 100%; box-sizing: border-box;
}
.rw-area { min-height: 72px; }
.rw-check { display: flex; align-items: center; gap: 8px; min-height: 44px; cursor: pointer; }
.rw-primary, .rw-ghost {
  min-height: 44px; padding: 10px 16px; border-radius: 999px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
}
.rw-primary { border: none; background: var(--accent); color: var(--text-invert, #fff); }
.rw-primary:disabled { opacity: 0.45; cursor: not-allowed; }
.rw-ghost { border: 1px solid var(--border-strong); background: transparent; color: var(--text-2); }
.rw-tabs { display: none; gap: 6px; }
.rw-tabs button {
  flex: 1; min-height: 44px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--surface); font: inherit; font-size: 14px; cursor: pointer;
}
.rw-tabs button[aria-selected="true"] { border-color: var(--accent); background: var(--accent-weak); font-weight: 600; }
.rw-actions { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }
.rw-preview-paper { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
.rw-chip { font-size: 13px; color: var(--text-2); }
.rw-status { font-size: 14px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); }
.rw-status.ok { background: var(--positive-weak); }
.rw-status.block { background: var(--critical-weak); }
.rw-status.warn { background: var(--warning-weak); }
.rw-type-rail { display: none; }
.rw-sticky-print { display: none; }
@media (max-width: 1279px) {
  .rw-grid { grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); }
  .rw-col-types { display: none; }
}
@media (max-width: 767px) {
  .rw-grid { grid-template-columns: 1fr; height: auto; min-height: 50vh; }
  .rw-col { border-right: none; border-bottom: 1px solid var(--border); }
  .rw-tabs { display: flex; }
  .rw-col-types, .rw-scope, .rw-preview { display: none; }
  .rw-col-types.rw-show, .rw-scope.rw-show, .rw-preview.rw-show { display: flex; flex-direction: column; min-height: 60vh; }
  .rw-sticky-print {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 5;
    padding: 8px 0 10px;
    background: var(--bg);
  }
  .rw-desktop-print { display: none; }
}
@media (min-width: 768px) and (max-width: 1279px) {
  .rw-type-rail { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
}
@media (min-width: 1280px) {
  .rw-type-rail { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .rw-type, .rw-seg button, .rw-primary, .rw-ghost { transition: none; }
}
`;

type MobileTab = "report" | "scope" | "preview";

function stateKey(s: {
  reportType: ReportType;
  periodMode: ReportPeriodMode;
  fyStartYear: number;
  dateFrom: string;
  dateTo: string;
  includeExcel: boolean;
  includeDirectEntry: boolean;
  excelFiles: string[];
  batchIds: string[];
  notes: string;
}): string {
  return JSON.stringify(s);
}

export default function ReportsWorkspace({
  events,
  registry,
  policy,
}: {
  events: Event[];
  registry?: Registry | null;
  policy?: CalculationPolicyT;
}) {
  const { confirm } = useConfirm();
  const years = useMemo(() => listFinancialYearsFromEvents(events), [events]);
  const [reportType, setReportType] = useState<ReportType>("fy-audit-pack");
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>("financial-year");
  const [fyStartYear, setFyStartYear] = useState(() => defaultFyStartYear(events));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeExcel, setIncludeExcel] = useState(true);
  const [includeDirectEntry, setIncludeDirectEntry] = useState(true);
  const [excelFiles, setExcelFiles] = useState<string[]>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("report");
  const [printing, setPrinting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [presets, setPresets] = useState<WorkspacePreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>("builtin:fy-audit-pack");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [persistDates, setPersistDates] = useState(false);
  const [cleanKey, setCleanKey] = useState("");

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const listed = listWorkspacePresets();
    if (listed.ok) setPresets(listed.value);
    else setMsg({ text: listed.error, tone: "err" });
  }, []);
  useEffect(() => {
    const id = "rw-print-css";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = PRINT_CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  const currentKey = stateKey({
    reportType, periodMode, fyStartYear, dateFrom, dateTo,
    includeExcel, includeDirectEntry, excelFiles, batchIds, notes,
  });
  const dirty = cleanKey !== "" && currentKey !== cleanKey;

  useEffect(() => {
    if (!cleanKey) setCleanKey(currentKey);
    // seed once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceChannels: SourceChannel[] = [];
  if (includeExcel) sourceChannels.push("excel");
  if (includeDirectEntry) sourceChannels.push("direct-entry");

  const built = useMemo(() => {
    const generatedAt = new Date().toISOString();
    return buildReport(
      events,
      {
        reportType,
        periodMode,
        financialYearStartYear: fyStartYear,
        dateFrom,
        dateTo,
        dateBasis: REPORT_DATE_BASIS,
        sourceChannels,
        sourceFiles: excelFiles,
        batchIds,
        notes,
        generatedAt,
        policy,
      },
      registry ?? undefined,
    );
    // sourceChannels is derived; list it via primitives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    events, reportType, periodMode, fyStartYear, dateFrom, dateTo,
    includeExcel, includeDirectEntry, excelFiles, batchIds, notes, policy, registry,
  ]);

  const fy = financialYear(fyStartYear);
  const excelList = useMemo(() => listExcelSourceFiles(events), [events]);
  const batchList = useMemo(() => listBatchIds(events), [events]);

  const askIfDirty = useCallback(async () => {
    if (!dirty) return true;
    return confirm({
      title: "Replace unsaved report setup?",
      description: "You have unsaved changes to this report. Continue and discard them?",
      confirmText: "Discard and continue",
      variant: "danger",
    });
  }, [dirty, confirm]);

  async function selectType(id: ReportType) {
    if (id === reportType) return;
    if (!(await askIfDirty())) return;
    setReportType(id);
    setActivePresetId(`builtin:${id}`);
    setMsg(null);
  }

  async function loadPreset(p: WorkspacePreset) {
    if (!(await askIfDirty())) return;
    setReportType(p.reportType);
    setPeriodMode(p.periodMode);
    setNotes(p.notes ?? "");
    if (p.persistCustomDates && p.dateFrom && p.dateTo) {
      setDateFrom(p.dateFrom);
      setDateTo(p.dateTo);
      setPeriodMode("custom");
    }
    setActivePresetId(p.id);
    setMsg(null);
  }

  function refreshPresets() {
    const listed = listWorkspacePresets();
    if (listed.ok) setPresets(listed.value);
    else setMsg({ text: listed.error, tone: "err" });
  }

  function handleSave(asCopy: boolean) {
    const existing = !asCopy && activePresetId && !activePresetId.startsWith("builtin:") ? activePresetId : undefined;
    const saved = saveWorkspacePreset({
      id: existing,
      name: saveName.trim() || REPORT_TYPES.find((t) => t.id === reportType)?.title || "Layout preset",
      reportType,
      periodMode,
      notes,
      persistCustomDates: persistDates && periodMode === "custom",
      dateFrom,
      dateTo,
    });
    if (!saved.ok) {
      setMsg({ text: saved.error, tone: "err" });
      return;
    }
    setActivePresetId(saved.value.id);
    setSaveName(saved.value.name);
    setSaveOpen(false);
    setCleanKey(currentKey);
    refreshPresets();
    setMsg({ text: `Saved layout preset “${saved.value.name}” (this browser only).`, tone: "ok" });
  }

  async function handleDelete() {
    if (!activePresetId || activePresetId.startsWith("builtin:")) return;
    const ok = await confirm({
      title: "Delete layout preset?",
      description: "This removes a browser-local layout preset. It is not a governed plant template.",
      confirmText: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = deleteWorkspacePreset(activePresetId);
    if (!res.ok) {
      setMsg({ text: res.error, tone: "err" });
      return;
    }
    setActivePresetId("builtin:fy-audit-pack");
    refreshPresets();
    setMsg({ text: "Layout preset deleted.", tone: "ok" });
  }

  function handlePrint() {
    if (!built.ok) {
      setMsg({ text: built.error, tone: "err" });
      return;
    }
    if (!built.model.validation.canExport) {
      setMsg({ text: built.model.validation.blockers[0] ?? "This report cannot be exported as audit evidence.", tone: "err" });
      return;
    }
    const prevTitle = document.title;
    document.title = reportFilename(built.model).replace(/\.pdf$/i, "");
    setPrinting(true);
    const restore = () => {
      document.title = prevTitle;
    };
    window.addEventListener("afterprint", restore, { once: true });
  }

  function handleManifest() {
    if (!built.ok) {
      setMsg({ text: built.error, tone: "err" });
      return;
    }
    const manifest = buildEvidenceManifest(events, built.scope, built.model);
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = reportFilename(built.model).replace(/\.pdf$/i, "") + "-evidence.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg({ text: "Downloaded evidence manifest (complete event list).", tone: "ok" });
  }

  useEffect(() => {
    if (!printing) return;
    document.body.classList.add("rp-printing");
    let cancelled = false;
    const cleanup = () => {
      if (cancelled) return;
      cancelled = true;
      document.body.classList.remove("rp-printing");
      setPrinting(false);
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    const t = window.setTimeout(cleanup, 90_000);
    const r1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) window.print();
      });
    });
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(r1);
      cleanup();
    };
  }, [printing]);

  const model = built.ok ? built.model : null;
  const blockReason = !built.ok ? built.error : model && !model.validation.canExport ? model.validation.blockers[0] : null;
  const canPrint = built.ok && !!model?.validation.canExport;

  const typesPane = (
    <div className="rw-col">
      <div className="rw-hd">
        <div style={{ fontWeight: 700, fontSize: 15 }}>Report</div>
        <div className="rw-chip">One type per export</div>
      </div>
      <div className="rw-scroll">
        {REPORT_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="rw-type"
            aria-pressed={reportType === t.id}
            onClick={() => void selectType(t.id)}
          >
            <div style={{ fontWeight: 600 }}>{t.title}</div>
            <div className="rw-chip" style={{ marginTop: 4 }}>{t.description}</div>
          </button>
        ))}
        <div style={{ marginTop: 16, fontSize: 13, color: "var(--text-2)" }}>
          Layout presets (this browser only)
        </div>
        {presets.filter((p) => !p.builtIn).map((p) => (
          <button
            key={p.id}
            type="button"
            className="rw-type"
            aria-pressed={activePresetId === p.id}
            onClick={() => void loadPreset(p)}
          >
            {p.name}
            <div className="rw-chip">Layout preset</div>
          </button>
        ))}
      </div>
    </div>
  );

  const scopePane = (
    <div className="rw-col">
      <div className="rw-hd">
        <div style={{ fontWeight: 700, fontSize: 15 }}>Scope</div>
        <div className="rw-chip">Does not change Dashboard filters</div>
      </div>
      <div className="rw-scroll">
        <div className="rw-field">
          <span id="rw-period-label">Period</span>
          <div className="rw-seg" role="group" aria-labelledby="rw-period-label">
            <button type="button" aria-pressed={periodMode === "financial-year"} onClick={() => setPeriodMode("financial-year")}>
              Financial year
            </button>
            <button type="button" aria-pressed={periodMode === "custom"} onClick={() => setPeriodMode("custom")}>
              Custom range
            </button>
          </div>
        </div>

        {periodMode === "financial-year" ? (
          <div className="rw-field">
            <label htmlFor="rw-fy">Financial year</label>
            <select
              id="rw-fy"
              className="rw-select"
              value={fyStartYear}
              onChange={(e) => setFyStartYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y.startYear} value={y.startYear}>{y.label}</option>
              ))}
              {!years.some((y) => y.startYear === fyStartYear) && (
                <option value={fyStartYear}>{fyLabel(fyStartYear)}</option>
              )}
            </select>
            <div className="rw-chip mono">
              {fy.from} → {fy.to} (inclusive)
            </div>
          </div>
        ) : (
          <>
            <div className="rw-field">
              <label htmlFor="rw-from">Start date</label>
              <DatePicker id="rw-from" value={dateFrom} onChange={setDateFrom} ariaLabel="Custom range start date" />
            </div>
            <div className="rw-field">
              <label htmlFor="rw-to">End date</label>
              <DatePicker id="rw-to" value={dateTo} onChange={setDateTo} ariaLabel="Custom range end date" min={dateFrom || undefined} />
            </div>
          </>
        )}

        <div className="rw-field">
          <div style={{ fontWeight: 600 }}>Date basis</div>
          <div>{REPORT_DATE_BASIS_LABEL}</div>
          <div className="rw-chip">
            Ledger recordedAt. Not the lot calendar in the batch ID.
          </div>
        </div>

        <div className="rw-field">
          <div style={{ fontWeight: 600 }}>Sources</div>
          <label className="rw-check">
            <input type="checkbox" checked={includeExcel} onChange={(e) => setIncludeExcel(e.target.checked)} />
            Excel uploads
          </label>
          <label className="rw-check">
            <input type="checkbox" checked={includeDirectEntry} onChange={(e) => setIncludeDirectEntry(e.target.checked)} />
            Data entry
          </label>
          <div className="rw-chip">
            {includeExcel && includeDirectEntry && excelFiles.length === 0 && batchIds.length === 0
              ? "All plant data"
              : `${includeExcel ? "Excel" : ""}${includeExcel && includeDirectEntry ? " + " : ""}${includeDirectEntry ? "Data entry" : ""}${!includeExcel && !includeDirectEntry ? "No channels" : ""}`}
          </div>
        </div>

        {includeExcel && excelList.length > 0 && (
          <div className="rw-field">
            <span>Excel files {excelFiles.length === 0 ? "(all)" : `(${excelFiles.length})`}</span>
            <button type="button" className="rw-ghost" onClick={() => setExcelFiles([])}>All Excel files</button>
            {excelList.map((f) => {
              const on = excelFiles.length === 0 || excelFiles.includes(f);
              return (
                <label key={f} className="rw-check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      if (excelFiles.length === 0) setExcelFiles(excelList.filter((x) => x !== f));
                      else if (excelFiles.includes(f)) setExcelFiles(excelFiles.filter((x) => x !== f));
                      else {
                        const next = [...excelFiles, f];
                        setExcelFiles(next.length === excelList.length ? [] : next);
                      }
                    }}
                  />
                  <span style={{ wordBreak: "break-word" }}>{f}</span>
                </label>
              );
            })}
          </div>
        )}

        {batchList.length > 0 && (
          <div className="rw-field">
            <span>Batches {batchIds.length === 0 ? "(all)" : `(${batchIds.length})`}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className="rw-ghost" onClick={() => setBatchIds([])}>All batches</button>
            </div>
            <div style={{ maxHeight: 180, overflow: "auto" }}>
              {batchList.map((b) => {
                const on = batchIds.includes(b);
                return (
                  <button
                    key={b}
                    type="button"
                    className="rw-ghost"
                    aria-pressed={on}
                    onClick={() => setBatchIds(on ? batchIds.filter((x) => x !== b) : [...batchIds, b])}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      fontFamily: "var(--font-mono)",
                      marginBottom: 4,
                      background: on ? "var(--accent-weak)" : undefined,
                    }}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rw-field">
          <label htmlFor="rw-notes">Notes (printed as authored)</label>
          <textarea id="rw-notes" className="rw-area" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </div>
  );

  const previewPane = (
    <div className="rw-col" style={{ background: "var(--surface-2)" }}>
      <div className="rw-hd">
        <div style={{ fontWeight: 700, fontSize: 15 }}>Preview</div>
        <div className="rw-chip">
          {model
            ? `${model.identity.periodCaption} · ${model.identity.dateFrom} → ${model.identity.dateTo} · ${REPORT_DATE_BASIS_LABEL}`
            : "Resolve scope to preview"}
          {dirty ? " · Unsaved" : ""}
        </div>
      </div>
      <div className="rw-scroll">
        {model && (
          <div
            className={`rw-status ${blockReason ? "block" : model.validation.warnings.length ? "warn" : "ok"}`}
            role={blockReason ? "alert" : "status"}
          >
            {blockReason ? (
              blockReason
            ) : (
              <>
                {model.validation.qualifyingEventCount.toLocaleString("en-IN")} qualifying events.
                {model.validation.warnings.length ? ` ${model.validation.warnings[0]}` : " Safe to generate."}
              </>
            )}
          </div>
        )}
        {!built.ok && (
          <div className="rw-status block" role="alert">{built.error}</div>
        )}
        <div className="rw-preview-paper" style={{ marginTop: 12 }}>
          {model ? (
            <AuditReportDocument model={model} />
          ) : (
            <p className="body" style={{ color: "var(--text-2)" }}>
              Choose a financial year or a valid custom range to preview. Empty reports cannot be exported as audit evidence.
            </p>
          )}
        </div>
      </div>
      <div className="rw-actions rw-desktop-print">
        {msg && (
          <div role={msg.tone === "err" ? "alert" : "status"} className={`rw-status ${msg.tone === "err" ? "block" : "ok"}`}>
            {msg.text}
          </div>
        )}
        <button type="button" className="rw-primary" onClick={handlePrint} disabled={!canPrint || printing}>
          {printing ? "Preparing print…" : "Print / Save as PDF"}
        </button>
        <button type="button" className="rw-ghost" onClick={handleManifest} disabled={!built.ok}>
          Download evidence manifest
        </button>
        {saveOpen ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="rw-save-name">Layout preset name</label>
            <input id="rw-save-name" className="rw-input" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <label className="rw-check">
              <input type="checkbox" checked={persistDates} onChange={(e) => setPersistDates(e.target.checked)} disabled={periodMode !== "custom"} />
              Also store these custom dates
            </label>
            <div className="rw-chip">Layout presets stay in this browser. They are not a governed plant template.</div>
            <button type="button" className="rw-primary" onClick={() => handleSave(false)}>
              {activePresetId && !activePresetId.startsWith("builtin:") ? "Update preset" : "Save layout preset"}
            </button>
            <button type="button" className="rw-ghost" onClick={() => handleSave(true)}>Save as copy</button>
            <button type="button" className="rw-ghost" onClick={() => setSaveOpen(false)}>Cancel</button>
          </div>
        ) : (
          <button
            type="button"
            className="rw-ghost"
            onClick={() => {
              setSaveName(REPORT_TYPES.find((t) => t.id === reportType)?.title ?? "Layout preset");
              setSaveOpen(true);
            }}
          >
            Save layout preset
          </button>
        )}
        {activePresetId && !activePresetId.startsWith("builtin:") && (
          <button type="button" className="rw-ghost" onClick={() => void handleDelete()}>Delete layout preset</button>
        )}
      </div>
    </div>
  );

  const printPortal =
    mounted &&
    printing &&
    model &&
    createPortal(
      <div className="rp-print-surface" aria-hidden="true">
        <AuditReportDocument model={model} />
      </div>,
      document.body,
    );

  return (
    <div className="rw">
      <style dangerouslySetInnerHTML={{ __html: WORKSPACE_CSS }} />
      <header>
        <h1 className="h1" style={{ margin: 0 }}>Reports</h1>
        <p className="body" style={{ color: "var(--text-2)", marginTop: 6, maxWidth: 640 }}>
          Generate a ledger extract for a financial year or custom Date of Entry range. Every figure is computed from stored events; nothing here is a compliance certificate.
        </p>
        <div className="rw-lock">
          <span>
            <strong style={{ color: "var(--text)", fontWeight: 600 }}>{REPORT_DATE_BASIS_LABEL}</strong>
            {" · "}
            <span className="mono">
              {periodMode === "financial-year" ? `${fy.from} → ${fy.to}` : dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : "Set a custom range"}
            </span>
            {" (inclusive)"}
          </span>
          <span>
            {model
              ? `${model.validation.qualifyingEventCount.toLocaleString("en-IN")} qualifying events`
              : built.ok
                ? "Resolving…"
                : built.error}
          </span>
        </div>
      </header>

      <div className="rw-tabs no-print" role="tablist" aria-label="Report workspace">
        {(["report", "scope", "preview"] as MobileTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mobileTab === tab}
            onClick={() => setMobileTab(tab)}
          >
            {tab === "report" ? "Report" : tab === "scope" ? "Scope" : "Preview"}
          </button>
        ))}
      </div>

      <div className="rw-sticky-print no-print">
        <button type="button" className="rw-primary" style={{ width: "100%" }} onClick={handlePrint} disabled={!canPrint || printing}>
          {printing ? "Preparing print…" : "Print / Save as PDF"}
        </button>
      </div>

      <div className="rw-type-rail no-print">
        {REPORT_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="rw-ghost"
            aria-pressed={reportType === t.id}
            onClick={() => void selectType(t.id)}
            style={{ background: reportType === t.id ? "var(--accent-weak)" : undefined }}
          >
            {t.title}
          </button>
        ))}
      </div>

      <div className="rw-grid">
        <div className={`rw-col-types ${mobileTab === "report" ? "rw-show" : ""}`}>
          {typesPane}
        </div>
        <div className={`rw-scope ${mobileTab === "scope" ? "rw-show" : ""}`}>
          {scopePane}
        </div>
        <div className={`rw-preview ${mobileTab === "preview" ? "rw-show" : ""}`}>
          {previewPane}
        </div>
      </div>

      {printPortal}
    </div>
  );
}
