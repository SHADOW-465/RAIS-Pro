// src/components/Dashboard.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, RefreshCw, Layers, Info, ShieldCheck, X } from "lucide-react";
import KPICard from "./KPICard";
import ChartContainer from "./ChartContainer";
import StatusAlert from "./StatusAlert";
import ChatPanel from "./ChatPanel";
import InsightSlide from "./InsightSlide";
import DataTable, { findColumn } from "./DataTable";
import BeamOverlay, { type BeamEndpoints } from "./BeamOverlay";
import type { DashboardConfig, RawSheet } from "@/types/dashboard";
import type { InsightSlide as InsightSlideType } from "@/types/dashboard";

interface DashboardProps {
  data: DashboardConfig;
  dataSummary: string;
  onReset: () => void;
  sessionId?: string;
  sessionTitle?: string;
  initialSlides?: InsightSlideType[];
  rawSheets?: RawSheet[];
}

export default function Dashboard({
  data,
  dataSummary,
  onReset,
  sessionId,
  sessionTitle,
  initialSlides,
  rawSheets,
}: DashboardProps) {
  const [currentConfig, setCurrentConfig] = useState<DashboardConfig>(data);
  const [slides, setSlides] = useState<InsightSlideType[]>(initialSlides ?? []);

  // ── Verify mode state ────────────────────────────────────────────────────────
  const [verifyMode, setVerifyMode] = useState(false);
  const [activeKpiIndex, setActiveKpiIndex] = useState<number | null>(null);

  // Refs: KPI cards indexed by position
  const kpiRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Refs: column header cells indexed by column name
  const colRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  const [beams, setBeams] = useState<BeamEndpoints[]>([]);

  // ── Compute beams when active KPI or verify mode changes ─────────────────────
  const computeBeams = useCallback(() => {
    if (!verifyMode || activeKpiIndex === null) {
      setBeams([]);
      return;
    }

    const kpi = currentConfig.kpis[activeKpiIndex];
    if (!kpi?.sourceColumn || !rawSheets?.length) {
      setBeams([]);
      return;
    }

    // Find the matching column across all sheets
    for (const sheet of rawSheets) {
      const matchedCol = findColumn(kpi.sourceColumn, sheet.columns);
      if (!matchedCol) continue;

      const kpiEl = kpiRefs.current.get(activeKpiIndex);
      const colEl = colRefs.current.get(matchedCol);
      if (!kpiEl || !colEl) continue;

      setBeams([{
        id: `${activeKpiIndex}-${matchedCol}`,
        from: kpiEl.getBoundingClientRect(),
        to: colEl.getBoundingClientRect(),
      }]);
      return;
    }

    setBeams([]);
  }, [verifyMode, activeKpiIndex, currentConfig.kpis, rawSheets]);

  useEffect(() => {
    computeBeams();
  }, [computeBeams]);

  // Recompute beams on scroll (both panels)
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = () => computeBeams();
    const left = leftPanelRef.current;
    const right = rightPanelRef.current;
    left?.addEventListener("scroll", handler, { passive: true });
    right?.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler, { passive: true });
    return () => {
      left?.removeEventListener("scroll", handler);
      right?.removeEventListener("scroll", handler);
      window.removeEventListener("resize", handler);
    };
  }, [computeBeams]);

  // ── Resolve highlight columns for DataTable ──────────────────────────────────
  const highlightColumns: string[] = [];
  if (activeKpiIndex !== null && rawSheets?.length) {
    const kpi = currentConfig.kpis[activeKpiIndex];
    if (kpi?.sourceColumn) {
      for (const sheet of rawSheets) {
        const match = findColumn(kpi.sourceColumn, sheet.columns);
        if (match) { highlightColumns.push(match); break; }
      }
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleKpiClick = (index: number) => {
    if (!verifyMode) return;
    setActiveKpiIndex(prev => prev === index ? null : index);
  };

  const handleColRef = useCallback(
    (col: string, el: HTMLTableCellElement | null) => {
      if (el) colRefs.current.set(col, el);
      else colRefs.current.delete(col);
    },
    []
  );

  const toggleVerify = () => {
    setVerifyMode(v => !v);
    setActiveKpiIndex(null);
    setBeams([]);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
  };

  const hasRawData = !!rawSheets?.length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Sticky topbar ──────────────────────────────────── */}
      <header className="topbar sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onReset} className="text-accent font-semibold hover:underline">
            ← Home
          </button>
          <span className="text-text-muted">/</span>
          <span className="font-bold text-text-primary truncate max-w-[260px]">
            {sessionTitle || currentConfig.dashboardTitle || "Analysis"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasRawData && (
            <button
              onClick={toggleVerify}
              className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-1.5 rounded-full border transition-all ${
                verifyMode
                  ? "bg-accent/15 border-accent/40 text-accent"
                  : "btn-ghost border-transparent"
              }`}
            >
              <ShieldCheck size={14} />
              {verifyMode ? "Exit Verify" : "Verify Data"}
            </button>
          )}
          <button onClick={() => window.print()} className="btn-ghost flex items-center gap-2">
            <Download size={14} />
            Export
          </button>
          <button onClick={onReset} className="btn-primary flex items-center gap-2">
            <RefreshCw size={14} />
            New Analysis
          </button>
        </div>
      </header>

      {/* ── Verify mode hint banner ───────────────────────────── */}
      <AnimatePresence>
        {verifyMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden flex-shrink-0"
          >
            <div className="bg-accent/8 border-b border-accent/20 px-6 py-2 flex items-center gap-2 text-xs text-accent">
              <ShieldCheck size={12} />
              <span className="font-semibold">Verification mode —</span>
              click any KPI card to highlight its source column and draw a data trace beam
              <button onClick={toggleVerify} className="ml-auto opacity-60 hover:opacity-100">
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Split body ─────────────────────────────────────────── */}
      <div className={`flex flex-1 overflow-hidden ${verifyMode ? "divide-x divide-white/30" : ""}`}>

        {/* LEFT — Dashboard content */}
        <div
          ref={leftPanelRef}
          className={`overflow-y-auto transition-all duration-300 ${verifyMode ? "w-1/2" : "w-full"}`}
        >
          <div className={`${verifyMode ? "px-5 py-6 max-w-none" : "max-w-5xl mx-auto px-6 py-8"}`}>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-6"
            >
              {/* Alerts */}
              {(currentConfig.alerts ?? []).map((alert, i) => (
                <StatusAlert key={i} message={alert} type="danger" />
              ))}

              {/* Executive Summary */}
              <motion.div variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}>
                <div className="glass-summary p-6 space-y-3">
                  <div className="flex items-center gap-2 text-accent text-[10px] font-bold uppercase tracking-widest">
                    <Layers size={12} /> Executive Summary
                  </div>
                  <p className="text-base font-medium text-text-primary leading-relaxed">
                    {currentConfig.executiveSummary}
                  </p>
                </div>
              </motion.div>

              {/* KPI Grid */}
              <div className={`grid gap-4 ${verifyMode ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
                {(currentConfig.kpis ?? []).length === 0 ? (
                  <div className="col-span-4 text-text-muted text-sm text-center py-4">
                    No key metrics identified
                  </div>
                ) : (
                  currentConfig.kpis.map((kpi, i) => (
                    <KPICard
                      key={i}
                      kpi={kpi}
                      isActive={verifyMode && activeKpiIndex === i}
                      onClick={verifyMode ? () => handleKpiClick(i) : undefined}
                      ref={el => {
                        if (el) kpiRefs.current.set(i, el);
                        else kpiRefs.current.delete(i);
                      }}
                    />
                  ))
                )}
              </div>

              {/* Chart Grid */}
              <div className={`grid gap-5 ${verifyMode ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
                {(currentConfig.charts ?? []).map((chart, i) => (
                  <ChartContainer
                    key={i}
                    title={chart.title}
                    description={chart.description}
                    type={chart.type}
                    data={chart.data}
                  />
                ))}
              </div>

              {/* Insights & Recommendations */}
              <div className={`grid gap-5 ${verifyMode ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
                <motion.div
                  variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                  className={`glass-card p-6 space-y-5 ${verifyMode ? "" : "lg:col-span-2"}`}
                >
                  <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <Info size={12} className="text-accent" /> Key Insights
                  </h3>
                  <div className="space-y-4">
                    {(currentConfig.insights ?? []).map((insight, idx) => (
                      <div key={idx} className="flex gap-4 items-start">
                        <span className="text-accent/40 font-mono text-base font-bold shrink-0">
                          0{idx + 1}
                        </span>
                        <p className="text-sm text-text-secondary leading-relaxed">{insight}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                  className="glass-tinted p-6 space-y-4"
                >
                  <h3 className="text-xs font-bold uppercase tracking-widest text-accent">
                    Recommendations
                  </h3>
                  <ul className="space-y-3">
                    {(currentConfig.recommendations ?? []).map((rec, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-text-primary">
                        <span className="text-warning mt-0.5 shrink-0">→</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </div>

              {/* Insight Slides */}
              {slides.length > 0 && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                    Insight Slides — from your questions
                  </p>
                  {slides.map((slide, i) => (
                    <InsightSlide key={slide.id ?? i} slide={slide} />
                  ))}
                </div>
              )}

              {/* Chat Panel */}
              {!verifyMode && (
                <div data-no-print>
                  <ChatPanel
                    dataSummary={dataSummary}
                    currentConfig={currentConfig}
                    onRefresh={setCurrentConfig}
                    sessionId={sessionId}
                    onSlideAdded={(slide) => setSlides(prev => [...prev, slide])}
                  />
                </div>
              )}

              {/* Footer */}
              <div className="flex flex-wrap gap-2 pt-8 border-t border-white/40">
                <span className="text-[10px] text-text-muted mr-2 font-semibold uppercase tracking-wider">
                  Sources:
                </span>
                <span className="text-[10px] bg-white/50 border border-white/70 rounded-full px-3 py-1 text-text-muted">
                  RAIS Analysis
                </span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* RIGHT — Data verification panel */}
        <AnimatePresence>
          {verifyMode && rawSheets && (
            <motion.div
              ref={rightPanelRef}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="w-1/2 overflow-hidden flex flex-col bg-white/30 backdrop-blur-sm"
            >
              {/* Panel header */}
              <div className="px-4 py-3 border-b border-white/40 flex-shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                  <ShieldCheck size={11} className="text-accent" />
                  Source Data
                  {activeKpiIndex !== null && (
                    <span className="ml-auto text-accent font-semibold normal-case tracking-normal">
                      Tracing: {currentConfig.kpis[activeKpiIndex]?.label}
                    </span>
                  )}
                </p>
              </div>

              <DataTable
                sheets={rawSheets}
                highlightColumns={highlightColumns}
                onColumnRef={handleColRef}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bezier beam overlay ─────────────────────────────────── */}
      <BeamOverlay beams={beams} />
    </div>
  );
}
