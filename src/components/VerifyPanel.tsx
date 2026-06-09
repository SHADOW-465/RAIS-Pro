// src/components/VerifyPanel.tsx
// Drill-in navigation for Verify mode: a workbook is a folder of months.
//   Overview (file index, grouped: months / summary / other)  ⇄  Month detail.
// KPI clicks deep-link into the right month and step through the metric's
// contributing months ("source N of M"). One month is shown at a time — no tab clutter.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DataTable from "./DataTable";
import Icon from "@/components/editorial/Icon";
import type { RawSheet } from "@/types/dashboard";
import type { MergePlan } from "@/types/analysis";
import {
  buildFileGroups,
  findColumn,
  findContributingSheets,
  quickStats,
  type FileGroup,
  type SheetEntry,
} from "@/lib/verify-nav";

interface VerifyPanelProps {
  sheets: RawSheet[];
  mergePlan?: MergePlan;
  /** active KPI's source column (null when no KPI selected) */
  activeSourceColumn: string | null;
  /** label of the metric being verified (for the trace header) */
  traceLabel: string | null;
  /** bumps each time a KPI is clicked → triggers deep-link navigation */
  verifyRequest: number;
  /** report which real column is highlighted in the currently shown sheet */
  onHighlightResolved: (col: string | null) => void;
  /** expose header cells for beam drawing */
  onColumnRef: (column: string, el: HTMLTableCellElement | null) => void;
  /**
   * The current dashboard scope — the section id (= sheetKey) when a month is
   * active, or "all" for the combined view. Used to pre-select the matching
   * sheet in the verify panel instead of always jumping to source[0].
   */
  activeScope?: string;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}
function fmtPct(r: number): string {
  return `${(r * 100).toFixed(2)}%`;
}

export default function VerifyPanel({
  sheets,
  mergePlan,
  activeSourceColumn,
  traceLabel,
  verifyRequest,
  onHighlightResolved,
  onColumnRef,
  activeScope,
}: VerifyPanelProps) {
  const groups = useMemo(() => buildFileGroups(sheets, mergePlan), [sheets, mergePlan]);

  const entryByIndex = useMemo(() => {
    const m = new Map<number, SheetEntry>();
    for (const g of groups) for (const e of g.ordered) m.set(e.index, e);
    return m;
  }, [groups]);

  // Auto-open detail when the whole upload is a single sheet.
  const singleSheet = groups.length === 1 && groups[0].ordered.length === 1;

  const [selectedFile, setSelectedFile] = useState<string>(groups[0]?.fileName ?? "");
  const [sheetIndex, setSheetIndex] = useState<number | null>(singleSheet ? groups[0].ordered[0].index : null);
  const [trace, setTrace] = useState<{ sources: number[]; pos: number } | null>(null);

  const currentGroup: FileGroup | undefined =
    groups.find((g) => g.fileName === selectedFile) ?? groups[0];
  const currentEntry = sheetIndex != null ? entryByIndex.get(sheetIndex) ?? null : null;
  const currentSheet = currentEntry?.sheet ?? null;

  // Resolve the highlighted column for the currently shown sheet.
  const resolved = useMemo(() => {
    if (!activeSourceColumn || !currentSheet) return null;
    return findColumn(activeSourceColumn, currentSheet.columns);
  }, [activeSourceColumn, currentSheet]);

  useEffect(() => {
    onHighlightResolved(resolved);
  }, [resolved, onHighlightResolved]);

  // KPI click → deep-link to the metric's contributing months.
  const lastRequest = useRef<number>(verifyRequest);
  useEffect(() => {
    if (verifyRequest === lastRequest.current) return;
    lastRequest.current = verifyRequest;
    const sources = findContributingSheets(sheets, activeSourceColumn);
    if (sources.length > 0) {
      // When a specific month/section is active, prefer the sheet that
      // corresponds to that scope (section id === sheet.name === sheetKey).
      // Fall back to sources[0] when viewing the combined "All Data" view.
      let startIndex = sources[0];
      if (activeScope && activeScope !== "all") {
        const matchedIdx = sources.find(
          (idx) => sheets[idx]?.name === activeScope,
        );
        if (matchedIdx !== undefined) startIndex = matchedIdx;
      }
      const startPos = sources.indexOf(startIndex);
      setTrace({ sources, pos: Math.max(0, startPos) });
      setSheetIndex(startIndex);
      const f = entryByIndex.get(startIndex)?.fileName;
      if (f) setSelectedFile(f);
    } else {
      setTrace(null);
    }
  }, [verifyRequest, activeSourceColumn, sheets, entryByIndex, activeScope]);

  // ── navigation helpers ─────────────────────────────────────────────────────
  const goOverview = () => {
    setSheetIndex(null);
    setTrace(null);
  };
  const openSheet = (index: number) => {
    setSheetIndex(index);
    setTrace(null);
    const f = entryByIndex.get(index)?.fileName;
    if (f) setSelectedFile(f);
  };

  // prev/next: in trace mode step contributing sources; otherwise step the file's months.
  const monthsList = currentGroup?.months ?? [];
  const monthPos = currentEntry ? monthsList.findIndex((e) => e.index === currentEntry.index) : -1;

  let canPrev = false, canNext = false;
  if (trace) {
    canPrev = trace.pos > 0;
    canNext = trace.pos < trace.sources.length - 1;
  } else if (monthPos >= 0) {
    canPrev = monthPos > 0;
    canNext = monthPos < monthsList.length - 1;
  }

  const step = (dir: -1 | 1) => {
    if (trace) {
      const pos = trace.pos + dir;
      if (pos < 0 || pos >= trace.sources.length) return;
      setTrace({ ...trace, pos });
      setSheetIndex(trace.sources[pos]);
      const f = entryByIndex.get(trace.sources[pos])?.fileName;
      if (f) setSelectedFile(f);
    } else if (monthPos >= 0) {
      const next = monthsList[monthPos + dir];
      if (next) setSheetIndex(next.index);
    }
  };

  if (!currentGroup) {
    return <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--text-3)", fontSize: 13 }}>No source data available.</div>;
  }

  // ── DETAIL VIEW ────────────────────────────────────────────────────────────
  if (currentEntry && currentSheet) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Nav header */}
        <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
          {/* breadcrumb row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 6px" }}>
            {!singleSheet && (
              <button
                onClick={goOverview}
                title="Back to file overview"
                style={navBtn}
              >
                <Icon name="arrow-left" size={13} /> Back
              </button>
            )}
            <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)", display: "inline-flex", gap: 6, alignItems: "center", minWidth: 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                {currentEntry.fileName.replace(/\.[^.]+$/, "")}
              </span>
              <span>▸</span>
              <span style={{ color: "var(--text)", fontWeight: 700 }}>{currentEntry.label}</span>
              {currentEntry.kind === "summary" && <Tag tone="warn">rollup · excluded</Tag>}
              {currentEntry.kind === "other" && <Tag tone="muted">not data</Tag>}
            </span>
          </div>

          {/* controls row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 16px 10px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {/* jump dropdown */}
              <select
                value={sheetIndex ?? ""}
                onChange={(e) => openSheet(Number(e.target.value))}
                aria-label="Jump to a sheet"
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  padding: "6px 8px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-strong)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  maxWidth: 200,
                }}
              >
                {currentGroup.months.length > 0 && (
                  <optgroup label="Months">
                    {currentGroup.months.map((e) => (
                      <option key={e.index} value={e.index}>{e.label}</option>
                    ))}
                  </optgroup>
                )}
                {currentGroup.summaries.length > 0 && (
                  <optgroup label="Summary / rollups">
                    {currentGroup.summaries.map((e) => (
                      <option key={e.index} value={e.index}>{e.sheetName}</option>
                    ))}
                  </optgroup>
                )}
                {currentGroup.others.length > 0 && (
                  <optgroup label="Other sheets">
                    {currentGroup.others.map((e) => (
                      <option key={e.index} value={e.index}>{e.sheetName}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {trace && (
                <span style={{ fontSize: 11, color: "var(--accent-text)", fontWeight: 700, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                  {traceLabel ? `Verifying ${traceLabel} · ` : ""}source {trace.pos + 1} of {trace.sources.length}
                </span>
              )}
              <div style={{ display: "inline-flex", gap: 4 }}>
                <button onClick={() => step(-1)} disabled={!canPrev} style={stepBtn(canPrev)} title={trace ? "Previous source" : "Previous month"}>
                  <Icon name="arrow-left" size={13} />
                </button>
                <button onClick={() => step(1)} disabled={!canNext} style={stepBtn(canNext)} title={trace ? "Next source" : "Next month"}>
                  <Icon name="arrow-right" size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* the sheet */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <DataTable sheet={currentSheet} highlightColumn={resolved} onColumnRef={onColumnRef} />
        </div>
      </div>
    );
  }

  // ── OVERVIEW VIEW ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* file selector (only when >1 file) */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "12px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: groups.length > 1 ? 8 : 0 }}>
          {groups.length > 1 ? "Files" : "Workbook"}
        </div>
        {groups.length > 1 ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {groups.map((g) => (
              <button
                key={g.fileName}
                onClick={() => setSelectedFile(g.fileName)}
                style={{
                  ...navBtn,
                  background: g.fileName === selectedFile ? "var(--accent)" : "var(--surface)",
                  color: g.fileName === selectedFile ? "var(--text-invert)" : "var(--text-2)",
                  borderColor: g.fileName === selectedFile ? "var(--accent)" : "var(--border-strong)",
                }}
              >
                {g.fileName.replace(/\.[^.]+$/, "")}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-mono)" }}>
            {currentGroup.fileName}
          </div>
        )}
      </div>

      {/* grouped index */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px 24px" }}>
        <Section title={`Months (${currentGroup.months.length})`}>
          {currentGroup.months.map((e) => (
            <MonthRow key={e.index} entry={e} onOpen={() => openSheet(e.index)} />
          ))}
          {currentGroup.months.length === 0 && <Empty>No month sheets detected.</Empty>}
        </Section>

        {currentGroup.summaries.length > 0 && (
          <Section title={`Summary & rollups (${currentGroup.summaries.length})`} hint="excluded from totals · reference only">
            {currentGroup.summaries.map((e) => (
              <SimpleRow key={e.index} label={e.sheetName} tag="rollup" onOpen={() => openSheet(e.index)} />
            ))}
          </Section>
        )}

        {currentGroup.others.length > 0 && (
          <Section title={`Other sheets (${currentGroup.others.length})`} hint="templates / non-data — not used in the analysis">
            {currentGroup.others.map((e) => (
              <SimpleRow key={e.index} label={e.sheetName} tag="not data" onOpen={() => openSheet(e.index)} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

// ─── small presentational bits ───────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: "var(--font-sans)",
  padding: "6px 10px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text-2)",
  cursor: "pointer",
};

function stepBtn(enabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border-strong)",
    background: "var(--surface)",
    color: enabled ? "var(--text)" : "var(--text-3)",
    opacity: enabled ? 1 : 0.4,
    cursor: enabled ? "pointer" : "default",
  };
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "warn" | "muted" }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        padding: "1px 6px",
        borderRadius: 999,
        background: tone === "warn" ? "var(--warning-weak)" : "var(--surface-2)",
        color: tone === "warn" ? "var(--warning)" : "var(--text-3)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-2)" }}>{title}</span>
        {hint && <span style={{ fontSize: 11, color: "var(--text-3)" }}>· {hint}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--text-3)", padding: "4px 0" }}>{children}</div>;
}

function MonthRow({ entry, onOpen }: { entry: SheetEntry; onOpen: () => void }) {
  const stats = useMemo(() => quickStats(entry.sheet), [entry.sheet]);
  return (
    <button
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        cursor: "pointer",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{entry.label}</span>
        <span className="num" style={{ fontSize: 11, color: "var(--text-3)" }}>{stats.rows} rows · {stats.cols} cols</span>
      </span>
      {stats.received != null ? (
        <span style={{ display: "inline-flex", flexDirection: "column", textAlign: "right" }}>
          <span className="num" style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{fmtInt(stats.received)}</span>
          <span style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>checked</span>
        </span>
      ) : <span />}
      {stats.rate != null ? (
        <span style={{ display: "inline-flex", flexDirection: "column", textAlign: "right", minWidth: 56 }}>
          <span className="num" style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-text)" }}>{fmtPct(stats.rate)}</span>
          <span style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>rej rate</span>
        </span>
      ) : <Icon name="arrow-right" size={14} />}
    </button>
  );
}

function SimpleRow({ label, tag, onOpen }: { label: string; tag: string; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "10px 14px",
        borderRadius: "var(--radius-md)",
        border: "1px dashed var(--border-strong)",
        background: "var(--surface-2)",
        cursor: "pointer",
      }}
    >
      <span className="num" style={{ fontSize: 12, color: "var(--text-2)" }}>{label}</span>
      <Tag tone="muted">{tag}</Tag>
    </button>
  );
}
