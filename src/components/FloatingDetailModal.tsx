"use client";

import React, { useState, useRef, useLayoutEffect, useCallback, useEffect, useMemo } from "react";
import Icon from "@/components/editorial/Icon";
import type { RawSheet } from "@/types/dashboard";
import {
  type SourceRow,
  type SourceMetricKind,
  type SourceGroupMode,
  type SourcePeriodGrain,
  type SourceTraceFilters,
  type SourceKind,
  normalizeSourceRows,
  filterSourceRows,
  groupSourceRows,
  summarizeSource,
  defaultGroupMode,
  defaultSourceFilters,
  stageOptionsFromRows,
  sizeOptionsFromRows,
  fileBasename,
  kindLabel,
  DETAIL_PAGE_SIZE,
} from "@/lib/analytics/source-trace";

export type { SourceRow, SourceMetricKind };

interface FloatingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  insight: string | string[];
  children: React.ReactNode;
  primaryValue?: string;
  sourceRows?: SourceRow[];
  rawSheets?: RawSheet[];
  originRect?: DOMRect | null;
  /** Drives default group mode + contribution ranking (Phase B). */
  metricKind?: SourceMetricKind;
  /** Period grouping grain when mode = period. */
  periodGrain?: SourcePeriodGrain;
}

interface Beam { x1: number; y1: number; x2: number; y2: number; key: string }

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:$|[T ])/;

function DateCell({ value }: { value: unknown }) {
  const s = String(value ?? "");
  if (!ISO_DATE.test(s)) return <>{s}</>;
  const i = s.indexOf("-");
  return (
    <>
      <span style={{ display: "block" }}>{s.slice(0, i + 1)}</span>
      <span style={{ display: "block" }}>{s.slice(i + 1)}</span>
    </>
  );
}

function colIndexToLabel(idx: number): string {
  let label = "";
  let temp = idx;
  while (temp >= 0) {
    label = String.fromCharCode((temp % 26) + 65) + label;
    temp = Math.floor(temp / 26) - 1;
  }
  return label;
}

const A1_REF = /^(.+)!([A-Z]+)(\d+)$/;
function parseRef(cell: string): { sheet: string; col: string; row: number } | null {
  const m = A1_REF.exec(cell);
  return m ? { sheet: m[1].trim().toLowerCase(), col: m[2], row: Number(m[3]) } : null;
}

function rawSheetMatches(raw: { name: string; fileName: string }, bareSheet: string): boolean {
  const bare = raw.name.startsWith(`${raw.fileName} - `)
    ? raw.name.slice(raw.fileName.length + 3)
    : raw.name;
  return bare.trim().toLowerCase() === bareSheet.trim().toLowerCase();
}

const GROUP_MODES: { id: SourceGroupMode; label: string }[] = [
  { id: "stage", label: "By stage" },
  { id: "period", label: "By period" },
  { id: "file", label: "By file" },
  { id: "type", label: "By type" },
  { id: "size", label: "By size" },
  { id: "defect", label: "By defect" },
  { id: "flat", label: "Flat" },
];

export default function FloatingDetailModal({
  isOpen,
  onClose,
  title,
  insight,
  children,
  primaryValue,
  sourceRows,
  rawSheets,
  originRect,
  metricKind = "generic",
  periodGrain = "month",
}: FloatingDetailModalProps) {
  const [showSource, setShowSource] = useState(false);
  const [isInsightExpanded, setIsInsightExpanded] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [beams, setBeams] = useState<Beam[]>([]);

  const [groupMode, setGroupMode] = useState<SourceGroupMode>(() => defaultGroupMode(metricKind));
  const [filters, setFilters] = useState<SourceTraceFilters>(defaultSourceFilters);
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(0);
  const [sourceSurface, setSourceSurface] = useState<"classified" | "spreadsheet">("classified");

  const [fetchedRawSheets] = useState<RawSheet[]>([]);
  const allRawSheets = useMemo(() => [...(rawSheets ?? []), ...fetchedRawSheets], [rawSheets, fetchedRawSheets]);

  // FLIP open
  useEffect(() => {
    if (isOpen && originRect && panelRef.current) {
      const panel = panelRef.current;
      const targetRect = panel.getBoundingClientRect();
      const scaleX = originRect.width / targetRect.width;
      const scaleY = originRect.height / targetRect.height;
      const transX = originRect.left - targetRect.left;
      const transY = originRect.top - targetRect.top;
      panel.animate(
        [
          {
            transform: `translate(${transX}px, ${transY}px) scale(${scaleX}, ${scaleY})`,
            transformOrigin: "top left",
            opacity: 0,
            borderRadius: "var(--radius-lg)",
          },
          {
            transform: `translate(0, 0) scale(1)`,
            transformOrigin: "top left",
            opacity: 1,
            borderRadius: "var(--radius-lg)",
          },
        ],
        { duration: 500, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "forwards" },
      );
    }
  }, [isOpen, originRect]);

  const normalizedAll = useMemo(
    () => normalizeSourceRows(sourceRows ?? []),
    [sourceRows],
  );

  const filteredRows = useMemo(
    () => filterSourceRows(normalizedAll, filters),
    [normalizedAll, filters],
  );

  const summary = useMemo(
    () => summarizeSource(filteredRows, metricKind),
    [filteredRows, metricKind],
  );

  const groups = useMemo(
    () => groupSourceRows(filteredRows, groupMode, { grain: periodGrain, metricKind }),
    [filteredRows, groupMode, periodGrain, metricKind],
  );

  const stageOpts = useMemo(() => stageOptionsFromRows(normalizedAll), [normalizedAll]);
  const sizeOpts = useMemo(() => sizeOptionsFromRows(normalizedAll), [normalizedAll]);

  // Reset classification when modal opens for a new metric
  useEffect(() => {
    if (!isOpen) {
      setShowSource(false);
      setFilters(defaultSourceFilters());
      setSourceSurface("classified");
      setDetailPage(0);
      return;
    }
    const mode = defaultGroupMode(metricKind);
    setGroupMode(mode);
    setFilters(defaultSourceFilters());
    setDetailPage(0);
  }, [isOpen, metricKind, title]);

  // Auto-open top contributor group when source opens or mode/filters change
  useEffect(() => {
    if (!showSource) return;
    if (groups.length === 0) {
      setOpenGroupKey(null);
      return;
    }
    setOpenGroupKey((cur) => {
      if (cur && groups.some((g) => g.key === cur)) return cur;
      return groups[0].key;
    });
    setDetailPage(0);
  }, [showSource, groups, groupMode]);

  const openGroup = useMemo(
    () => groups.find((g) => g.key === openGroupKey) ?? null,
    [groups, openGroupKey],
  );

  const detailRows = openGroup?.rows ?? [];
  const detailTotalPages = Math.max(1, Math.ceil(detailRows.length / DETAIL_PAGE_SIZE));
  const detailSlice = detailRows.slice(
    detailPage * DETAIL_PAGE_SIZE,
    (detailPage + 1) * DETAIL_PAGE_SIZE,
  );

  const contributingSheets = useMemo(() => {
    const sheets = new Set<string>();
    filteredRows.forEach((r) => {
      if (r.sheet) sheets.add(r.sheet);
    });
    return Array.from(sheets);
  }, [filteredRows]);

  const activeRawSheets = useMemo(() => {
    if (allRawSheets.length === 0 || contributingSheets.length === 0) return [];
    return allRawSheets.filter((s) => contributingSheets.some((cs) => rawSheetMatches(s, cs)));
  }, [allRawSheets, contributingSheets]);

  const sheetLabel = useCallback(
    (s: RawSheet) => {
      const stem = s.name.split(" - ").slice(-1)[0];
      const collisions = activeRawSheets.filter((x) => x.name.split(" - ").slice(-1)[0] === stem).length;
      return collisions > 1 ? `${stem} — ${s.fileName}` : stem;
    },
    [activeRawSheets],
  );

  const [activeTab, setActiveTab] = useState("");
  useEffect(() => {
    if (activeRawSheets.length > 0) setActiveTab(activeRawSheets[0].name);
    else setActiveTab("");
  }, [activeRawSheets]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  const hasSource = normalizedAll.length > 0;
  const excelCount = useMemo(() => normalizedAll.filter((r) => !r.isDirect).length, [normalizedAll]);
  const manualCount = useMemo(() => normalizedAll.filter((r) => r.isDirect).length, [normalizedAll]);

  // Bezier beams: one smooth S-curve from the computed-value anchor to each
  // on-screen source target. Spreadsheet surface points at highlighted Excel
  // cells; the classified surface points at the open group's detail rows.
  const computeBeams = useCallback(() => {
    if (!showSource || !containerRef.current || !anchorRef.current) {
      setBeams([]);
      return;
    }
    const base = containerRef.current.getBoundingClientRect();
    const a = anchorRef.current.getBoundingClientRect();
    const fromX = a.right - base.left;
    const fromY = a.top + a.height / 2 - base.top;
    const scroll = tableScrollRef.current?.getBoundingClientRect();
    const next: Beam[] = [];
    const push = (el: Element, key: string) => {
      if (next.length >= 15) return; // keep it clean
      const r = el.getBoundingClientRect();
      const midY = r.top + r.height / 2;
      // Clip beams whose target is scrolled out of the source table viewport.
      if (scroll && (midY < scroll.top || midY > scroll.bottom)) return;
      next.push({ key: `b-${key}`, x1: fromX, y1: fromY, x2: r.left - base.left, y2: midY - base.top });
    };
    if (sourceSurface === "spreadsheet") {
      cellRefs.current.forEach((el, key) => push(el, key));
    } else {
      rowRefs.current.forEach((el, i) => push(el, String(i)));
    }
    setBeams(next);
  }, [showSource, sourceSurface, activeTab]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(computeBeams);
    return () => cancelAnimationFrame(id);
  }, [isOpen, showSource, computeBeams, activeTab, sourceSurface, detailSlice.length, openGroupKey, detailPage]);

  useEffect(() => {
    if (!showSource) return;
    let raf = 0;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(computeBeams);
    };
    const scroller = tableScrollRef.current;
    scroller?.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
    return () => {
      cancelAnimationFrame(raf);
      scroller?.removeEventListener("scroll", handler);
      window.removeEventListener("resize", handler);
    };
  }, [showSource, computeBeams, activeTab, sourceSurface, openGroupKey]);

  useEffect(() => {
    cellRefs.current.clear();
  }, [activeTab]);

  const insights = Array.isArray(insight) ? insight : [insight];

  const setFilter = <K extends keyof SourceTraceFilters>(key: K, value: SourceTraceFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setDetailPage(0);
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(10, 9, 8, 0.88)",
        backdropFilter: "blur(20px)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 24,
        opacity: isOpen ? 1 : 0,
        visibility: isOpen ? "visible" : "hidden",
        transition:
          "opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.45s cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="modal-panel"
        style={{
          width: "95vw",
          maxWidth: showSource ? 1720 : 1440,
          height: "92vh",
          background: "var(--bg)",
          border: "1.5px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 30px 60px -15px rgba(0,0,0,0.65)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "92vh",
          overflow: "hidden",
          opacity: isOpen && !originRect ? 1 : originRect ? undefined : 0,
          transform:
            isOpen && !originRect
              ? "translateY(0) scale(1)"
              : originRect
                ? undefined
                : "translateY(24px) scale(0.985)",
          transition: originRect
            ? "max-width var(--duration-medium) var(--ease-out)"
            : "max-width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            padding: "20px 28px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                background: "var(--accent)",
                color: "var(--text-invert)",
                padding: "2px 6px",
                borderRadius: 4,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              RAIS
            </span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 800,
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {hasSource && (
              <button
                type="button"
                onClick={() => setShowSource((s) => !s)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 18px",
                  borderRadius: "9999px",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: `1.5px solid ${showSource ? "var(--accent)" : "var(--border-strong)"}`,
                  background: showSource ? "var(--accent)" : "var(--surface)",
                  color: showSource ? "var(--text-invert)" : "var(--text)",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.18)",
                }}
              >
                <Icon name="search" size={12} /> {showSource ? "Hide Source" : "View Source"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "var(--surface)",
                border: "1.5px solid var(--border-strong)",
                color: "var(--text-2)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                padding: 8,
                borderRadius: "50%",
              }}
            >
              <Icon name="plus" size={14} style={{ transform: "rotate(45deg)" }} />
            </button>
          </div>
        </div>

        <div ref={containerRef} style={{ position: "relative", flex: 1, overflowY: "auto", padding: "8px 28px 28px" }}>
          {!showSource ? (
            <>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 450 }}>{children}</div>
              {insights.filter(Boolean).length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    onClick={() => setIsInsightExpanded((prev) => !prev)}
                    style={{
                      padding: "10px 14px",
                      background: "var(--surface-2)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      userSelect: "none",
                      borderBottom: isInsightExpanded ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                      <Icon name="spark" size={13} style={{ color: "var(--accent)" }} />
                      <span>AI Advisory Insights</span>
                    </div>
                    <Icon name={isInsightExpanded ? "chevron-up" : "chevron-down"} size={14} />
                  </div>
                  {isInsightExpanded && (
                    <div
                      style={{
                        padding: "14px 18px",
                        background: "var(--accent-weak)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {insights.filter(Boolean).map((item, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: 12 }}>›</span>
                          <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(240px, 280px) minmax(0, 1fr)",
                gap: 20,
                alignItems: "start",
              }}
            >
              {/* Left: computed value + contribution */}
              <div
                ref={anchorRef}
                style={{
                  position: "sticky",
                  top: 0,
                  border: "1px solid var(--accent)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface)",
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <span className="eyebrow accent" style={{ fontWeight: 700, fontSize: 10.5 }}>
                  Computed value
                </span>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 28,
                    fontWeight: 800,
                    color: "var(--accent)",
                    wordBreak: "break-word",
                    lineHeight: 1.15,
                  }}
                >
                  {primaryValue ?? "—"}
                </div>
                <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                  Traced to{" "}
                  <strong style={{ color: "var(--text)" }}>{summary.recordCount.toLocaleString()}</strong>{" "}
                  record{summary.recordCount === 1 ? "" : "s"}
                  {filters.source !== "all" ||
                  filters.stageId !== "all" ||
                  filters.kind !== "all" ||
                  filters.search
                    ? ` (of ${normalizedAll.length.toLocaleString()} total)`
                    : ""}
                  .
                </p>

                {summary.topDriver && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "color-mix(in srgb, var(--accent) 8%, var(--surface-2))",
                      border: "1px solid color-mix(in srgb, var(--accent) 25%, var(--border))",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--text-3)",
                        marginBottom: 4,
                      }}
                    >
                      Main driver
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
                      {summary.topDriver.label}
                      <span style={{ color: "var(--accent)", marginLeft: 6, fontFamily: "var(--font-mono)" }}>
                        {summary.topDriver.sharePct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <MiniStat label="Checked" value={fmtQty(summary.checkedQty)} />
                  <MiniStat label="Rejected" value={fmtQty(summary.rejectedQty + summary.defectQty)} />
                  <MiniStat label="Files" value={String(summary.fileCount)} />
                  <MiniStat
                    label="Span"
                    value={
                      summary.dateFrom && summary.dateTo
                        ? summary.dateFrom === summary.dateTo
                          ? summary.dateFrom.slice(5)
                          : `${summary.dateFrom.slice(5)}–${summary.dateTo.slice(5)}`
                        : "—"
                    }
                  />
                </div>

                <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>Source mix</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Pill
                      active={filters.source === "excel"}
                      onClick={() => setFilter("source", filters.source === "excel" ? "all" : "excel")}
                      label={`Excel ${excelCount}`}
                    />
                    <Pill
                      active={filters.source === "manual"}
                      onClick={() => setFilter("source", filters.source === "manual" ? "all" : "manual")}
                      label={`Manual ${manualCount}`}
                    />
                  </div>
                </div>

                {summary.stageBreakdown.length > 1 && (
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>By stage</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {summary.stageBreakdown.slice(0, 6).map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => {
                            setGroupMode("stage");
                            setFilter("stageId", filters.stageId === s.key ? "all" : s.key);
                          }}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            background: filters.stageId === s.key ? "var(--accent-weak)" : "transparent",
                            border: "none",
                            padding: "4px 6px",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 11.5,
                            color: "var(--text-2)",
                            textAlign: "left",
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.label}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", flexShrink: 0 }}>{s.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: classification workbench */}
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Mode + surface */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {GROUP_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setGroupMode(m.id);
                        setDetailPage(0);
                      }}
                      style={modeChip(groupMode === m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                  {activeRawSheets.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSourceSurface((s) => (s === "spreadsheet" ? "classified" : "spreadsheet"))
                      }
                      style={{
                        ...modeChip(sourceSurface === "spreadsheet"),
                        marginLeft: "auto",
                      }}
                    >
                      {sourceSurface === "spreadsheet" ? "← Classified view" : "Spreadsheet cells"}
                    </button>
                  )}
                </div>

                {/* Filters */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <select
                    value={filters.stageId}
                    onChange={(e) => setFilter("stageId", e.target.value)}
                    style={selectStyle}
                    aria-label="Filter by stage"
                  >
                    <option value="all">All stages</option>
                    {stageOpts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {sizeOpts.length > 0 && (
                    <select
                      value={filters.size}
                      onChange={(e) => setFilter("size", e.target.value)}
                      style={selectStyle}
                      aria-label="Filter by size"
                    >
                      <option value="all">All sizes</option>
                      {sizeOpts.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    value={filters.kind}
                    onChange={(e) => setFilter("kind", e.target.value as "all" | SourceKind)}
                    style={selectStyle}
                    aria-label="Filter by kind"
                  >
                    <option value="all">All kinds</option>
                    <option value="checked">Checked</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                    <option value="defect">Defect</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    value={filters.search}
                    onChange={(e) => setFilter("search", e.target.value)}
                    placeholder="Search batch, file, defect, cell…"
                    style={{
                      ...selectStyle,
                      flex: "1 1 160px",
                      minWidth: 140,
                    }}
                  />
                  {(filters.stageId !== "all" ||
                    filters.size !== "all" ||
                    filters.kind !== "all" ||
                    filters.search ||
                    filters.source !== "all") && (
                    <button
                      type="button"
                      onClick={() => setFilters(defaultSourceFilters())}
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        border: "none",
                        background: "none",
                        color: "var(--accent)",
                        cursor: "pointer",
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {sourceSurface === "spreadsheet" && activeRawSheets.length > 0 ? (
                  <SpreadsheetPanel
                    activeRawSheets={activeRawSheets}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    sheetLabel={sheetLabel}
                    filteredRows={filteredRows}
                    tableScrollRef={tableScrollRef}
                    cellRefs={cellRefs}
                  />
                ) : groups.length === 0 ? (
                  <div
                    className="muted"
                    style={{
                      padding: 28,
                      textAlign: "center",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                    }}
                  >
                    No source records match these filters.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {groups.map((g) => {
                      const open = openGroupKey === g.key;
                      return (
                        <div
                          key={g.key}
                          style={{
                            border: `1px solid ${open ? "var(--accent)" : "var(--border)"}`,
                            borderRadius: 12,
                            background: "var(--surface)",
                            overflow: "hidden",
                            boxShadow: open ? "var(--shadow-1)" : "none",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setOpenGroupKey((cur) => (cur === g.key ? null : g.key));
                              setDetailPage(0);
                            }}
                            style={{
                              width: "100%",
                              display: "grid",
                              gridTemplateColumns: "auto 1fr auto",
                              gap: 12,
                              alignItems: "center",
                              padding: "12px 14px",
                              border: "none",
                              background: open
                                ? "color-mix(in srgb, var(--accent) 6%, var(--surface))"
                                : "transparent",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                                color: "var(--text-3)",
                                width: 14,
                              }}
                            >
                              {open ? "▾" : "▸"}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: "var(--text)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {g.label}
                              </div>
                              <div
                                style={{
                                  fontSize: 11.5,
                                  color: "var(--text-3)",
                                  marginTop: 2,
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "4px 10px",
                                }}
                              >
                                <span>{g.recordCount.toLocaleString()} records</span>
                                {g.checkedQty > 0 && <span>Chk {fmtQty(g.checkedQty)}</span>}
                                {g.rejectedQty + g.defectQty > 0 && (
                                  <span>Rej {fmtQty(g.rejectedQty + g.defectQty)}</span>
                                )}
                                <span style={{ textTransform: "capitalize" }}>{g.source}</span>
                                {g.fileCount > 0 && <span>{g.fileCount} file{g.fileCount === 1 ? "" : "s"}</span>}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 16,
                                  fontWeight: 800,
                                  color: "var(--accent)",
                                }}
                              >
                                {g.contributionPct.toFixed(0)}%
                              </div>
                              <div style={{ fontSize: 10, color: "var(--text-3)" }}>of metric</div>
                            </div>
                          </button>

                          {open && (
                            <div style={{ borderTop: "1px solid var(--border)" }}>
                              <div ref={tableScrollRef} style={{ maxHeight: "48vh", overflow: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                                  <thead
                                    style={{
                                      position: "sticky",
                                      top: 0,
                                      background: "var(--surface-2)",
                                      zIndex: 1,
                                    }}
                                  >
                                    <tr
                                      style={{
                                        color: "var(--text-3)",
                                        textAlign: "left",
                                        fontSize: 10,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                      }}
                                    >
                                      <th style={th}>Date</th>
                                      <th style={th}>Batch</th>
                                      <th style={th}>Size</th>
                                      <th style={th}>Kind</th>
                                      <th style={{ ...th, textAlign: "right" }}>Qty</th>
                                      <th style={th}>File</th>
                                      <th style={th}>Cell</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detailSlice.map((r, i) => (
                                      <tr
                                        key={`${r.date}-${r.cell}-${i}`}
                                        ref={(el) => {
                                          if (el) rowRefs.current.set(i, el);
                                          else rowRefs.current.delete(i);
                                        }}
                                        style={{ borderTop: "1px solid var(--border)" }}
                                      >
                                        <td style={{ ...td, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                                          <DateCell value={r.date} />
                                        </td>
                                        <td
                                          style={{
                                            ...td,
                                            fontFamily: "var(--font-mono)",
                                            fontSize: 11.5,
                                            color: "var(--text-2)",
                                          }}
                                        >
                                          {r.batch || "—"}
                                        </td>
                                        <td style={td}>{r.size || "—"}</td>
                                        <td style={td}>
                                          <KindPill kind={r.kind} defectCode={r.defectCode} />
                                        </td>
                                        <td
                                          style={{
                                            ...td,
                                            textAlign: "right",
                                            fontFamily: "var(--font-mono)",
                                            fontWeight: 700,
                                          }}
                                        >
                                          {typeof r.qty === "number" ? r.qty.toLocaleString() : r.qty}
                                        </td>
                                        <td
                                          style={{
                                            ...td,
                                            maxWidth: 140,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                          }}
                                          title={r.file}
                                        >
                                          {fileBasename(r.file)}
                                        </td>
                                        <td
                                          style={{
                                            ...td,
                                            fontFamily: "var(--font-mono)",
                                            color: "var(--accent)",
                                            fontSize: 11.5,
                                          }}
                                        >
                                          {r.cell}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {detailRows.length > DETAIL_PAGE_SIZE && (
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "8px 12px",
                                    borderTop: "1px solid var(--border)",
                                    background: "var(--surface-2)",
                                    fontSize: 12,
                                    color: "var(--text-2)",
                                  }}
                                >
                                  <span>
                                    {detailPage * DETAIL_PAGE_SIZE + 1}–
                                    {Math.min((detailPage + 1) * DETAIL_PAGE_SIZE, detailRows.length)} of{" "}
                                    {detailRows.length.toLocaleString()}
                                  </span>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                      type="button"
                                      disabled={detailPage === 0}
                                      onClick={() => setDetailPage((p) => Math.max(0, p - 1))}
                                      style={pageBtn}
                                    >
                                      Prev
                                    </button>
                                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                                      {detailPage + 1}/{detailTotalPages}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={detailPage >= detailTotalPages - 1}
                                      onClick={() =>
                                        setDetailPage((p) => Math.min(detailTotalPages - 1, p + 1))
                                      }
                                      style={pageBtn}
                                    >
                                      Next
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bezier beams: computed value → on-screen source targets (both surfaces) */}
              {(
                <svg
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    zIndex: 5,
                    overflow: "visible",
                  }}
                >
                  <defs>
                    <marker
                      id="modal-beam-arrow"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto"
                    >
                      <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
                    </marker>
                  </defs>
                  {beams.map((b) => {
                    const dx = b.x2 - b.x1;
                    const c1x = b.x1 + Math.max(40, dx * 0.4);
                    const c2x = b.x2 - Math.max(40, dx * 0.4);
                    return (
                      <path
                        key={b.key}
                        d={`M ${b.x1} ${b.y1} C ${c1x} ${b.y1}, ${c2x} ${b.y2}, ${b.x2 - 3} ${b.y2}`}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="1.3"
                        opacity="0.5"
                        markerEnd="url(#modal-beam-arrow)"
                        pathLength="1"
                        className="draw-line"
                        style={{ animationDuration: "0.6s" }}
                      />
                    );
                  })}
                  {beams[0] && <circle cx={beams[0].x1} cy={beams[0].y1} r="4" fill="var(--accent)" />}
                </svg>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function fmtQty(n: number): string {
  if (!n) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text)", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "4px 10px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accent)" : "var(--surface-2)",
        color: active ? "var(--text-invert)" : "var(--text-2)",
      }}
    >
      {label}
    </button>
  );
}

function KindPill({ kind, defectCode }: { kind: SourceKind; defectCode?: string | null }) {
  const color =
    kind === "rejected" || kind === "defect"
      ? "var(--critical)"
      : kind === "accepted"
        ? "var(--positive)"
        : kind === "checked"
          ? "var(--text-2)"
          : "var(--text-3)";
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        padding: "2px 7px",
        borderRadius: 6,
        whiteSpace: "nowrap",
      }}
    >
      {kindLabel(kind, defectCode)}
    </span>
  );
}

function SpreadsheetPanel({
  activeRawSheets,
  activeTab,
  setActiveTab,
  sheetLabel,
  filteredRows,
  tableScrollRef,
  cellRefs,
}: {
  activeRawSheets: RawSheet[];
  activeTab: string;
  setActiveTab: (t: string) => void;
  sheetLabel: (s: RawSheet) => string;
  filteredRows: SourceRow[];
  tableScrollRef: React.RefObject<HTMLDivElement | null>;
  cellRefs: React.MutableRefObject<Map<string, HTMLTableCellElement>>;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
          Source file
        </span>
        <select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
          style={selectStyle}
        >
          {activeRawSheets.map((s) => (
            <option key={s.name} value={s.name}>
              {sheetLabel(s)}
            </option>
          ))}
        </select>
      </div>
      {activeRawSheets.map((sheet) => {
        if (sheet.name !== activeTab) return null;
        const visibleSheetRows = sheet.rows.slice(0, 100);
        return (
          <div key={sheet.name}>
            <div
              ref={tableScrollRef}
              style={{ maxHeight: "60vh", overflow: "auto", border: "1px solid var(--border)", borderRadius: 10 }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--surface-2)", zIndex: 10 }}>
                  <tr
                    style={{
                      color: "var(--text-3)",
                      textAlign: "left",
                      fontSize: 10,
                      textTransform: "uppercase",
                    }}
                  >
                    <th style={{ ...th, width: 40, textAlign: "center" }}>#</th>
                    {sheet.columns.map((col, cIdx) => {
                      const colLetter = sheet.colLetters?.[col] || colIndexToLabel(cIdx);
                      const isColumnUsed = filteredRows.some((r) => {
                        const ref = parseRef(r.cell);
                        return ref && ref.col === colLetter && rawSheetMatches(sheet, ref.sheet);
                      });
                      return (
                        <th
                          key={col}
                          style={{
                            ...th,
                            background: isColumnUsed ? "var(--accent-weak)" : "var(--surface-2)",
                            color: isColumnUsed ? "var(--accent)" : "var(--text-3)",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: 9, opacity: 0.7, fontFamily: "var(--font-mono)" }}>
                              {colLetter}
                            </span>
                            <span style={{ whiteSpace: "nowrap" }}>{col}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleSheetRows.map((row, rIdx) => {
                    const rowNum = (row.__rowNum as number) || rIdx + 1;
                    return (
                      <tr key={rIdx} style={{ borderTop: "1px solid var(--border)" }}>
                        <td
                          style={{
                            ...td,
                            textAlign: "center",
                            fontFamily: "var(--font-mono)",
                            background: "var(--surface-2)",
                            color: "var(--text-3)",
                          }}
                        >
                          {rowNum}
                        </td>
                        {sheet.columns.map((col, cIdx) => {
                          const colLetter = sheet.colLetters?.[col] || colIndexToLabel(cIdx);
                          const matchingSource = filteredRows.find((r) => {
                            const ref = parseRef(r.cell);
                            return (
                              ref &&
                              ref.col === colLetter &&
                              ref.row === rowNum &&
                              rawSheetMatches(sheet, ref.sheet)
                            );
                          });
                          const isHighlighted = !!matchingSource;
                          const cellKey = `${sheet.name}-${colLetter}-${rowNum}`;
                          return (
                            <td
                              key={col}
                              ref={(el) => {
                                if (el && isHighlighted) cellRefs.current.set(cellKey, el);
                                else cellRefs.current.delete(cellKey);
                              }}
                              style={{
                                ...td,
                                background: isHighlighted ? "var(--accent-weak)" : "transparent",
                                color: isHighlighted ? "var(--accent)" : "var(--text)",
                                fontWeight: isHighlighted ? 700 : 400,
                                fontFamily: typeof row[col] === "number" ? "var(--font-mono)" : "var(--font-sans)",
                                textAlign: typeof row[col] === "number" ? "right" : "left",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <DateCell value={row[col]} />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function modeChip(active: boolean): React.CSSProperties {
  return {
    fontSize: 11.5,
    fontWeight: 700,
    padding: "6px 12px",
    borderRadius: 999,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface)",
    color: active ? "var(--accent)" : "var(--text-2)",
  };
}

const selectStyle: React.CSSProperties = {
  padding: "6px 28px 6px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  outline: "none",
};

const pageBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  cursor: "pointer",
};

const th: React.CSSProperties = { padding: "8px 12px", fontWeight: 800, fontSize: 11 };
const td: React.CSSProperties = { padding: "8px 12px", color: "var(--text)", verticalAlign: "middle" };
