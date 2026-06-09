// src/components/Dashboard.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import KPICard from "./KPICard";
import ChartContainer from "./ChartContainer";
import ParetoChart from "./ParetoChart";
import StatusAlert from "./StatusAlert";
import ChatPanel from "./ChatPanel";
import InsightSlide from "./InsightSlide";
import VerifyPanel from "./VerifyPanel";
import Sidebar from "./Sidebar";
import { findContributingSheets } from "@/lib/verify-nav";
import BeamOverlay, { type BeamEndpoints } from "./BeamOverlay";
import SourcesPanel from "./SourcesPanel";
import Icon from "@/components/editorial/Icon";
import Pill from "@/components/editorial/Pill";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { ThemeSwitcher } from "@/components/editorial/EditorialHeader";
import type { DashboardConfig, RawSheet } from "@/types/dashboard";
import type { InsightSlide as InsightSlideType } from "@/types/dashboard";
import type { MergePlan } from "@/types/analysis";

interface DashboardProps {
  data: DashboardConfig;
  dataSummary: string;
  onReset: () => void;
  sessionId?: string;
  sessionTitle?: string;
  initialSlides?: InsightSlideType[];
  rawSheets?: RawSheet[];
  mergePlan?: MergePlan;
  narrativePending?: boolean;
}

const SummarySkeleton = () => (
  <div
    style={{
      background: "var(--accent-weak)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--pad-card)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          background: "var(--accent)",
          color: "var(--text-invert)",
          padding: "2px 6px",
          borderRadius: "4px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        AI
      </span>
      <span className="eyebrow accent" style={{ fontWeight: 700, margin: 0 }}>
        Generating Summary...
      </span>
    </div>
    <div className="skeleton-shimmer" style={{ height: 28, width: "60%", borderRadius: "var(--radius-sm)", marginBottom: 16 }} />
    <div className="skeleton-shimmer" style={{ height: 16, width: "90%", borderRadius: "var(--radius-sm)", marginBottom: 10 }} />
    <div className="skeleton-shimmer" style={{ height: 16, width: "85%", borderRadius: "var(--radius-sm)", marginBottom: 10 }} />
    <div className="skeleton-shimmer" style={{ height: 16, width: "40%", borderRadius: "var(--radius-sm)" }} />
  </div>
);

const ObservationsSkeleton = () => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
    <div>
      <div className="skeleton-shimmer" style={{ height: 20, width: "50%", borderRadius: "var(--radius-sm)", marginBottom: 20 }} />
      {[1, 2, 3].map((n) => (
        <div key={n} style={{ display: "flex", gap: 16, padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
          <div className="skeleton-shimmer" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton-shimmer" style={{ height: 14, width: "90%", borderRadius: "var(--radius-sm)" }} />
            <div className="skeleton-shimmer" style={{ height: 14, width: "60%", borderRadius: "var(--radius-sm)" }} />
          </div>
        </div>
      ))}
    </div>
    <div>
      <div className="skeleton-shimmer" style={{ height: 20, width: "50%", borderRadius: "var(--radius-sm)", marginBottom: 20 }} />
      {[1, 2, 3].map((n) => (
        <div key={n} style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
          <div className="skeleton-shimmer" style={{ width: 14, height: 14, borderRadius: "2px", flexShrink: 0 }} />
          <div className="skeleton-shimmer" style={{ height: 14, width: "80%", borderRadius: "var(--radius-sm)", flex: 1 }} />
        </div>
      ))}
    </div>
  </div>
);

// Safely bold any number/percent/ID-like token in an insight string without dangerouslySetInnerHTML
export function safeBolden(text: string): React.ReactNode {
  const regex = /([0-9]+(?:\.[0-9]+)?%?(?:\s*pt)?|LOT-[A-Z0-9-]+|Line-\d+|Line\s\d+)/g;
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(regex)) {
          return (
            <strong
              key={i}
              className="num"
              style={{
                fontWeight: 700,
                padding: "2px 4px",
                background: "var(--surface-3)",
                color: "var(--text)",
                borderRadius: "3px",
                border: "1px solid var(--border)",
                fontSize: "12px",
              }}
            >
              {part}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function ReadingChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "critical" | "positive";
}) {
  const color =
    tone === "critical"
      ? "var(--accent)"
      : tone === "positive"
        ? "var(--positive)"
        : "var(--text)";
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span className="eyebrow muted" style={{ fontSize: 9 }}>
        {label}
      </span>
      <span
        className="num"
        style={{ color, fontSize: 13, fontWeight: 600, marginTop: 2 }}
      >
        {value}
      </span>
    </div>
  );
}

export default function Dashboard({
  data,
  dataSummary,
  onReset,
  sessionId,
  sessionTitle,
  initialSlides,
  rawSheets,
  mergePlan,
  narrativePending,
}: DashboardProps) {
  const [currentConfig, setCurrentConfig] = useState<DashboardConfig>(data);

  useEffect(() => {
    setCurrentConfig(data);
  }, [data]);

  const [slides, setSlides] = useState<InsightSlideType[]>(initialSlides ?? []);
  const { t } = useTweaks();

  const [verifyMode, setVerifyMode] = useState(false);
  const [activeKpiIndex, setActiveKpiIndex] = useState<number | null>(null);
  const [noMatchWarning, setNoMatchWarning] = useState<string | null>(null);
  const [mobileVerifyWarning, setMobileVerifyWarning] = useState(false);

  const kpiRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const colRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  const [beams, setBeams] = useState<BeamEndpoints[]>([]);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const hasRawData = !!rawSheets?.length;
  // Skeletons show ONLY while the narrative call is in flight. If it fails, we
  // stop pending and fall back gracefully (the numbers below are complete).
  const isNarrativePending = !!narrativePending;

  // The real column highlighted in the sheet VerifyPanel is currently showing
  // (resolved per-sheet by VerifyPanel and reported back up). The beam draws to it.
  const [resolvedCol, setResolvedCol] = useState<string | null>(null);
  // Bumps on every KPI click so VerifyPanel deep-links to the metric's sheets.
  const [verifyRequest, setVerifyRequest] = useState(0);

  // Per-sheet sections. scope = "all" (combined) or a section id. The KPI grid
  // and charts follow the active scope so a user can drill into / verify one
  // sheet (e.g. one month) at a time.
  const sections = currentConfig.sections ?? [];
  const [scope, setScope] = useState<string>("all");
  const activeSection = scope === "all" ? null : sections.find((s) => s.id === scope) ?? null;
  const kpis = activeSection ? activeSection.kpis : currentConfig.kpis ?? [];
  const charts = activeSection ? activeSection.charts : currentConfig.charts ?? [];
  // Lean Six Sigma 80/20 analysis follows the active scope (combined or one sheet).
  const pareto = (activeSection ? activeSection.pareto : currentConfig.pareto) ?? null;
  const changeScope = (next: string) => {
    setScope(next);
    setActiveKpiIndex(null);
    setResolvedCol(null);
    setBeams([]);
    setNoMatchWarning(null);
  };

  const activeKpi = activeKpiIndex !== null ? kpis[activeKpiIndex] : null;
  const activeSourceColumn = activeKpi?.sourceColumn ?? null;
  const traceLabel = activeKpi?.label ?? null;

  const onHighlightResolved = useCallback((col: string | null) => {
    setResolvedCol(col);
  }, []);

  const computeBeams = useCallback(() => {
    if (!verifyMode || activeKpiIndex === null || !t.showBeams || !resolvedCol) {
      setBeams([]);
      return;
    }
    const kpiEl = kpiRefs.current.get(activeKpiIndex);
    const colEl = colRefs.current.get(resolvedCol);
    if (!kpiEl || !colEl) {
      setBeams([]);
      return;
    }

    // Clip: don't draw if the active KPI card is scrolled out of the left panel viewport.
    const leftPanel = leftPanelRef.current?.getBoundingClientRect();
    if (leftPanel) {
      const kpiRect = kpiEl.getBoundingClientRect();
      const kpiCenterY = kpiRect.top + kpiRect.height / 2;
      if (kpiCenterY < leftPanel.top || kpiCenterY > leftPanel.bottom) {
        setBeams([]);
        return;
      }
    }

    const colRect = colEl.getBoundingClientRect();
    // Clip: don't draw when the column header is scrolled outside the verify panel.
    const panel = rightPanelRef.current?.getBoundingClientRect();
    if (panel) {
      const cx = colRect.left + colRect.width / 2;
      const cy = colRect.top + colRect.height / 2;
      if (cx < panel.left - 4 || cx > panel.right + 4 || cy < panel.top - 4 || cy > panel.bottom + 4) {
        setBeams([]);
        return;
      }
    }
    setBeams([{ id: `${activeKpiIndex}-${resolvedCol}`, from: kpiEl.getBoundingClientRect(), to: colRect }]);
  }, [verifyMode, activeKpiIndex, t.showBeams, resolvedCol]);

  // Recompute after paint (refs/scroll settle).
  useEffect(() => {
    const id = requestAnimationFrame(computeBeams);
    return () => cancelAnimationFrame(id);
  }, [computeBeams]);

  // Track ANY scroll (capture catches the inner table scroller, which doesn't
  // bubble) + resize, rAF-throttled so the beam follows instead of freezing.
  useEffect(() => {
    let raf = 0;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(computeBeams);
    };
    window.addEventListener("scroll", handler, { passive: true, capture: true });
    window.addEventListener("resize", handler, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", handler, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", handler);
    };
  }, [computeBeams]);

  const handleKpiClick = (i: number) => {
    if (!verifyMode) return;
    setActiveKpiIndex((prev) => {
      const next = prev === i ? null : i;
      if (next === null) {
        setNoMatchWarning(null);
        return next;
      }
      const col = kpis[next]?.sourceColumn ?? null;
      const sources = findContributingSheets(rawSheets ?? [], col);
      setNoMatchWarning(
        sources.length === 0
          ? `Could not trace "${col ?? kpis[next]?.label ?? "this metric"}" to a source column in the raw data.`
          : null,
      );
      setVerifyRequest((r) => r + 1);
      return next;
    });
  };

  const handleColRef = useCallback(
    (col: string, el: HTMLTableCellElement | null) => {
      if (el) colRefs.current.set(col, el);
      else colRefs.current.delete(col);
    },
    [],
  );

  const toggleVerify = () => {
    if (!verifyMode && window.innerWidth < 1024) {
      setMobileVerifyWarning(true);
      return;
    }
    setMobileVerifyWarning(false);
    setVerifyMode((v) => !v);
    setActiveKpiIndex(null);
    setResolvedCol(null);
    setNoMatchWarning(null);
    setBeams([]);
  };

  const title = sessionTitle ?? currentConfig.dashboardTitle ?? "Analysis";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const alerts = currentConfig.alerts ?? [];
  const insights = currentConfig.insights ?? [];
  const recommendations = currentConfig.recommendations ?? [];

  // "In this issue" TOC built from what's actually present
  const toc: Array<[string, string, string]> = [];
  let secNum = 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (kpis.length) toc.push([pad(secNum++), "The numbers", "kpi-grid"]);
  if (charts.length) toc.push([pad(secNum++), "The picture", "charts-grid"]);
  if (pareto && pareto.items.length > 0) toc.push([pad(secNum++), "Pareto diagnostics", "pareto-diagnostics"]);
  if (insights.length || recommendations.length || isNarrativePending) toc.push([pad(secNum++), "Observations", "observations"]);
  if (mergePlan) toc.push([pad(secNum++), "Sources & merge audit", "sources-audit"]);

  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", background: "var(--bg)" }}>
      <Sidebar
        verifyMode={verifyMode}
        onVerifyToggle={toggleVerify}
        hasRawData={hasRawData}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header className="masthead">
          <div className="shell-wide">
            <div className="row1">
              <div className="left" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", color: "var(--text)" }}>
                  {verifyMode ? "Verification Studio" : "Executive Briefing"}
                </span>
              </div>
              <div className="right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn" onClick={() => window.print()}>
                  <Icon name="print" size={13} /> Export
                </button>
                <button className="btn accent" onClick={onReset}>
                  <Icon name="plus" size={13} /> New analysis
                </button>
                <ThemeSwitcher showLabel />
              </div>
            </div>
            <div className="meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)" }}>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>{title}</span>
                <span className="pipe" style={{ color: "var(--border-strong)" }}>·</span>
                <span style={{ fontFamily: "var(--font-sans)" }}>{today}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                <span className="num">{kpis.length} KPIs</span> · <span className="num">{charts.length} figures</span> · <span style={{ color: "var(--positive)" }}>●</span> Verified
              </div>
            </div>
          </div>
        </header>

        {/* ── Split body ───────────────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* LEFT: main scroll region */}
          <div
            ref={leftPanelRef}
            id="main-scroll"
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              paddingBottom: 260,
              transition: "flex 0.4s ease",
            }}
          >
            {/* Sticky sub-navigation section nav */}
            {!verifyMode && toc.length > 0 && (
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  background: "var(--bg)",
                  borderBottom: "1px solid var(--border)",
                  padding: "12px 24px",
                  display: "flex",
                  gap: 24,
                  zIndex: 40,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)", letterSpacing: "0.08em" }}>In this issue</span>
                {toc.map(([num, name, id]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-2)",
                      textDecoration: "none",
                      transition: "color 0.15s",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.color = "var(--accent)")}
                    onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-2)")}
                  >
                    <span className="num" style={{ color: "var(--accent)", marginRight: 6 }}>{num}</span>
                    {name}
                  </a>
                ))}
              </div>
            )}

            <div
              className={verifyMode ? "" : "shell-wide"}
              style={{
                paddingLeft: verifyMode ? 24 : undefined,
                paddingRight: verifyMode ? 24 : undefined,
                paddingTop: 36,
                paddingBottom: 48,
              }}
            >
              {/* Mobile viewport warning */}
              {mobileVerifyWarning && (
                <div style={{ marginBottom: 24 }}>
                  <StatusAlert
                    message="Verify mode is optimized for desktop screens (1024px+). The side-by-side data sheet and connecting beams require a wider viewport."
                    type="warning"
                    onClose={() => setMobileVerifyWarning(false)}
                  />
                </div>
              )}

              {/* Column mapping verification warning */}
              {verifyMode && noMatchWarning && (
                <div style={{ marginBottom: 24 }}>
                  <StatusAlert
                    message={noMatchWarning}
                    type="warning"
                    onClose={() => setNoMatchWarning(null)}
                  />
                </div>
              )}

              {/* 1. Critical alert */}
              {alerts.length > 0 && (
                <div style={{ marginBottom: 36 }} className="fade-up">
                  <StatusAlert message={alerts[0]} type="danger" />
                </div>
              )}

              {/* 2. Executive summary (AI brief surface) */}
              <section id="brief" style={{ marginBottom: 56 }} className="fade-up">
                {isNarrativePending ? (
                  <SummarySkeleton />
                ) : (
                  <div
                    style={{
                      background: "var(--accent-weak)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-lg)",
                      padding: "var(--pad-card)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          background: "var(--accent)",
                          color: "var(--text-invert)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        AI
                      </span>
                      <span className="eyebrow accent" style={{ fontWeight: 700, margin: 0 }}>
                        Executive Summary
                      </span>
                    </div>
                    <h1
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 36,
                        fontWeight: 800,
                        lineHeight: 1.15,
                        margin: 0,
                        letterSpacing: "-0.03em",
                        color: "var(--text)",
                      }}
                    >
                      {title}
                    </h1>
                    <p
                      style={{
                        fontSize: 16,
                        lineHeight: 1.6,
                        color: "var(--text-2)",
                        marginTop: 16,
                        marginBottom: 0,
                        maxWidth: 820,
                      }}
                    >
                      {currentConfig.executiveSummary ||
                        "AI summary unavailable for this analysis — the figures below are complete and verified."}
                    </p>
                    <div
                      className="flex gap-6 mt-6"
                      style={{ alignItems: "center", flexWrap: "wrap" }}
                    >
                      <ReadingChip
                        label="Outlook"
                        value={alerts.length > 0 ? "Action required" : "Steady"}
                        tone={alerts.length > 0 ? "critical" : "positive"}
                      />
                      <ReadingChip label="Confidence" value="AI-generated" />
                      <ReadingChip
                        label="Reading time"
                        value={`${Math.max(2, Math.round(insights.length * 0.8))} min`}
                      />
                      <ReadingChip label="Analyst" value="RAIS · Pro" />
                    </div>
                  </div>
                )}
              </section>

              {/* Scope selector — drill into a single sheet (e.g. a month) or All Data */}
              {sections.length > 1 && (
                <section style={{ marginBottom: 28 }} className="fade-up">
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--text-3)",
                        flexShrink: 0,
                      }}
                    >
                      View
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <ScopeChip label="All Data" active={scope === "all"} onClick={() => changeScope("all")} />
                      {sections.map((s) => (
                        <ScopeChip key={s.id} label={s.label} active={scope === s.id} onClick={() => changeScope(s.id)} />
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* 3. The Numbers — KPI Grid */}
              {kpis.length > 0 && (
                <section id="kpi-grid" style={{ marginBottom: 56 }} className="fade-up">
                  <SectionHeader
                    eyebrow="01 · The Numbers"
                    title={activeSection ? `At a glance · ${activeSection.label}` : "At a glance"}
                    sub={
                      hasRawData
                        ? "✓ Computed facts · Click any number in Verify mode to trace it back to its source column."
                        : "✓ Computed facts."
                    }
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: verifyMode
                        ? "repeat(2, minmax(0, 1fr))"
                        : `repeat(${Math.min(3, kpis.length)}, minmax(0, 1fr))`,
                      gap: "var(--gap-grid)",
                    }}
                  >
                    {kpis.map((kpi, i) => (
                      <KPICard
                        key={`${kpi.label}-${i}`}
                        kpi={kpi}
                        compact={verifyMode}
                        isActive={verifyMode && activeKpiIndex === i}
                        onClick={verifyMode ? () => handleKpiClick(i) : undefined}
                        ref={(el) => {
                          if (el) kpiRefs.current.set(i, el);
                          else kpiRefs.current.delete(i);
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 4. The Picture — Charts */}
              {charts.length > 0 && (
                <section id="charts-grid" style={{ marginBottom: 56 }} className="fade-up">
                  <SectionHeader
                    eyebrow="02 · The Picture"
                    title="Where the data points"
                    sub="✓ Computed facts · Plotted dynamically from aggregated sheets."
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        verifyMode || charts.length === 1 ? "1fr" : "1fr 1fr",
                      gap: "var(--gap-grid)",
                    }}
                  >
                    {charts.map((chart, i) => (
                      <ChartContainer
                        key={`${chart.title}-${i}`}
                        title={chart.title}
                        description={chart.description ?? undefined}
                        type={chart.type}
                        data={chart.data}
                        figNum={String(i + 1).padStart(2, "0")}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 4b. Pareto diagnostics — Lean Six Sigma 80/20 */}
              {pareto && pareto.items.length > 0 && (
                <section id="pareto-diagnostics" style={{ marginBottom: 56 }} className="fade-up">
                  <SectionHeader
                    eyebrow="03 · Lean Diagnostics"
                    title="The vital few"
                    sub="✓ Computed facts · 80/20 Pareto analysis of rejection reasons."
                  />

                  {/* Diagnostic brief */}
                  <div
                    style={{
                      border: "1px solid var(--accent)",
                      borderRadius: "var(--radius-lg)",
                      padding: "var(--pad-card)",
                      marginBottom: "var(--gap-grid)",
                      background: "var(--accent-weak)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          background: "var(--accent)",
                          color: "var(--text-invert)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        ⚡ 80/20 Rule
                      </span>
                      <span className="eyebrow accent" style={{ fontWeight: 700, margin: 0 }}>
                        Critical Improvement Area Flagged
                      </span>
                    </div>
                    <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0, fontWeight: 600, color: "var(--text)" }}>
                      {pareto.criticalAreaText}
                    </p>
                    <p style={{ fontSize: 14, lineHeight: 1.55, margin: "12px 0 0", color: "var(--text-2)" }}>
                      <strong>Action plan:</strong> Prioritizing corrective engineering on
                      {" "}
                      {pareto.vitalFewCount === 1 ? "this category" : `these ${pareto.vitalFewCount} categories`}
                      {" "}
                      will resolve the vast majority of shopfloor quality losses.
                    </p>
                  </div>

                  {/* Dual-axis Pareto chart */}
                  <div className="card" style={{ overflow: "hidden" }}>
                    <div style={{ paddingBottom: 16 }}>
                      <div className="eyebrow" style={{ marginBottom: 4 }}>
                        <span style={{ color: "var(--accent)" }}>Fig. P1</span>
                        <span style={{ marginLeft: 8, color: "var(--text-3)" }}>
                          · {pareto.totalDefects.toLocaleString()} total rejects
                        </span>
                      </div>
                      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0, fontWeight: 800, color: "var(--text)" }}>
                        Pareto chart — defect counts vs. cumulative %
                      </h3>
                    </div>
                    <ParetoChart analysis={pareto} />
                  </div>
                </section>
              )}

              {/* 5. Observations (AI observations surface) */}
              {(insights.length > 0 || recommendations.length > 0 || isNarrativePending) && (
                <section id="observations" style={{ marginBottom: 56 }} className="fade-up">
                  <div
                    style={{
                      background: "var(--accent-weak)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-lg)",
                      padding: "var(--pad-card)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          background: "var(--accent)",
                          color: "var(--text-invert)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        AI
                      </span>
                      <span className="eyebrow accent" style={{ fontWeight: 700, margin: 0 }}>
                        Observations & Diagnostics
                      </span>
                    </div>

                    {isNarrativePending ? (
                      <ObservationsSkeleton />
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: verifyMode || !insights.length || !recommendations.length ? "1fr" : "1fr 1fr",
                          gap: 48,
                        }}
                      >
                        {insights.length > 0 && (
                          <div>
                            <SectionHeader
                              eyebrow="Observations"
                              title="What the data is telling you"
                              sub="⚡ Deep diagnostics from the model."
                            />
                            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                              {insights.map((line, i) => (
                                <li
                                  key={i}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "44px 1fr",
                                    gap: 16,
                                    padding: "16px 0",
                                    borderBottom: "1px solid var(--border)",
                                  }}
                                >
                                  <span
                                    className="num"
                                    style={{
                                      fontFamily: "var(--font-display)",
                                      fontSize: 26,
                                      fontWeight: 800,
                                      color: "var(--accent)",
                                      lineHeight: 1,
                                      letterSpacing: "-0.02em",
                                    }}
                                  >
                                    {String(i + 1).padStart(2, "0")}
                                  </span>
                                  <span style={{ fontSize: 15, lineHeight: 1.55 }}>
                                    {safeBolden(line)}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {recommendations.length > 0 && (
                          <div>
                            <SectionHeader
                              eyebrow="Recommendations"
                              title="What to do about it"
                              sub="⚡ Suggested corrective actions."
                            />
                            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                              {recommendations.map((rec, i) => (
                                <li
                                  key={i}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "20px 1fr 80px",
                                    gap: 14,
                                    padding: "16px 0",
                                    borderBottom: "1px solid var(--border)",
                                    alignItems: "center",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 14,
                                      height: 14,
                                      border: "1.5px solid var(--border-strong)",
                                      marginTop: 2,
                                    }}
                                  />
                                  <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                                    {safeBolden(rec)}
                                  </span>
                                  <span
                                    className="num"
                                    style={{
                                      fontSize: 10,
                                      color: "var(--text-3)",
                                      letterSpacing: "0.08em",
                                    }}
                                  >
                                    {["Today", "This wk", "Next wk", "30 days"][i] ?? "—"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* 6. Inserted insight slides */}
              {!verifyMode && slides.length > 0 && (
                <section style={{ marginBottom: 56 }} className="fade-up">
                  <SectionHeader
                    eyebrow="Drill-downs"
                    title="From your questions"
                    sub="Each panel is a standalone insight you can save as an image."
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {slides.map((s, i) => (
                      <InsightSlide
                        key={s.id ?? `slide-${i}`}
                        slide={s}
                        onRemove={() =>
                          setSlides((prev) => prev.filter((_, j) => j !== i))
                        }
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 7. Sources Audit */}
              {mergePlan && !verifyMode && (
                <section id="sources-audit" style={{ marginBottom: 56 }} className="fade-up">
                  <SourcesPanel mergePlan={mergePlan} sectionNum={pad(toc.length)} />
                </section>
              )}

              {/* Colophon */}
              <div
                className="mt-12"
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "var(--text-3)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                <span>RAIS Pro</span>
                <span>
                  Compiled {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span>End of report</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Verify panel */}
          {verifyMode && rawSheets && (
            <div
              ref={rightPanelRef}
              id="verify-scroll"
              style={{
                width: "46%",
                minWidth: 420,
                borderLeft: "1px solid var(--border)",
                background: "var(--bg)",
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              <VerifyPanel
                sheets={rawSheets}
                mergePlan={mergePlan}
                activeSourceColumn={activeSourceColumn}
                traceLabel={traceLabel}
                verifyRequest={verifyRequest}
                onHighlightResolved={onHighlightResolved}
                onColumnRef={handleColRef}
              />
            </div>
          )}
        </div>
      </div>

      {/* Beam overlay */}
      {verifyMode && t.showBeams && activeKpiIndex !== null && (
        <BeamOverlay beams={beams} />
      )}

      {/* Chat dock — hidden in verify mode to keep focus on tracing */}
      {!verifyMode && (
        <ChatPanel
          dataSummary={dataSummary}
          currentConfig={currentConfig}
          sessionId={sessionId}
          onSlideAdded={(slide) => setSlides((prev) => [...prev, slide])}
        />
      )}
    </div>
  );
}

// Editorial section header used inline (not exported — kept here to avoid a
// fifth tiny file). Mirrors components.jsx SectionHeader.
function SectionHeader({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 20,
      }}
    >
      <div>
        {eyebrow && (
          <div className="eyebrow accent" style={{ marginBottom: 6 }}>
            {eyebrow}
          </div>
        )}
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: 0, fontWeight: 800, letterSpacing: "-0.02em" }}>
          {title}
        </h2>
        {sub && (
          <div className="muted" style={{ marginTop: 6, fontSize: 13, maxWidth: 640 }}>
            {sub}
          </div>
        )}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

// Scope selector chip — switches the KPI/charts region between "All Data" and
// a single sheet's deterministic breakdown.
function ScopeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "6px 12px",
        borderRadius: "var(--radius-pill)",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "var(--font-sans)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        background: active ? "var(--accent)" : "var(--surface)",
        color: active ? "var(--text-invert)" : "var(--text-2)",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: active ? "var(--accent)" : "var(--border-strong)",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}
