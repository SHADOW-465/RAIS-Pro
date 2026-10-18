"use client";

import React, { useState, useRef, useLayoutEffect, useCallback, useEffect, useMemo } from "react";
import Select from "@/components/ui/Select";
import Icon from "@/components/editorial/Icon";
import { BRAND_NAME } from "@/lib/brand";
import { useActiveMetric } from "@/components/app/ActiveMetricContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import type { RawSheet } from "@/types/dashboard";
import DefectRemedyShowcase from "@/components/DefectRemedyShowcase";
import {
  type SourceRow,
  type SourceMetricKind,
  type SourcePeriodGrain,
  type SourceTraceFilters,
  type SourceKind,
  normalizeSourceRows,
  consolidateEntries,
  filterSourceRows,
  groupSourceRows,
  summarizeSource,
  rejectionRateFromSummary,
  type RejectionProof,
  resolvedRejectedQty,
  defaultSourceFilters,
  stageOptionsFromRows,
  sizeOptionsFromRows,
  fileBasename,
  DETAIL_PAGE_SIZE,
} from "@/lib/analytics/source-trace";
import { parseBatchId } from "@/lib/entry/batch-id";
import { sizeColorFor } from "@/lib/entry/size-color";
import { safeBolden } from "@/components/app/widgets";


export type { SourceRow, SourceMetricKind };

export interface SourceBatchItem {
  batchId: string;
  sizeFr: string | null;
  sizeColor: { hex: string; name: string; textOn: "light" | "dark" } | null;
  dateMin: string;
  dateMax: string;
  checkedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  defectQty: number;
  stages: string[];
  entryCount: number;
  defects: { code: string; qty: number }[];
  defectRate: number;
}

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
  /** Live Pareto ranking — Primary / Secondary / Tertiary remedies. */
  rankedDefects?: { code: string; label: string }[];
  /** Open directly to source view rather than chart view */
  initialShowSource?: boolean;
  /** Initial source sub-view mode: "batches" | "history" */
  defaultSourceTab?: "batches" | "history";
}

/** A single bezier beam from the computed-value anchor to one highlighted target. */
interface Beam { x1: number; y1: number; x2: number; y2: number }

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

// Universal fallback click tracker for card -> modal morph across any page in the app
let globalLastClickRect: DOMRect | null = null;

if (typeof window !== "undefined") {
  window.addEventListener(
    "click",
    (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest(
        ".card, .card-hover, .kpi-card-overdrive, [role='button'], button, .clickable, svg, canvas, table, tr",
      );
      if (el) {
        globalLastClickRect = el.getBoundingClientRect();
      } else {
        globalLastClickRect = target.getBoundingClientRect();
      }
    },
    true, // Capture phase executes before React onClick handlers
  );
}

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
  periodGrain: _periodGrain = "month",
  rankedDefects = [],
  initialShowSource = false,
  defaultSourceTab = "batches",
}: FloatingDetailModalProps) {
  void _periodGrain; // retained on the public prop surface; grouping modes removed
  const { t, setTweak } = useTweaks();
  // No usePolicy() here any more: the rejection formula is locked, so the proof
  // panel renders one shape regardless of policy.
  const [showSource, setShowSource] = useState(initialShowSource);
  const [sourceSubView, setSourceSubView] = useState<"batches" | "history" | "spreadsheet">(defaultSourceTab);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchSort, setBatchSort] = useState<"defects" | "rate" | "asc" | "desc" | "date">("defects");
  const [copiedBatches, setCopiedBatches] = useState(false);

  const [isInsightExpanded, setIsInsightExpanded] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [beam, setBeam] = useState<Beam | null>(null);
  // The single highlighted entry row the beam points at (follows hover; defaults to top).
  const [beamRowIndex, setBeamRowIndex] = useState(0);

  const [filters, setFilters] = useState<SourceTraceFilters>(defaultSourceFilters);
  const [detailPage, setDetailPage] = useState(0);
  const [sourceSurface, setSourceSurface] = useState<"classified" | "spreadsheet">("classified");

  const [fetchedRawSheets] = useState<RawSheet[]>([]);
  const allRawSheets = useMemo(() => [...(rawSheets ?? []), ...fetchedRawSheets], [rawSheets, fetchedRawSheets]);

  const [activeOrigin, setActiveOrigin] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (isOpen) {
      const rect = originRect || globalLastClickRect;
      setActiveOrigin(rect);
    }
  }, [isOpen, originRect]);

  const effectiveOrigin = originRect || activeOrigin || globalLastClickRect;

  // Smooth FLIP open animation from origin card center to modal center
  useEffect(() => {
    if (isOpen && effectiveOrigin && panelRef.current) {
      const panel = panelRef.current;
      const targetRect = panel.getBoundingClientRect();

      const originCenterX = effectiveOrigin.left + effectiveOrigin.width / 2;
      const originCenterY = effectiveOrigin.top + effectiveOrigin.height / 2;
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;

      const transX = originCenterX - targetCenterX;
      const transY = originCenterY - targetCenterY;
      const scaleX = Math.max(0.08, effectiveOrigin.width / targetRect.width);
      const scaleY = Math.max(0.08, effectiveOrigin.height / targetRect.height);

      panel.animate(
        [
          {
            transform: `translate3d(${transX}px, ${transY}px, 0) scale(${scaleX}, ${scaleY})`,
            transformOrigin: "center center",
            opacity: 0.35,
            borderRadius: "var(--radius-lg)",
          },
          {
            transform: "translate3d(0, 0, 0) scale(1)",
            transformOrigin: "center center",
            opacity: 1,
            borderRadius: "var(--radius-lg)",
          },
        ],
        {
          duration: 340,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        },
      );
    }
  }, [isOpen, effectiveOrigin]);

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

  /** One formula for both COMPUTED VALUE and HOW IT ADDS UP — never two answers. */
  const rejectionProof = useMemo(() => {
    if (metricKind !== "rejection_rate") return null;
    if (
      summary.sectionBreakdown.length === 0 &&
      summary.stageBreakdown.length === 0 &&
      summary.checkedQty === 0
    ) {
      return null;
    }
    return rejectionRateFromSummary(summary);
  }, [metricKind, summary]);

  const computedDisplay = useMemo(() => {
    if (rejectionProof) {
      return `${(rejectionProof.value * 100).toFixed(2)}%`;
    }
    return primaryValue ?? "—";
  }, [rejectionProof, primaryValue]);

  // Always flat — no By stage / period / file / type grouping chrome.
  const groups = useMemo(
    () => groupSourceRows(filteredRows, "flat", { metricKind }),
    [filteredRows, metricKind],
  );

  const stageOpts = useMemo(() => stageOptionsFromRows(normalizedAll), [normalizedAll]);
  const sizeOpts = useMemo(() => sizeOptionsFromRows(normalizedAll), [normalizedAll]);

  // Publish this card's verified numbers for "what is this graph?" / "highlight
  // it" in Ask MOID. One place to update instead of the 8 pages that open this
  // modal. Cleared on close so an explain question about a closed card fails
  // honestly instead of answering from stale data.
  const { setMetric } = useActiveMetric();
  useEffect(() => {
    if (!isOpen) {
      setMetric(null);
      return;
    }
    const insightText = Array.isArray(insight) ? insight.join(" ") : insight;
    setMetric(
      {
        title,
        insight: insightText,
        primaryValue: computedDisplay !== "—" ? computedDisplay : primaryValue,
        checkedQty: summary.checkedQty,
        acceptedQty: summary.acceptedQty,
        rejectedQty: summary.rejectedQty,
        reworkQty: summary.reworkQty,
        defectQty: summary.defectQty,
        recordCount: summary.recordCount,
        dateFrom: summary.dateFrom,
        dateTo: summary.dateTo,
        topDriver: summary.topDriver ? { label: summary.topDriver.label, sharePct: summary.topDriver.sharePct } : null,
      },
      effectiveOrigin,
    );
    return () => setMetric(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, title, primaryValue, computedDisplay, insight, summary, effectiveOrigin]);

  // Reset classification when modal opens for a new metric
  useEffect(() => {
    if (!isOpen) {
      setShowSource(false);
      setFilters(defaultSourceFilters());
      setSourceSurface("classified");
      setDetailPage(0);
      setBatchSearch("");
      setCopiedBatches(false);
      return;
    }
    setShowSource(initialShowSource);
    setSourceSubView(defaultSourceTab);
    setFilters(defaultSourceFilters());
    setDetailPage(0);
  }, [isOpen, metricKind, title, initialShowSource, defaultSourceTab]);

  const detailRows = groups[0]?.rows ?? [];
  // Fold the kind-split rows into one entry per date·batch·size·stage·file (audit style).
  const entryRows = useMemo(() => consolidateEntries(detailRows), [detailRows]);
  const detailTotalPages = Math.max(1, Math.ceil(entryRows.length / DETAIL_PAGE_SIZE));
  const entrySlice = entryRows.slice(
    detailPage * DETAIL_PAGE_SIZE,
    (detailPage + 1) * DETAIL_PAGE_SIZE,
  );

  // Derive distinct batch items with size colors, rejections count, and date span (Option 1)
  const batchItems = useMemo<SourceBatchItem[]>(() => {
    const map = new Map<string, SourceBatchItem>();
    for (const e of entryRows) {
      const bId = e.batch?.trim() || "Unassigned";
      let b = map.get(bId);
      if (!b) {
        const parsed = parseBatchId(bId);
        const sizeFr = parsed?.sizeFr || (e.size ? String(e.size).replace(/[^0-9]/g, "") : null);
        const swatch = sizeFr ? sizeColorFor(sizeFr) : null;
        b = {
          batchId: bId,
          sizeFr: sizeFr || null,
          sizeColor: swatch,
          dateMin: e.date,
          dateMax: e.date,
          checkedQty: 0,
          acceptedQty: 0,
          rejectedQty: 0,
          defectQty: 0,
          stages: [],
          entryCount: 0,
          defects: [],
          defectRate: 0,
        };
        map.set(bId, b);
      }
      b.checkedQty += e.checkedQty;
      b.acceptedQty += e.acceptedQty;
      b.rejectedQty += e.rejectedQty;
      b.entryCount += 1;
      if (e.date && e.date < b.dateMin) b.dateMin = e.date;
      if (e.date && e.date > b.dateMax) b.dateMax = e.date;
      const stageName = e.stage || e.stageId;
      if (stageName && !b.stages.includes(stageName)) b.stages.push(stageName);
      for (const d of e.defects) {
        b.defectQty += d.qty;
        const ex = b.defects.find((x) => x.code === d.code);
        if (ex) ex.qty += d.qty;
        else b.defects.push({ code: d.code, qty: d.qty });
      }
    }
    for (const b of map.values()) {
      b.defectRate = b.checkedQty > 0 ? (b.rejectedQty / b.checkedQty) * 100 : 0;
    }
    return Array.from(map.values());
  }, [entryRows]);

  const displayBatches = useMemo(() => {
    const q = batchSearch.trim().toUpperCase();
    const filtered = batchItems.filter((b) => {
      if (!q) return true;
      if (b.batchId.toUpperCase().includes(q)) return true;
      if (b.sizeFr && `${b.sizeFr}FR`.includes(q)) return true;
      if (b.stages.some((s) => s.toUpperCase().includes(q))) return true;
      if (b.defects.some((d) => d.code.toUpperCase().includes(q))) return true;
      return false;
    });

    return [...filtered].sort((a, b) => {
      if (batchSort === "defects") {
        const da = a.rejectedQty || a.defectQty;
        const db = b.rejectedQty || b.defectQty;
        if (db !== da) return db - da;
        return a.batchId.localeCompare(b.batchId);
      }
      if (batchSort === "rate") {
        if (b.defectRate !== a.defectRate) return b.defectRate - a.defectRate;
        return (b.rejectedQty || b.defectQty) - (a.rejectedQty || a.defectQty);
      }
      if (batchSort === "asc") return a.batchId.localeCompare(b.batchId);
      if (batchSort === "desc") return b.batchId.localeCompare(a.batchId);
      if (batchSort === "date") return b.dateMax.localeCompare(a.dateMax);
      return 0;
    });
  }, [batchItems, batchSearch, batchSort]);

  const handleCopyBatches = (ids: string[]) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(ids.join(", "));
      setCopiedBatches(true);
      setTimeout(() => setCopiedBatches(false), 2200);
    }
  };

  const handleSelectBatch = (batchId: string) => {
    setFilters((prev) => ({ ...prev, search: batchId }));
    setSourceSubView("history");
  };

  // Keep the highlighted (beam) row valid + reset to the top entry on any change.
  useEffect(() => {
    setBeamRowIndex(0);
  }, [detailPage, filters, showSource, sourceSurface, sourceSubView]);

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

  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);

    const finishClose = () => {
      setIsClosing(false);
      onClose();
    };

    if (effectiveOrigin && panelRef.current) {
      const panel = panelRef.current;
      const targetRect = panel.getBoundingClientRect();

      const originCenterX = effectiveOrigin.left + effectiveOrigin.width / 2;
      const originCenterY = effectiveOrigin.top + effectiveOrigin.height / 2;
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;

      const transX = originCenterX - targetCenterX;
      const transY = originCenterY - targetCenterY;
      const scaleX = Math.max(0.08, effectiveOrigin.width / targetRect.width);
      const scaleY = Math.max(0.08, effectiveOrigin.height / targetRect.height);

      const anim = panel.animate(
        [
          {
            transform: "translate3d(0, 0, 0) scale(1)",
            transformOrigin: "center center",
            opacity: 1,
            borderRadius: "var(--radius-lg)",
          },
          {
            transform: `translate3d(${transX}px, ${transY}px, 0) scale(${scaleX}, ${scaleY})`,
            transformOrigin: "center center",
            opacity: 0,
            borderRadius: "var(--radius-lg)",
          },
        ],
        {
          duration: 250,
          easing: "cubic-bezier(0.25, 1, 0.5, 1)",
          fill: "forwards",
        },
      );
      anim.onfinish = finishClose;
    } else if (panelRef.current) {
      const anim = panelRef.current.animate(
        [
          { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
          { transform: "translate3d(0, 16px, 0) scale(0.97)", opacity: 0 },
        ],
        { duration: 220, easing: "cubic-bezier(0.25, 1, 0.5, 1)", fill: "forwards" },
      );
      anim.onfinish = finishClose;
    } else {
      finishClose();
    }
  }, [isClosing, effectiveOrigin, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, handleClose]);

  const hasSource = normalizedAll.length > 0;
  const excelCount = useMemo(() => normalizedAll.filter((r) => !r.isDirect).length, [normalizedAll]);
  const manualCount = useMemo(() => normalizedAll.filter((r) => r.isDirect).length, [normalizedAll]);

  // A single bezier from the computed-value anchor to the one highlighted target:
  // the highlighted entry row (classified) or the first matched cell (spreadsheet).
  // The arrow lands a little INSIDE the row, never on the table border.
  const computeBeams = useCallback(() => {
    if (!showSource || !containerRef.current || !anchorRef.current) {
      setBeam(null);
      return;
    }
    const target: Element | undefined =
      sourceSurface === "spreadsheet"
        ? cellRefs.current.values().next().value
        : rowRefs.current.get(beamRowIndex) ?? rowRefs.current.values().next().value;
    if (!target) {
      setBeam(null);
      return;
    }
    const base = containerRef.current.getBoundingClientRect();
    const a = anchorRef.current.getBoundingClientRect();
    const scroll = tableScrollRef.current?.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const midY = r.top + r.height / 2;
    // Clip when the highlighted target is scrolled out of the table viewport.
    if (scroll && (midY < scroll.top || midY > scroll.bottom)) {
      setBeam(null);
      return;
    }
    const inset = Math.min(16, r.width * 0.12); // land on the row, not its edge
    setBeam({
      x1: a.right - base.left,
      y1: a.top + a.height / 2 - base.top,
      x2: r.left - base.left + inset,
      y2: midY - base.top,
    });
  }, [showSource, sourceSurface, beamRowIndex, activeTab]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(computeBeams);
    return () => cancelAnimationFrame(id);
  }, [isOpen, showSource, computeBeams, activeTab, sourceSurface, entrySlice.length, beamRowIndex]);

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
  }, [showSource, computeBeams, activeTab, sourceSurface]);

  useEffect(() => {
    cellRefs.current.clear();
  }, [activeTab]);

  const insights = Array.isArray(insight) ? insight : [insight];
  const validInsights = insights.filter(Boolean);

  const checkedCount = summary.checkedQty;
  const rejectedCount = summary.rejectedQty || summary.defectQty;
  const effectiveRate = primaryValue ?? (rejectionProof ? `${(rejectionProof.value * 100).toFixed(2)}%` : null);

  let primaryMetricLabel = "Primary Rate";
  const titleLower = title.toLowerCase();
  if (titleLower.includes("rejection")) primaryMetricLabel = "Rejection Rate";
  else if (titleLower.includes("acceptance")) primaryMetricLabel = "Acceptance Rate";
  else if (titleLower.includes("copq")) primaryMetricLabel = "COPQ Impact";
  else if (titleLower.includes("defect")) primaryMetricLabel = "Defect Count";
  else if (titleLower.includes("yield")) primaryMetricLabel = "Yield Rate";
  else if (titleLower.includes("spc") || titleLower.includes("control")) primaryMetricLabel = "Process Mean";

  const isRejectionMetric = primaryMetricLabel === "Rejection Rate";
  const numericRate = rejectionProof ? rejectionProof.value : (primaryValue && primaryValue.includes("%") ? parseFloat(primaryValue) / 100 : null);
  const isCompliant = isRejectionMetric && numericRate != null ? numericRate <= 0.15 : null;

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
        opacity: isOpen && !isClosing ? 1 : 0,
        visibility: isOpen ? "visible" : "hidden",
        pointerEvents: isOpen && !isClosing ? "auto" : "none",
        transition:
          "opacity 0.25s cubic-bezier(0.25, 1, 0.5, 1), visibility 0.25s cubic-bezier(0.25, 1, 0.5, 1), backdrop-filter 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
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
                padding: "2px 8px",
                borderRadius: 999,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {BRAND_NAME}
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
              <div
                style={{
                  display: "inline-flex",
                  gap: 3,
                  padding: 3,
                  borderRadius: 9999,
                  background: "var(--surface)",
                  border: "1.5px solid var(--border-strong)",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.12)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowSource(false)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 9999,
                    border: "none",
                    background: !showSource ? "var(--accent)" : "transparent",
                    color: !showSource ? "var(--text-invert)" : "var(--text-2)",
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    transition: "all 0.15s ease",
                  }}
                >
                  <Icon name="trend-up" size={12} /> Graph
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSource(true);
                    setSourceSubView("batches");
                  }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 9999,
                    border: "none",
                    background: showSource && sourceSubView === "batches" ? "var(--accent)" : "transparent",
                    color: showSource && sourceSubView === "batches" ? "var(--text-invert)" : "var(--text-2)",
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>🏷️ Batches ID</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: showSource && sourceSubView === "batches" ? "rgba(255,255,255,0.25)" : "var(--surface-3)",
                      color: showSource && sourceSubView === "batches" ? "var(--text-invert)" : "var(--text-3)",
                    }}
                  >
                    {batchItems.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSource(true);
                    setSourceSubView("history");
                  }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 9999,
                    border: "none",
                    background: showSource && sourceSubView === "history" ? "var(--accent)" : "transparent",
                    color: showSource && sourceSubView === "history" ? "var(--text-invert)" : "var(--text-2)",
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>📋 Entry History</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: showSource && sourceSubView === "history" ? "rgba(255,255,255,0.25)" : "var(--surface-3)",
                      color: showSource && sourceSubView === "history" ? "var(--text-invert)" : "var(--text-3)",
                    }}
                  >
                    {entryRows.length}
                  </span>
                </button>
                {activeRawSheets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSource(true);
                      setSourceSubView("spreadsheet");
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 9999,
                      border: "none",
                      background: showSource && sourceSubView === "spreadsheet" ? "var(--accent)" : "transparent",
                      color: showSource && sourceSubView === "spreadsheet" ? "var(--text-invert)" : "var(--text-2)",
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>Spreadsheet</span>
                  </button>
                )}
              </div>
            )}
            {/* Modal Holiday Toggle Button */}
            <button
              type="button"
              onClick={() => setTweak("showCalendarHolidays", !(t.showCalendarHolidays ?? true))}
              title={(t.showCalendarHolidays ?? true) ? "Holidays & Calendar synchronization active (click to toggle)" : "Click to activate Holidays & Calendar synchronization"}
              style={{
                padding: "6px 14px",
                borderRadius: 9999,
                border: "1.5px solid",
                borderColor: (t.showCalendarHolidays ?? true) ? "var(--accent)" : "var(--border-strong)",
                background: (t.showCalendarHolidays ?? true)
                  ? "color-mix(in srgb, var(--accent) 14%, var(--surface))"
                  : "var(--surface)",
                color: (t.showCalendarHolidays ?? true) ? "var(--accent)" : "var(--text-3)",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                transition: "all 0.15s ease",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.12)",
              }}
            >
              <span style={{ fontSize: 10 }}>★</span>
              <span>{(t.showCalendarHolidays ?? true) ? "Holidays Active" : "Holidays Off"}</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
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

        <div ref={containerRef} style={{ position: "relative", flex: 1, overflowY: "auto", padding: "16px 28px 28px" }}>
          {/* Executive Scope Metric Ribbon (Universal across Graph, Batches, and History) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            {/* 1. Primary Value / Compliance */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                  {primaryMetricLabel}
                </span>
                {isCompliant !== null && (
                  <span
                    style={{
                      fontSize: 8.5,
                      fontWeight: 800,
                      padding: "1px 5px",
                      borderRadius: 999,
                      background: isCompliant ? "var(--positive-weak)" : "var(--critical-weak)",
                      color: isCompliant ? "var(--positive)" : "var(--critical)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {isCompliant ? "✓ IN SPEC" : "⚠ EXCEEDS"}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text)", lineHeight: 1.2 }}>
                {effectiveRate ?? (primaryValue || "—")}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                {isRejectionMetric ? "Target: 15.00% max" : (summary.dateFrom ? `${summary.dateFrom} window` : "Selected period")}
              </div>
            </div>

            {/* 2. Total Entered */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                Total Units Entered
              </span>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text)", lineHeight: 1.2 }}>
                {checkedCount > 0 ? checkedCount.toLocaleString("en-IN") : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                {summary.entryStage ? `Gate: ${summary.entryStage}` : "Upstream inspection count"}
              </div>
            </div>

            {/* 3. Total Scrapped */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                Total Scrapped Units
              </span>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--accent)", lineHeight: 1.2 }}>
                {rejectedCount > 0 ? rejectedCount.toLocaleString("en-IN") : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                {checkedCount > 0 && rejectedCount > 0 ? `${((rejectedCount / checkedCount) * 100).toFixed(2)}% of total entered` : "Verified rejects"}
              </div>
            </div>

            {/* 4. Active Batches */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                Active Batches
              </span>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text)", lineHeight: 1.2 }}>
                {batchItems.length > 0 ? batchItems.length : (summary.batchCount > 0 ? summary.batchCount : "—")}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                {entryRows.length > 0 ? `${entryRows.length} audit entries` : "Recorded in ledger"}
              </div>
            </div>

            {/* 5. Leading Driver */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                Leading Driver
              </span>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={rankedDefects[0]?.label ?? summary.topDriver?.label ?? "Plant-wide Trace"}>
                {rankedDefects[0]?.label ?? summary.topDriver?.label ?? "Plant-wide Trace"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                {summary.topDriver?.sharePct ? `${summary.topDriver.sharePct.toFixed(1)}% rejection share` : "Primary variance source"}
              </div>
            </div>
          </div>

          {!showSource ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Full-width Horizontal Visualization Canvas */}
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "18px 20px 14px",
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>Timeline & Trend Analysis</span>
                    {summary.dateFrom && summary.dateTo && (
                      <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                        ({summary.dateFrom} → {summary.dateTo})
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                    Interactive Forensic Plot · Full Horizon
                  </div>
                </div>

                <div style={{ width: "100%", minHeight: 330, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  {children}
                </div>
              </div>

              {/* Full-width AI Advisory Insights Bottom Panel */}
              {validInsights.length > 0 && (
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "var(--radius-lg)",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
                    width: "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "var(--radius-sm, 6px)",
                          background: "var(--accent-weak)",
                          color: "var(--accent)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Icon name="spark" size={13} />
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>AI Advisory Insights</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                          color: "var(--accent)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        Ledger Verified
                      </span>
                    </div>

                    {hasSource && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setShowSource(true);
                            setSourceSubView("batches");
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            background: "var(--surface-2)",
                            color: "var(--text)",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span>🏷️ View Batches ({batchItems.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowSource(true);
                            setSourceSubView("history");
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            background: "var(--surface-2)",
                            color: "var(--text)",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span>📋 View Audit ({entryRows.length})</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: validInsights.length > 1 ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr",
                      gap: 10,
                    }}
                  >
                    {validInsights.map((item, i) => {
                      let label = "";
                      let text = item;
                      const colonMatch = item.match(/^([A-Za-z\s/]+):/);
                      if (colonMatch && colonMatch[1].length <= 25) {
                        label = colonMatch[1].trim();
                        text = item.slice(colonMatch[0].length).trim();
                      }

                      return (
                        <div
                          key={i}
                          style={{
                            padding: "10px 14px",
                            borderRadius: "var(--radius-md)",
                            background: "var(--surface-2)",
                            border: "1px solid var(--border)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          {label && (
                            <div
                              style={{
                                fontSize: 9.5,
                                fontWeight: 800,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: "var(--accent)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {label}
                            </div>
                          )}
                          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text)", fontWeight: 500 }}>
                            {safeBolden(text)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {rankedDefects.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <DefectRemedyShowcase ranked={rankedDefects} compact />
                    </div>
                  )}
                </div>
              )}
            </div>
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
                  {computedDisplay}
                </div>
                <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                  Traced to{" "}
                  <strong style={{ color: "var(--text)" }}>{summary.recordCount.toLocaleString()}</strong>{" "}
                  record{summary.recordCount === 1 ? "" : "s"}
                  {summary.batchCount > 0 && (
                    <>
                      {" "}across{" "}
                      <strong style={{ color: "var(--text)" }}>{summary.batchCount.toLocaleString()}</strong>{" "}
                      batch{summary.batchCount === 1 ? "" : "es"}
                    </>
                  )}
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

                {rejectionProof && rejectionProof.sections.length > 0 && (
                  <RejectionProofPanel proof={rejectionProof} total={computedDisplay} />
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <MiniStat
                    label={summary.entryStage ? `Entered · ${summary.entryStage}` : "Entered"}
                    value={fmtQty(summary.checkedQty)}
                  />
                  <MiniStat
                    label="Rejected · all gates"
                    value={fmtQty(
                      resolvedRejectedQty(summary.rejectedQty, summary.defectQty),
                    )}
                  />
                  {summary.reworkQty > 0 && (
                    <MiniStat label="Held / rework" value={fmtQty(summary.reworkQty)} />
                  )}
                  <MiniStat
                    label="Batches"
                    value={String(summary.batchCount)}
                  />
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
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>Stages</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {summary.stageBreakdown.slice(0, 6).map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => {
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

              {/* Right: source records */}
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Sub-view mode tabs header bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      gap: 4,
                      background: "var(--surface-2)",
                      padding: 3,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSourceSubView("batches")}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        border: "none",
                        background: sourceSubView === "batches" ? "var(--surface)" : "transparent",
                        color: sourceSubView === "batches" ? "var(--accent)" : "var(--text-2)",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        boxShadow: sourceSubView === "batches" ? "var(--shadow-1)" : "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>🏷️ Batches ID</span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontFamily: "var(--font-mono)",
                          padding: "1px 6px",
                          borderRadius: 999,
                          background:
                            sourceSubView === "batches"
                              ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                              : "var(--surface-3)",
                          color: sourceSubView === "batches" ? "var(--accent)" : "var(--text-3)",
                        }}
                      >
                        {batchItems.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceSubView("history")}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        border: "none",
                        background: sourceSubView === "history" ? "var(--surface)" : "transparent",
                        color: sourceSubView === "history" ? "var(--accent)" : "var(--text-2)",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        boxShadow: sourceSubView === "history" ? "var(--shadow-1)" : "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>📋 Data Entry History</span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontFamily: "var(--font-mono)",
                          padding: "1px 6px",
                          borderRadius: 999,
                          background:
                            sourceSubView === "history"
                              ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                              : "var(--surface-3)",
                          color: sourceSubView === "history" ? "var(--accent)" : "var(--text-3)",
                        }}
                      >
                        {entryRows.length}
                      </span>
                    </button>
                    {activeRawSheets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSourceSubView("spreadsheet")}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 8,
                          border: "none",
                          background: sourceSubView === "spreadsheet" ? "var(--surface)" : "transparent",
                          color: sourceSubView === "spreadsheet" ? "var(--accent)" : "var(--text-2)",
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          boxShadow: sourceSubView === "spreadsheet" ? "var(--shadow-1)" : "none",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>Spreadsheet cells</span>
                      </button>
                    )}
                  </div>

                  {sourceSubView === "batches" && (
                    <button
                      type="button"
                      onClick={() => handleCopyBatches(displayBatches.map((b) => b.batchId))}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        border: "1px solid var(--border-strong)",
                        background: copiedBatches ? "var(--positive)" : "var(--surface)",
                        color: copiedBatches ? "#fff" : "var(--text)",
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {copiedBatches ? "✓ Copied Batch IDs!" : "📋 Copy All Batch IDs"}
                    </button>
                  )}
                </div>

                {/* Option 1: Batches ID View (like 3rd image) */}
                {sourceSubView === "batches" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Search & Sort Controls */}
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
                      <input
                        value={batchSearch}
                        onChange={(e) => setBatchSearch(e.target.value)}
                        placeholder="Search batch ID, size (e.g. 14Fr), stage, defect…"
                        style={{
                          ...selectStyle,
                          flex: "1 1 200px",
                          minWidth: 160,
                        }}
                      />
                      <Select
                        value={batchSort}
                        onChange={(v) => setBatchSort(v as any)}
                        options={[
                          { value: "defects", label: "Sort: Most Rejections" },
                          { value: "rate", label: "Sort: Highest Rej Rate %" },
                          { value: "asc", label: "Sort: Batch A–Z" },
                          { value: "desc", label: "Sort: Batch Z–A" },
                          { value: "date", label: "Sort: Latest Date" },
                        ]}
                        size="sm"
                        variant="pill"
                        block={false}
                        ariaLabel="Sort batches"
                      />
                      {batchSearch && (
                        <button
                          type="button"
                          onClick={() => setBatchSearch("")}
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

                    {/* Stats summary bar */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0 4px",
                        fontSize: 12,
                        color: "var(--text-3)",
                      }}
                    >
                      <span>
                        Showing <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{displayBatches.length}</strong> of{" "}
                        <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{batchItems.length}</strong> batches
                        {displayBatches.length > 0 && (
                          <>
                            {" "}·{" "}
                            <strong style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                              {displayBatches
                                .reduce((acc, b) => acc + (b.rejectedQty || b.defectQty), 0)
                                .toLocaleString("en-IN")}
                            </strong>{" "}
                            total rejections
                          </>
                        )}
                      </span>
                      <span style={{ fontSize: 11, fontStyle: "italic", color: "var(--text-3)" }}>
                        Click any batch tile to drill into its entry history
                      </span>
                    </div>

                    {displayBatches.length === 0 ? (
                      <div
                        className="muted"
                        style={{
                          padding: 28,
                          textAlign: "center",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          background: "var(--surface)",
                        }}
                      >
                        No batches match “{batchSearch}”.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                          gap: 10,
                          maxHeight: "56vh",
                          overflowY: "auto",
                          paddingRight: 4,
                        }}
                      >
                        {displayBatches.map((b) => (
                          <button
                            key={b.batchId}
                            type="button"
                            onClick={() => handleSelectBatch(b.batchId)}
                            title={`Click to view data entry history for batch ${b.batchId}`}
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid var(--border-strong)",
                              borderLeft: b.sizeColor
                                ? `4px solid ${b.sizeColor.hex}`
                                : "4px solid var(--border-strong)",
                              background: "var(--surface)",
                              color: "var(--text)",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              boxShadow: "var(--shadow-1)",
                              transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "translateY(-1px)";
                              e.currentTarget.style.boxShadow = "var(--shadow-2)";
                              e.currentTarget.style.borderColor = "var(--accent)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "none";
                              e.currentTarget.style.boxShadow = "var(--shadow-1)";
                              e.currentTarget.style.borderColor = "var(--border-strong)";
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: "var(--text)" }}>
                                {b.batchId}
                              </span>
                              {b.sizeFr && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontFamily: "var(--font-mono)",
                                    fontWeight: 700,
                                    padding: "1px 5px",
                                    borderRadius: 4,
                                    background: b.sizeColor
                                      ? `color-mix(in srgb, ${b.sizeColor.hex} 18%, var(--surface-2))`
                                      : "var(--surface-2)",
                                    color:
                                      b.sizeColor?.hex === "#FFFFFF"
                                        ? "var(--text)"
                                        : (b.sizeColor?.hex ?? "var(--text-2)"),
                                    border: "1px solid var(--border)",
                                  }}
                                >
                                  {b.sizeFr}Fr
                                </span>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                                {(b.rejectedQty || b.defectQty).toLocaleString("en-IN")}{" "}
                                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--text-3)" }}>rejected</span>
                              </span>
                              {b.defectRate > 0 && (
                                <span style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--text-3)", fontWeight: 600 }}>
                                  {b.defectRate.toFixed(1)}%
                                </span>
                              )}
                            </div>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 4,
                                fontSize: 10,
                                color: "var(--text-3)",
                                borderTop: "1px dashed var(--border)",
                                paddingTop: 5,
                                marginTop: 2,
                              }}
                            >
                              <span style={{ fontFamily: "var(--font-mono)" }}>
                                {b.dateMin === b.dateMax ? b.dateMin.slice(5) : `${b.dateMin.slice(5)} → ${b.dateMax.slice(5)}`}
                              </span>
                              <span style={{ color: "var(--accent)", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>
                                History →
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Option 2: Data Entry History View (like 2nd image) */}
                {sourceSubView === "history" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                      <Select
                        value={filters.stageId}
                        onChange={(v) => setFilter("stageId", v)}
                        options={[
                          { value: "all", label: "All stages" },
                          ...stageOpts.map((s) => ({ value: s.id, label: s.label })),
                        ]}
                        size="sm"
                        variant="pill"
                        block={false}
                        ariaLabel="Filter by stage"
                      />
                      {sizeOpts.length > 0 && (
                        <Select
                          value={filters.size}
                          onChange={(v) => setFilter("size", v)}
                          options={[
                            { value: "all", label: "All sizes" },
                            ...sizeOpts.map((s) => ({ value: s, label: s })),
                          ]}
                          size="sm"
                          mono
                          variant="pill"
                          block={false}
                          ariaLabel="Filter by size"
                        />
                      )}
                      <Select
                        value={filters.kind}
                        onChange={(v) => setFilter("kind", v as "all" | SourceKind)}
                        options={[
                          { value: "all", label: "All kinds" },
                          { value: "checked", label: "Checked" },
                          { value: "accepted", label: "Accepted" },
                          { value: "rejected", label: "Rejected" },
                          { value: "rework", label: "Rework / hold" },
                          { value: "defect", label: "Defect" },
                          { value: "other", label: "Other" },
                        ]}
                        size="sm"
                        variant="pill"
                        block={false}
                        ariaLabel="Filter by kind"
                      />
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

                    {entryRows.length === 0 ? (
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
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      background: "var(--surface)",
                      overflow: "hidden",
                    }}
                  >
                    <div ref={tableScrollRef} style={{ maxHeight: "56vh", overflow: "auto" }}>
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
                            <th style={th}>Stage</th>
                            <th style={th}>Size</th>
                            <th style={{ ...th, textAlign: "right" }}>Checked</th>
                            <th style={{ ...th, textAlign: "right" }}>Accepted</th>
                            <th style={{ ...th, textAlign: "right" }}>Rejected</th>
                            <th style={th}>Defects</th>
                            <th style={th}>File</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entrySlice.map((e, i) => {
                            const highlighted = i === beamRowIndex;
                            return (
                              <tr
                                key={e.key}
                                ref={(el) => {
                                  if (el) rowRefs.current.set(i, el);
                                  else rowRefs.current.delete(i);
                                }}
                                onMouseEnter={() => setBeamRowIndex(i)}
                                style={{
                                  borderTop: "1px solid var(--border)",
                                  background: highlighted
                                    ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                                    : "transparent",
                                  boxShadow: highlighted
                                    ? "inset 2px 0 0 var(--accent)"
                                    : undefined,
                                }}
                              >
                                <td style={{ ...td, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                                  <DateCell value={e.date} />
                                </td>
                                <td
                                  style={{
                                    ...td,
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 11.5,
                                    color: "var(--text-2)",
                                  }}
                                >
                                  {e.batch || "—"}
                                  {e.confirmedDistinctFrom && (
                                    <div
                                      title={`Confirmed a different lot from ${e.confirmedDistinctFrom} despite matching checked/accepted/rejected counts — not a duplicate entry.`}
                                      style={{
                                        display: "inline-block",
                                        marginLeft: 6,
                                        padding: "0px 5px",
                                        borderRadius: 999,
                                        fontSize: 9.5,
                                        fontWeight: 700,
                                        fontFamily: "var(--font-sans)",
                                        letterSpacing: 0.2,
                                        color: "var(--accent)",
                                        background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                                        border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                                      }}
                                    >
                                      Confirmed distinct
                                    </div>
                                  )}
                                </td>
                                <td style={{ ...td, fontWeight: 600, color: "var(--text)" }}>
                                  {e.stage || e.stageId || "—"}
                                </td>
                                <td style={td}>{e.size || "—"}</td>
                                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                                  {e.checkedQty > 0 ? e.checkedQty.toLocaleString() : "—"}
                                </td>
                                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: e.acceptedQty > 0 ? "var(--positive)" : "var(--text)" }}>
                                  {e.acceptedQty > 0 ? e.acceptedQty.toLocaleString() : "—"}
                                </td>
                                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: e.rejectedQty > 0 ? "var(--critical)" : "var(--text)" }}>
                                  {e.rejectedQty > 0 ? e.rejectedQty.toLocaleString() : "—"}
                                </td>
                                <td style={{ ...td, fontSize: 11.5, lineHeight: 1.45 }}>
                                  {e.defects.length === 0 ? (
                                    <span style={{ color: "var(--text-3)" }}>—</span>
                                  ) : (
                                    e.defects.map((d, di) => (
                                      <span key={d.code}>
                                        {di > 0 ? ", " : null}
                                        <strong style={{ fontWeight: 600 }}>{d.code}</strong>
                                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}> {d.qty.toLocaleString()}</span>
                                      </span>
                                    ))
                                  )}
                                </td>
                                <td
                                  style={{
                                    ...td,
                                    maxWidth: 140,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={e.file}
                                >
                                  {fileBasename(e.file)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {entryRows.length > DETAIL_PAGE_SIZE && (
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
                          {Math.min((detailPage + 1) * DETAIL_PAGE_SIZE, entryRows.length)} of{" "}
                          {entryRows.length.toLocaleString()} entries
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
            )}

            {/* Option 3: Spreadsheet Cells View */}
            {sourceSubView === "spreadsheet" && activeRawSheets.length > 0 && (
              <SpreadsheetPanel
                activeRawSheets={activeRawSheets}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                sheetLabel={sheetLabel}
                filteredRows={filteredRows}
                tableScrollRef={tableScrollRef}
                cellRefs={cellRefs}
              />
            )}
          </div>

              {/* Single bezier beam → the highlighted target */}
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
                {beam &&
                  (() => {
                    const dx = beam.x2 - beam.x1;
                    const c1x = beam.x1 + Math.max(40, dx * 0.4);
                    const c2x = beam.x2 - Math.max(40, dx * 0.4);
                    return (
                      <>
                        <path
                          d={`M ${beam.x1} ${beam.y1} C ${c1x} ${beam.y1}, ${c2x} ${beam.y2}, ${beam.x2 - 3} ${beam.y2}`}
                          fill="none"
                          stroke="var(--accent)"
                          strokeWidth="1.6"
                          opacity="0.6"
                          markerEnd="url(#modal-beam-arrow)"
                          pathLength="1"
                          className="draw-line"
                          style={{ animationDuration: "0.6s" }}
                        />
                        <circle cx={beam.x1} cy={beam.y1} r="4" fill="var(--accent)" />
                      </>
                    );
                  })()}
              </svg>
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

/**
 * "How it adds up" — the arithmetic, written out.
 *
 * The old version printed `67,464 / 508,282  13.27%` on one line with the
 * contributing gates crammed into a grey run-on sentence underneath that did NOT
 * visibly sum to the numerator. You had to take the number on faith.
 *
 * Now each section shows: its denominator (named at its entry gate), every gate
 * that rejected anything, a ruled subtotal proving those gates ARE the
 * numerator, and the division spelled out. Layout is a 2-column grid so the
 * quantities align into a column you can add with your eye.
 */
function RejectionProofPanel({
  proof,
  total,
}: {
  proof: RejectionProof;
  total: string;
}) {
  const multi = proof.sections.length > 1;
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          padding: "9px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--text-3)",
          }}
        >
          How it adds up
        </span>
        <span className="muted" style={{ fontSize: 10.5 }}>
          {multi ? `${proof.sections.length} sections · rates add` : "1 section"}
        </span>
      </div>

      {proof.sections.map((sec) => (
        <div
          key={sec.key}
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          {multi && (
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{sec.label}</div>
          )}

          {/* Denominator first — you cannot read a rate without it. */}
          <ProofLine
            label={`Entered at ${sec.entryLabel}`}
            value={fmtQty(sec.checkedQty)}
            hint="the denominator"
          />

          {sec.gates.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div
                className="muted"
                style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.03em" }}
              >
                Rejected at
              </div>
              {sec.gates.map((g) => (
                <ProofLine key={g.key} label={g.label} value={fmtQty(g.rejectedQty)} indent />
              ))}
              <ProofLine
                label={sec.gates.length > 1 ? `Total rejected · ${sec.gates.length} gates` : "Total rejected"}
                value={fmtQty(sec.rejectedQty)}
                rule
                strong
              />
            </div>
          )}

          {/* The division, in full. No inference required. */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 10,
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              padding: "7px 9px",
              borderRadius: 6,
              background: "var(--surface-2)",
            }}
          >
            <span style={{ color: "var(--text-2)" }}>
              {fmtQty(sec.rejectedQty)} ÷ {fmtQty(sec.checkedQty)}
            </span>
            <span style={{ fontWeight: 700, color: multi ? "var(--text)" : "var(--accent)" }}>
              {pct(sec.rate)}
            </span>
          </div>
        </div>
      ))}

      {/* Only earns a row when there is actually an addition to show. */}
      {multi && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
            padding: "9px 12px",
            borderBottom: "1px solid var(--border)",
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
          }}
        >
          <span style={{ color: "var(--text-2)" }}>
            {proof.sections.map((s) => pct(s.rate)).join(" + ")}
          </span>
          <span style={{ fontWeight: 700, color: "var(--accent)" }}>{total}</span>
        </div>
      )}

      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        <p className="muted" style={{ fontSize: 10.5, lineHeight: 1.5, margin: 0 }}>
          {multi
            ? "Each section is a separate population measured at its own entry gate, so the section rates add. Inside a section the gates are sequential — they share one denominator, so their rejects are summed and their rates are not."
            : "The gates here are sequential — what one accepts, the next checks — so they share one denominator. Rejects are summed across gates; gate rates are never added."}
        </p>
        {proof.legacySumOfGateRates != null && (
          <p className="muted" style={{ fontSize: 10.5, lineHeight: 1.5, margin: 0 }}>
            The old YEARLY / REJECTION ANALYSIS sheet printed{" "}
            <strong style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>
              {pct(proof.legacySumOfGateRates)}
            </strong>{" "}
            for these rows — it added each gate&rsquo;s own rate, counting the same units once per
            gate.
          </p>
        )}
      </div>
    </div>
  );
}

/** One `label ………… qty` row. `rule` draws the add-up line above the subtotal. */
function ProofLine({
  label,
  value,
  hint,
  indent,
  rule,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  indent?: boolean;
  rule?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 10,
        fontSize: 11.5,
        paddingLeft: indent ? 10 : 0,
        paddingTop: rule ? 4 : 0,
        marginTop: rule ? 2 : 0,
        borderTop: rule ? "1px solid var(--border)" : undefined,
      }}
    >
      <span style={{ color: strong ? "var(--text)" : "var(--text-2)", fontWeight: strong ? 700 : 400 }}>
        {label}
        {hint && (
          <span className="muted" style={{ fontSize: 10, marginLeft: 5 }}>
            {hint}
          </span>
        )}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: strong ? 700 : 600,
          color: "var(--text)",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
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
        <Select
          value={activeTab}
          onChange={setActiveTab}
          options={activeRawSheets.map((s) => ({ value: s.name, label: sheetLabel(s) }))}
          size="sm"
          ariaLabel="Sheet"
        />
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
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
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
