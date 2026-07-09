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
  BarsH,
  ProcessFlow,
  GaugeChart,
  StageSizeHeatmap,
  pct,
  rupee,
  num,
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
  byStage,
  trend,
  byDefect,
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
  periodsIn,
  periodLabel,
  copqTrend,
  getTargetRejectionRate,
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
    const stages = byStage(events, scope);
    const defects = byDefect(events, scope);

    // Ensure all 5 stages from mockup are mapped correctly (Visual, Eye Punching, Balloon, Valve, Final)
    const order = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const orderedStages = [...stages].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));

    const tr = trend(events, trendScope, "rejectionRate");
    const sizes = bySize(events, scope);

    // Sort sizes numerically: Fr10, Fr12, Fr14, Fr16, Fr18
    const orderedSizes = [...sizes].sort((a, b) => {
      const an = parseInt(a.size.replace(/\D/g, ""), 10);
      const bn = parseInt(b.size.replace(/\D/g, ""), 10);
      return an - bn;
    });

    const stageSize = stageBySize(events, scope);
    const copqRes = copq(events, scope);
    const savings = savingsOpportunity(events, scope);
    const trust = trustScore(events, scope);
    const audit = auditSummary(events, scope);
    const status = qualityStatus(events, scope);
    // Kept for the rate-of-change used in `stats.copqDiff` below — the COPQ
    // trend chart itself was cut from the overview (lives on /copq).
    const cTrend = copqTrend(events, trendScope);

    const worstSize = orderedSizes.length > 0 ? [...orderedSizes].sort((a,b) => b.rejRate - a.rejRate)[0] : null;
    const sizeWiseInsight = worstSize
      ? worstSize.rejRate > 0
        ? `Catheter size ${worstSize.size} shows the highest quality deviation with a rejection rate of ${(worstSize.rejRate * 100).toFixed(2)}% YTD.`
        : "All catheter sizes operate within control parameters with 0.00% rejection rate YTD."
      : "No size-wise rejection data available for the active period.";

    return {
      rate,
      rejected,
      checked,
      stages: orderedStages,
      defects,
      tr,
      sizes: orderedSizes,
      stageSize,
      copq: copqRes?.value ?? 0,
      savings: savings ?? 0,
      trust,
      audit,
      status,
      copqTrend: cTrend,
      worstSize,
      sizeWiseInsight,
      snapshotScope: scope,
      trendScope,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain]);

  // The active view is the GLOBAL stage scope from the header (TweaksContext).
  const activeView = t.stageView;

  // Build provenance rows for a metric's "View Source" panel (scoped to the snapshot period).
  const srcRows = (filter: Parameters<typeof toSourceRows>[1] = {}): SourceRow[] =>
    events && m ? toSourceRows(scopeEvents(events, m.snapshotScope), filter) : [];

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
      copqDiff: copqDiffText,
    };
  }, [m]);

  const worstStageRow = m ? [...m.stages].sort((a, b) => b.rejected - a.rejected)[0] ?? null : null;
  const worstStageByRejs = worstStageRow?.label ?? "Visual Inspection";

  /** Per-KPI drill-down narrative: What happened / Why / Cost impact / [Evidence
   *  is the existing View Source table, wired separately] / Recommended action.
   *  All figures come from `m` — already-computed, already-sorted selectors —
   *  and `recommendations` (filtered to the ONE most relevant line per metric). */
  const kpiNarrative = (metric: "rate" | "copq" | "bottleneck", whatHappened: string): string[] => {
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
          {/* Verdict banner: single source of truth from qualityStatus() — the
              same rate-vs-target/watch comparison every Kpi tone below already
              uses, so the banner state can never contradict a tile. */}
          <VerdictBanner
            status={m.status}
            impact={rupee(m.savings)}
            primaryDriver={worstStageRow
              ? `${worstStageRow.label} (${pct(worstStageRow.rejRate)} rejection rate, ${worstStageRow.contributionPct.toFixed(1)}% of total)`
              : m.defects.length > 0
                ? `${m.defects[0].label} (${m.defects[0].pct.toFixed(1)}% of all rejections)`
                : null}
            action={recommendationCards[0] ?? null}
            completeness={m.audit.dataCompleteness}
            onViewAudit={() => router.push("/audit")}
          />

          {/* KPI strip — one fact, one place. Rejection rate, COPQ, and the worst
              stage/defect/size each appear exactly once on this page. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 20 }}>
            <Kpi
              primary
              label="Overall Rejection"
              value={pct(m.rate)}
              sub={`${stats.rateDiff} · ${num(m.rejected)}/${num(m.checked)}`}
              tone={m.rate > targetRej ? "bad" : "good"}
              spark={m.tr}
              href="/stage-analysis"
              onClick={() => openModal(
                `${grainLabel} Rejection Rate — Drill-down`,
                kpiNarrative("rate", `The rejection rate stands at ${pct(m.rate)}, compared to the target of ${pct(targetRej)} (${stats.rateDiff}).`),
                <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} /></div>,
                { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) },
              )}
            />
            <Kpi
              primary
              label="Cost of Poor Quality"
              value={rupee(m.copq)}
              sub={stats.copqDiff}
              tone={m.copq > 0 ? "warn" : "good"}
              href="/copq"
              onClick={() => openModal(
                `COPQ (${grainLabel}) — Drill-down`,
                kpiNarrative("copq", `Cost of poor quality stands at ${rupee(m.copq)} for the period (${stats.copqDiff}).`),
                <div style={{ display: "flex", justifyContent: "center", width: "100%" }}><GaugeChart value={m.copq / 100000} label={rupee(m.copq)} subtext={stats.copqDiff} /></div>,
                { rows: srcRows({ types: ["inspection", "rejection"] }), value: rupee(m.copq) },
              )}
            />
            <Kpi
              primary
              label="Top Rejecting Stage"
              value={worstStageByRejs}
              sub={worstStageRow ? `${pct(worstStageRow.rejRate)} rejection rate` : "—"}
              tone={worstStageRow && worstStageRow.rejRate > targetRej ? "bad" : "warn"}
              href="/stage-analysis"
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
              sub={m.defects[0] ? `${m.defects[0].pct.toFixed(1)}% of all rejections` : "No defect data this period"}
              tone="warn"
              href="/defect-analysis"
              onClick={() => m.defects[0] && openModal(
                `Top Defect — ${m.defects[0].label}`,
                `The top defect category is ${m.defects[0].label}, accounting for ${m.defects[0].rejected.toLocaleString()} rejects (${m.defects[0].pct.toFixed(1)}% of all rejections).`,
                <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><ParetoChart analysis={calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected }))) || { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "" }} showTable={true} /></div>,
                { rows: srcRows({ defectCode: m.defects[0].label, types: ["rejection"] }), value: m.defects[0].rejected.toLocaleString() }
              )}
            />
            <Kpi
              primary
              label="Worst Size"
              value={m.worstSize?.size ?? "—"}
              sub={m.worstSize ? `${pct(m.worstSize.rejRate)} rejection rate` : "No size data this period"}
              tone={m.worstSize && m.worstSize.rejRate > targetRej ? "bad" : "warn"}
              href="/size-analysis"
              onClick={() => m.worstSize && openModal(
                `Size ${m.worstSize.size} — Drill-down`,
                m.sizeWiseInsight,
                <div style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}` }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>,
                { rows: srcRows({ types: ["inspection", "rejection"] }).filter(r => r.size), value: pct(m.worstSize.rejRate) }
              )}
            />
          </div>

          {/* Row 2: overall trend + process flow (per-stage share/units absorbs
              the former standalone donut card — same fact, one home). */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: 20,
            marginTop: 10
          }}>
            <Card
              title={`Overall Rejection Trend (${grainLabel})`}
              sub={`Target (${(targetRej * 100).toFixed(0)}%) & Mean`}
              onClick={() => openModal(`Rejection Trend (${grainLabel})`, `${grainLabel} rejection trend lines compared to the target limit of ${(targetRej * 100).toFixed(0)}% and the period mean limit.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}
            >
              <LineChart points={m.tr} target={targetRej} fmt={pct} mean />
            </Card>

            <Card
              title="Process Flow"
              sub="Rate · Share · YTD Units"
              onClick={() => openModal("Process Flow Overview", "Catheter assembly process flow indicating quality yields at each gate, with each stage's share of total rejections.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stages} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <ProcessFlow rows={m.stages} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  {m.stages.map((s, idx) => {
                    const colors = ["#2563EB", "#0D9488", "#D97706", "#DC2626", "#7C3AED", "#65A30D"];
                    const share = ((s.rejected / (m.rejected || 1)) * 100).toFixed(1);
                    return (
                      <div key={s.stageId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors[idx % colors.length] }} />
                          {s.label}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                          {pct(s.rejRate)} <span className="muted" style={{ fontWeight: 500, fontSize: 11 }}>({share}% share · {s.rejected.toLocaleString()} units)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>

          {/* Row 3: defect and size drivers */}
          {(() => {
            const hasPareto = m.defects.length > 0;
            const hasSizeYtd = m.sizes.length > 0;
            if (!hasPareto && !hasSizeYtd) return null;
            const gridCols = hasPareto && hasSizeYtd ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)";
            return (
              <div style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 20,
                marginTop: 20
              }}>
                {hasPareto && (
                  <Card
                    title="Defect Pareto (All Stages)"
                    sub="Vital few defect classes responsible for quality deviation"
                    onClick={() => openModal("Defect Pareto (All Stages)", "Six Sigma Pareto analysis highlighting the vital few defect categories responsible for most rejects.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ParetoChart analysis={calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected }))) || { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "No defect data available for this period." }} /></div>, { rows: srcRows({ types: ["rejection"] }), value: num(m.defects.reduce((s, d) => s + d.rejected, 0)) })}
                  >
                    <ParetoChart analysis={calculatePareto(m.defects.map(d => ({ label: d.label, value: d.rejected }))) || { items: [], totalDefects: 0, vitalFewCount: 0, vitalFewContribution: 0, criticalAreaText: "No defect data available for this period." }} showTable={false} />
                  </Card>
                )}

                {hasSizeYtd && (
                  <Card
                    title="Rejection by Size (YTD)"
                    sub={m.worstSize ? `Worst: ${m.worstSize.size}` : "YTD"}
                    onClick={() => openModal("Size-wise Rejection (YTD)", m.sizeWiseInsight, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}` }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }).filter(r => r.size), value: m.sizes.length ? `${(Math.max(...m.sizes.map(s => s.rejRate)) * 100).toFixed(1)}%` : "—" })}
                  >
                    <BarsH rows={m.sizes.map((s) => ({ label: s.size, value: s.rejRate * 100, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}` }))} fmt={(n) => `${n.toFixed(1)}%`} />
                  </Card>
                )}
              </div>
            );
          })()}

          {/* Row 4: stage x size concentration heatmap */}
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

/** One labeled row (Impact / Primary driver) inside the verdict banner.
 *  Presentational only — values are computed by the caller. */
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

/** Single source of truth for "is the factory OK": status/reason come straight
 *  from qualityStatus(), so this banner can never disagree with a Kpi tone
 *  chip below it (both derive from the same rate-vs-target comparison). */
function VerdictBanner({
  status,
  impact,
  primaryDriver,
  action,
  completeness,
  onViewAudit,
}: {
  status: { state: "ok" | "watch" | "at-risk"; reason: string };
  impact: string;
  primaryDriver: string | null;
  action: { text: string; tone: "bad" | "warn" | "info"; evidence: string | null } | null;
  completeness: number;
  onViewAudit: () => void;
}) {
  const tone = status.state === "at-risk" ? "var(--critical)" : status.state === "watch" ? "var(--warning)" : "var(--positive)";
  const label = status.state === "at-risk" ? "Intervene" : status.state === "watch" ? "Watch" : "In Control";
  const chipColor = action ? (action.tone === "bad" ? "var(--critical)" : action.tone === "warn" ? "var(--warning)" : "var(--positive)") : "var(--text-3)";
  const chipText = action ? (action.tone === "bad" ? "Critical" : action.tone === "warn" ? "Warning" : "Info") : "";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1.3fr 1fr 1.3fr",
      gap: 20,
      border: `1.5px solid ${tone}`,
      borderRadius: "var(--radius-lg)",
      background: `color-mix(in srgb, ${tone} 5%, var(--surface))`,
      padding: "20px 24px",
      boxShadow: "var(--shadow-2)",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: tone,
            boxShadow: status.state === "at-risk" ? `0 0 8px ${tone}` : undefined,
            animation: status.state === "at-risk" ? "pulse-ring 1.5s infinite" : undefined,
          }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", color: tone }}>
            {label}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--text-2)" }}>{status.reason}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", padding: "0 20px" }}>
        <BriefRow label="Impact" value={impact} />
        {primaryDriver && <BriefRow label="Primary driver" value={primaryDriver} />}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {action ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                padding: "2px 8px",
                borderRadius: 5,
                color: chipColor,
                background: `color-mix(in srgb, ${chipColor} 14%, transparent)`,
              }}>
                {chipText}
              </span>
              <a href="/capa" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}>
                Create CAPA →
              </a>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text)" }}>{safeBolden(action.text)}</div>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>No actions flagged for this period.</div>
        )}
        <button
          onClick={onViewAudit}
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            color: "var(--text-2)",
          }}
        >
          <span>Data completeness</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: completeness >= 95 ? "var(--positive)" : "var(--warning)" }}>{completeness}%</span>
        </button>
      </div>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20 }}>
        <Kpi primary label={`${label} — Rejection Rate`} value={pct(d.rate)} tone={d.rate > targetRej ? "bad" : "good"} spark={d.trend}
          onClick={() => openModal(`${label} — Rejection Rate`, `${label} rejection rate is ${pct(d.rate)} for the selected range.`, <div style={{ minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={d.trend} target={targetRej} fmt={pct} mean /></div>, { rows: srcRows({ stageId, types: ["production", "inspection"] }), value: pct(d.rate) })} />
        <Kpi label="Quantity Checked" value={num(d.checked)} />
        <Kpi label="Total Rejected" value={num(d.rejected)} tone="bad" />
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
