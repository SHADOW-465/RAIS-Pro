// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
import { usePlantTotals } from "@/lib/client/use-plant-totals";
import { headlineFigures, overlayStageRows, restoreCopqTrend, restoreTrend } from "@/lib/analytics/overlay-totals";
import { useRegistry } from "@/components/app/RegistryContext";
import Icon from "@/components/editorial/Icon";
import type { SourceRow, SourceMetricKind } from "@/components/FloatingDetailModal";
import OpenWipStrip from "@/components/app/OpenWipStrip";
import DashboardBoard, { DashItem, DashboardLayoutToggle, clearLayout } from "@/components/app/DashboardBoard";
import { RejectionTrendCard, RejectionTrendView } from "@/components/app/RejectionTrendCard";
import { usePersona } from "@/components/app/PersonaContext";
import type { AuditEventLike } from "@/lib/analytics/audit-sessions";
import { draftFromRecommendation, blankDraft, titleFromText, type CapaRecord } from "@/lib/capa-store";
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
  Donut,
  SizeColorLegend
} from "@/components/app/widgets";
import { sizeColorFor } from "@/lib/entry/size-color";
import type { Event } from "@/lib/store/types";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import { sortStageIds } from "@/core/ontology/plant-catalog";
import PageLoader from "@/components/app/PageLoader";
import { safeBolden } from "@/components/app/widgets";
import { calculatePareto } from "@/lib/analytics/pareto";

// Modal/chart builders only load when the operator opens them.
const FloatingDetailModal = dynamic(() => import("@/components/FloatingDetailModal"), {
  ssr: false,
  loading: () => null,
});
const ChartBuilder = dynamic(() => import("@/components/ChartBuilder"), {
  ssr: false,
  loading: () => null,
});
const CapaComposerModal = dynamic(() => import("@/components/CapaComposerModal"), {
  ssr: false,
  loading: () => null,
});
const ParetoChart = dynamic(() => import("@/components/ParetoChart"), {
  ssr: false,
  loading: () => (
    <div className="muted" style={{ padding: 16, fontSize: 12 }}>Loading chart…</div>
  ),
});
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
  funnelReconciliation,
  dashboardKpiDeltas,
  formatPercent,
  formatRatioPercent,
  overallRejectionHeadline,
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
  toSourceRows,
  STAGE_LABELS,
  openWip,
  lotScopeLabel,
} from "@/lib/analytics";
import { decide } from "@/core/decision/engine";
import { SEED_DECISION_RULES } from "@/core/decision/seed-rules";
import type { RecommendationT } from "@/shared/models/decision";
import Select from "@/components/ui/Select";
import { KpiTile, PrimaryAction, GhostButton, StatusBadge, EmptyState } from "@/components/ui/primitives";
import { deltaFromArrowText, type Status } from "@/components/ui/shared-logic";

/** Quiet text link / link-button: accent blue is reserved for the one primary action. */
const linkStyle: React.CSSProperties = {
  fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-2)", textDecoration: "underline",
  textUnderlineOffset: 3, background: "none", border: "none", cursor: "pointer", padding: 0, whiteSpace: "nowrap",
};

export default function Dashboard() {
  const router = useRouter();
  const { t } = useTweaks();
  const { events, isLoading } = useEvents();
  const serverTotals = usePlantTotals().data;
  const { registry, policy } = useRegistry();
  const { authUser, persona } = usePersona();
  const layoutUser = authUser?.username ?? persona;
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [dirtyMain, setLayoutDirtyMain] = useState(false);
  const [dirtyDetail, setLayoutDirtyDetail] = useState(false);
  const layoutDirty = dirtyMain || dirtyDetail;
  const [briefOpen, setBriefOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  // Arranging cards needs every card on screen.
  const showMore = detailOpen || layoutEditing;
  const activeRegistry = registry || EMPTY_REGISTRY;
  const scopeLabel = lotScopeLabel(t, STAGE_LABELS);
  const [selectedSize, setSelectedSize] = useState("Fr16");
  const [targetRej, setTargetRej] = useState<number>(0.03);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [modalMetricKind, setModalMetricKind] = useState<SourceMetricKind>("generic");
  const [modalOriginRect, setModalOriginRect] = useState<DOMRect | null>(null);
  const [modalRankedDefects, setModalRankedDefects] = useState<{ code: string; label: string }[]>([]);
  const lastClickRect = useRef<DOMRect | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('.card, .card-hover, .kpi-card-overdrive');
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
    source?: {
      rows: SourceRow[];
      value: string;
      metricKind?: SourceMetricKind;
      rankedDefects?: { code: string; label: string }[];
    },
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
    setModalMetricKind(source?.metricKind ?? "generic");
    setModalRankedDefects(source?.rankedDefects ?? []);
    setModalOriginRect(lastClickRect.current);
    setModalOpen(true);
  };


  const scope: Scope = useMemo(
    () => resolveScope(events ?? [], t, policy),
    [events, t, policy],
  );

  // Plant policy target (not per-browser localStorage).
  useEffect(() => {
    setTargetRej(getTargetRejectionRate(scope));
  }, [scope, policy.targetRejectionPct]);

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

    const stageRank = new Map(sortStageIds(stages.map((s) => s.stageId)).map((id, i) => [id, i]));
    const orderedStages = [...stages].sort(
      (a, b) => (stageRank.get(a.stageId) ?? 99) - (stageRank.get(b.stageId) ?? 99),
    );

    const tr = trend(events, trendScope, "rejectionRate", activeRegistry);
    const st = stageTrend(events, trendScope, activeRegistry);
    // Cumulative-by-stage trend (stations + additive Total) and the single Total
    // line that matches the workbook's "REJECTION TRENDS" chart.
    const cumTrend = cumulativeStageTrend(events, trendScope, activeRegistry);
    const totalTrend = cumTrend.map((p) => ({ period: p.period, label: p.label, value: p.perStage[CUM_TOTAL_KEY] ?? 0 }));
    // Every stage that has data anywhere — keeps the station tabs stable/discoverable
    // even when the selected date range is sparse for some stations.
    const stagesAllRaw = byStage(events, { grain: t.grain }, activeRegistry);
    const stageRankAll = new Map(sortStageIds(stagesAllRaw.map((s) => s.stageId)).map((id, i) => [id, i]));
    const stagesAll = [...stagesAllRaw].sort(
      (a, b) => (stageRankAll.get(a.stageId) ?? 99) - (stageRankAll.get(b.stageId) ?? 99),
    );
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

    const worstSize = orderedSizes.length > 0 ? [...orderedSizes].sort((a, b) => b.rejRate - a.rejRate)[0] : null;
    const worstSizeRate = worstSize ? formatRatioPercent(worstSize.rejRate) : null;
    const sizeWiseInsight = !worstSize || !worstSizeRate
      ? "No size-wise rejection data available for the active period."
      : worstSize.rejRate > 0
        ? `Catheter size ${worstSize.size} shows the highest quality deviation with a rejection rate of ${worstSizeRate} (${scopeLabel}).`
        : `All catheter sizes operate within control parameters with ${worstSizeRate} rejection rate (${scopeLabel}).`;

    const sizeTrendInsight = szTrend.length > 0
      ? `Quality levels for size ${selectedSize} over time.`
      : `No trend data available for size ${selectedSize} in the active period.`;

    const accepted = Math.max(0, checked - rejected);
    const acceptedRate = checked > 0 ? (checked - rejected) / checked : Math.max(0, 1 - rate);

    const local = {
      rate,
      rejected,
      checked,
      accepted,
      acceptedRate,
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
    if (!serverTotals) return local;
    const head = headlineFigures(serverTotals.headlines);
    return {
      ...local,
      rate: head.rate,
      rejected: head.rejected,
      checked: head.checked,
      accepted: head.accepted,
      acceptedRate: head.acceptedRate,
      fpy: head.fpy,
      stages: overlayStageRows(local.stages, serverTotals.stages),
      defects: serverTotals.defects,
      tr: restoreTrend(serverTotals.rejectionTrend),
      defectTrend: serverTotals.defectTrend,
      copq: head.copq,
      savings: head.savings,
      copqTrend: restoreCopqTrend(serverTotals.copqTrend),
    };
  }, [events, scope, t.grain, selectedSize, activeRegistry, scopeLabel, serverTotals]);

  // The active view is the GLOBAL stage scope from the header (TweaksContext).
  const activeView = t.stageView;

  useEffect(() => {
    if (activeView !== "cumulative") setLayoutEditing(false);
  }, [activeView]);

  // Synchronize selected size with the available sizes dataset
  useEffect(() => {
    if (m && m.sizes.length > 0 && !m.sizes.some(s => s.size === selectedSize)) {
      const worstSize = [...m.sizes].sort((a, b) => b.rejRate - a.rejRate)[0];
      setSelectedSize(worstSize ? worstSize.size : m.sizes[0].size);
    }
  }, [m, selectedSize]);

  // DS/ANX/05 size color code for the selected caliber — same mapping used on
  // Size Analysis, so a size reads the same color everywhere in the app. Pure
  // yellow/white read poorly as a thin line stroke, so the trend line falls
  // back to the house accent for those two.
  const selectedSizeColor = sizeColorFor(selectedSize);
  const trendColor =
    selectedSizeColor && selectedSizeColor.hex !== "#FFFF00" && selectedSizeColor.hex !== "#FFFFFF"
      ? selectedSizeColor.hex
      : undefined;

  // Build provenance rows for a metric's "View Source" panel (scoped to the snapshot period).
  const srcRows = (filter: Parameters<typeof toSourceRows>[1] = {}): SourceRow[] =>
    events && m ? toSourceRows(scopeEvents(events, m.snapshotScope), filter) : [];

  /** Full provenance for rejection-rate drill-downs: production + inspection +
   *  bare rejection events (defect fallbacks) so HOW IT ADDS UP matches the KPI. */
  const rejectionSrc = (): SourceRow[] =>
    srcRows({ types: ["production", "inspection", "rejection"] });

  // Executive summary points
  const exec = useMemo(() => {
    if (!m || m.checked === 0) return [];

    const visualShare = formatPercent(
      m.stages.find((s) => s.stageId === "visual")?.contributionPct,
      1,
    ) ?? "0.0%";

    const lines = [
      overallRejectionHeadline(m.rate, m.tr),
      `Visual Inspection contributes ${visualShare} of total rejections.`,
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
          if (typeof v !== "number" || !Number.isFinite(v)) return null;
          const asPct =
            v <= 1 &&
            (k.includes("rate") || k === "fpy" || k.includes("share"));
          const shown = asPct ? formatRatioPercent(v, 1) : String(v);
          return shown ? `${k}=${shown}` : null;
        })
        .filter((bit): bit is string => !!bit)
        .join(" · ");
      return {
        text: r.text,
        tone,
        evidence: `${r.ruleId} v${r.ruleVersion}${varBits ? ` · ${varBits}` : ""}`,
      };
    });
  }, [engineRecs, recommendations]);

  const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

  const stats = useMemo(
    () => dashboardKpiDeltas(m ? {
      ratePoints: m.tr,
      rejected: m.rejected,
      checked: m.checked,
      fpy: m.fpy,
      copqTrend: m.copqTrend,
    } : null),
    [m],
  );

  // `.find(rejected > 0)`, not `[0]`: a stage that rejected nothing is not the
  // "top rejecting stage". Sorting alone named the first gate in a scope where
  // every gate was clean — and the fallback hardcoded this plant's own
  // "Visual Inspection", so an empty scope invented a bottleneck that had no
  // records behind it. No data ⇒ no answer.
  const worstStageRow = m
    ? [...m.stages].sort((a, b) => b.rejected - a.rejected).find((s) => s.rejected > 0) ?? null
    : null;
  const worstStageByRejs = worstStageRow?.label ?? "—";
  const wip = useMemo(() => openWip((events ?? []) as AuditEventLike[]), [events]);
  const wipOpen = wip.openCount > 0;

  // Same three states the status line shows (analytics decides; nothing re-derived here).
  const statusTone: Status = !m || m.checked === 0
    ? "neutral"
    : m.status.state === "blocked" || m.status.state === "at-risk" ? "critical"
    : m.status.state === "watch" ? "warning" : "ok";

  const openSizeModal = () => {
    if (!m) return;
    openModal(
      `Size-wise Rejection (${scopeLabel})`,
      m.sizeWiseInsight,
      <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
        <BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}`, color: sizeColorFor(s.size)?.hex }))} fmt={(n) => formatPercent(n, 1) ?? "—"} />
        <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}><SizeColorLegend sizes={m.sizes.map((s) => s.size)} /></div>
      </div>,
      { rows: srcRows({ types: ["inspection", "rejection"] }).filter((r) => r.size), value: m.sizes.length ? (formatRatioPercent(Math.max(...m.sizes.map((s) => Number.isFinite(s.rejRate) ? s.rejRate : 0)), 1) ?? "—") : "—", metricKind: "size" },
    );
  };

  /** Primary action: open the brief (recommendations + Create CAPA) and bring it into view. */
  const reviewIssues = () => {
    setBriefOpen(true);
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-dash-id="ai-brief"]');
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else router.push("/actions/capa");
    });
  };

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
      // No catalog mapping for this defect → fall back to the plant's own
      // denominator, the one the headline uses. This used to take
      // `m.stages[0].checked`, i.e. whichever stage happened to sort first, and
      // printed defect rates over 100% whenever that was a low-volume gate.
      checkedSum = m.checked;
    }
    const rate = checkedSum > 0 ? defect.rejected / checkedSum : 0;
    return Number.isFinite(rate) ? rate : 0;
  };

  /** C3: reshape `exec`'s bullet lines into "Executive Brief" form — a bolded
   *  headline (the first/most severe `exec` line, unchanged text) plus labeled
   *  Impact / Primary driver / Recommendation rows. Every value here is already
   *  computed in `m` / `recommendations` — this only relabels/restructures the
   *  existing bullets, it invents nothing. Falls back to plain bullets when
   *  `exec` is sparse (<3 lines) so it never looks broken with little data. */
  const execBrief = useMemo(() => {
    if (!m || exec.length < 3) return null;
    const stageShare = worstStageRow ? formatPercent(worstStageRow.contributionPct, 1) : null;
    const defectShare = m.defects[0] ? formatPercent(m.defects[0].pct, 1) : null;
    const primaryDriver = worstStageRow && stageShare
      ? `${worstStageRow.label} (${pct(worstStageRow.rejRate)} rejection rate, ${stageShare} of total)`
      : m.defects.length > 0 && defectShare
        ? `${m.defects[0].label} (${defectShare} of all rejections)`
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
  const kpiNarrative = (metric: "rate" | "accepted" | "fpy" | "copq" | "bottleneck", whatHappened: string): string[] => {
    if (!m) return [whatHappened];
    const lines: string[] = [`What happened: ${whatHappened}`];

    const topStage = [...m.stages].sort((a, b) => b.rejected - a.rejected)[0];
    const topDefect = m.defects[0];
    const topSize = [...m.sizes].sort((a, b) => b.rejRate - a.rejRate)[0];
    const whyParts: string[] = [];
    if (topStage && topStage.rejected > 0) {
      const share = formatPercent(topStage.contributionPct, 1);
      if (share) whyParts.push(`${topStage.label} (${share} of total rejections)`);
    }
    if (topDefect && topDefect.rejected > 0) {
      const share = formatPercent(topDefect.pct, 1);
      if (share) whyParts.push(`${topDefect.label} defects (${share} of rejections)`);
    }
    if (topSize && Number.isFinite(topSize.rejRate) && topSize.rejRate > 0) {
      const rate = formatRatioPercent(topSize.rejRate, 1);
      if (rate) whyParts.push(`size ${topSize.size} (${rate} rejection rate)`);
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
      action = `Audit quality gates and operator logs at ${topStage.label} stage (rejection rate: ${formatRatioPercent(topStage.rejRate, 1) ?? "—"}).`;
    } else if (metric === "copq") {
      action = `Achieving target quality limits offers up to ${rupee(m.savings)} in annual recoverable opportunity — prioritize the highest-rejection stage first.`;
    } else if (recommendations.length > 0) {
      action = recommendations[0];
    }
    lines.push(`Recommended action: ${action}`);

    return lines;
  };

  // CAPA composer — opened from a "Create CAPA →" recommendation. The advisor is
  // grounded in these verified figures; the model never originates numbers.
  const [capaOpen, setCapaOpen] = useState(false);
  const [capaDraft, setCapaDraft] = useState<CapaRecord | null>(null);
  const [capaRecText, setCapaRecText] = useState<string | undefined>(undefined);
  const [capaEvidence, setCapaEvidence] = useState<string | null>(null);

  const capaContext = useMemo(() => {
    if (!m) return "";
    const lines = [
      `Overall rejection rate: ${pct(m.rate)} (target ${pct(targetRej)}).`,
      `First-pass yield: ${pct(m.fpy)}.`,
      `Cost of poor quality (period): ${rupee(m.copq)}.`,
      `Annual savings opportunity: ${rupee(m.savings)}.`,
    ];
    if (worstStageRow) {
      lines.push(`Worst stage: ${worstStageRow.label} — ${pct(worstStageRow.rejRate)} rejection rate, ${formatPercent(worstStageRow.contributionPct, 1) ?? "—"} of total rejections.`);
    }
    if (m.defects.length > 0) {
      lines.push(`Top defect driver: ${m.defects[0].label} (${formatPercent(m.defects[0].pct, 1) ?? "—"} of rejections).`);
    }
    return lines.join("\n");
  }, [m, targetRej, worstStageRow]);

  const openCapa = (i: number, cardText: string, evidence: string | null) => {
    const rec = engineRecs[i];
    if (rec) {
      setCapaDraft(draftFromRecommendation(rec));
      setCapaRecText(rec.text);
    } else {
      setCapaDraft({ ...blankDraft(), problem: cardText, title: titleFromText(cardText) });
      setCapaRecText(cardText);
    }
    setCapaEvidence(evidence);
    setCapaOpen(true);
  };

  return (
    <AppShell
      active="dashboard"
      wide
      trustScore={m?.trust.pct ?? null}
      statusCounts={{ capa: 0, overdue: 0 }}
      dateRange={m?.latestPeriodLabel}
      toolbarExtra={
        m && activeView === "cumulative" ? (
          <DashboardLayoutToggle
            editing={layoutEditing}
            dirty={layoutDirty}
            onChangeLayout={() => setLayoutEditing(true)}
            onFixLayout={() => setLayoutEditing(false)}
            onReset={() => { clearLayout(layoutUser); clearLayout(`${layoutUser}:detail`); }}
          />
        ) : null
      }
    >
      {isLoading && !serverTotals && (
        <PageLoader message="Initializing the intelligence ledger..." minHeight="60vh" />
      )}
      {isLoading && serverTotals && (() => {
        // Server totals land in a few seconds; the full ledger (charts,
        // drill-downs) keeps loading behind them, so the GM sees the key
        // numbers first instead of a full-page spinner.
        const head = headlineFigures(serverTotals.headlines);
        const topDefect = serverTotals.defects?.[0];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-busy="true">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--gap-grid)" }}>
              <KpiTile
                label="Rejection rate"
                value={pct(head.rate)}
                hint={`${num(head.rejected)} rejected · ${num(head.checked)} checked · ${scopeLabel}`}
                status={head.rate > targetRej ? "critical" : "ok"}
              />
              <KpiTile
                label="Accepted"
                value={pct(head.acceptedRate)}
                hint={`${num(head.accepted)} accepted · ${num(head.checked)} checked`}
                status={head.acceptedRate >= 1 - targetRej ? "ok" : "critical"}
              />
              <KpiTile label="First pass yield" value={pct(head.fpy)} hint={scopeLabel} />
              <KpiTile
                word
                label="Top defect"
                value={topDefect?.label ?? "—"}
                hint={topDefect ? `${num(topDefect.rejected)} rejected` : undefined}
              />
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>Loading charts and detail…</div>
            <PageLoader minHeight="40vh" />
          </div>
        );
      })()}
      {!isLoading && events && events.length === 0 && (
        <EmptyState
          title="No data yet"
          body="Upload your monthly inspection workbooks under Excel files to populate Home: the Visual size-wise book, the Valve Integrity size-wise book (covers Balloon + Valve) and the Rejection Analysis book (covers Final inspection). Or key figures in manually under Log."
          action={<PrimaryAction onClick={() => router.push("/excel/import")}>Go to Excel files →</PrimaryAction>}
        />
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
            <DashboardBoard userKey={layoutUser} editing={layoutEditing} onDirtyChange={setLayoutDirtyMain}>
              <DashItem id="quality" span={12}>
                <QualityStatusStrip
                  status={m.status}
                  action={layoutEditing ? null : <PrimaryAction onClick={reviewIssues}>Review issues</PrimaryAction>}
                />
              </DashItem>
              <DashItem id="kpis" span={12}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--gap-grid)" }}>
                <KpiTile
                  label="Rejection rate"
                  value={pct(m.rate)}
                  delta={deltaFromArrowText(stats.rateDiff)}
                  hint={`${num(m.rejected)} of ${num(m.checked)} checked`}
                  status={statusTone}
                  onOpen={() => openModal(
                    `${grainLabel} Rejection Rate — Drill-down`,
                    kpiNarrative("rate", `The rejection rate stands at ${pct(m.rate)} (${num(m.rejected)} of ${num(m.checked)} checked, ${pct(m.acceptedRate)} accepted), compared to the target of ${pct(targetRej)} (${stats.rateDiff}).`),
                    <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} /></div>,
                    { rows: rejectionSrc(), value: pct(m.rate), metricKind: "rejection_rate" },
                  )}
                />
                <KpiTile
                  word
                  label="Worst gate"
                  value={worstStageByRejs}
                  hint={worstStageRow ? `${pct(worstStageRow.rejRate)} rejection rate · ${num(worstStageRow.rejected)} rejected` : "No rejecting stage in scope"}
                  status={worstStageRow ? (worstStageRow.rejRate > targetRej ? "critical" : "warning") : "neutral"}
                  // No rejecting stage in scope → nothing to drill into. Opening a
                  // "— — Drill-down" on an empty trace is worse than not opening.
                  onOpen={worstStageRow ? () => openModal(
                    `${worstStageRow.label} — Drill-down`,
                    kpiNarrative("bottleneck", `${worstStageRow.label} is the top bottleneck stage, contributing ${num(worstStageRow.rejected)} rejections (${pct(worstStageRow.rejRate)} rejection rate).`),
                    <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stages} /></div>,
                    { rows: srcRows({ stageId: worstStageRow.stageId, types: ["production", "inspection", "rejection"] }), value: pct(worstStageRow.rejRate), metricKind: "rejection_rate" },
                  ) : undefined}
                />
                <KpiTile
                  word
                  label="Worst size"
                  value={m.worstSize ? m.worstSize.size : "—"}
                  hint={m.worstSize ? `${pct(m.worstSize.rejRate)} rejection rate · ${num(m.worstSize.rejected)} rejected` : "No size data in scope"}
                  status={m.worstSize && m.worstSize.rejRate > 0 ? (m.worstSize.rejRate > targetRej ? "critical" : "warning") : "neutral"}
                  onOpen={m.worstSize ? openSizeModal : undefined}
                />
                <KpiTile
                  word
                  label="Top defect"
                  value={m.defects[0]?.label ?? "—"}
                  hint={m.defects[0] ? `${formatPercent(m.defects[0].pct, 1) ?? "—"} of rejections · ${num(m.defects[0].rejected)} rejected` : "No defect data in scope"}
                  status={m.defects[0] ? "warning" : "neutral"}
                  onOpen={m.defects[0] ? () => openModal(
                    `Top Defect — ${m.defects[0].label}`,
                    `The top defect category is ${m.defects[0].label}, accounting for ${num(m.defects[0].rejected)} rejects (${formatPercent(m.defects[0].pct, 1) ?? "—"} of all rejections).`,
                    <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><ParetoChart analysis={calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected }))) || { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "" }} showTable={true} /></div>,
                    {
                      rows: srcRows({ defectCode: m.defects[0].label, types: ["rejection"] }),
                      value: m.defects[0].rejected.toLocaleString(),
                      metricKind: "pareto",
                      rankedDefects: m.defects.slice(0, 3).map((d) => ({
                        code: d.defectCode || d.label,
                        label: d.label,
                      })),
                    }
                  ) : undefined}
                />
                <KpiTile
                  label="Stalled lots"
                  value={wip.stalledCount}
                  hint={`${num(wip.openCount)} open · ${num(wip.unitsWaiting)} units waiting`}
                  status={wip.stalledCount > 0 ? "warning" : "ok"}
                  onOpen={() => router.push("/lots/open")}
                />
              </div>
              </DashItem>
              <DashItem id="trend" span={12}>
                <RejectionTrendCard
                  events={events ?? []}
                  scope={scope}
                  points={m.tr}
                  target={targetRej}
                  grainLabel={grainLabel}
                  registry={activeRegistry}
                  onOpenFullTrend={() => openModal(`Rejection Trend (${grainLabel})`, `${grainLabel} rejection trend lines compared to the target limit of ${formatRatioPercent(targetRej, 0) ?? "—"} and the period mean limit.`, <div style={{ minHeight: 320, display: "flex", flexDirection: "column" }}><RejectionTrendView events={events ?? []} scope={scope} points={m.tr} target={targetRej} grainLabel={grainLabel} registry={activeRegistry} height={320} variant="detail" /></div>, { rows: rejectionSrc(), value: pct(m.rate), metricKind: "rejection_rate" })}
                />
              </DashItem>
              <DashItem id="by-stage" span={4}>
                <Card
                  title="Rejection By Stage"
                  sub={scopeLabel}
                  onClick={() => openModal(`Stage-wise Rejection (${scopeLabel})`, "Total rejections share by process stages.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><Donut data={m.stages.map((s) => ({ label: s.label, value: s.rejected }))} size={220} fontSize={13.5} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }), value: num(m.rejected), metricKind: "rejected" })}
                >
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                    <div style={{ flex: 1, minHeight: 180, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 0" }}>
                      <Donut data={m.stages.map((s) => ({ label: s.label, value: s.rejected }))} size={175} fontSize={10} hideLegend={true} />
                    </div>
                    <div style={{ marginTop: "var(--space-2)", display: "flex" }}>
                      <a
                        href="/quality/stage"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        style={linkStyle}
                      >
                        Stage analysis →
                      </a>
                    </div>
                  </div>
                </Card>
              </DashItem>
                {m.sizes.length > 0 && (
                <DashItem id="size-ytd" span={4}>
                  <Card
                    title="Rejection by Size"
                    sub={m.worstSize ? `Worst: ${m.worstSize.size} · ${scopeLabel}` : scopeLabel}
                    onClick={openSizeModal}
                  >
                    <BarsH rows={m.sizes.map((s) => ({ label: s.size, value: Number.isFinite(s.rejRate) ? s.rejRate * 100 : 0, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}`, color: sizeColorFor(s.size)?.hex }))} fmt={(n) => formatPercent(n, 1) ?? "—"} />
                  </Card>
                </DashItem>
                )}
              <DashItem id="pareto" span={4}>
                <Card
                  title="Top Defects (Pareto)"
                  sub={scopeLabel}
                  onClick={() => openModal(
                    "Defect Pareto (All Stages)",
                    "Six Sigma Pareto analysis highlighting the vital few defect categories responsible for most rejects.",
                    <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <ParetoChart analysis={calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected }))) || { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "No defect data available for this period." }} showTable={false} />
                    </div>,
                    {
                      rows: srcRows({ types: ["rejection"] }),
                      value: num(m.defects.reduce((s, d) => s + d.rejected, 0)),
                      metricKind: "pareto",
                      rankedDefects: m.defects.slice(0, 3).map((d) => ({
                        code: d.defectCode || d.label,
                        label: d.label,
                      })),
                    }
                  )}
                >
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "20px minmax(0, 1.3fr) 55px 70px 60px",
                        gap: "var(--space-2)",
                        fontSize: "var(--text-xs)",
                        fontWeight: 600,
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
                          const colors = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)"];
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
                              <span className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--text)" }}>{formatRatioPercent(rejRate, 1) ?? "—"}</span>
                              <div style={{ display: "flex", alignItems: "center", paddingLeft: 6 }}>
                                <div style={{ width: "100%", height: 5, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)" }}>
                                  <div style={{ width: `${Number.isFinite(d.pct) ? d.pct : 0}%`, height: "100%", background: colors[i % colors.length], borderRadius: 3 }} />
                                </div>
                              </div>
                              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-2)" }}>{formatPercent(d.pct, 0) ?? "—"}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div style={{ marginTop: "var(--space-2)", display: "flex" }}>
                      <a
                        href="/quality/defect"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        style={linkStyle}
                      >
                        Defect Pareto →
                      </a>
                    </div>
                  </div>
                </Card>
              </DashItem>
              <DashItem id="ai-brief" span={12}>
                <Card
                  title="AI Diagnostics & Actionable Brief"
                  extra={
                    <button
                      type="button"
                      onClick={() => setBriefOpen((v) => !v)}
                      aria-expanded={briefOpen}
                      style={{ ...linkStyle, marginLeft: "auto" }}
                    >
                      {briefOpen ? "Hide full brief" : "Show full brief"}
                    </button>
                  }
                >
                  {!briefOpen ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ fontSize: "var(--text-base)", fontWeight: 600, lineHeight: 1.45, color: "var(--text)", maxWidth: "70ch" }}>
                        {execBrief ? safeBolden(execBrief.headline) : (exec[0] ? safeBolden(exec[0]) : "Diagnostics Brief")}
                      </div>
                      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
                        {recommendationCards.slice(0, 3).map((rec, i) => (
                          <li
                            key={i}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i === 0 ? "1px solid var(--border)" : "none", borderBottom: "1px solid var(--border)" }}
                          >
                            <StatusBadge status={rec.tone === "bad" ? "critical" : rec.tone === "warn" ? "warning" : "neutral"} label={rec.tone === "bad" ? "Critical" : rec.tone === "warn" ? "Warning" : "Info"} />
                            <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-md)", lineHeight: 1.5, color: "var(--text)" }}>{safeBolden(rec.text)}</span>
                            <button type="button" onClick={() => openCapa(i, rec.text, rec.evidence)} style={linkStyle}>
                              Create CAPA →
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.8fr) 1px minmax(0, 1.2fr)",
                    gap: 32,
                    alignItems: "stretch"
                  }}>
                    {/* Left Side: Diagnostic Summary */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 20, justifyContent: "space-between" }}>
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
                                  background: "var(--text-3)"
                                }} />
                                {safeBolden(bullet)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Integrated Callout: Worst Stage Bottleneck & Recovery.
                      Hidden with no rejecting stage in scope — "— Bottleneck …
                      rate of —" is a claim about nothing. */}
                      {worstStageRow && (
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "1.2fr 1fr",
                          gap: 20,
                          paddingTop: 16,
                          borderTop: "1px solid var(--border)",
                          marginTop: "auto"
                        }}>
                          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "var(--critical)",
                              }} />
                              <span style={{ fontSize: "var(--text-md)", fontWeight: 600, fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}>
                                {worstStageRow.label} Bottleneck
                              </span>
                            </div>
                            <p className="small" style={{ margin: 0, color: "var(--text-3)", lineHeight: 1.45 }}>
                              Quality deviation is concentrated here at a rejection rate of <strong style={{ fontWeight: 600, color: "var(--text)" }}>{pct(worstStageRow.rejRate)}</strong>.
                            </p>
                          </div>

                          <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 20, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <div className="ui-label" style={{ marginBottom: 4 }}>
                              Financial Recovery Potential
                            </div>
                            <div className="kpi" style={{ fontSize: "var(--text-2xl)", color: "var(--critical)" }}>
                              {rupee(m.savings)}
                            </div>
                            <div className="small" style={{ marginTop: 2, color: "var(--text-3)" }}>
                              {scopeLabel}. Scrap reduction if rejection met the target.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Vertical Divider Line */}
                    <div style={{ background: "var(--border)", height: "100%" }} />

                    {/* Right Side: Action Plan (CAPA Items) */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", display: "flex", alignItems: "center", gap: 8 }}>
                        <Icon name="check" size={14} /> Recommended Actions
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, justifyContent: "center" }}>
                        {recommendationCards.slice(0, 3).map((rec, i) => {
                                                    const chipText = rec.tone === "bad" ? "Critical" : rec.tone === "warn" ? "Warning" : "Info";
                          return (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                                padding: "12px 14px",
                                background: "var(--surface-2)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius-md)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <StatusBadge status={rec.tone === "bad" ? "critical" : rec.tone === "warn" ? "warning" : "neutral"} label={chipText} />
                                <button
                                  type="button"
                                  onClick={() => openCapa(i, rec.text, rec.evidence)}
                                  style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text)", textDecoration: "underline", textUnderlineOffset: 3, background: "none", border: "none", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
                                >
                                  Create CAPA →
                                </button>
                              </div>
                              <div style={{ fontSize: "var(--text-md)", lineHeight: 1.5, color: "var(--text)", fontWeight: 500 }}>{safeBolden(rec.text)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  )}
                </Card>
              </DashItem>
            </DashboardBoard>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <GhostButton onClick={() => setDetailOpen((v) => !v)}>
                <Icon name={showMore ? "chevron-up" : "chevron-down"} size={14} />
                {showMore ? "Hide detail" : "Show more detail"}
              </GhostButton>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            {showMore && (
              <>
              <DashboardBoard userKey={`${layoutUser}:detail`} editing={layoutEditing} onDirtyChange={setLayoutDirtyDetail}>
                {wipOpen && (
                <DashItem id="wip" span={12} handle="start">
                  <OpenWipStrip events={(events ?? []) as AuditEventLike[]} embedded />
                </DashItem>
                )}
                {m.stages.length > 0 && (
                <DashItem id="funnel" span={12}>
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
                        goInvestigation(router.push.bind(router), "/quality/stage", {
                          ...m.investigationBase,
                          stage: row.stageId,
                          metric: "stage",
                          label: row.label,
                        });
                      }}
                    />
                  </Card>
                </DashItem>
                )}
              <DashItem id="attention" span={12}>
                <AttentionRail
                  m={m}
                  targetRej={targetRej}
                  base={m.investigationBase}
                  onGo={(path, state) => goInvestigation(router.push.bind(router), path, state)}
                />
              </DashItem>
              <DashItem id="stage-trend" span={12}>
                <Card
                  title={`Stage-wise Rejection Trend (${grainLabel})`}
                  sub="per-stage + Total — hover for values"
                  onClick={() => openModal(`Stage-wise Rejection Trend (${grainLabel})`, "Each line is a station's rejection rate over its own checked quantity; the Total line is the plant rejection rule for that period. Recomputed from raw counts.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.cumTrend} stages={[...m.stagesAll.map((s) => ({ stageId: s.stageId, label: s.label })), { stageId: CUM_TOTAL_KEY, label: "Total" }]} /></div>, { rows: rejectionSrc(), value: pct(m.rate), metricKind: "rejection_rate" })}
                >
                  <MultiLine data={m.cumTrend} stages={[...m.stagesAll.map((s) => ({ stageId: s.stageId, label: s.label })), { stageId: CUM_TOTAL_KEY, label: "Total" }]} height={180} />
                </Card>
              </DashItem>
                {m.stageSize.length > 0 && (
                <DashItem id="heatmap" span={12}>
                  <Card
                    title="Stage x Size Concentration"
                    sub="Rejection rate by stage and catheter size (warmer cells indicate concentration hotspots)"
                    onClick={() => openModal(
                      "Stage x Size Concentration",
                      "Rejection rate for every stage x size combination present in the selected period — darker/warmer cells indicate where quality problems concentrate.",
                      <div style={{ minHeight: 200 }}><StageSizeHeatmap cells={m.stageSize} /></div>,
                      { rows: srcRows({ types: ["production", "inspection"] }), value: m.stageSize.length ? (formatRatioPercent(Math.max(...m.stageSize.map((c) => Number.isFinite(c.rejRate) ? c.rejRate : 0)), 1) ?? "—") : "—", metricKind: "rejection_rate" },
                    )}
                  >
                    <StageSizeHeatmap cells={m.stageSize} />
                  </Card>
                </DashItem>
                )}
                {m.sizes.length > 0 && m.sizeTrend.length > 0 && (
                <DashItem id="size-trend" span={6}>
                  <Card
                    title={`Size Trend (${selectedSize})`}
                    onClick={() => openModal(`Size-wise Trend (${selectedSize})`, m.sizeTrendInsight, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.sizeTrend} fmt={pct} color={trendColor} /></div>, { rows: srcRows({ types: ["production", "inspection"], size: selectedSize }), value: m.sizeTrend.length ? pct(m.sizeTrend[m.sizeTrend.length - 1].value) : "—", metricKind: "size" })}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }} onClick={(e) => e.stopPropagation()}>
                      <span className="muted" style={{ fontSize: "var(--text-xs)", fontWeight: 500 }}>Size:</span>
                      {selectedSizeColor && (
                        <span
                          aria-hidden="true"
                          title={`${selectedSize} — ${selectedSizeColor.name}`}
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: 3,
                            flexShrink: 0,
                            background: selectedSizeColor.hex,
                            boxShadow: selectedSizeColor.hex === "#FFFFFF" ? "inset 0 0 0 1px var(--border-strong)" : undefined,
                          }}
                        />
                      )}
                      <Select
                        value={selectedSize}
                        onChange={setSelectedSize}
                        options={(m.sizes.length > 0 ? m.sizes.map((s) => s.size) : ["Fr10", "Fr12", "Fr14", "Fr16", "Fr18", "Fr20", "Fr22", "Fr24"]).map((sz) => ({ value: sz, label: sz }))}
                        block={false}
                        mono
                        size="sm"
                        ariaLabel="Size for trend"
                        style={{ minWidth: 92 }}
                      />
                    </div>
                    <LineChart points={m.sizeTrend} fmt={pct} height={180} color={trendColor} />
                  </Card>
                </DashItem>
                )}
                {m.copqTrend.length > 0 && (
                <DashItem id="copq" span={5}>
                  <Card
                    title={`COPQ Trend (${grainLabel})`}
                    sub={`${rupee(m.copq)} this period`}
                    onClick={() => openModal(`COPQ Trend (${grainLabel})`, `Cost of poor quality trends across historical periods.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.copqTrend} fmt={rupee} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }), value: rupee(m.copq), metricKind: "copq" })}
                  >
                    <LineChart points={m.copqTrend} fmt={rupee} height={180} />
                  </Card>
                </DashItem>
                )}
              <DashItem id="audit" span={m.copqTrend.length > 0 ? 7 : 12}>
                <Card
                  title="Data checks · Audit &amp; Verification"
                  onClick={() => openModal("Audit & Verification", "Integrity is V-004 and V-014 on this scope. Confidence basis is a separate count.", <div style={{ minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "center" }}><AuditVerificationTable summary={m.audit} integrity={{ state: m.status.state, critical: m.status.integrityIssues.filter((i) => i.severity === "critical").length, open: m.status.integrityIssues.length }} /></div>)}
                >
                  <AuditVerificationTable summary={m.audit} integrity={{ state: m.status.state, critical: m.status.integrityIssues.filter((i) => i.severity === "critical").length, open: m.status.integrityIssues.length }} />
                  <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push("/reports/audit"); }}
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "var(--radius-md)",
                        padding: "6px 16px",
                        fontSize: "var(--text-sm)",
                        fontWeight: 500,
                        cursor: "pointer",
                        width: "100%"
                      }}
                    >
                      View Audit Trail
                    </button>
                  </div>
                </Card>
              </DashItem>
              </DashboardBoard>
              {/* Custom chart: Reports > Custom chart takes this over in phase 11. */}
              <ChartBuilder
                events={events ?? []}
                storageId="dashboard"
                base={{ dateFrom: scope.dateFrom, dateTo: scope.dateTo, stageIds: scope.stageIds }}
                sub={
                  scope.dateFrom && scope.dateTo
                    ? `Anything the tiles above don't answer. Follows the Scope chip's range (${scope.dateFrom} to ${scope.dateTo}).`
                    : "Anything the tiles above don't answer. Follows the Scope chip's range and View."
                }
              />
              </>
            )}
            </>
          )}
        </div>
      )}

      {modalOpen && (
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
          metricKind={modalMetricKind}
          periodGrain={t.grain === "week" ? "week" : t.grain === "day" ? "day" : "month"}
          originRect={modalOriginRect}
          rankedDefects={modalRankedDefects}
        >
          {modalContent}
        </FloatingDetailModal>
      )}

      {capaOpen && (
        <CapaComposerModal
          isOpen={capaOpen}
          onClose={() => setCapaOpen(false)}
          draft={capaDraft}
          recommendationText={capaRecText}
          context={capaContext}
          evidence={capaEvidence}
        />
      )}
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
 *  and a connector stating what it passed forward and what has not reached the
 *  next gate yet. Numbers come from `funnelReconciliation` over `byStage` rows. */
function FunnelStrip({ stages, entryChecked, fpy, targetRej, onGateClick }: {
  stages: FunnelRow[];
  entryChecked: number;
  fpy: number;
  targetRej: number;
  onGateClick: (row: FunnelRow) => void;
}) {
  const denom = Math.max(entryChecked, 1);
  const { gates, finalGood, betweenGates } = funnelReconciliation(stages);
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0, overflowX: "auto", padding: "4px 0" }}>
      {stages.map((s, i) => {
        const { passed, notYetAtNext, overAtNext } = gates[i];
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
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: over ? "var(--critical)" : "var(--text-2)" }}>
                −{num(s.rejected)} rejected ({pct(s.rejRate)})
              </span>
              {/* survivor bar: this gate's throughput as a share of line entry */}
              <span style={{ display: "block", height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                <span style={{
                  display: "block", height: "100%", borderRadius: 3,
                  width: `${Math.min((passed / denom) * 100, 100)}%`,
                  background: over ? "var(--critical)" : "var(--text-2)",
                }} />
              </span>
            </button>
            {i < stages.length - 1 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 6px", flexShrink: 0 }}>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", whiteSpace: "nowrap" }}>{num(passed)} →</span>
                {(notYetAtNext ?? 0) > 0 && (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", whiteSpace: "nowrap" }}>{num(notYetAtNext ?? 0)} not yet at next</span>
                )}
                {overAtNext > 0 && (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--warning)", whiteSpace: "nowrap" }}>+{num(overAtNext)} over (V-014)</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 12, flexShrink: 0, borderLeft: "1px dashed var(--border)", marginLeft: 10 }}>
        <span className="ui-label">Final good</span>
        <span className="num" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--text)" }}>{num(finalGood)}</span>
        <span className="small" style={{ color: "var(--text-2)" }}>FPY {pct(fpy)}</span>
        {betweenGates !== 0 && (
          <span className="small" style={{ color: "var(--text-3)" }}>{num(betweenGates)} between gates</span>
        )}
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
      text: `${worstStage.label} holds ${formatPercent(worstStage.contributionPct, 0) ?? "—"} of all rejections (${pct(worstStage.rejRate)} rate${Number.isFinite(worstStage.rejRate) && worstStage.rejRate > targetRej ? ", over target" : ""}).`,
      path: "/quality/stage",
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
      text: `${topDefect.label} accounts for ${formatPercent(topDefect.pct, 0) ?? "—"} of rejections (${num(topDefect.rejected)} units).`,
      path: "/quality/defect",
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
      path: "/quality/size",
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
          <span className="kpi-label" style={{ letterSpacing: "0.04em" }}>{it.label}</span>
          <span style={{ fontSize: "var(--text-base)", color: "var(--text)", lineHeight: 1.5, fontWeight: 500 }}>{it.text}</span>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-2)" }}>Investigate →</span>
        </button>
      ))}
    </div>
  );
}

/** Status line: ok / watch / at-risk badge + reason + target, with the page's one primary action. */
function QualityStatusStrip({ status, action }: { status: QualityStatusT; action?: React.ReactNode }) {
  const badge: { status: Status; label: string } =
    status.state === "blocked" ? { status: "critical", label: "Integrity" }
    : status.state === "at-risk" ? { status: "critical", label: "At risk" }
    : status.state === "watch" ? { status: "warning", label: "Watch" }
    : { status: "ok", label: "Within target" };
  const priorRateText = formatRatioPercent(status.priorRate);
  const targetText = formatRatioPercent(status.targetLimit, 1) ?? "—";
  const watchText = formatRatioPercent(status.watchLimit, 1) ?? "—";
  const prior = priorRateText
    ? `Prior period ${priorRateText} · Target ${targetText}`
    : `Target ${targetText} · Watch ${watchText}`;
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface)",
        padding: "var(--pad-card)",
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 16px",
        alignItems: "center",
      }}
    >
      <StatusBadge status={badge.status} label={badge.label} />
      <span style={{ fontSize: "var(--text-md)", color: "var(--text)", lineHeight: 1.5, flex: "1 1 240px", maxWidth: "70ch" }}>
        {status.state === "blocked"
          ? "Open data-integrity issues — see Plant setup for the full list."
          : status.reason}
      </span>
      <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{prior}</span>
      {action}
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
  openModal: (title: string, insight: string | string[], content: React.ReactNode, source?: { rows: SourceRow[]; value: string; metricKind?: SourceMetricKind }) => void;
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
        <Kpi
          primary
          label={`${label} — Rejection Rate`}
          basis={`${label} – lot date`}
          value={pct(d.rate)}
          detail={`${num(d.rejected)} rejected · ${num(d.checked)} checked`}
          tone={d.rate > targetRej ? "bad" : "good"}
          spark={d.trend}
          onClick={() => openModal(`${label} — Rejection Rate`, `${label} rejection rate is ${pct(d.rate)} (${num(d.rejected)} of ${num(d.checked)} checked) for the selected range.`, <div style={{ minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={d.trend} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ stageId, types: ["production", "inspection", "rejection"] }), value: pct(d.rate), metricKind: "rejection_rate" })}
        />
        <Kpi label="Quantity Checked" basis={`${label} – lot date`} value={num(d.checked)} detail="units entered this gate" />
        <Kpi label="Total Rejected" basis={`${label} – lot date`} value={num(d.rejected)} detail={d.checked > 0 ? `${pct(d.rate)} of checked` : undefined} tone="bad" />
        <Kpi
          label="Overall Accepted"
          basis={`${label} – lot date`}
          value={pct(d.checked > 0 ? (d.checked - d.rejected) / d.checked : 1 - d.rate)}
          detail={`${num(Math.max(0, d.checked - d.rejected))} accepted · ${num(d.checked)} checked`}
          tone={(d.checked > 0 ? (d.checked - d.rejected) / d.checked : 1 - d.rate) >= 1 - targetRej ? "good" : "bad"}
        />
      </div>

      <Card title={`${label} — Rejection % Trend (${grainLabel})`} sub="recomputed from raw checked / rejected"
        onClick={() => openModal(`${label} — Rejection % Trend (${grainLabel})`, `${label} rejection rate per period, from this station's own checked and rejected counts.`, <div style={{ minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={d.trend} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ stageId, types: ["production", "inspection"] }), value: pct(d.rate), metricKind: "rejection_rate" })}>
        <LineChart points={d.trend} target={targetRej} fmt={pct} mean height={180} />
      </Card>

      {d.defects.length > 0 && (
        <Card title={`${label} — Defect Pareto`}
          onClick={() => openModal(`${label} — Defect Pareto`, `Defect distribution for ${label} over the selected range.`, <div style={{ minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}><ParetoChart analysis={paretoFor(d.defects)} /></div>, { rows: srcRows({ stageId, types: ["rejection"] }), value: num(d.defects.reduce((s, x) => s + x.rejected, 0)), metricKind: "pareto" })}>
          <ParetoChart analysis={paretoFor(d.defects)} showTable={false} />
        </Card>
      )}
    </div>
  );
}
