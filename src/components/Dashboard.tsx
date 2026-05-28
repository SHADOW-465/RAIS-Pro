// src/components/Dashboard.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import KPICard from "./KPICard";
import ChartContainer from "./ChartContainer";
import StatusAlert from "./StatusAlert";
import ChatPanel from "./ChatPanel";
import InsightSlide from "./InsightSlide";
import DataTable, { findColumn } from "./DataTable";
import BeamOverlay, { type BeamEndpoints } from "./BeamOverlay";
import SourcesPanel from "./SourcesPanel";
import Icon from "@/components/editorial/Icon";
import Pill from "@/components/editorial/Pill";
import { useTweaks } from "@/components/editorial/TweaksContext";
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
}

// Bold any number/percent/ID-like token in an insight string
function bolden(s: string): string {
  return s.replace(
    /([0-9]+(?:\.[0-9]+)?%?(?:\s*pt)?|LOT-[A-Z0-9-]+|Line-\d+|Line\s\d+)/g,
    '<strong style="font-weight:700; font-family:var(--mono); padding:1px 4px; background:var(--paper-deep);">$1</strong>',
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
        : "var(--ink)";
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span className="eyebrow muted" style={{ fontSize: 9 }}>
        {label}
      </span>
      <span
        className="mono"
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
}: DashboardProps) {
  const [currentConfig, setCurrentConfig] = useState<DashboardConfig>(data);
  const [slides, setSlides] = useState<InsightSlideType[]>(initialSlides ?? []);
  const { t } = useTweaks();

  const [verifyMode, setVerifyMode] = useState(false);
  const [activeKpiIndex, setActiveKpiIndex] = useState<number | null>(null);

  const kpiRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const colRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  const [beams, setBeams] = useState<BeamEndpoints[]>([]);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const hasRawData = !!rawSheets?.length;

  const computeBeams = useCallback(() => {
    if (!verifyMode || activeKpiIndex === null || !t.showBeams) {
      setBeams([]);
      return;
    }
    const kpi = currentConfig.kpis[activeKpiIndex];
    if (!kpi?.sourceColumn || !rawSheets?.length) {
      setBeams([]);
      return;
    }
    for (const sheet of rawSheets) {
      const matched = findColumn(kpi.sourceColumn, sheet.columns);
      if (!matched) continue;
      const kpiEl = kpiRefs.current.get(activeKpiIndex);
      const colEl = colRefs.current.get(matched);
      if (!kpiEl || !colEl) continue;
      setBeams([
        {
          id: `${activeKpiIndex}-${matched}`,
          from: kpiEl.getBoundingClientRect(),
          to: colEl.getBoundingClientRect(),
        },
      ]);
      return;
    }
    setBeams([]);
  }, [verifyMode, activeKpiIndex, currentConfig.kpis, rawSheets, t.showBeams]);

  useEffect(() => {
    computeBeams();
  }, [computeBeams]);

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

  const highlightColumns: string[] = [];
  if (activeKpiIndex !== null && rawSheets?.length) {
    const kpi = currentConfig.kpis[activeKpiIndex];
    if (kpi?.sourceColumn) {
      for (const sheet of rawSheets) {
        const match = findColumn(kpi.sourceColumn, sheet.columns);
        if (match) {
          highlightColumns.push(match);
          break;
        }
      }
    }
  }

  const handleKpiClick = (i: number) => {
    if (!verifyMode) return;
    setActiveKpiIndex((prev) => (prev === i ? null : i));
  };

  const handleColRef = useCallback(
    (col: string, el: HTMLTableCellElement | null) => {
      if (el) colRefs.current.set(col, el);
      else colRefs.current.delete(col);
    },
    [],
  );

  const toggleVerify = () => {
    setVerifyMode((v) => !v);
    setActiveKpiIndex(null);
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
  const kpis = currentConfig.kpis ?? [];
  const charts = currentConfig.charts ?? [];
  const insights = currentConfig.insights ?? [];
  const recommendations = currentConfig.recommendations ?? [];

  // "In this issue" TOC built from what's actually present
  const toc: Array<[string, string]> = [];
  let secNum = 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (kpis.length) toc.push([pad(secNum++), "The numbers"]);
  if (charts.length) toc.push([pad(secNum++), "The picture"]);
  if (insights.length) toc.push([pad(secNum++), "Five things to know"]);
  if (recommendations.length) toc.push([pad(secNum++), "What to do this week"]);
  if (mergePlan) toc.push([pad(secNum++), "Sources & merge audit"]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="masthead">
        <div className="shell-wide">
          <div className="row1">
            <div className="left" style={{ gap: 20 }}>
              <button
                className="btn ghost sm"
                onClick={onReset}
                title="Back to upload"
                aria-label="Back"
              >
                <Icon name="arrow-left" size={14} />
              </button>
              <div className="nameplate">
                The Rejection <em>Report</em>
              </div>
              <Pill tone="outline">{title}</Pill>
            </div>
            <div className="right">
              {hasRawData && (
                <button
                  className={`btn ${verifyMode ? "primary" : ""}`}
                  onClick={toggleVerify}
                >
                  <Icon name="split" size={13} /> Verify data
                </button>
              )}
              <button className="btn" onClick={() => window.print()}>
                <Icon name="print" size={13} /> Export
              </button>
              <button className="btn accent" onClick={onReset}>
                <Icon name="plus" size={13} /> New analysis
              </button>
            </div>
          </div>
          <div className="meta">
            <div>
              <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
                RAIS Pro
              </span>
              <span className="pipe">·</span>
              <span>{today}</span>
            </div>
            <div>
              <span className="mono">
                {kpis.length} kpis · {charts.length} figures
              </span>
              <span className="pipe">·</span>
              <span style={{ color: "var(--positive)" }}>●</span>
              <span style={{ marginLeft: 4 }}>compiled just now</span>
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
          <div className="shell-wide" style={{ paddingTop: 36, paddingBottom: 48 }}>
            {/* Critical alert */}
            {alerts.length > 0 && (
              <div style={{ marginBottom: 36 }}>
                <StatusAlert message={alerts[0]} type="danger" />
              </div>
            )}

            {/* Lead story */}
            <section style={{ marginBottom: 56 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: verifyMode ? "1fr" : "1fr 320px",
                  gap: 48,
                }}
              >
                <div>
                  <div className="eyebrow accent" style={{ marginBottom: 12 }}>
                    The brief
                  </div>
                  <h1
                    className="serif tracked-tight"
                    style={{
                      fontSize: verifyMode ? 40 : 52,
                      fontWeight: 500,
                      lineHeight: 1.05,
                      margin: 0,
                      letterSpacing: "-0.025em",
                    }}
                  >
                    {title}
                  </h1>
                  <p
                    style={{
                      fontSize: 17,
                      lineHeight: 1.55,
                      color: "var(--ink-soft)",
                      marginTop: 20,
                      marginBottom: 0,
                      maxWidth: 760,
                    }}
                  >
                    {currentConfig.executiveSummary}
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

                {!verifyMode && toc.length > 0 && (
                  <aside
                    style={{
                      borderLeft: "2px solid var(--ink)",
                      paddingLeft: 24,
                    }}
                  >
                    <div className="eyebrow" style={{ marginBottom: 10 }}>
                      In this issue
                    </div>
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        fontSize: 13,
                        lineHeight: 1.8,
                      }}
                    >
                      {toc.map(([n, label]) => (
                        <li
                          key={n}
                          className="flex gap-3"
                          style={{
                            alignItems: "baseline",
                            borderBottom: "1px dashed var(--hairline)",
                            padding: "6px 0",
                          }}
                        >
                          <span className="mono muted" style={{ fontSize: 11 }}>
                            {n}
                          </span>
                          <span style={{ flex: 1 }}>{label}</span>
                          <span
                            className="muted mono"
                            style={{ fontSize: 10 }}
                          >
                            p.{n}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </aside>
                )}
              </div>
            </section>

            <hr className="rule mb-8" />

            {/* THE NUMBERS — KPI Grid */}
            {kpis.length > 0 && (
              <section style={{ marginBottom: 56 }}>
                <SectionHeader
                  eyebrow="01 · The Numbers"
                  title="At a glance"
                  sub={
                    hasRawData
                      ? "Click any number in Verify mode to trace it back to its source column."
                      : undefined
                  }
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${verifyMode ? 2 : Math.min(3, kpis.length)}, 1fr)`,
                    gap: "var(--gap-grid)",
                  }}
                >
                  {kpis.map((kpi, i) => (
                    <KPICard
                      key={`${kpi.label}-${i}`}
                      kpi={kpi}
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

            {/* THE PICTURE — Charts */}
            {charts.length > 0 && (
              <section style={{ marginBottom: 56 }}>
                <SectionHeader
                  eyebrow="02 · The Picture"
                  title="Where the data points"
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
                      description={chart.description}
                      type={chart.type}
                      data={chart.data}
                      figNum={String(i + 1).padStart(2, "0")}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Inserted insight slides */}
            {slides.length > 0 && (
              <section style={{ marginBottom: 56 }}>
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

            {/* Insights + recommendations */}
            {(insights.length > 0 || recommendations.length > 0) && (
              <section style={{ marginBottom: 56 }}>
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
                        eyebrow="03 · Five things to know"
                        title="What the data is telling you"
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
                              borderBottom: "1px solid var(--hairline)",
                            }}
                          >
                            <span
                              className="serif"
                              style={{
                                fontSize: 28,
                                fontWeight: 500,
                                color: "var(--accent)",
                                lineHeight: 1,
                                letterSpacing: "-0.02em",
                              }}
                            >
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span
                              style={{ fontSize: 15, lineHeight: 1.55 }}
                              dangerouslySetInnerHTML={{ __html: bolden(line) }}
                            />
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {recommendations.length > 0 && (
                    <div>
                      <SectionHeader
                        eyebrow="04 · This week"
                        title="What to do about it"
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
                              borderBottom: "1px solid var(--hairline)",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                width: 14,
                                height: 14,
                                border: "1.5px solid var(--ink)",
                                marginTop: 2,
                              }}
                            />
                            <span
                              style={{ fontSize: 14, lineHeight: 1.5 }}
                              dangerouslySetInnerHTML={{ __html: bolden(rec) }}
                            />
                            <span
                              className="mono"
                              style={{
                                fontSize: 10,
                                color: "var(--muted)",
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
              </section>
            )}

            {/* Sources audit */}
            {mergePlan && !verifyMode && (
              <SourcesPanel mergePlan={mergePlan} sectionNum={pad(toc.length)} />
            )}

            {/* Colophon */}
            <div
              className="mt-12"
              style={{
                borderTop: "1px solid var(--ink)",
                paddingTop: 16,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: "var(--muted)",
                fontFamily: "var(--mono)",
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
              borderLeft: "1px solid var(--ink)",
              background: "var(--paper-deep)",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            <DataTable
              sheets={rawSheets}
              highlightColumns={highlightColumns}
              onColumnRef={handleColRef}
            />
          </div>
        )}
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
          onRefresh={setCurrentConfig}
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
        <h2 className="serif tracked-tight" style={{ fontSize: 28, margin: 0, fontWeight: 600 }}>
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
