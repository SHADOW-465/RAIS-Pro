"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import FloatingDetailModal, { type SourceRow } from "@/components/FloatingDetailModal";
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
import type { Event } from "@/lib/store/types";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
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
} from "@/lib/analytics";

const STAGE_LABELS: Record<string, string> = {
  visual: "Visual Inspection", "eye-punching": "Eye Punching", balloon: "Balloon Testing",
  "valve-integrity": "Valve Integrity", final: "Final Inspection",
};

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
      sheet: prov.sheet,
      cell: prov.cells?.[0] ?? "ENTRY",
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export default function StageAnalysisPage() {
  const { t } = useTweaks();
  const [highlight, setHighlight] = useState<string | null>(null);
  // Mid-path: apply ?grain&from&to&stage from dashboard funnel / attention rail.
  useApplyInvestigationFromUrl({ onState: (s) => setHighlight(s.highlight ?? null) });
  const { events: contextEvents, isLoading } = useEvents();
  const { registry } = useRegistry();
  const activeRegistry = registry || EMPTY_REGISTRY;
  const events = contextEvents ? (contextEvents as any[]) : null;
  const [targetRej, setTargetRej] = useState(0.10);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [rawSheets, setRawSheets] = useState<any[] | undefined>(undefined);

  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: { rows: SourceRow[]; value: string }
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
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
    () => resolveScope(events ?? [], t),
    [events, t.grain, t.datePreset, t.dateFrom, t.dateTo, t.stageView],
  );

  const srcRows = (filter: Parameters<typeof toSourceRows>[1] = {}): SourceRow[] =>
    events ? toSourceRows(scopeEvents(events, scope), filter) : [];

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;

    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    const rate = rejectionRate(events, scope, activeRegistry).value;
    const stages = byStage(events, scope, activeRegistry);
    const order = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const orderedStages = [...stages].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));
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
                    <Card highlight={highlight} title={`Stage-wise Rejection Trend (${grainLabel})`} onClick={() => openModal(`Stage-wise Rejection Trend (${grainLabel})`, "Visual Inspection continues to drive the highest defect volume, followed by Valve Integrity and Balloon Inspection.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.stageTrend} stages={activeRegistry.stages} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}>
                      <MultiLine data={m.stageTrend} stages={activeRegistry.stages} />
                    </Card>
                  )}

                  {m.tr.length > 0 && (
                    <Card highlight={highlight} title={`Overall Rejection Trend (${grainLabel})`} onClick={() => openModal(`Overall Rejection Trend (${grainLabel})`, `Overall ${grainLabel.toLowerCase()} rejection trend lines compared to the target limit of ${(targetRej * 100).toFixed(0)}%.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}>
                      <LineChart points={m.tr} target={targetRej} fmt={pct} />
                    </Card>
                  )}
                </div>
              )}

              {hasRight && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                  <Card highlight={highlight} title="Process Flow Quality Gates" onClick={() => openModal("Process Flow Quality Gates", "catheter manufacturing process flow highlights Balloon Sealing and Valve Integrity as crucial quality checkpoints.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stages} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}>
                    <ProcessFlow rows={m.stages} />
                  </Card>

                  <Card highlight={highlight} title="Stage Contribution (YTD)" onClick={() => openModal("Stage Contribution (YTD)", "Visual Inspection represents the single largest quality loss stage, contributing over half of all shopfloor rejects.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.stages.map((s) => ({ label: s.label, value: s.contributionPct, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}` }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }), value: pct(m.rate) })}>
                    <BarsH rows={m.stages.map((s) => ({ label: s.label, value: s.contributionPct, sub: `${s.rejected.toLocaleString("en-IN")} rejected of ${s.checked.toLocaleString("en-IN")}` }))} fmt={(n) => `${n.toFixed(1)}%`} />
                  </Card>

                  <Card highlight={highlight} title="Rejection Share by Stage">
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
        primaryValue={modalPrimaryValue}
        rawSheets={rawSheets}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
