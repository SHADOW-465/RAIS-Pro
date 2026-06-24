"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
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
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
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
  getTargetRejectionRate
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
  const [events, setEvents] = useState<Event[] | null>(null);
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
    fetch("/api/events")
      .then((r) => r.json())
      .then((b) => setEvents(b.events ?? []))
      .catch(() => setEvents([]));

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

    const trendScope: Scope = scope; // carries the stage filter into the trends

    const rate = rejectionRate(events, scope).value;
    const stages = byStage(events, scope);
    const order = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const orderedStages = [...stages].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));
    const tr = trend(events, trendScope, "rejectionRate");
    const st = stageTrend(events, trendScope);

    return {
      rate,
      stages: orderedStages,
      tr,
      stageTrend: st,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain]);

  return (
    <AppShell active="stage" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            Stage Analysis
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect quality thresholds, bottleneck gates, and rejection ratios across all five manufacturing stages.
          </p>
        </div>

        {events === null && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            Aggregating stage quality events...
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
                    <Card title={`Stage-wise Rejection Trend (${grainLabel})`} onClick={() => openModal(`Stage-wise Rejection Trend (${grainLabel})`, "Visual Inspection continues to drive the highest defect volume, followed by Valve Integrity and Balloon Inspection.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}>
                      <MultiLine data={m.stageTrend} stages={DISPOSAFE_REGISTRY.stages} />
                    </Card>
                  )}

                  {m.tr.length > 0 && (
                    <Card title={`Overall Rejection Trend (${grainLabel})`} onClick={() => openModal(`Overall Rejection Trend (${grainLabel})`, `Overall ${grainLabel.toLowerCase()} rejection trend lines compared to the target limit of ${(targetRej * 100).toFixed(0)}%.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.tr} target={targetRej} fmt={pct} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}>
                      <LineChart points={m.tr} target={targetRej} fmt={pct} />
                    </Card>
                  )}
                </div>
              )}

              {hasRight && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                  <Card title="Process Flow Quality Gates" onClick={() => openModal("Process Flow Quality Gates", "catheter manufacturing process flow highlights Balloon Sealing and Valve Integrity as crucial quality checkpoints.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stages} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.rate) })}>
                    <ProcessFlow rows={m.stages} />
                  </Card>

                  <Card title="Stage Contribution (YTD)" onClick={() => openModal("Stage Contribution (YTD)", "Visual Inspection represents the single largest quality loss stage, contributing over half of all shopfloor rejects.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><BarsH rows={m.stages.map((s) => ({ label: s.label, value: s.contributionPct }))} fmt={(n) => `${n.toFixed(1)}%`} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }), value: pct(m.rate) })}>
                    <BarsH rows={m.stages.map((s) => ({ label: s.label, value: s.contributionPct }))} fmt={(n) => `${n.toFixed(1)}%`} />
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
        primaryValue={modalPrimaryValue}
        rawSheets={rawSheets}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
