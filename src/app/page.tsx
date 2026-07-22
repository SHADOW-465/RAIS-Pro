// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import Icon from "@/components/editorial/Icon";
import FloatingDetailModal, { type SourceRow } from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  Kpi, 
  Empty, 
  LineChart, 
  MultiLine, 
  BarsH, 
  ProcessFlow, 
  GaugeChart,
  AuditVerificationTable,
  StageSizeHeatmap,
  pct,
  rupee,
  num,
  Donut
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import PageLoader from "@/components/app/PageLoader";
import ParetoChart from "@/components/ParetoChart";
import { safeBolden } from "@/components/app/widgets";
import { calculatePareto } from "@/lib/analytics/pareto";
import {
  rejectionRate,
  totalRejected,
  totalChecked,
  fpy,
  byStage,
  trend,
  stageTrend,
  weeklyTrend,
  byDefect,
  defectTrend,
  bySize,
  stageBySize,
  scopeEvents,
  resolveScope,
  type Scope,
  copq,
  savingsOpportunity,
  trustScore,
  auditSummary,
  qualityStatus,
  sizeTrend,
  periodsIn,
  periodKey,
  periodLabel,
  copqTrend,
  getTargetRejectionRate,
  cumulativeStageTrend,
  CUM_TOTAL_KEY,
  goInvestigation,
  type InvestigationState,
  type QualityStatusT,
} from "@/lib/analytics";
import { decide } from "@/core/decision/engine";
import { SEED_DECISION_RULES } from "@/core/decision/seed-rules";
import type { RecommendationT } from "@/shared/models/decision";

const STAGE_LABELS: Record<string, string> = {
  visual: "Visual Inspection", "eye-punching": "Eye Punching", balloon: "Balloon Testing",
  "valve-integrity": "Valve Integrity", final: "Final Inspection",
};

/** Map canonical events → provenance rows for the "View Source" verification panel. */
function toSourceRows(events: Event[], filter: { stageId?: string; defectCode?: string; size?: string; types?: string[] } = {}): SourceRow[] {
  const out: SourceRow[] = [];
  for (const e of events as any[]) {
    if (filter.types && !filter.types.includes(e.eventType)) continue;
    if (filter.stageId && e.stageId !== filter.stageId) continue;
    if (filter.size && e.size !== filter.size) continue;
    if (filter.defectCode && e.defectCodeRaw !== filter.defectCode && e.defectCode !== filter.defectCode) continue;
    const prov = e.provenance ?? {};
    out.push({
      date: e.occurredOn?.start ?? "—",
      stage: STAGE_LABELS[e.stageId] ?? e.stageId ?? "—",
      size: e.size ?? null,
      type: e.eventType + (e.disposition ? `·${e.disposition}` : "") + (e.defectCodeRaw ? ` ${e.defectCodeRaw}` : ""),
      qty: e.quantity ?? e.statedValue ?? "—",
      file: prov.file ?? "Manual Entry",
      fileHash: prov.fileHash ?? null,
      sheet: prov.sheet,
      cell: prov.cells?.[0] ?? "ENTRY",
      isDirect: prov.is_direct_entry === true,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export default function Dashboard() {
  const router = useRouter();
  const { t } = useTweaks();
  const { events, isLoading } = useEvents();
  const { registry } = useRegistry();
  const activeRegistry = registry || EMPTY_REGISTRY;
  const [selectedSize, setSelectedSize] = useState("Fr16");
  const [targetRej, setTargetRej] = useState<number>(0.03);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [modalOriginRect, setModalOriginRect] = useState<DOMRect | null>(null);
  const [rawSheets, setRawSheets] = useState<any[] | undefined>(undefined);
  const lastClickRect = useRef<DOMRect | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('.card'); // Kpis and Cards both use .card
      if (el) {
        lastClickRect.current = el.getBoundingClientRect();
      }
    };
    document.addEventListener('click', handler, true); // Capture phase
    return () => document.removeEventListener('click', handler, true);
  }, []);

  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: { rows: SourceRow[]; value: string },
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
    setModalOriginRect(lastClickRect.current);
    setModalOpen(true);
  };

  useEffect(() => {
    // Load target rejection rate from settings/localStorage
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
    () => resolveScope(events ?? [], t),
    [events, t.grain, t.datePreset, t.dateFrom, t.dateTo, t.stageView],
  );

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;
    
    // Find all distinct periods in current events for the active grain
    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    // Trends bucket by grain across the selected range.
    const trendScope: Scope = scope; // carries the stage filter into the trends

    // Headline metrics aggregate over the SELECTED date range (scope). Grain only
    // controls trend bucketing below — so changing the date range moves every tile,
    // and weekly/daily views are never empty just because the latest period is sparse.
    const rate = rejectionRate(events, scope, activeRegistry).value;
    const rejected = totalRejected(events, scope).value;
    const checked = totalChecked(events, scope, activeRegistry).value;
    const fpyVal = fpy(events, scope, activeRegistry).value;
    const stages = byStage(events, scope, activeRegistry);
    const defects = byDefect(events, scope, activeRegistry);

    // Ensure all 5 stages from mockup are mapped correctly (Visual, Eye Punching, Balloon, Valve, Final)
    const order = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const orderedStages = [...stages].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));

    const tr = trend(events, trendScope, "rejectionRate", activeRegistry);
    const st = stageTrend(events, trendScope, activeRegistry);
    // Cumulative-by-stage trend (stations + additive Total) and the single Total
    // line that matches the workbook's "REJECTION TRENDS" chart.
    const cumTrend = cumulativeStageTrend(events, trendScope, activeRegistry);
    const totalTrend = cumTrend.map((p) => ({ period: p.period, label: p.label, value: p.perStage[CUM_TOTAL_KEY] ?? 0 }));
    // Every stage that has data anywhere — keeps the station tabs stable/discoverable
    // even when the selected date range is sparse for some stations.
    const order2 = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const stagesAll = [...byStage(events, { grain: t.grain }, activeRegistry)].sort((a, b) => order2.indexOf(a.stageId) - order2.indexOf(b.stageId));
    const dt = defectTrend(events, trendScope, 5, activeRegistry);
    const sizes = bySize(events, scope);

    // Sort sizes numerically: Fr10, Fr12, Fr14, Fr16, Fr18
    const orderedSizes = [...sizes].sort((a, b) => {
      const an = parseInt(a.size.replace(/\D/g, ""), 10);
      const bn = parseInt(b.size.replace(/\D/g, ""), 10);
      return an - bn;
    });

    const stageSize = stageBySize(events, scope, activeRegistry);
    const weekly = weeklyTrend(events, trendScope, activeRegistry);
    const copqRes = copq(events, scope);
    const savings = savingsOpportunity(events, scope);
    const trust = trustScore(events, scope);
    const audit = auditSummary(events, scope);
    const status = qualityStatus(events, scope);
    const szTrend = sizeTrend(events, trendScope, selectedSize);
    const cTrend = copqTrend(events, trendScope);

    const worstSize = orderedSizes.length > 0 ? [...orderedSizes].sort((a,b) => b.rejRate - a.rejRate)[0] : null;
    const sizeWiseInsight = worstSize
      ? worstSize.rejRate > 0
        ? `Catheter size ${worstSize.size} shows the highest quality deviation with a rejection rate of ${(worstSize.rejRate * 100).toFixed(2)}% YTD.`
        : "All catheter sizes operate within control parameters with 0.00% rejection rate YTD."
      : "No size-wise rejection data available for the active period.";

    const sizeTrendInsight = szTrend.length > 0
      ? `Quality levels for size ${selectedSize} over time.`
      : `No trend data available for size ${selectedSize} in the active period.`;

    return {
      rate, 
      rejected, 
      checked, 
      fpy: fpyVal, 
      stages: orderedStages,
      defects,
      tr,
      stageTrend: st,
      defectTrend: dt,
      sizes: orderedSizes,
      stageSize,
      weekly,
      copq: copqRes?.value ?? 0,
      savings: savings ?? 0,
      trust, 
      audit, 
      status,
      sizeTrend: szTrend,
      copqTrend: cTrend,
      cumTrend,
      totalTrend,
      stagesAll,
      worstSize,
      sizeWiseInsight,
      sizeTrendInsight,
      snapshotScope: scope,
      trendScope,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : "",
      /** Base investigation scope for mid-path links (period + grain). */
      investigationBase: {
        grain: t.grain,
        from: scope.dateFrom,
        to: scope.dateTo,
      } satisfies Pick<InvestigationState, "grain" | "from" | "to">,
    };
  }, [events, scope, t.grain, selectedSize, activeRegistry]);

  // The active view is the GLOBAL stage scope from the header (TweaksContext).
  const activeView = t.stageView;

  // Synchronize selected size with the available sizes dataset
  useEffect(() => {
    if (m && m.sizes.length > 0 && !m.sizes.some(s => s.size === selectedSize)) {
      const worstSize = [...m.sizes].sort((a, b) => b.rejRate - a.rejRate)[0];
      setSelectedSize(worstSize ? worstSize.size : m.sizes[0].size);
    }
  }, [m, selectedSize]);

  // Build provenance rows for a metric's "View Source" panel (scoped to the snapshot period).
  const srcRows = (filter: Parameters<typeof toSourceRows>[1] = {}): SourceRow[] =>
    events && m ? toSourceRows(scopeEvents(events, m.snapshotScope), filter) : [];

  // Executive summary points
  const exec = useMemo(() => {
    if (!m || m.checked === 0) return [];
    
    let rateDiff = "";
    if (m.tr && m.tr.length >= 2) {
      const last = m.tr[m.tr.length - 1].value;
      const prev = m.tr[m.tr.length - 2].value;
      const diff = last - prev;
      const dir = diff >= 0 ? "increase" : "reduction";
      rateDiff = `, a ${Math.abs(diff * 100).toFixed(2)}% pt ${dir} vs ${m.tr[m.tr.length - 2].label}`;
    }

    const lines = [
      `Overall rejection rate is ${pct(m.rate)}${rateDiff}.`,
      `Visual Inspection contributes ${m.stages.find(s => s.stageId === "visual")?.contributionPct.toFixed(1) ?? "0.0"}% of total rejections.`,
    ];

    // Only assert defect drivers when per-defect data actually exists. Showing
    // "Unknown, Unknown, Unknown" reads as a broken pipeline; an honest note is
    // correct for a regulated context.
    if (m.defects.length > 0) {
      const drivers = m.defects.slice(0, 3).map(d => d.label).join(", ");
      lines.push(`Top defect drivers: ${drivers}.`);
    } else {
      lines.push("Per-defect breakdown unavailable for this period — ingest the size-wise defect sheets to populate it.");
    }

    lines.push(`Estimated annual savings opportunity: ${rupee(m.savings)}.`);
    return lines;
  }, [m]);

  // Phase 6: Recommended Actions come from the decision engine (versioned
  // rules over canonical vars). Numbers are already on the events; rules only
  // match predicates and fill templates — never invent metrics.
  const [engineRecs, setEngineRecs] = useState<RecommendationT[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { recommendations: recs } = await decide(events ?? [], scope, {
        registry: activeRegistry,
        rules: SEED_DECISION_RULES,
        targetRate: targetRej,
        limit: 4,
      });
      if (!cancelled) setEngineRecs(recs);
    })();
    return () => { cancelled = true; };
  }, [events, scope, activeRegistry, targetRej]);

  const recommendations = useMemo(
    () => (engineRecs.length > 0 ? engineRecs.map((r) => r.text) : ["Upload quality records to generate action items."]),
    [engineRecs],
  );

  const recommendationCards = useMemo(() => {
    if (engineRecs.length === 0) {
      return recommendations.map((text) => ({ text, tone: "info" as const, evidence: null as string | null }));
    }
    return engineRecs.map((r) => {
      const tone = (r.severity === "critical" ? "bad" : r.severity === "warning" ? "warn" : "info") as "bad" | "warn" | "info";
      const varBits = Object.entries(r.vars)
        .slice(0, 3)
        .map(([k, v]) => {
          const asPct =
            typeof v === "number" &&
            v <= 1 &&
            (k.includes("rate") || k === "fpy" || k.includes("share"));
          return `${k}=${asPct ? `${(v * 100).toFixed(1)}%` : v}`;
        })
        .join(" · ");
      return {
        text: r.text,
        tone,
        evidence: `${r.ruleId} v${r.ruleVersion}${varBits ? ` · ${varBits}` : ""}`,
      };
    });
  }, [engineRecs, recommendations]);

  const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

  const stats = useMemo(() => {
    if (!m || !m.tr || m.tr.length < 2) {
      return {
        rateDiff: "vs Prior Period",
        rejDiff: "vs Prior Period",
        fpyDiff: "vs Prior Period",
        copqDiff: "vs Prior Period",
      };
    }
    const cur = m.tr[m.tr.length - 1];
    const prev = m.tr[m.tr.length - 2];
    
    const rateChange = cur.value - prev.value;
    const rateDiffSign = rateChange >= 0 ? "↑" : "↓";
    const rateDiffText = `${rateDiffSign} ${(Math.abs(rateChange) * 100).toFixed(2)}% vs ${prev.label}`;

    const rejChange = m.rejected - (prev.value * (m.checked || 1));
    const rejDiffSign = rejChange >= 0 ? "↑" : "↓";
    const rejDiffText = `${rejDiffSign} vs ${prev.label}`;

    const fpyCur = m.fpy;
    const fpyPrev = 1 - prev.value;
    const fpyChange = fpyCur - fpyPrev;
    const fpyDiffSign = fpyChange >= 0 ? "↑" : "↓";
    const fpyDiffText = `${fpyDiffSign} ${(Math.abs(fpyChange) * 100).toFixed(2)}% vs ${prev.label}`;

    let copqDiffText = `vs ${prev.label}`;
    if (m.copqTrend.length >= 2) {
      const lastVal = m.copqTrend[m.copqTrend.length - 1].value;
      const prevVal = m.copqTrend[m.copqTrend.length - 2].value;
      if (prevVal > 0) {
        const diff = ((lastVal - prevVal) / prevVal) * 100;
        const dir = diff >= 0 ? "↑" : "↓";
        copqDiffText = `${dir} ${Math.abs(diff).toFixed(1)}% vs ${prev.label}`;
      }
    }

    return {
      rateDiff: rateDiffText,
      rejDiff: rejDiffText,
      fpyDiff: fpyDiffText,
      copqDiff: copqDiffText,
    };
  }, [m]);

  const worstStageRow = m ? [...m.stages].sort((a, b) => b.rejected - a.rejected)[0] ?? null : null;
  const worstStageByRejs = worstStageRow?.label ?? "Visual Inspection";

  const getDefectRejRate = (defect: any) => {
    if (!m) return 0;
    const regDef = activeRegistry.defects.find(
      (d: any) => d.label === defect.label || d.defectCode === defect.defectCode
    );
    const stagesList = regDef?.stages ?? [];
    let checkedSum = 0;
    for (const stageId of stagesList) {
      const st = m.stages.find((s) => s.stageId === stageId);
      if (st) {
        checkedSum += st.checked;
      }
    }
    if (checkedSum <= 0) {
      const firstStage = m.stages[0];
      checkedSum = firstStage ? firstStage.checked : 1;
    }
    return defect.rejected / checkedSum;
  };

  /** C3: reshape `exec`'s bullet lines into "Executive Brief" form — a bolded
   *  headline (the first/most severe `exec` line, unchanged text) plus labeled
   *  Impact / Primary driver / Recommendation rows. Every value here is already
   *  computed in `m` / `recommendations` — this only relabels/restructures the
   *  existing bullets, it invents nothing. Falls back to plain bullets when
   *  `exec` is sparse (<3 lines) so it never looks broken with little data. */
  const execBrief = useMemo(() => {
    if (!m || exec.length < 3) return null;
    const primaryDriver = worstStageRow
      ? `${worstStageRow.label} (${pct(worstStageRow.rejRate)} rejection rate, ${worstStageRow.contributionPct.toFixed(1)}% of total)`
      : m.defects.length > 0
        ? `${m.defects[0].label} (${m.defects[0].pct.toFixed(1)}% of all rejections)`
        : null;
    return {
      headline: exec[0],
      impact: rupee(m.copq),
      primaryDriver,
      recommendation: recommendations[0] ?? null,
    };
  }, [m, exec, worstStageRow, recommendations]);

  /** Per-KPI drill-down narrative: What happened / Why / Cost impact / [Evidence
   *  is the existing View Source table, wired separately] / Recommended action.
   *  All figures come from `m` — already-computed, already-sorted selectors —
   *  and `recommendations` (filtered to the ONE most relevant line per metric). */
  const kpiNarrative = (metric: "rate" | "fpy" | "copq" | "bottleneck", whatHappened: string): string[] => {
    if (!m) return [whatHappened];
    const lines: string[] = [`What happened: ${whatHappened}`];

    const topStage = [...m.stages].sort((a, b) => b.rejected - a.rejected)[0];
    const topDefect = m.defects[0];
    const topSize = [...m.sizes].sort((a, b) => b.rejRate - a.rejRate)[0];
    const whyParts: string[] = [];
    if (topStage && topStage.rejected > 0) {
      whyParts.push(`${topStage.label} (${topStage.contributionPct.toFixed(1)}% of total rejections)`);
    }
    if (topDefect && topDefect.rejected > 0) {
      whyParts.push(`${topDefect.label} defects (${topDefect.pct.toFixed(1)}% of rejections)`);
    }
    if (topSize && topSize.rejRate > 0) {
      whyParts.push(`size ${topSize.size} (${(topSize.rejRate * 100).toFixed(1)}% rejection rate)`);
    }
    lines.push(
      whyParts.length > 0
        ? `Why: driven mainly by ${whyParts.join(", ")}.`
        : "Why: no single stage, size, or defect stands out as the dominant driver this period."
    );

    if (metric === "copq") {
      lines.push(`Cost impact: this IS the cost-of-poor-quality figure — ${rupee(m.copq)} for the period, against an annual savings opportunity of ${rupee(m.savings)}.`);
    } else {
      lines.push(`Cost impact: this period's rejections carry an estimated ${rupee(m.copq)} in cost of poor quality (COPQ).`);
    }

    let action = "Upload quality records to generate action items.";
    if (metric === "bottleneck" && topStage && topStage.rejected > 0) {
      action = `Audit quality gates and operator logs at ${topStage.label} stage (rejection rate: ${(topStage.rejRate * 100).toFixed(1)}%).`;
    } else if (metric === "copq") {
      action = `Achieving target quality limits offers up to ${rupee(m.savings)} in annual recoverable opportunity — prioritize the highest-rejection stage first.`;
    } else if (recommendations.length > 0) {
      action = recommendations[0];
    }
    lines.push(`Recommended action: ${action}`);

    return lines;
  };

  return (
    <AppShell active="dashboard" trustScore={m?.trust.pct ?? null} statusCounts={{ anomalies: 0, alerts: 0, capa: 0, overdue: 0 }} dateRange={m?.latestPeriodLabel}>
      {isLoading && (
        <PageLoader message="Initializing the intelligence ledger..." minHeight="60vh" />
      )}
      {!isLoading && events && events.length === 0 && (
        <div style={{ padding: "72px 32px", textAlign: "center" }}>
          <div className="h1" style={{ marginBottom: 12 }}>
            No data yet
          </div>
          <div className="body" style={{ color: "var(--text-2)", lineHeight: 1.65, maxWidth: 42 * 16, margin: "0 auto 20px" }}>
            Upload your monthly inspection workbooks on <strong>Staging &amp; Review</strong> to populate the dashboard —
            the <strong>Visual</strong> size-wise book, the <strong>Valve Integrity</strong> size-wise book (covers Balloon + Valve),
            and the <strong>Rejection Analysis</strong> book (covers Final inspection). Or key figures in manually via <strong>Data Entry</strong>.
          </div>
          <button
            onClick={() => router.push("/staging")}
            style={{
              fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 13, cursor: "pointer",
              color: "var(--paper)", background: "var(--accent)", border: "none",
              padding: "10px 20px", borderRadius: "var(--radius-md)",
            }}
          >
            Go to Staging &amp; Review →
          </button>
        </div>
      )}

      {m && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {activeView !== "cumulative" ? (
            (
              <StationView
                events={events!}
                stageId={activeView}
                label={STAGE_LABELS[activeView] ?? activeView}
                scope={m.snapshotScope}
                trendScope={m.trendScope}
                grainLabel={grainLabel}
                targetRej={targetRej}
                openModal={openModal}
                srcRows={srcRows}
                registry={activeRegistry}
              />
            )
          ) : (
          <>
          {/* Section 1: Executive KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "var(--gap-grid)" }}>
            <Kpi
              primary
              label="Overall Rejection"
              value={pct(m.rate)}
              sub={stats.rateDiff}
              tone={m.rate > targetRej ? "bad" : "good"}
              spark={m.tr}
              onClick={() => openModal(
                `${grainLabel} Rejection Rate — Drill-down`,
                kpiNarrative("rate", `The rejection rate stands at ${pct(m.rate)}, compared to the target of ${pct(targetRej)} (${stats.rateDiff}).`),
                <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} /></div>,
                { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) },
              )}
            />
            <Kpi
              primary
              label="First Pass Yield"
              value={pct(m.fpy)}
              sub={stats.fpyDiff}
              tone={m.fpy >= (1 - targetRej) ? "good" : "bad"}
              spark={m.tr.map(p => ({ ...p, value: 1 - p.value }))}
              onClick={() => openModal(
                `${grainLabel} First Pass Yield — Drill-down`,
                kpiNarrative("fpy", `First Pass Yield stands at ${pct(m.fpy)} for the latest period (${stats.fpyDiff}).`),
                <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr.map(p => ({ ...p, value: 1 - p.value }))} fmt={pct} /></div>,
                { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.fpy) },
              )}
            />
            <Kpi
              primary
              label="Top Rejecting Stage"
              value={worstStageByRejs}
              sub={worstStageRow ? `${pct(worstStageRow.rejRate)} rejection rate` : "—"}
              tone={worstStageRow && worstStageRow.rejRate > targetRej ? "bad" : "warn"}
              onClick={() => openModal(
                `${worstStageByRejs} — Drill-down`,
                kpiNarrative("bottleneck", `${worstStageByRejs} is the top bottleneck stage, contributing ${num(worstStageRow?.rejected ?? 0)} rejections (${worstStageRow ? pct(worstStageRow.rejRate) : "—"} rejection rate).`),
                <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stages} /></div>,
                { rows: srcRows({ stageId: worstStageRow?.stageId, types: ["production", "inspection"] }), value: worstStageRow ? pct(worstStageRow.rejRate) : "—" },
              )}
            />
            <Kpi
              primary
              label="Top Defect"
              value={m.defects[0]?.label ?? "—"}
              sub={m.defects[0] ? `${m.defects[0].pct.toFixed(1)}% of all rejections` : "—"}
              tone="warn"
              onClick={() => m.defects[0] && openModal(
                `Top Defect — ${m.defects[0].label}`,
                `The top defect category is ${m.defects[0].label}, accounting for ${m.defects[0].rejected.toLocaleString()} rejects (${m.defects[0].pct.toFixed(1)}% of all rejections).`,
                <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><ParetoChart analysis={calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected }))) || { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "" }} showTable={true} /></div>,
                { rows: srcRows({ defectCode: m.defects[0].label, types: ["rejection"] }), value: m.defects[0].rejected.toLocaleString() }
              )}
            />
            <Kpi
              primary
              label="COPQ (₹)"
              value={rupee(m.copq)}
              sub={stats.copqDiff || "Cost of poor quality"}
              tone={m.copq > 0 ? "bad" : "good"}
              spark={m.copqTrend}
              onClick={() => openModal(
                `COPQ Trend (${grainLabel})`,
                kpiNarrative("copq", `Cost of Poor Quality (COPQ) is ${rupee(m.copq)} for the latest period (${stats.copqDiff}).`),
                <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.copqTrend} fmt={rupee} /></div>,
                { rows: srcRows({ types: ["inspection", "rejection"] }), value: rupee(m.copq) },
              )}
            />
          </div>



          {/* Row 1: Primary Rejection Analytics (3-column layout) */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))", 
            gap: "var(--gap-grid)",
            marginTop: "var(--gap-grid)"
          }}>
            {/* Card 1: Rejection Trend */}
            <Card 
              title="Rejection Trend" 
              sub={`Target (${(targetRej * 100).toFixed(0)}%) & Mean`} 
              onClick={() => openModal(`Rejection Trend (${grainLabel})`, `${grainLabel} rejection trend lines compared to the target limit of ${(targetRej * 100).toFixed(0)}% and the period mean limit.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}
            >
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                <div style={{ flex: 1, minHeight: 180, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <LineChart points={m.tr} target={targetRej} fmt={pct} mean height={180} />
                </div>
                <div style={{ marginTop: "var(--space-2)", display: "flex" }}>
                  <a 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openModal(`Rejection Trend (${grainLabel})`, `${grainLabel} rejection trend lines compared to the target limit of ${(targetRej * 100).toFixed(0)}% and the period mean limit.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) });
                    }}
                    style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
                  >
                    View full trend →
                  </a>
                </div>
              </div>
            </Card>
 
            {/* Card 2: Rejection By Stage */}
            <Card 
              title="Rejection By Stage" 
              sub="YTD Rejection Shares"
              onClick={() => openModal("Stage-wise Rejection (YTD)", "Total rejections share by process stages.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><Donut data={m.stages.map((s) => ({ label: s.label, value: s.rejected }))} size={220} fontSize={13.5} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }), value: num(m.rejected) })}
            >
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
                    <Donut data={m.stages.map((s) => ({ label: s.label.split(" ")[0], value: s.rejected }))} size={130} fontSize={10} hideLegend={true} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-3)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                    {m.stages.slice(0, 4).map((s, idx) => {
                      const colors = ["#2563EB", "#0D9488", "#D97706", "#DC2626", "#EC4899", "#65A30D"];
                      const share = ((s.rejected / (m.rejected || 1)) * 100).toFixed(1);
                      return (
                        <div key={s.stageId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", gap: 8 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text)", minWidth: 0 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors[idx % colors.length], flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                          </span>
                          <span className="num" style={{ fontWeight: 600, flexShrink: 0 }}>
                            {pct(s.rejRate)}{" "}
                            <span className="muted" style={{ fontWeight: 500, fontSize: "var(--text-xs)", fontFamily: "var(--font-sans)" }}>
                              ({share}%)
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ marginTop: "var(--space-2)", display: "flex" }}>
                  <a 
                    href="/stage-analysis"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
                  >
                    View stage analysis →
                  </a>
                </div>
              </div>
            </Card>
 
            {/* Card 3: Top Defects (Pareto) */}
            <Card 
              title="Top Defects (Pareto)" 
              sub="YTD Rejections"
              onClick={() => openModal(
                "Defect Pareto (All Stages)", 
                "Six Sigma Pareto analysis highlighting the vital few defect categories responsible for most rejects.", 
                <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <ParetoChart analysis={calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected }))) || { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "No defect data available for this period." }} showTable={false} />
                </div>, 
                { rows: srcRows({ types: ["rejection"] }), value: num(m.defects.reduce((s, d) => s + d.rejected, 0)) }
              )}
            >
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "20px minmax(0, 1.3fr) 55px 70px 60px", 
                    gap: "var(--space-2)", 
                    fontSize: 10, 
                    fontWeight: 700, 
                    textTransform: "uppercase", 
                    letterSpacing: "0.05em", 
                    color: "var(--text-3)", 
                    paddingBottom: "var(--space-2)", 
                    borderBottom: "1px solid var(--border)" 
                  }}>
                    <div></div>
                    <div>Defect</div>
                    <div style={{ textAlign: "right" }}>Rejection %</div>
                    <div></div>
                    <div style={{ textAlign: "right" }}>% of Total</div>
                  </div>
                  {m.defects.length === 0 ? (
                    <Empty label="No defect data available for this period." />
                  ) : (
                    m.defects.slice(0, 5).map((d, i) => {
                      const colors = ["#C8421C", "#2563EB", "#D97706", "#0D9488", "#EC4899"];
                      const rejRate = getDefectRejRate(d);
                      return (
                        <div key={d.label} style={{ 
                          display: "grid", 
                          gridTemplateColumns: "22px minmax(0, 1.3fr) 58px 70px 56px", 
                          gap: "var(--space-2)", 
                          alignItems: "center", 
                          fontSize: "var(--text-sm)",
                          padding: "4px 0",
                          borderBottom: i < 4 ? "1px solid var(--border)" : "none"
                        }}>
                          <span style={{ color: "var(--text-3)", fontWeight: 600 }}>{i + 1}</span>
                          <span style={{ fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.label}>{d.label}</span>
                          <span className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--text)" }}>{(rejRate * 100).toFixed(1)}%</span>
                          <div style={{ display: "flex", alignItems: "center", paddingLeft: 6 }}>
                            <div style={{ width: "100%", height: 5, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)" }}>
                              <div style={{ width: `${d.pct}%`, height: "100%", background: colors[i % colors.length], borderRadius: 3 }} />
                            </div>
                          </div>
                          <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-2)" }}>{d.pct.toFixed(0)}%</span>
                        </div>
                      );
                    })
                  )}
                </div>
                <div style={{ marginTop: "var(--space-2)", display: "flex" }}>
                  <a 
                    href="/defect-analysis"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
                  >
                    View defect Pareto →
                  </a>
                </div>
              </div>
            </Card>
          </div>
 
          {/* Row 2: Stage wise Rejection Trend (Full Width) */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "1fr", 
            gap: "var(--gap-grid)",
            marginTop: "var(--gap-grid)"
          }}>
            <Card 
              title={`Stage-wise Rejection Trend (${grainLabel})`} 
              sub="per-stage + Total — hover for values" 
              onClick={() => openModal(`Stage-wise Rejection Trend (${grainLabel})`, "Each line is a station's rejection rate over its own checked quantity; the Total line is the per-period sum of those stage rates. Recomputed from raw counts.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.cumTrend} stages={[...m.stagesAll.map((s) => ({ stageId: s.stageId, label: s.label })), { stageId: CUM_TOTAL_KEY, label: "Total" }]} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}
            >
              <MultiLine data={m.cumTrend} stages={[...m.stagesAll.map((s) => ({ stageId: s.stageId, label: s.label })), { stageId: CUM_TOTAL_KEY, label: "Total" }]} height={180} />
            </Card>
          </div>

          {/* Row 4: Stage x Size Concentration Heatmap */}
          {m.stageSize.length > 0 && (
            <div style={{ marginTop: "var(--gap-grid)" }}>
              <Card
                title="Stage x Size Concentration"
                sub="Rejection rate by stage and catheter size (warmer cells indicate concentration hotspots)"
                onClick={() => openModal(
                  "Stage x Size Concentration",
                  "Rejection rate for every stage x size combination present in the selected period — darker/warmer cells indicate where quality problems concentrate.",
                  <div style={{ minHeight: 200 }}><StageSizeHeatmap cells={m.stageSize} /></div>,
                  { rows: srcRows({ types: ["production", "inspection"] }), value: m.stageSize.length ? `${(Math.max(...m.stageSize.map(c => c.rejRate)) * 100).toFixed(1)}%` : "—" },
                )}
              >
                <StageSizeHeatmap cells={m.stageSize} />
              </Card>
            </div>
          )}
 
          {/* Row 5: Size Analytics */}
          {(() => {
            const hasSizeYtd = m.sizes.length > 0;
            const hasSizeTrend = hasSizeYtd && m.sizeTrend.length > 0;
            if (!hasSizeYtd) return null;
            const gridCols = hasSizeTrend ? "minmax(0, 1fr) minmax(0, 2fr)" : "minmax(0, 1fr)";
            return (
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: gridCols, 
                gap: "var(--gap-grid)",
                marginTop: "var(--gap-grid)"
              }}>
                <Card 
                  title="Rejection by Size (YTD)" 
                  sub={m.worstSize ? `Worst: ${m.worstSize.size}` : "YTD"}
                  onClick={() => openModal("Size-wise Rejection (YTD)", m.sizeWiseInsight, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}` }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }).filter(r => r.size), value: m.sizes.length ? `${(Math.max(...m.sizes.map(s => s.rejRate)) * 100).toFixed(1)}%` : "—" })}
                >
                  <BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}` }))} fmt={(n) => `${n.toFixed(1)}%`} />
                </Card>

                {hasSizeTrend && (
                  <Card 
                    title={`Size Trend (${selectedSize})`} 
                    onClick={() => openModal(`Size-wise Trend (${selectedSize})`, m.sizeTrendInsight, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.sizeTrend} fmt={pct} /></div>, { rows: srcRows({ types: ["production", "inspection"], size: selectedSize }), value: m.sizeTrend.length ? pct(m.sizeTrend[m.sizeTrend.length - 1].value) : "—" })}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }} onClick={(e) => e.stopPropagation()}>
                      <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>Size:</span>
                      <select
                        value={selectedSize}
                        onChange={(e) => setSelectedSize(e.target.value)}
                        style={{
                          padding: "2px 6px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border)",
                          background: "var(--surface)",
                          color: "var(--text)",
                          fontSize: "11px",
                          fontWeight: 600,
                          outline: "none",
                          cursor: "pointer"
                        }}
                      >
                        {(m.sizes.length > 0 ? m.sizes.map(s => s.size) : ["Fr10", "Fr12", "Fr14", "Fr16", "Fr18", "Fr20", "Fr22", "Fr24"]).map((sz) => (
                          <option key={sz} value={sz}>{sz}</option>
                        ))}
                      </select>
                    </div>
                    <LineChart points={m.sizeTrend} fmt={pct} height={180} />
                  </Card>
                )}
              </div>
            );
          })()}
 
          {/* Row 6: COPQ & Audit Trail */}
          {(() => {
            const hasCopq = m.copqTrend.length > 0;
            const colList = [
              hasCopq ? "minmax(0, 1fr)" : null,
              "minmax(0, 1.2fr)"
            ].filter(Boolean);
            const gridCols = colList.join(" ");
            return (
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: gridCols, 
                gap: "var(--gap-grid)",
                marginTop: "var(--gap-grid)"
              }}>
                {hasCopq && (
                  <Card 
                    title={`COPQ Trend (${grainLabel})`} 
                    onClick={() => openModal(`COPQ Trend (${grainLabel})`, `Cost of poor quality trends across historical periods.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.copqTrend} fmt={rupee} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }), value: rupee(m.copq) })}
                  >
                    <LineChart points={m.copqTrend} fmt={rupee} height={180} />
                  </Card>
                )}
 
                <Card 
                  title="Audit &amp; Verification" 
                  onClick={() => openModal("Audit & Verification", `Ledger verification metrics derived from processed source files.`, <div style={{ minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "center" }}><AuditVerificationTable sourceFiles={m.audit.sourceFilesProcessed} validation={m.audit.dataValidationChecks} integrity={m.audit.formulaIntegrity} overrides={m.audit.manualOverrides} completeness={m.audit.dataCompleteness} /></div>)}
                >
                  <AuditVerificationTable 
                    sourceFiles={m.audit.sourceFilesProcessed}
                    validation={m.audit.dataValidationChecks}
                    integrity={m.audit.formulaIntegrity}
                    overrides={m.audit.manualOverrides}
                    completeness={m.audit.dataCompleteness}
                  />
                  <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); router.push("/audit"); }}
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "var(--radius-sm)",
                        padding: "6px 16px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        width: "100%"
                      }}
                    >
                      View Audit Trail
                    </button>
                  </div>
                </Card>
              </div>
            );
          })()}

          {/* Quality Status strip — comparison frame (target / watch / prior) + integrity. */}
          <div style={{ marginTop: "var(--gap-grid)" }}>
            <QualityStatusStrip status={m.status} />
          </div>

          {/* Production funnel: entry qty → loss at each gate → final good.
              Gate click = mid-path entry (stage analysis with carried scope). */}
          {m.stages.length > 0 && (
            <div style={{ marginTop: "var(--gap-grid)" }}>
              <Card
                title="Production Funnel"
                sub={`${num(m.checked)} units entered · First Pass Yield ${pct(m.fpy)} · click a gate to investigate`}
              >
                <FunnelStrip
                  stages={m.stages}
                  entryChecked={m.checked}
                  fpy={m.fpy}
                  targetRej={targetRej}
                  onGateClick={(row) => {
                    // Mid-path entry: Stage Analysis with gate + period carried (EX-1 / F7).
                    goInvestigation(router.push.bind(router), "/stage-analysis", {
                      ...m.investigationBase,
                      stage: row.stageId,
                      metric: "stage",
                      label: row.label,
                    });
                  }}
                />
              </Card>
            </div>
          )}

          {/* Attention rail: ranked next steps with carried investigation scope. */}
          <div style={{ marginTop: "var(--gap-grid)" }}>
            <AttentionRail
              m={m}
              targetRej={targetRej}
              base={m.investigationBase}
              onGo={(path, state) => goInvestigation(router.push.bind(router), path, state)}
            />
          </div>
 
          {/* Section 3: AI Diagnostics & Actionable Brief */}
          <div style={{ marginTop: "var(--gap-grid)" }}>
            <Card title="AI Diagnostics & Actionable Brief">
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "minmax(0, 1.8fr) 1px minmax(0, 1.2fr)", 
                gap: 32,
                alignItems: "stretch"
              }}>
                {/* Left Side: Diagnostic Summary */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div
                      className="h3"
                      style={{
                        fontSize: "var(--text-base)",
                        fontWeight: 600,
                        lineHeight: 1.45,
                        color: "var(--text)",
                      }}
                    >
                      {execBrief ? safeBolden(execBrief.headline) : (exec[0] ? safeBolden(exec[0]) : "Diagnostics Brief")}
                    </div>
                    {execBrief ? (
                      <div className="body" style={{ display: "flex", flexDirection: "column", gap: 8, lineHeight: 1.55 }}>
                        <BriefRow label="COPQ Impact" value={execBrief.impact} />
                        {execBrief.primaryDriver && <BriefRow label="Primary Driver" value={execBrief.primaryDriver} />}
                      </div>
                    ) : (
                      <ul className="body" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
                        {exec.slice(1).map((bullet, i) => (
                          <li key={i} style={{ listStyleType: "none", position: "relative", paddingLeft: 4, marginBottom: 8 }}>
                            <span style={{
                              position: "absolute",
                              left: -16,
                              top: 8,
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "var(--accent)"
                            }} />
                            {safeBolden(bullet)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Highlight Block: Worst Stage Bottleneck & Recovery */}
                  <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "1.2fr 1fr", 
                    gap: 16,
                    background: "var(--surface-2)", 
                    border: "1.5px solid var(--border)", 
                    borderRadius: "var(--radius-lg)", 
                    padding: "16px 20px",
                    marginTop: "auto"
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ 
                          width: 10, 
                          height: 10, 
                          borderRadius: "50%", 
                          background: "var(--critical)",
                          boxShadow: "0 0 8px var(--critical)",
                          animation: "pulse-ring 1.5s infinite"
                        }} />
                        <span style={{ fontSize: "var(--text-md)", fontWeight: 600, fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}>
                          {worstStageByRejs} Bottleneck
                        </span>
                      </div>
                      <p className="small" style={{ margin: 0, color: "var(--text-2)", lineHeight: 1.5 }}>
                        Quality deviation is concentrated here at a rejection rate of <strong style={{ fontWeight: 600 }}>{worstStageRow ? pct(worstStageRow.rejRate) : "—"}</strong>.
                      </p>
                    </div>

                    <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 20, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div className="ui-label" style={{ marginBottom: 4 }}>
                        Financial Recovery Potential
                      </div>
                      <div className="kpi" style={{ fontSize: "var(--text-2xl)", color: "var(--critical)" }}>
                        {rupee(m.savings)}
                      </div>
                      <div className="small" style={{ marginTop: 2 }}>
                        YTD scrap reduction potential.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vertical Divider Line */}
                <div style={{ background: "var(--border)", height: "100%" }} />

                {/* Right Side: Action Plan (CAPA Items) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="check" size={14} /> Recommended Actions
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, justifyContent: "center" }}>
                    {recommendationCards.slice(0, 3).map((rec, i) => {
                      const chipColor = rec.tone === "bad" ? "var(--critical)" : rec.tone === "warn" ? "var(--warning)" : "var(--positive)";
                      const chipText = rec.tone === "bad" ? "Critical" : rec.tone === "warn" ? "Warning" : "Info";
                      return (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            padding: "12px 14px",
                            background: "var(--surface-2)",
                            border: "1.5px solid var(--border)",
                            borderRadius: "var(--radius-md)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                padding: "2px 8px",
                                borderRadius: 5,
                                color: chipColor,
                                background: `color-mix(in srgb, ${chipColor} 14%, transparent)`,
                              }}
                            >
                              {chipText}
                            </span>
                            <a
                              href="/capa"
                              style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}
                            >
                              Create CAPA →
                            </a>
                          </div>
                          <div style={{ fontSize: "var(--text-md)", lineHeight: 1.5, color: "var(--text)", fontWeight: 500 }}>{safeBolden(rec.text)}</div>
                          {rec.evidence && (
                            <div className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>{rec.evidence}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          </div>
          </>
          )}
        </div>
      )}

      <FloatingDetailModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          lastClickRect.current = null;
        }}
        title={modalTitle}
        insight={modalInsight}
        primaryValue={modalPrimaryValue}
        sourceRows={modalSourceRows}
        rawSheets={rawSheets}
        originRect={modalOriginRect}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}

/** C3: one labeled row in the Executive Brief card (Impact / Primary driver /
 *  Recommendation). Presentational only — values are computed by the caller. */
function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span className="kpi-label" style={{ minWidth: 108, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--text-md)", color: "var(--text)", lineHeight: 1.45 }}>{safeBolden(value)}</span>
    </div>
  );
}

type FunnelRow = { stageId: string; label: string; checked: number; rejected: number; rejRate: number; contributionPct: number };

/** The sequential gate chain drawn as a funnel: each gate is a block showing its
 *  own checked/rejected, a survivor bar proportional to units entering the line,
 *  and a connector stating what it passed forward. Pure presentation over
 *  `byStage` rows — no new math, no summing across gates. */
function FunnelStrip({ stages, entryChecked, fpy, targetRej, onGateClick }: {
  stages: FunnelRow[];
  entryChecked: number;
  fpy: number;
  targetRej: number;
  onGateClick: (row: FunnelRow) => void;
}) {
  const denom = Math.max(entryChecked, 1);
  const last = stages[stages.length - 1];
  const finalGood = last ? Math.max(last.checked - last.rejected, 0) : 0;
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0, overflowX: "auto", padding: "4px 0" }}>
      {stages.map((s, i) => {
        const passed = Math.max(s.checked - s.rejected, 0);
        const over = s.rejRate > targetRej;
        return (
          <div key={s.stageId} style={{ display: "flex", alignItems: "stretch", flex: 1, minWidth: 150 }}>
            <button
              type="button"
              onClick={() => onGateClick(s)}
              style={{
                flex: 1, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                background: "var(--surface)", padding: "10px 12px",
                display: "flex", flexDirection: "column", gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  color: "var(--text)",
                  lineHeight: 1.3,
                }}
              >
                {s.label}
              </span>
              <span className="num" style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text)" }}>
                {num(s.checked)}{" "}
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--text-3)", fontFamily: "var(--font-sans)" }}>
                  checked
                </span>
              </span>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: over ? "var(--critical, #b42318)" : "var(--text-2)" }}>
                −{num(s.rejected)} rejected ({pct(s.rejRate)})
              </span>
              {/* survivor bar: this gate's throughput as a share of line entry */}
              <span style={{ display: "block", height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                <span style={{
                  display: "block", height: "100%", borderRadius: 3,
                  width: `${Math.min((passed / denom) * 100, 100)}%`,
                  background: over ? "var(--critical, #b42318)" : "var(--accent)",
                }} />
              </span>
            </button>
            {i < stages.length - 1 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 6px", flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{num(passed)} →</span>
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 12, flexShrink: 0, borderLeft: "1px dashed var(--border)", marginLeft: 10 }}>
        <span className="ui-label">Final good</span>
        <span className="num" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--text)" }}>{num(finalGood)}</span>
        <span className="small" style={{ color: "var(--text-2)" }}>FPY {pct(fpy)}</span>
      </div>
    </div>
  );
}

/** Ranked next steps with carried investigation scope (period + grain + locus). */
function AttentionRail({ m, targetRej, base, onGo }: {
  m: {
    stages: FunnelRow[];
    defects: { label: string; rejected: number; pct: number }[];
    worstSize: { size: string; rejRate: number } | null;
  };
  targetRej: number;
  base: Pick<InvestigationState, "grain" | "from" | "to">;
  onGo: (path: string, state: InvestigationState) => void;
}) {
  const worstStage = [...m.stages].sort((a, b) => b.rejected - a.rejected)[0];
  const topDefect = m.defects[0];
  const items: { text: string; path: string; label: string; state: InvestigationState }[] = [];
  if (worstStage && worstStage.rejected > 0) {
    items.push({
      label: "Worst gate",
      text: `${worstStage.label} holds ${worstStage.contributionPct.toFixed(0)}% of all rejections (${pct(worstStage.rejRate)} rate${worstStage.rejRate > targetRej ? ", over target" : ""}).`,
      path: "/stage-analysis",
      state: {
        ...base,
        stage: worstStage.stageId,
        metric: "stage",
        label: worstStage.label,
      },
    });
  }
  if (topDefect && topDefect.rejected > 0) {
    items.push({
      label: "Top defect",
      text: `${topDefect.label} accounts for ${topDefect.pct.toFixed(0)}% of rejections (${num(topDefect.rejected)} units).`,
      path: "/defect-analysis",
      state: {
        ...base,
        metric: "defect",
        label: topDefect.label,
      },
    });
  }
  if (m.worstSize && m.worstSize.rejRate > 0) {
    items.push({
      label: "Worst size",
      text: `Size ${m.worstSize.size} rejects at ${pct(m.worstSize.rejRate)} — the highest of any size.`,
      path: "/size-analysis",
      state: {
        ...base,
        size: m.worstSize.size,
        metric: "size",
        label: m.worstSize.size,
      },
    });
  }
  if (items.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: "var(--gap-grid)" }}>
      {items.map((it) => (
        <button
          key={`${it.path}|${it.state.stage ?? ""}|${it.state.size ?? ""}|${it.label}`}
          type="button"
          onClick={() => onGo(it.path, it.state)}
          style={{
            textAlign: "left", cursor: "pointer", fontFamily: "inherit",
            border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
            background: "var(--surface)", padding: "10px 14px",
            display: "flex", flexDirection: "column", gap: 3,
          }}
        >
          <span className="kpi-label" style={{ color: "var(--accent)", letterSpacing: "0.04em" }}>{it.label}</span>
          <span style={{ fontSize: "var(--text-base)", color: "var(--text)", lineHeight: 1.5, fontWeight: 500 }}>{it.text}</span>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-2)" }}>Investigate →</span>
        </button>
      ))}
    </div>
  );
}

/** Status surface: ok / watch / at-risk (integrity detail lives on Data Schema). */
function QualityStatusStrip({ status }: { status: QualityStatusT }) {
  const tone =
    status.state === "blocked" || status.state === "at-risk"
      ? "var(--status-bad, #c44)"
      : status.state === "watch"
        ? "var(--status-warn, #b8860b)"
        : "var(--status-good, #1a7f4b)";
  const title =
    status.state === "blocked"
      ? "Integrity"
      : status.state === "at-risk"
        ? "At risk"
        : status.state === "watch"
          ? "Watch"
          : "Within target";
  const prior =
    status.priorRate != null
      ? `Prior period ${(status.priorRate * 100).toFixed(2)}% · Target ${(status.targetLimit * 100).toFixed(1)}%`
      : `Target ${(status.targetLimit * 100).toFixed(1)}% · Watch ${(status.watchLimit * 100).toFixed(1)}%`;
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
        padding: "10px 14px",
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 20px",
        alignItems: "baseline",
      }}
    >
      <span className="kpi-label">Quality status</span>
      <span style={{ fontSize: "var(--text-base)", fontWeight: 600, color: tone }}>{title}</span>
      <span style={{ fontSize: "var(--text-md)", color: "var(--text-2)", lineHeight: 1.5, flex: "1 1 240px" }}>
        {status.state === "blocked"
          ? "Open data-integrity issues — see Data Schema for the full list."
          : status.reason}
      </span>
      <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{prior}</span>
    </div>
  );
}

/** A single inspection station, scoped to the selected date range — KPIs, daily-%
 *  trend, and (when present) its defect Pareto. Mirrors a station sheet in the
 *  workbook; all numbers recomputed from raw counts via the shared selectors. */
function StationView({ events, stageId, label, scope, trendScope, grainLabel, targetRej, openModal, srcRows, registry }: {
  events: Event[];
  stageId: string;
  label: string;
  scope: Scope;
  trendScope: Scope;
  grainLabel: string;
  targetRej: number;
  openModal: (title: string, insight: string | string[], content: React.ReactNode, source?: { rows: SourceRow[]; value: string }) => void;
  srcRows: (filter?: { stageId?: string; defectCode?: string; size?: string; types?: string[] }) => SourceRow[];
  registry: typeof EMPTY_REGISTRY;
}) {
  const d = useMemo(() => {
    const snap: Scope = { ...scope, stageIds: [stageId] };
    const tr: Scope = { ...trendScope, stageIds: [stageId] };
    return {
      rate: rejectionRate(events, snap, registry).value,
      checked: totalChecked(events, snap, registry).value,
      rejected: totalRejected(events, snap).value,
      fpy: fpy(events, snap, registry).value,
      trend: trend(events, tr, "rejectionRate", registry),
      defects: byDefect(events, snap, registry),
    };
  }, [events, stageId, scope, trendScope, registry]);

  if (d.checked === 0 && d.rejected === 0) {
    return <Empty label={`No ${label} data in the selected date range — widen the range (top bar) or pick a period that has ${label} data (e.g. the month its workbook covers).`} />;
  }

  const paretoFor = (defects: typeof d.defects) =>
    calculatePareto(defects.map((x) => ({ label: x.label, value: x.rejected }))) ||
    { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "No defect data for this period." };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--gap-grid)" }}>
        <Kpi primary label={`${label} — Rejection Rate`} value={pct(d.rate)} tone={d.rate > targetRej ? "bad" : "good"} spark={d.trend}
          onClick={() => openModal(`${label} — Rejection Rate`, `${label} rejection rate is ${pct(d.rate)} for the selected range.`, <div style={{ minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={d.trend} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ stageId, types: ["production", "inspection"] }), value: pct(d.rate) })} />
        <Kpi label="Quantity Checked" value={num(d.checked)} />
        <Kpi label="Total Rejected" value={num(d.rejected)} tone="bad" />
        <Kpi label="First Pass Yield" value={pct(d.fpy)} tone={d.fpy >= 1 - targetRej ? "good" : "bad"} />
      </div>

      <Card title={`${label} — Rejection % Trend (${grainLabel})`} sub="recomputed from raw checked / rejected"
        onClick={() => openModal(`${label} — Rejection % Trend (${grainLabel})`, `${label} rejection rate per period, from this station's own checked and rejected counts.`, <div style={{ minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={d.trend} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ stageId, types: ["production", "inspection"] }), value: pct(d.rate) })}>
        <LineChart points={d.trend} target={targetRej} fmt={pct} mean height={180} />
      </Card>

      {d.defects.length > 0 && (
        <Card title={`${label} — Defect Pareto`}
          onClick={() => openModal(`${label} — Defect Pareto`, `Defect distribution for ${label} over the selected range.`, <div style={{ minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}><ParetoChart analysis={paretoFor(d.defects)} /></div>, { rows: srcRows({ stageId, types: ["rejection"] }), value: num(d.defects.reduce((s, x) => s + x.rejected, 0)) })}>
          <ParetoChart analysis={paretoFor(d.defects)} showTable={false} />
        </Card>
      )}
    </div>
  );
}
