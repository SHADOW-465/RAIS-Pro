"use client";

// Floating Sources / Scope panel — three columns, content driven by channel pick.
//
//   Col 1  Channels (Excel · Data entry)     — always
//   Col 2  Sections → stations               — process scope
//   Col 3  Narrow by                         — batches and/or Excel files
//          · Excel only  → tabs: Batches | Excel files
//          · Entry only  → batches
//          · Both        → tabs: Batches | Excel files
//
// Empty batch / file lists = full plant / all uploads. Filters apply immediately.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTweaks } from "@/components/editorial/TweaksContext";
import DatePicker from "@/components/ui/DatePicker";
import Select from "@/components/ui/Select";
import {
  countBySourceChannel,
  describeActiveScope,
  isPlantDefaultTweaks,
  listBatchIds,
  listExcelSourceFiles,
  resolveScope,
  scopeEvents,
  sourcesNarrowMode,
  STAGE_CATEGORIES,
  DEFAULT_STAGE_CATEGORIES,
} from "@/lib/analytics/scope";
import {
  STAGES,
  STAGE_CATEGORY,
  type StageCategory,
} from "@/core/ontology/plant-catalog";
import type { Event } from "@/lib/store/types";

const EXCLUDED_ASSEMBLY_STAGES = new Set(["valve-fixing", "primary-pack-inspection"]);
const ASSEMBLY_STAGES = STAGES.filter(
  (s) => s.category === "assembly" && !EXCLUDED_ASSEMBLY_STAGES.has(s.stageId),
);

type NarrowTab = "batches" | "files";

export default function SourcesScopePanel({
  events,
  onClose,
}: {
  events: Event[];
  onClose: () => void;
}) {
  const { t, setTweak } = useTweaks();
  const [batchSearch, setBatchSearch] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [openAssemblyStages, setOpenAssemblyStages] = useState(
    () => !!(t.stageView && t.stageView !== "cumulative" && STAGE_CATEGORY[t.stageView] === "assembly"),
  );

  const excelOn = t.includeExcel;
  const entryOn = t.includeDirectEntry;
  const bothChannels = excelOn && entryOn;
  const onlyExcel = excelOn && !entryOn;
  const onlyEntry = entryOn && !excelOn;
  const noChannel = !excelOn && !entryOn;

  const [narrowTab, setNarrowTab] = useState<NarrowTab>(() =>
    t.batchIds.length > 0 ? "batches" : t.excelFiles.length > 0 ? "files" : "batches",
  );

  useEffect(() => {
    // Excel-only used to force the Files tab, which hid batch-wise analysis
    // even though Excel rows carry lot codes. Keep Files as the default when
    // nothing is batch-focused; never steal an active batch selection.
    if (onlyEntry) setNarrowTab("batches");
    else if (onlyExcel && t.batchIds.length === 0) setNarrowTab("files");
  }, [onlyExcel, onlyEntry, t.batchIds.length]);

  const excelFiles = useMemo(() => listExcelSourceFiles(events), [events]);
  const batchOptions = useMemo(() => {
    // Same lot set the KPIs will actually compute: channels + sections +
    // date window. "All data" no longer date-clips, so early lots (26H01-14)
    // stay pickable and batch-wise analysis is non-empty.
    const scope = resolveScope(events, {
      grain: t.grain,
      datePreset: t.datePreset,
      dateFrom: t.dateFrom,
      dateTo: t.dateTo,
      includeExcel: t.includeExcel,
      includeDirectEntry: t.includeDirectEntry,
      excelFiles: t.excelFiles,
      batchIds: [],
      stageCategories: t.stageCategories,
      stageView: t.stageView,
    });
    return listBatchIds(scopeEvents(events, scope));
  }, [
    events,
    t.grain,
    t.datePreset,
    t.dateFrom,
    t.dateTo,
    t.includeExcel,
    t.includeDirectEntry,
    t.excelFiles,
    t.stageCategories,
    t.stageView,
  ]);
  const sourceCounts = useMemo(() => countBySourceChannel(events), [events]);
  const sectionCounts = useMemo(() => {
    const n: Record<string, number> = {};
    for (const e of events) {
      const stage = "stageId" in e ? (e.stageId as string) : null;
      const cat = stage ? STAGE_CATEGORY[stage] : undefined;
      if (cat) n[cat] = (n[cat] ?? 0) + 1;
    }
    return n;
  }, [events]);

  const filteredBatches = useMemo(() => {
    const q = batchSearch.trim().toUpperCase();
    if (!q) return batchOptions;
    return batchOptions.filter((b) => b.includes(q));
  }, [batchOptions, batchSearch]);

  useEffect(() => {
    if (t.batchIds.length === 0) return;
    const allowed = new Set(batchOptions);
    const next = t.batchIds.filter((b) => allowed.has(b));
    if (next.length !== t.batchIds.length) setTweak("batchIds", next);
  }, [batchOptions, t.batchIds, setTweak]);

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return excelFiles;
    return excelFiles.filter((f) => f.toLowerCase().includes(q));
  }, [excelFiles, fileSearch]);

  const summary = useMemo(() => describeActiveScope(t), [t]);
  const isDefault = useMemo(() => isPlantDefaultTweaks(t), [t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function resetAll() {
    setTweak("includeExcel", true);
    setTweak("includeDirectEntry", true);
    setTweak("excelFiles", []);
    setTweak("batchIds", []);
    setTweak("stageCategories", [...DEFAULT_STAGE_CATEGORIES]);
    setTweak("stageView", "cumulative");
    setBatchSearch("");
    setFileSearch("");
    setOpenAssemblyStages(false);
    setNarrowTab("batches");
  }

  function toggleBatch(b: string) {
    if (t.batchIds.includes(b)) {
      setTweak("batchIds", t.batchIds.filter((x) => x !== b));
    } else {
      setTweak("batchIds", [...t.batchIds, b]);
    }
  }

  function clearBatches() {
    setTweak("batchIds", []);
  }

  function toggleFile(f: string) {
    if (t.excelFiles.length === 0) {
      setTweak("excelFiles", excelFiles.filter((x) => x !== f));
    } else if (t.excelFiles.includes(f)) {
      setTweak("excelFiles", t.excelFiles.filter((x) => x !== f));
    } else {
      const next = [...t.excelFiles, f];
      setTweak("excelFiles", next.length === excelFiles.length ? [] : next);
    }
  }

  function toggleSection(id: StageCategory) {
    const on = t.stageCategories.includes(id);
    if (on) {
      const next = t.stageCategories.filter((x) => x !== id);
      setTweak("stageCategories", next);
      // Pinned station in View must belong to an enabled section — clear if not.
      if (
        t.stageView !== "cumulative" &&
        STAGE_CATEGORY[t.stageView] === id
      ) {
        setTweak("stageView", "cumulative");
      }
    } else {
      setTweak("stageCategories", [...t.stageCategories, id]);
      if (id === "assembly") setOpenAssemblyStages(true);
    }
  }

  function pinAssemblyStage(stageId: string | "cumulative") {
    setTweak("stageView", stageId);
    if (!t.stageCategories.includes("assembly")) {
      setTweak("stageCategories", [...t.stageCategories, "assembly"]);
    }
  }

  const batchCount = t.batchIds.length;
  const filesActive = t.excelFiles.length > 0;

  const col3Mode = sourcesNarrowMode(excelOn, entryOn);

  const activeNarrow: NarrowTab =
    col3Mode === "batches" ? "batches" : narrowTab;

  // Column “live” state for step color hierarchy
  const col1Live = true;
  const col2Live = !noChannel;
  const col3Live = col3Mode !== "empty";

  return (
    <div
      className="no-print sources-scope-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sources-scope-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "color-mix(in srgb, var(--ink, #0a0a0a) 42%, transparent)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "max(16px, 2vh) max(12px, 2vw)",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <style>{scopePanelCss}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="sources-scope-card"
        style={{
          width: "min(920px, 96vw)",
          height: "min(74vh, 660px)",
          maxHeight: "92vh",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 16,
          boxShadow: "var(--shadow-3), 0 0 0 1px color-mix(in srgb, var(--accent) 8%, transparent)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "16px 20px 14px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
            background: "linear-gradient(180deg, var(--surface) 0%, color-mix(in srgb, var(--accent-weak) 55%, var(--surface)) 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                id="sources-scope-title"
                style={{
                  margin: 0,
                  fontWeight: 700,
                  fontSize: 17,
                  letterSpacing: "-0.02em",
                  fontFamily: "var(--font-display)",
                  color: "var(--text)",
                  lineHeight: 1.2,
                }}
              >
                Sources &amp; batches
              </h2>
              <p
                className="muted"
                style={{ fontSize: 13, margin: "4px 0 0", lineHeight: 1.45, maxWidth: 52 * 8 }}
              >
                Channels → sections → narrow. Changes hit every analytics screen immediately.
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="sources-icon-btn" style={iconClose}>
              ×
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
            <div
              key={summary}
              className="sources-active-pill"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                background: isDefault ? "var(--surface)" : "var(--accent-weak)",
                border: `1px solid ${
                  isDefault
                    ? "var(--border-strong)"
                    : "color-mix(in srgb, var(--accent) 40%, var(--border))"
                }`,
                fontSize: 12.5,
                fontWeight: 600,
                color: isDefault ? "var(--text-2)" : "var(--accent-text)",
                maxWidth: "100%",
                boxShadow: isDefault ? "none" : "0 1px 0 color-mix(in srgb, var(--accent) 12%, transparent)",
              }}
              title={summary}
            >
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: isDefault ? "var(--positive)" : "var(--accent)",
                  flexShrink: 0,
                  boxShadow: isDefault
                    ? "0 0 0 3px color-mix(in srgb, var(--positive) 22%, transparent)"
                    : "0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)",
                }}
              />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {summary}
              </span>
            </div>

            <div style={{ marginLeft: "auto", flexShrink: 0 }}>
              <CustomRangePill batchCount={batchOptions.length} />
            </div>
          </div>
        </header>

        {/* Body: 3 columns */}
        <div className="sources-scope-grid" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* COL 1 */}
          <section className="sources-col" style={{ background: "var(--surface-2)" }}>
            <ColHeader step={1} live={col1Live} title="Channels" sub="What can feed analytics" />
            <div className="sources-col-scroll">
              <SelectableRow
                checked={t.includeExcel}
                onChange={(on) => {
                  setTweak("includeExcel", on);
                  if (!on) setTweak("excelFiles", []);
                }}
                title="Excel uploads"
                sub="Staging workbooks"
                count={sourceCounts.excel}
              />
              <div style={{ height: 8 }} />
              <SelectableRow
                checked={t.includeDirectEntry}
                onChange={(on) => setTweak("includeDirectEntry", on)}
                title="Data entry"
                sub="Batch matrix / manual"
                count={sourceCounts.directEntry}
              />
              <p className="sources-hint">
                {bothChannels && "Both on — pick sections, then batches or files."}
                {onlyExcel && "Excel only — sections, then batches or files on the right."}
                {onlyEntry && "Data entry only — sections, then batches on the right."}
                {noChannel && "Turn on at least one channel to continue."}
              </p>
            </div>
          </section>

          {/* COL 2 */}
          <section className="sources-col">
            <ColHeader
              step={2}
              live={col2Live}
              title="Sections"
              sub={noChannel ? "Waiting for a channel" : "Shop-floor process"}
            />
            <div className="sources-col-scroll">
              {noChannel ? (
                <EmptyState>Enable Excel or Data entry first.</EmptyState>
              ) : (
                STAGE_CATEGORIES.map((c) => {
                  const on = t.stageCategories.includes(c.id);
                  const isAssembly = c.id === "assembly";
                  return (
                    <div key={c.id} style={{ marginBottom: 8 }}>
                      <SelectableRow
                        checked={on}
                        onChange={() => toggleSection(c.id)}
                        title={c.label}
                        sub={
                          c.id === "assembly"
                            ? "Visual · Balloon · Valve · Final"
                            : c.id === "primary"
                              ? "Dipping → Trimming"
                              : "P10–P14, qty only"
                        }
                        count={sectionCounts[c.id] ?? 0}
                        trailing={
                          isAssembly && on ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenAssemblyStages((v) => !v);
                              }}
                              aria-expanded={openAssemblyStages}
                              title={openAssemblyStages ? "Hide stations" : "Show stations"}
                              className="sources-icon-btn"
                              style={chevronBtn}
                            >
                              {openAssemblyStages ? "▾" : "▸"}
                            </button>
                          ) : undefined
                        }
                      />
                      {isAssembly && on && openAssemblyStages && (
                        <div className="sources-station-nest">
                          <div className="sources-hint" style={{ margin: "0 0 6px", paddingTop: 0, border: "none" }}>
                            Optional station pin
                          </div>
                          <StagePick
                            active={!t.stageView || t.stageView === "cumulative"}
                            label="All assembly stations"
                            onClick={() => pinAssemblyStage("cumulative")}
                          />
                          {ASSEMBLY_STAGES.map((s) => (
                            <StagePick
                              key={s.stageId}
                              active={t.stageView === s.stageId}
                              label={s.label}
                              onClick={() => pinAssemblyStage(s.stageId)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* COL 3 */}
          <section className="sources-col sources-col-last">
            <div style={{ ...colHeader, paddingBottom: col3Mode === "tabs" ? 10 : 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <StepBadge n={3} live={col3Live} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>Narrow</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 1, lineHeight: 1.35 }}>
                    {col3Mode === "empty" && "Waiting for channels"}
                    {col3Mode === "batches" && (batchCount === 0 ? "Full plant · every batch" : `${batchCount} batch${batchCount === 1 ? "" : "es"} focused`)}
                    {col3Mode === "tabs" &&
                      (activeNarrow === "files"
                        ? filesActive
                          ? `${t.excelFiles.length} upload${t.excelFiles.length === 1 ? "" : "s"}`
                          : "All Excel uploads"
                        : batchCount === 0
                          ? "Batches or Excel files"
                          : `${batchCount} batch${batchCount === 1 ? "" : "es"} focused`)}
                  </div>
                </div>
              </div>

              {col3Mode === "tabs" && (
                <div className="sources-tabs" role="tablist" aria-label="Narrow by">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeNarrow === "batches"}
                    onClick={() => setNarrowTab("batches")}
                    className="sources-tab"
                    data-active={activeNarrow === "batches" ? "true" : "false"}
                  >
                    Batches
                    {batchCount > 0 ? (
                      <span className="sources-tab-count">{batchCount}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeNarrow === "files"}
                    onClick={() => setNarrowTab("files")}
                    className="sources-tab"
                    data-active={activeNarrow === "files" ? "true" : "false"}
                  >
                    Excel
                    {filesActive ? (
                      <span className="sources-tab-count">{t.excelFiles.length}</span>
                    ) : null}
                  </button>
                </div>
              )}
            </div>

            <div className="sources-col-scroll">
              {col3Mode === "empty" && (
                <EmptyState>Turn on Excel and/or Data entry to narrow here.</EmptyState>
              )}

              {(col3Mode === "batches" || (col3Mode === "tabs" && activeNarrow === "batches")) && (
                <BatchesPane
                  batchOptions={batchOptions}
                  filteredBatches={filteredBatches}
                  batchSearch={batchSearch}
                  setBatchSearch={setBatchSearch}
                  batchCount={batchCount}
                  selectedIds={t.batchIds}
                  onToggle={toggleBatch}
                  onClear={clearBatches}
                />
              )}

              {col3Mode === "tabs" && activeNarrow === "files" && (
                <FilesPane
                  excelFiles={excelFiles}
                  filteredFiles={filteredFiles}
                  fileSearch={fileSearch}
                  setFileSearch={setFileSearch}
                  filesActive={filesActive}
                  selectedFiles={t.excelFiles}
                  onToggle={toggleFile}
                  onClearAll={() => setTweak("excelFiles", [])}
                />
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={resetAll}
            disabled={isDefault}
            className="sources-ghost-btn"
            style={{
              ...ghostBtn,
              opacity: isDefault ? 0.45 : 1,
              cursor: isDefault ? "default" : "pointer",
            }}
          >
            Plant default
          </button>
          <button type="button" onClick={onClose} className="sources-primary-btn" style={primaryBtn}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

function ColHeader({
  step,
  live,
  title,
  sub,
}: {
  step: number;
  live: boolean;
  title: string;
  sub: string;
}) {
  return (
    <div style={colHeader}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StepBadge n={step} live={live} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{title}</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 1, lineHeight: 1.35 }}>
            {sub}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepBadge({ n, live }: { n: number; live: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        fontFamily: "var(--font-mono)",
        flexShrink: 0,
        background: live ? "var(--accent)" : "var(--surface-3)",
        color: live ? "var(--text-invert)" : "var(--text-3)",
        transition: "background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
      }}
    >
      {n}
    </span>
  );
}

function SelectableRow({
  checked,
  onChange,
  title,
  sub,
  count,
  trailing,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  title: string;
  sub: string;
  count: number;
  trailing?: React.ReactNode;
}) {
  return (
    <label
      className="sources-select-row"
      data-checked={checked ? "true" : "false"}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        border: checked
          ? "1px solid color-mix(in srgb, var(--accent) 45%, var(--border))"
          : "1px solid var(--border)",
        background: checked ? "var(--accent-weak)" : "var(--surface)",
        cursor: "pointer",
        fontSize: 13,
        transition:
          "background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3, accentColor: "var(--accent)" }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontWeight: 700,
            fontSize: 13,
            color: checked ? "var(--accent-text)" : "var(--text)",
          }}
        >
          {title}
        </span>
        <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.35 }}>
          {sub}
        </span>
      </span>
      <span
        style={{
          ...countBadge,
          background: checked
            ? "color-mix(in srgb, var(--accent) 14%, var(--surface))"
            : count > 0
              ? "var(--surface-2)"
              : "var(--surface-3)",
          color: checked ? "var(--accent-text)" : count > 0 ? "var(--text-2)" : "var(--text-3)",
        }}
      >
        {count}
      </span>
      {trailing}
    </label>
  );
}

function BatchesPane({
  batchOptions,
  filteredBatches,
  batchSearch,
  setBatchSearch,
  batchCount,
  selectedIds,
  onToggle,
  onClear,
}: {
  batchOptions: string[];
  filteredBatches: string[];
  batchSearch: string;
  setBatchSearch: (v: string) => void;
  batchCount: number;
  selectedIds: string[];
  onToggle: (b: string) => void;
  onClear: () => void;
}) {
  const [sortOrder, setSortOrder] = useState<"selected" | "asc" | "desc">("selected");

  const displayBatches = useMemo(() => {
    return [...filteredBatches].sort((a, b) => {
      if (sortOrder === "selected") {
        const sa = selectedIds.includes(a);
        const sb = selectedIds.includes(b);
        if (sa && !sb) return -1;
        if (!sa && sb) return 1;
      }
      if (sortOrder === "desc") return b.localeCompare(a);
      return a.localeCompare(b);
    });
  }, [filteredBatches, sortOrder, selectedIds]);

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {batchCount > 0 && (
          <button type="button" onClick={onClear} className="sources-chip-btn" style={chipBtn}>
            Full plant
          </button>
        )}
        <input
          type="search"
          value={batchSearch}
          onChange={(e) => setBatchSearch(e.target.value)}
          placeholder="Search batch…"
          aria-label="Search batches"
          className="sources-search"
          style={{ ...searchInput, flex: 1, minWidth: 120 }}
        />
        <Select
          value={sortOrder}
          onChange={(v) => setSortOrder(v as any)}
          options={[
            { value: "selected", label: "Sort: Selected first" },
            { value: "asc", label: "Sort: Batch A–Z" },
            { value: "desc", label: "Sort: Batch Z–A" },
          ]}
          variant="pill"
          size="sm"
          block={false}
          ariaLabel="Sort batch list"
        />
      </div>
      {batchOptions.length === 0 && (
        <EmptyState>No batch IDs yet — enter them in Data Entry or map them from Excel.</EmptyState>
      )}
      {batchOptions.length > 0 && displayBatches.length === 0 && (
        <EmptyState>No batches match “{batchSearch}”.</EmptyState>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
          gap: 8,
        }}
      >
        {displayBatches.map((b) => {
          const selected = selectedIds.includes(b);
          return (
            <button
              key={b}
              type="button"
              onClick={() => onToggle(b)}
              aria-pressed={selected}
              title={selected ? "Selected — click to deselect" : "Click to select"}
              className="sources-batch-tile"
              data-selected={selected ? "true" : "false"}
              style={{
                textAlign: "left",
                padding: "12px 12px",
                borderRadius: 10,
                border: selected
                  ? "1px solid color-mix(in srgb, var(--accent) 55%, var(--border))"
                  : "1px solid var(--border-strong)",
                background: selected ? "var(--accent-weak)" : "var(--surface)",
                color: selected ? "var(--accent-text)" : "var(--text)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              {b}
            </button>
          );
        })}
      </div>
    </>
  );
}

function FilesPane({
  excelFiles,
  filteredFiles,
  fileSearch,
  setFileSearch,
  filesActive,
  selectedFiles,
  onToggle,
  onClearAll,
}: {
  excelFiles: string[];
  filteredFiles: string[];
  fileSearch: string;
  setFileSearch: (v: string) => void;
  filesActive: boolean;
  selectedFiles: string[];
  onToggle: (f: string) => void;
  onClearAll: () => void;
}) {
  return (
    <>
      {excelFiles.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {filesActive && (
            <button type="button" onClick={onClearAll} className="sources-chip-btn" style={chipBtn}>
              All uploads
            </button>
          )}
          <input
            type="search"
            value={fileSearch}
            onChange={(e) => setFileSearch(e.target.value)}
            placeholder="Search file…"
            aria-label="Search Excel files"
            className="sources-search"
            style={searchInput}
          />
        </div>
      )}
      {excelFiles.length === 0 && (
        <EmptyState>No Excel-sourced events yet — import a workbook in Staging.</EmptyState>
      )}
      {excelFiles.length > 0 && filteredFiles.length === 0 && (
        <EmptyState>No files match “{fileSearch}”.</EmptyState>
      )}
      {filteredFiles.map((f) => {
        const checked = !filesActive || selectedFiles.includes(f);
        return (
          <label
            key={f}
            className="sources-file-row"
            data-checked={checked ? "true" : "false"}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              marginBottom: 6,
              borderRadius: 10,
              border: checked
                ? "1px solid color-mix(in srgb, var(--accent) 28%, var(--border))"
                : "1px solid var(--border)",
              background: checked ? "var(--accent-weak)" : "var(--surface-2)",
              opacity: checked ? 1 : 0.7,
              cursor: "pointer",
              lineHeight: 1.35,
              transition:
                "background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out)",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              style={{ marginTop: 2, accentColor: "var(--accent)" }}
              onChange={() => onToggle(f)}
            />
            <span
              style={{
                fontSize: 12.5,
                wordBreak: "break-word",
                fontWeight: 600,
                color: checked ? "var(--text)" : "var(--text-2)",
              }}
            >
              {f}
            </span>
          </label>
        );
      })}
    </>
  );
}

function StagePick({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="sources-stage-pick"
      data-active={active ? "true" : "false"}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        marginBottom: 3,
        borderRadius: 8,
        border: active
          ? "1px solid color-mix(in srgb, var(--accent) 40%, var(--border))"
          : "1px solid transparent",
        background: active ? "var(--accent-weak)" : "transparent",
        color: active ? "var(--accent-text)" : "var(--text-2)",
        fontWeight: active ? 700 : 500,
        fontSize: 12.5,
        cursor: "pointer",
        fontFamily: "inherit",
        transition:
          "background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
      }}
    >
      {label}
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.5,
        padding: "28px 16px",
        textAlign: "center",
        color: "var(--text-3)",
        background: "var(--surface-2)",
        borderRadius: 12,
        border: "1px dashed var(--border-strong)",
      }}
    >
      {children}
    </div>
  );
}

/* ── base style objects ──────────────────────────────────────────────────── */

const colHeader: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid var(--border)",
  flexShrink: 0,
  background: "var(--surface)",
};

const countBadge: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  padding: "3px 7px",
  borderRadius: 6,
  flexShrink: 0,
};

const chevronBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  cursor: "pointer",
  color: "var(--text-2)",
  fontSize: 12,
  padding: 0,
  width: 28,
  height: 28,
  borderRadius: 8,
  fontFamily: "inherit",
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const chipBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: "6px 12px",
  background: "var(--surface)",
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
  flexShrink: 0,
  whiteSpace: "nowrap",
};

const searchInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 12.5,
  padding: "7px 11px",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "var(--font-mono)",
  outline: "none",
};

const iconClose: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
  color: "var(--text-2)",
  flexShrink: 0,
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const ghostBtn: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: 9,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  fontFamily: "inherit",
  fontWeight: 600,
  fontSize: 13,
  color: "var(--text-2)",
};

const primaryBtn: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 9,
  border: "none",
  background: "var(--accent)",
  color: "var(--text-invert, #fff)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 13,
};

/** Scoped CSS for layout grid, hover/focus delight, reduced motion */
const scopePanelCss = `
.sources-scope-grid {
  display: grid;
  grid-template-columns: minmax(190px, 220px) minmax(0, 1fr) minmax(0, 1.15fr);
  min-height: 0;
  flex: 1;
}
.sources-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: var(--bg);
}
.sources-col-last { border-right: none; }
.sources-col-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: 12px 14px 16px;
}
.sources-hint {
  font-size: 11.5px;
  line-height: 1.45;
  margin: 16px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  color: var(--text-3);
}
.sources-station-nest {
  margin: 8px 0 0;
  padding: 8px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.sources-tabs {
  display: flex;
  gap: 4px;
  margin-top: 12px;
  padding: 3px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.sources-tab {
  flex: 1;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 8px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.sources-tab[data-active="true"] {
  background: var(--surface);
  color: var(--accent-text);
  box-shadow: var(--shadow-1);
}
.sources-tab-count {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent-text);
}
.sources-batch-tile {
  transition: transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}
.sources-batch-tile:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-2);
}
.sources-batch-tile[data-selected="true"] {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent);
}
.sources-batch-tile:active {
  transform: translateY(0);
}
.sources-primary-btn {
  transition: background var(--duration-fast) var(--ease-out), transform 80ms var(--ease-out);
}
.sources-primary-btn:hover {
  background: var(--accent-hover) !important;
}
.sources-primary-btn:active {
  transform: translateY(1px);
}
.sources-ghost-btn:hover:not(:disabled),
.sources-chip-btn:hover,
.sources-icon-btn:hover {
  border-color: var(--border-strong);
  background: var(--surface-2) !important;
}
.sources-search:focus-visible,
.sources-select-row:focus-within,
.sources-batch-tile:focus-visible,
.sources-stage-pick:focus-visible,
.sources-tab:focus-visible,
.sources-primary-btn:focus-visible,
.sources-ghost-btn:focus-visible,
.sources-chip-btn:focus-visible,
.sources-icon-btn:focus-visible,
.sources-file-row:focus-within {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.sources-active-pill {
  animation: sources-pill-in var(--duration-medium) var(--ease-out);
}
@keyframes sources-pill-in {
  from { opacity: 0.55; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 760px) {
  .sources-scope-grid {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .sources-col {
    border-right: none;
    border-bottom: 1px solid var(--border);
    max-height: none;
  }
  .sources-col-scroll {
    max-height: 240px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sources-batch-tile,
  .sources-tab,
  .sources-primary-btn,
  .sources-select-row,
  .sources-file-row,
  .sources-stage-pick,
  .sources-active-pill {
    transition: none !important;
    animation: none !important;
  }
  .sources-batch-tile:hover {
    transform: none;
  }
}
`;

function CustomRangePill({ batchCount }: { batchCount: number }) {
  const { t, setTweak } = useTweaks();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hasRange = !!(t.dateFrom || t.dateTo || (t.datePreset && t.datePreset !== "all"));

  const label = useMemo(() => {
    if (t.dateFrom && t.dateTo) {
      const fmt = (iso: string) => {
        const d = new Date(iso + "T00:00:00");
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      };
      return `${fmt(t.dateFrom)} – ${fmt(t.dateTo)}`;
    }
    if (t.dateFrom) return `From ${t.dateFrom}`;
    if (t.dateTo) return `Until ${t.dateTo}`;
    if (t.datePreset === "last-90-days") return "Last 90d";
    if (t.datePreset === "last-12-months") return "Last 12m";
    if (t.datePreset === "this-fy") return "This FY";
    return "Custom range";
  }, [t.dateFrom, t.dateTo, t.datePreset]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("click", onClickOutside);
    return () => window.removeEventListener("click", onClickOutside);
  }, [open]);

  return (
    <div ref={popoverRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${label}, ${batchCount} batch${batchCount === 1 ? "" : "es"}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 11px",
          borderRadius: 999,
          border: `1px solid ${hasRange ? "color-mix(in srgb, var(--accent) 45%, var(--border))" : "var(--border-strong)"}`,
          background: hasRange ? "var(--accent-weak)" : "var(--surface-2)",
          color: hasRange ? "var(--accent-text, var(--accent))" : "var(--text)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.15s ease",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>{label}</span>
        <span
          aria-label={`${batchCount} batch${batchCount === 1 ? "" : "es"}`}
          title={`${batchCount} batch${batchCount === 1 ? "" : "es"} in this range`}
          style={{
            display: "inline-flex",
            alignItems: "baseline",
            gap: 4,
            marginLeft: 2,
            padding: "1px 7px",
            borderRadius: 999,
            background: hasRange
              ? "color-mix(in srgb, var(--accent) 18%, transparent)"
              : "var(--surface)",
            border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--border))",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.4,
          }}
        >
          {batchCount}
          <span style={{ fontFamily: "inherit", fontSize: 9.5, fontWeight: 600, opacity: 0.78, letterSpacing: "0.02em" }}>
            {batchCount === 1 ? "batch" : "batches"}
          </span>
        </span>
        <span style={{ fontSize: 9, opacity: 0.7, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 350,
            width: 250,
            padding: 12,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-3)" }}>
              Custom Range
            </span>
            {hasRange && (
              <button
                type="button"
                onClick={() => {
                  setTweak("datePreset", "all");
                  setTweak("dateFrom", "");
                  setTweak("dateTo", "");
                }}
                style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                Reset
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", width: 34 }}>From</span>
              <DatePicker
                value={t.dateFrom || ""}
                onChange={(d) => {
                  setTweak("dateFrom", d);
                  if (t.dateTo) setTweak("datePreset", "custom");
                }}
                ariaLabel="Scope from date"
                size="sm"
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", width: 34 }}>To</span>
              <DatePicker
                value={t.dateTo || ""}
                onChange={(d) => {
                  setTweak("dateTo", d);
                  if (t.dateFrom) setTweak("datePreset", "custom");
                }}
                ariaLabel="Scope to date"
                size="sm"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              marginTop: 2,
              padding: "5px 12px",
              borderRadius: 6,
              background: "var(--accent)",
              color: "var(--text-invert, #fff)",
              fontSize: 11.5,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
