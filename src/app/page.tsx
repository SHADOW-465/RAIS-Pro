// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
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
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import PageLoader from "@/components/app/PageLoader";
import ParetoChart from "@/components/ParetoChart";
import GenericDatasetView from "@/components/app/GenericDatasetView";
import { safeBolden } from "@/components/app/widgets";
import { calculatePareto } from "@/lib/dashboard-builder";
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
  CUM_TOTAL_KEY
} from "@/lib/analytics";

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
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export default function Dashboard() {
  const router = useRouter();
  const { t } = useTweaks();
  const { events, isLoading } = useEvents();
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
    const rate = rejectionRate(events, scope).value;
    const rejected = totalRejected(events, scope).value;
    const checked = totalChecked(events, scope).value;
    const fpyVal = fpy(events, scope).value;
    const stages = byStage(events, scope);
    const defects = byDefect(events, scope);
    
    // Ensure all 5 stages from mockup are mapped correctly (Visual, Eye Punching, Balloon, Valve, Final)
    const order = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const orderedStages = [...stages].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));

    const tr = trend(events, trendScope, "rejectionRate");
    const st = stageTrend(events, trendScope);
    // Cumulative-by-stage trend (stations + additive Total) and the single Total
    // line that matches the workbook's "REJECTION TRENDS" chart.
    const cumTrend = cumulativeStageTrend(events, trendScope);
    const totalTrend = cumTrend.map((p) => ({ period: p.period, label: p.label, value: p.perStage[CUM_TOTAL_KEY] ?? 0 }));
    // Every stage that has data anywhere — keeps the station tabs stable/discoverable
    // even when the selected date range is sparse for some stations.
    const order2 = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const stagesAll = [...byStage(events, { grain: t.grain })].sort((a, b) => order2.indexOf(a.stageId) - order2.indexOf(b.stageId));
    const dt = defectTrend(events, trendScope, 5);
    const sizes = bySize(events, scope);
    
    // Sort sizes numerically: Fr10, Fr12, Fr14, Fr16, Fr18
    const orderedSizes = [...sizes].sort((a, b) => {
      const an = parseInt(a.size.replace(/\D/g, ""), 10);
      const bn = parseInt(b.size.replace(/\D/g, ""), 10);
      return an - bn;
    });

    const stageSize = stageBySize(events, scope);
    const weekly = weeklyTrend(events, trendScope);
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
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain, selectedSize]);

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

  const recommendations = useMemo(() => {
    if (!m || m.checked === 0) return [
      "Upload quality records to generate action items.",
      "Configure target quality metrics in Settings."
    ];

    const list: string[] = [];

    // Find highest rejection stage
    const highestStage = [...m.stages].sort((a, b) => b.rejRate - a.rejRate)[0];
    if (highestStage && highestStage.rejRate > 0) {
      list.push(`Audit quality gates and operator logs at ${highestStage.label} stage (rejection rate: ${(highestStage.rejRate * 100).toFixed(1)}%).`);
    }

    // Find top defect
    const topDefect = m.defects[0];
    if (topDefect && topDefect.rejected > 0) {
      list.push(`Investigate root cause for ${topDefect.label} defects (responsible for ${topDefect.pct.toFixed(1)}% of all rejections).`);
    }

    // Check sizes
    const badSize = [...m.sizes].sort((a, b) => b.rejRate - a.rejRate)[0];
    if (badSize && badSize.rejRate > 0) {
      list.push(`Review material batch consistency and tensile strength for size ${badSize.size} (rejection rate: ${(badSize.rejRate * 100).toFixed(1)}%).`);
    }

    // Default actions if list is too short
    if (list.length < 3) {
      list.push("Review machine maintenance logs for the active period.");
      list.push("Confirm that all operators have completed the monthly SOP training refresh.");
    }

    return list.slice(0, 4);
  }, [m, targetRej]);

  /** C2: pair each `recommendations` string with a severity chip + evidence line
   *  for the action-card rendering, WITHOUT inventing new numbers — severity is
   *  derived by re-matching the recommendation against the same `m.stages` /
   *  `m.defects` / `m.sizes` rows it was built from and comparing against
   *  `targetRej`, the same threshold already used for Kpi `tone` above (e.g.
   *  `tone={m.rate > targetRej ? "bad" : "good"}`). Evidence is the metric value
   *  that triggered the line, already present in `m`. */
  const recommendationCards = useMemo(() => {
    if (!m) return recommendations.map((text) => ({ text, tone: "warn" as const, evidence: null as string | null }));

    return recommendations.map((text) => {
      const stageMatch = m.stages.find((s) => text.includes(s.label));
      if (stageMatch) {
        return {
          text,
          tone: (stageMatch.rejRate > targetRej ? "bad" : "warn") as "bad" | "warn",
          evidence: `${stageMatch.label}: ${pct(stageMatch.rejRate)} rejection rate vs ${pct(targetRej)} target`,
        };
      }
      const defectMatch = m.defects.find((d) => text.includes(d.label));
      if (defectMatch) {
        return {
          text,
          tone: "warn" as const,
          evidence: `${defectMatch.label}: ${defectMatch.pct.toFixed(1)}% of all rejections`,
        };
      }
      const sizeMatch = m.sizes.find((s) => text.includes(s.size));
      if (sizeMatch) {
        return {
          text,
          tone: (sizeMatch.rejRate > targetRej ? "bad" : "warn") as "bad" | "warn",
          evidence: `Size ${sizeMatch.size}: ${pct(sizeMatch.rejRate)} rejection rate vs ${pct(targetRej)} target`,
        };
      }
      // Fallback / default lines (SOP training, maintenance logs, upload prompts) —
      // no rejection-rate breach implied, so these read as informational, not urgent.
      return { text, tone: "info" as const, evidence: null as string | null };
    });
  }, [m, recommendations, targetRej]);

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
    const regDef = DISPOSAFE_REGISTRY.defects.find(
      (d) => d.label === defect.label || d.defectCode === defect.defectCode
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
      {/* Dataset views read from the dataset store, not the event ledger — they
          must render even when zero events exist (e.g. a fresh upload whose
          recognized data hasn't been published to Cumulative yet). */}
      {!isLoading && activeView.startsWith("dataset:") && (
        <GenericDatasetView datasetId={activeView.slice("dataset:".length)} />
      )}
      {!isLoading && !activeView.startsWith("dataset:") && events && events.length === 0 && (
        <div style={{ padding: "72px 32px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>
            No data yet
          </div>
          <div style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.75, maxWidth: 760, margin: "0 auto 20px" }}>
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

      {m && !activeView.startsWith("dataset:") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
              />
            )
          ) : (
          <>
          {/* Overview strip: 5 large traffic-light tiles — the fixed investigation
              order (Rejection Rate → FPY → COPQ → Top Bottleneck → Quality Status).
              Every value is already computed in `m`; this is reordering/relabeling,
              not new math. Clicking any of the first 4 opens the 5-part drill-down
              na          <>
          {/* Section 1: Executive KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 20 }}>
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
              label="COPQ"
              value={rupee(m.copq)}
              sub={stats.copqDiff}
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
            gap: 20,
            marginTop: 10
          }}>
            {/* Card 1: Rejection Trend */}
            <Card 
              title="Rejection Trend" 
              sub={`Target (${(targetRej * 100).toFixed(0)}%) & Mean`} 
              onClick={() => openModal(`Rejection Trend (${grainLabel})`, `${grainLabel} rejection trend lines compared to the target limit of ${(targetRej * 100).toFixed(0)}% and the period mean limit.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}
            >
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                <div style={{ flex: 1, minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <LineChart points={m.tr} target={targetRej} fmt={pct} mean />
                </div>
                <div style={{ marginTop: 12, display: "flex" }}>
                  <a 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openModal(`Rejection Trend (${grainLabel})`, `${grainLabel} rejection trend lines compared to the target limit of ${(targetRej * 100).toFixed(0)}% and the period mean limit.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) });
                    }}
                    style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}
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
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
                    <Donut data={m.stages.map((s) => ({ label: s.label.split(" ")[0], value: s.rejected }))} size={150} fontSize={11} hideLegend={true} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                    {m.stages.slice(0, 4).map((s, idx) => {
                      const colors = ["#2563EB", "#0D9488", "#D97706", "#DC2626", "#7C3AED", "#65A30D"];
                      const share = ((s.rejected / (m.rejected || 1)) * 100).toFixed(1);
                      return (
                        <div key={s.stageId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors[idx % colors.length] }} />
                            {s.label}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                            {pct(s.rejRate)} <span className="muted" style={{ fontWeight: 500, fontSize: 11 }}>({share}%)</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "flex" }}>
                  <a 
                    href="/stage-analysis"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}
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
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "24px minmax(0, 1.3fr) 60px 80px 70px", 
                    gap: 8, 
                    fontSize: 10.5, 
                    fontWeight: 700, 
                    textTransform: "uppercase", 
                    letterSpacing: "0.05em", 
                    color: "var(--text-3)", 
                    paddingBottom: 8, 
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
                      const colors = ["#C8421C", "#2563EB", "#D97706", "#0D9488", "#7C3AED"];
                      const rejRate = getDefectRejRate(d);
                      return (
                        <div key={d.label} style={{ 
                          display: "grid", 
                          gridTemplateColumns: "24px minmax(0, 1.3fr) 60px 80px 70px", 
                          gap: 8, 
                          alignItems: "center", 
                          fontSize: 12,
                          padding: "4px 0",
                          borderBottom: i < 4 ? "1px solid var(--border-subtle)" : "none"
                        }}>
                          <span style={{ color: "var(--text-3)", fontWeight: 700 }}>{i + 1}</span>
                          <span style={{ fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.label}>{d.label}</span>
                          <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text)" }}>{(rejRate * 100).toFixed(2)}%</span>
                          <div style={{ display: "flex", alignItems: "center", paddingLeft: 8 }}>
                            <div style={{ width: "100%", height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)" }}>
                              <div style={{ width: `${d.pct}%`, height: "100%", background: colors[i % colors.length], borderRadius: 3 }} />
                            </div>
                          </div>
                          <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-2)" }}>{d.pct.toFixed(0)}%</span>
                        </div>
                      );
                    })
                  )}
                </div>
                <div style={{ marginTop: 12, display: "flex" }}>
                  <a 
                    href="/defect-analysis"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}
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
            gap: 20,
            marginTop: 20
          }}>
            <Card 
              title={`Stage-wise Rejection Trend (${grainLabel})`} 
              sub="per-stage + Total — hover for values" 
              onClick={() => openModal(`Stage-wise Rejection Trend (${grainLabel})`, "Each line is a station's rejection rate over its own checked quantity; the Total line is the per-period sum of those stage rates. Recomputed from raw counts.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.cumTrend} stages={[...m.stagesAll.map((s) => ({ stageId: s.stageId, label: s.label })), { stageId: CUM_TOTAL_KEY, label: "Total" }]} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}
            >
              <MultiLine data={m.cumTrend} stages={[...m.stagesAll.map((s) => ({ stageId: s.stageId, label: s.label })), { stageId: CUM_TOTAL_KEY, label: "Total" }]} />
            </Card>
          </div>

          {/* Row 4: Size Analytics */}
          {(() => {
            const hasSizeYtd = m.sizes.length > 0;
            const hasSizeTrend = hasSizeYtd && m.sizeTrend.length > 0;
            if (!hasSizeYtd) return null;
            const gridCols = hasSizeTrend ? "minmax(0, 1fr) minmax(0, 2fr)" : "minmax(0, 1fr)";
            return (
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: gridCols, 
                gap: 20,
                marginTop: 20
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
                    <LineChart points={m.sizeTrend} fmt={pct} />
                  </Card>
                )}
              </div>
            );
          })()}

          {/* Row 5: Stage x Size Concentration Heatmap */}
          {m.stageSize.length > 0 && (
            <div style={{ marginTop: 20 }}>
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
                gap: 20,
                marginTop: 20
              }}>
                {hasCopq && (
                  <Card 
                    title={`COPQ Trend (${grainLabel})`} 
                    onClick={() => openModal(`COPQ Trend (${grainLabel})`, `Cost of poor quality trends across historical periods.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.copqTrend} fmt={rupee} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }), value: rupee(m.copq) })}
                  >
                    <LineChart points={m.copqTrend} fmt={rupee} />
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

          {/* Section 3: Executive Brief */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.2fr)", 
            gap: 20,
            marginTop: 20
          }}>
            {/* Brief Column 1: AI Executive Summary */}
            <Card title="AI Executive Summary">
              {execBrief ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, lineHeight: 1.45, color: "var(--text)" }}>
                    {safeBolden(execBrief.headline)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, lineHeight: 1.6 }}>
                    <BriefRow label="Impact" value={execBrief.impact} />
                    {execBrief.primaryDriver && <BriefRow label="Primary driver" value={execBrief.primaryDriver} />}
                    {execBrief.recommendation && <BriefRow label="Recommendation" value={execBrief.recommendation} />}
                  </div>
                </div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.75 }}>
                  {exec.map((bullet, i) => {
                    const colors = ["var(--accent)", "var(--positive)", "var(--critical)", "var(--warning)", "#C8421C"];
                    return (
                      <li key={i} style={{ listStyleType: "none", position: "relative", paddingLeft: 4, marginBottom: 8 }}>
                        <span style={{
                          position: "absolute",
                          left: -16,
                          top: 8,
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: colors[i % colors.length]
                        }} />
                        {safeBolden(bullet)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Brief Column 2: Biggest Improvement Opportunity */}
            <Card title="Biggest Improvement Opportunity">
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ 
                    width: 10, 
                    height: 10, 
                    borderRadius: "50%", 
                    background: "var(--critical)",
                    boxShadow: "0 0 8px var(--critical)",
                    animation: "pulse-ring 1.5s infinite"
                  }} />
                  <span style={{ fontSize: 14.5, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                    {worstStageByRejs} Stage Gate
                  </span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: "var(--text-2)" }}>
                  Quality deviation is heavily concentrated at the <strong>{worstStageByRejs}</strong> gate, operating at a rejection rate of <strong>{worstStageRow ? pct(worstStageRow.rejRate) : "—"}</strong>.
                </p>
                <div style={{ 
                  background: "var(--surface-2)", 
                  border: "1px solid var(--border)", 
                  borderRadius: "var(--radius-md)", 
                  padding: "12px 14px",
                  marginTop: 4
                }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", marginBottom: 4 }}>
                    Financial Recovery Potential
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "var(--critical)", fontFamily: "var(--font-mono)", letterSpacing: "-0.02em" }}>
                    {rupee(m.savings)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                    YTD scrap reduction & rework optimization potential.
                  </div>
                </div>
              </div>
            </Card>

            {/* Brief Column 3: Recommended Action */}
            <Card title="Recommended Actions (AI)">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                        padding: "10px 12px",
                        background: "var(--surface-2)",
                        border: "1.5px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span
                          style={{
                            fontSize: 10,
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
                          style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}
                        >
                          Create CAPA →
                        </a>
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text)" }}>{safeBolden(rec.text)}</div>
                      {rec.evidence && (
                        <div className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>{rec.evidence}</div>
                      )}
                    </div>
                  );
                })}
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
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-3)", minWidth: 108, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: "var(--text)" }}>{safeBolden(value)}</span>
    </div>
  );
}

/** A single inspection station, scoped to the selected date range — KPIs, daily-%
 *  trend, and (when present) its defect Pareto. Mirrors a station sheet in the
 *  workbook; all numbers recomputed from raw counts via the shared selectors. */
function StationView({ events, stageId, label, scope, trendScope, grainLabel, targetRej, openModal, srcRows }: {
  events: Event[];
  stageId: string;
  label: string;
  scope: Scope;
  trendScope: Scope;
  grainLabel: string;
  targetRej: number;
  openModal: (title: string, insight: string | string[], content: React.ReactNode, source?: { rows: SourceRow[]; value: string }) => void;
  srcRows: (filter?: { stageId?: string; defectCode?: string; size?: string; types?: string[] }) => SourceRow[];
}) {
  const d = useMemo(() => {
    const snap: Scope = { ...scope, stageIds: [stageId] };
    const tr: Scope = { ...trendScope, stageIds: [stageId] };
    return {
      rate: rejectionRate(events, snap).value,
      checked: totalChecked(events, snap).value,
      rejected: totalRejected(events, snap).value,
      fpy: fpy(events, snap).value,
      trend: trend(events, tr, "rejectionRate"),
      defects: byDefect(events, snap),
    };
  }, [events, stageId, scope, trendScope]);

  if (d.checked === 0 && d.rejected === 0) {
    return <Empty label={`No ${label} data in the selected date range — widen the range (top bar) or pick a period that has ${label} data (e.g. the month its workbook covers).`} />;
  }

  const paretoFor = (defects: typeof d.defects) =>
    calculatePareto(defects.map((x) => ({ label: x.label, value: x.rejected }))) ||
    { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "No defect data for this period." };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 20 }}>
        <Kpi primary label={`${label} — Rejection Rate`} value={pct(d.rate)} tone={d.rate > targetRej ? "bad" : "good"} spark={d.trend}
          onClick={() => openModal(`${label} — Rejection Rate`, `${label} rejection rate is ${pct(d.rate)} for the selected range.`, <div style={{ minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={d.trend} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ stageId, types: ["production", "inspection"] }), value: pct(d.rate) })} />
        <Kpi label="Quantity Checked" value={num(d.checked)} />
        <Kpi label="Total Rejected" value={num(d.rejected)} tone="bad" />
        <Kpi label="First Pass Yield" value={pct(d.fpy)} tone={d.fpy >= 1 - targetRej ? "good" : "bad"} />
      </div>

      <Card title={`${label} — Rejection % Trend (${grainLabel})`} sub="recomputed from raw checked / rejected"
        onClick={() => openModal(`${label} — Rejection % Trend (${grainLabel})`, `${label} rejection rate per period, from this station's own checked and rejected counts.`, <div style={{ minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={d.trend} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ stageId, types: ["production", "inspection"] }), value: pct(d.rate) })}>
        <LineChart points={d.trend} target={targetRej} fmt={pct} mean />
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
