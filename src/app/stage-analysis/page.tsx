"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import FloatingDetailModal, { type SourceRow, type SourceMetricKind } from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card,
  LineChart,
  MultiLine,
  BarsH,
  ProcessFlow,
  Donut,
  pct
} from "@/components/app/widgets";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import { sortStageIds } from "@/core/ontology/plant-catalog";
import {
  rejectionRate,
  byStage,
  trend,
  stageTrend,
  periodsIn,
  periodKey,
  periodLabel,
  resolveScope,
  scopeEvents,
  type Scope,
  getTargetRejectionRate,
  useApplyInvestigationFromUrl,
  toSourceRows,
  STAGE_LABELS,
} from "@/lib/analytics";

export default function StageAnalysisPage() {
  const { t } = useTweaks();
  // Mid-path: apply ?grain&from&to&stage from dashboard funnel / attention rail.
  useApplyInvestigationFromUrl();
  const { events: contextEvents, isLoading } = useEvents();
  const { registry, policy } = useRegistry();
  const activeRegistry = registry || EMPTY_REGISTRY;
  const events = contextEvents ? (contextEvents as any[]) : null;
  const [targetRej, setTargetRej] = useState(0.10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [modalMetricKind, setModalMetricKind] = useState<SourceMetricKind>("rejection_rate");
  const [modalInitialShowSource, setModalInitialShowSource] = useState(false);
  const [modalDefaultSourceTab, setModalDefaultSourceTab] = useState<"batches" | "history">("batches");
  const [rawSheets, setRawSheets] = useState<any[] | undefined>(undefined);
  const [layoutTemplate, setLayoutTemplate] = useState<"2-wide" | "1-full" | "3-grid" | "4-compact">(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("rais_stage_grid_layout");
        if (saved === "2-wide" || saved === "1-full" || saved === "3-grid" || saved === "4-compact") {
          return saved;
        }
      } catch {}
    }
    return "2-wide";
  });

  useEffect(() => {
    try {
      localStorage.setItem("rais_stage_grid_layout", layoutTemplate);
    } catch {}
  }, [layoutTemplate]);

  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: { rows: SourceRow[]; value: string; metricKind?: SourceMetricKind },
    options?: { initialShowSource?: boolean; defaultSourceTab?: "batches" | "history" }
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
    setModalMetricKind(source?.metricKind ?? "rejection_rate");
    setModalInitialShowSource(options?.initialShowSource ?? false);
    setModalDefaultSourceTab(options?.defaultSourceTab ?? "batches");
    setModalOpen(true);
  };

  useEffect(() => {
    setTargetRej(getTargetRejectionRate());

    // Load stashed raw sheets if any are available in sessionStorage
    try {
      let activeId = sessionStorage.getItem("rais_active_session_id");
      if (!activeId) {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith("rais_raw_")) {
            activeId = key.substring("rais_raw_".length);
            break;
          }
        }
      }
      if (activeId) {
        const stored = sessionStorage.getItem(`rais_raw_${activeId}`);
        if (stored) setRawSheets(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, []);

  const scope: Scope = useMemo(
    () => resolveScope(events ?? [], t, policy),
    [events, t, policy],
  );

  const srcRows = (filter: Parameters<typeof toSourceRows>[1] = {}): SourceRow[] =>
    events ? toSourceRows(scopeEvents(events, scope), filter) : [];

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;

    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    const rate = rejectionRate(events, scope, activeRegistry).value;
    const stages = byStage(events, scope, activeRegistry);
    const stageRank = new Map(sortStageIds(stages.map((s) => s.stageId)).map((id, i) => [id, i]));
    const orderedStages = [...stages].sort(
      (a, b) => (stageRank.get(a.stageId) ?? 99) - (stageRank.get(b.stageId) ?? 99),
    );
    const tr = trend(events, scope, "rejectionRate", activeRegistry);
    const st = stageTrend(events, scope, activeRegistry);

    return {
      rate,
      stages: orderedStages,
      tr,
      stageTrend: st,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain, activeRegistry]);

  return (
    <AppShell active="stage" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            Stage Analysis
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect quality thresholds, bottleneck gates, and rejection ratios
            {t.stageView !== "cumulative" ? ` · focused on ${STAGE_LABELS[t.stageView] ?? t.stageView}` : " across manufacturing stages"}
            {t.dateFrom && t.dateTo ? ` · ${t.dateFrom} → ${t.dateTo}` : ""}.
          </p>
        </div>

        {isLoading && (
          <PageLoader message="Aggregating stage quality events..." minHeight="40vh" />
        )}

        {!isLoading && (!events || events.length === 0) && (
          <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, marginBottom: 8, color: "var(--text)" }}>
              No Data Available
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>
              Please upload monthly inspection workbooks in Staging &amp; Review to populate these metrics.
            </p>
            <a
              href="/staging"
              style={{
                display: "inline-block", textDecoration: "none", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12.5,
                color: "var(--paper)", background: "var(--accent)", border: "none",
                padding: "8px 16px", borderRadius: "var(--radius-md)", cursor: "pointer"
              }}
            >
              Go to Staging &amp; Review →
            </a>
          </div>
        )}

        {m && (() => {
          const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";
          const hasLeft = m.stageTrend.length > 0 || m.tr.length > 0;
          const hasRight = m.stages.length > 0;
          const gridTemplate = hasLeft && hasRight ? "minmax(0, 1.8fr) minmax(0, 1.2fr)" : "minmax(0, 1fr)";

          return (
            <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 20 }}>
              {hasLeft && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                  {m.stageTrend.length > 0 && (
                    <Card title={`Stage-wise Rejection Trend (${grainLabel})`} onClick={() => openModal(`Stage-wise Rejection Trend (${grainLabel})`, "Visual Inspection continues to drive the highest defect volume, followed by Valve Integrity and Balloon Inspection.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.stageTrend} stages={activeRegistry.stages} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}>
                      <MultiLine data={m.stageTrend} stages={activeRegistry.stages} />
                    </Card>
                  )}

<<<<<<< Updated upstream
                  {m.tr.length > 0 && (
                    <Card title={`Overall Rejection Trend (${grainLabel})`} onClick={() => openModal(`Overall Rejection Trend (${grainLabel})`, `Overall ${grainLabel.toLowerCase()} rejection trend lines compared to the target limit of ${(targetRej * 100).toFixed(0)}%.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}>
                      <LineChart points={m.tr} target={targetRej} fmt={pct} />
                    </Card>
                  )}
=======
                {m.stageTrend.length > 0 && chartStages.length > 0 && (
                  <Card
                    title={`Multi-Stage Rejection Comparative (${grainLabel})`}
                    sub="Comparative trend overlay across all manufacturing stations"
                    onClick={() =>
                      openModal(
                        `All Stages Rejection Trend (${grainLabel})`,
                        "Each colour is one station in process order. The same colours are used on the pie and on the per-stage charts below.",
                        <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <MultiLine data={m.stageTrend} stages={chartStages} colorByStageId={colorByStageId} />
                        </div>,
                        { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) }
                      )
                    }
                  >
                    <MultiLine data={m.stageTrend} stages={chartStages} colorByStageId={colorByStageId} height={230} />
                  </Card>
                )}
              </div>

              {/* Middle Tier: Station-by-Station Grid */}
              {m.stageTrend.length > 0 && chartStages.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                        Station Gate Breakdown ({chartStages.length} Active Stations)
                      </h2>
                      <span className="muted" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
                        Independent station defect curves vs control limits
                      </span>
                    </div>

                    {/* Size Orientation Layout Option */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.04em" }}>
                        LAYOUT:
                      </span>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          padding: 2,
                          gap: 2,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setLayoutTemplate("2-wide")}
                          title="2-Wide — 2 graphs side-by-side with full horizontal timeline vision"
                          style={{
                            padding: "3px 9px",
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            background: layoutTemplate === "2-wide" ? "var(--surface-2)" : "transparent",
                            color: layoutTemplate === "2-wide" ? "var(--accent)" : "var(--text-3)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span>▥</span>
                          <span>2-WIDE</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLayoutTemplate("1-full")}
                          title="1-Full — 1 panoramic full-width graph per row with complete timeline vision"
                          style={{
                            padding: "3px 9px",
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            background: layoutTemplate === "1-full" ? "var(--surface-2)" : "transparent",
                            color: layoutTemplate === "1-full" ? "var(--accent)" : "var(--text-3)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span>▤</span>
                          <span>1-FULL</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLayoutTemplate("3-grid")}
                          title="3-Grid — 3 graphs per row balanced layout"
                          style={{
                            padding: "3px 9px",
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            background: layoutTemplate === "3-grid" ? "var(--surface-2)" : "transparent",
                            color: layoutTemplate === "3-grid" ? "var(--accent)" : "var(--text-3)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span>▦</span>
                          <span>3-GRID</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLayoutTemplate("4-compact")}
                          title="4-Dense — 4 graphs per row compact view"
                          style={{
                            padding: "3px 9px",
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            background: layoutTemplate === "4-compact" ? "var(--surface-2)" : "transparent",
                            color: layoutTemplate === "4-compact" ? "var(--accent)" : "var(--text-3)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span>⊞</span>
                          <span>4-DENSE</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        layoutTemplate === "1-full"
                          ? "1fr"
                          : layoutTemplate === "2-wide"
                            ? "repeat(auto-fit, minmax(min(100%, 540px), 1fr))"
                            : layoutTemplate === "3-grid"
                              ? "repeat(auto-fit, minmax(min(100%, 380px), 1fr))"
                              : "repeat(auto-fill, minmax(320px, 1fr))",
                      gap: 16,
                    }}
                  >
                    {chartStages.map((s, si) => {
                      const points = m.stageTrend.map((p) => ({
                        period: p.period,
                        label: p.label,
                        value: p.perStage[s.stageId] ?? 0,
                        rejected: p.counts?.[s.stageId]?.rejected,
                        checked: p.counts?.[s.stageId]?.checked,
                      }));
                      const color = colorByStageId[s.stageId];

                      const chartHeight =
                        layoutTemplate === "1-full"
                          ? 260
                          : layoutTemplate === "2-wide"
                            ? 240
                            : layoutTemplate === "3-grid"
                              ? 220
                              : 200;
                      const isChartCompact = layoutTemplate === "4-compact";

                      return (
                        <Card
                          key={s.stageId}
                          title={s.label}
                          onClick={() =>
                            openModal(
                              `${s.label} · ${grainLabel}`,
                              `${s.label} rejection over time. Colour matches the all-stages chart and the pie.`,
                              <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                <LineChart points={points} target={targetRej} fmt={pct} color={color} stage={s.label} />
                              </div>,
                              { rows: srcRows({ types: ["production", "inspection"], stageId: s.stageId }), value: pct(s.rejRate) },
                              { initialShowSource: true, defaultSourceTab: "batches" }
                            )
                          }
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                                {pct(s.rejRate)} · {s.rejected.toLocaleString("en-IN")} rejected of {s.checked.toLocaleString("en-IN")}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <button
                                type="button"
                                title={`Show batch IDs for ${s.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openModal(
                                    `${s.label} · ${grainLabel}`,
                                    `${s.label} rejection over time. Colour matches the all-stages chart and the pie.`,
                                    <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                      <LineChart points={points} target={targetRej} fmt={pct} color={color} stage={s.label} />
                                    </div>,
                                    { rows: srcRows({ types: ["production", "inspection"], stageId: s.stageId }), value: pct(s.rejRate) },
                                    { initialShowSource: true, defaultSourceTab: "batches" }
                                  );
                                }}
                                style={{
                                  padding: "2px 7px",
                                  borderRadius: 4,
                                  border: "1px solid var(--border)",
                                  background: "var(--surface-2)",
                                  color: "var(--text-2)",
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontFamily: "var(--font-mono)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = "var(--accent)";
                                  e.currentTarget.style.borderColor = "var(--accent)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = "var(--text-2)";
                                  e.currentTarget.style.borderColor = "var(--border)";
                                }}
                              >
                                🏷️ Batches
                              </button>
                              <button
                                type="button"
                                title={`View Data Entry History ledger for ${s.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openModal(
                                    `${s.label} · ${grainLabel}`,
                                    `${s.label} rejection over time. Colour matches the all-stages chart and the pie.`,
                                    <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                      <LineChart points={points} target={targetRej} fmt={pct} color={color} stage={s.label} />
                                    </div>,
                                    { rows: srcRows({ types: ["production", "inspection"], stageId: s.stageId }), value: pct(s.rejRate) },
                                    { initialShowSource: true, defaultSourceTab: "history" }
                                  );
                                }}
                                style={{
                                  padding: "2px 7px",
                                  borderRadius: 4,
                                  border: "1px solid var(--border)",
                                  background: "var(--surface-2)",
                                  color: "var(--text-2)",
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontFamily: "var(--font-mono)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = "var(--accent)";
                                  e.currentTarget.style.borderColor = "var(--accent)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = "var(--text-2)";
                                  e.currentTarget.style.borderColor = "var(--border)";
                                }}
                              >
                                📋 History
                              </button>
                              {layoutTemplate !== "4-compact" && (
                                <span style={{
                                  fontSize: 10.5,
                                  fontFamily: "var(--font-mono)",
                                  color: "var(--text-3)",
                                  background: "var(--surface-2)",
                                  padding: "2px 6px",
                                  borderRadius: 3,
                                }}>
                                  Gate #{si + 1}
                                </span>
                              )}
                            </div>
                          </div>
                          <LineChart points={points} target={targetRej} fmt={pct} color={color} stage={s.label} height={chartHeight} compact={isChartCompact} />
                        </Card>
                      );
                    })}
                  </div>
>>>>>>> Stashed changes
                </div>
              )}

              {hasRight && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                  <Card title="Process Flow Quality Gates" onClick={() => openModal("Process Flow Quality Gates", "catheter manufacturing process flow highlights Balloon Sealing and Valve Integrity as crucial quality checkpoints.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stages} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}>
                    <ProcessFlow rows={m.stages} />
                  </Card>

                  <Card title="Stage Contribution (YTD)" onClick={() => openModal("Stage Contribution (YTD)", "Visual Inspection represents the single largest quality loss stage, contributing over half of all shopfloor rejects.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.stages.map((s) => ({ label: s.label, value: s.contributionPct, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}` }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }), value: pct(m.rate) })}>
                    <BarsH rows={m.stages.map((s) => ({ label: s.label, value: s.contributionPct, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}` }))} fmt={(n) => `${n.toFixed(1)}%`} />
                  </Card>

                  <Card title="Rejection Share by Stage">
                    <Donut data={m.stages.map((s) => ({ label: s.label, value: s.rejected }))} />
                  </Card>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <FloatingDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        insight={modalInsight}
        sourceRows={modalSourceRows}
        metricKind={modalMetricKind}
        periodGrain={t.grain === "week" ? "week" : t.grain === "day" ? "day" : "month"}
        primaryValue={modalPrimaryValue}
        rawSheets={rawSheets}
        initialShowSource={modalInitialShowSource}
        defaultSourceTab={modalDefaultSourceTab}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
