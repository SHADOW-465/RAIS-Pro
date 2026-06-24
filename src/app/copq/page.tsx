"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import FloatingDetailModal, { type SourceRow } from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  LineChart, 
  GaugeChart,
  rupee
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import {
  copq,
  savingsOpportunity,
  trend,
  periodsIn,
  periodKey,
  periodLabel,
  resolveScope,
  scopeEvents,
  type Scope,
  copqTrend
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

export default function CopqPage() {
  const { t } = useTweaks();
  const { events: contextEvents, isLoading } = useEvents();
  const events = contextEvents ? (contextEvents as any[]) : null;
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

    const copqRes = copq(events, scope);
    const savings = savingsOpportunity(events, scope);
    const cTrend = copqTrend(events, trendScope);

    // Dynamic Period-over-Period Delta
    let copqDiff = "vs Prior Period";
    if (cTrend.length >= 2) {
      const lastVal = cTrend[cTrend.length - 1].value;
      const prevVal = cTrend[cTrend.length - 2].value;
      if (prevVal > 0) {
        const diff = ((lastVal - prevVal) / prevVal) * 100;
        const dir = diff >= 0 ? "↑" : "↓";
        copqDiff = `vs ${cTrend[cTrend.length - 2].label}: ${dir} ${Math.abs(diff).toFixed(1)}%`;
      }
    }

    return {
      copq: copqRes?.value ?? 0,
      savings: savings ?? 0,
      copqTrend: cTrend,
      copqDiff,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain]);

  const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

  return (
    <AppShell active="copq" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            COPQ &amp; Savings Opportunity
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect financial impact assessments of shopfloor rejects and review project return-on-investment targets.
          </p>
        </div>

        {isLoading && (
          <PageLoader message="Compiling cost models..." minHeight="40vh" />
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
          const hasLeft = m.copq > 0 || m.savings > 0;
          const hasRight = m.copqTrend.length > 0;
          const gridTemplate = hasLeft && hasRight ? "minmax(0, 1.25fr) minmax(0, 1.75fr)" : "minmax(0, 1fr)";

          return (
            <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 20 }}>
              {hasLeft && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                  {m.copq > 0 && (
                    <Card title={`${grainLabel} COPQ Impact`} onClick={() => openModal(`${grainLabel} COPQ Impact`, `COPQ reaches ${rupee(m.copq)} this period. ${m.copqDiff}. Material waste and tooling downtime are major drivers.`, <div style={{ display: "flex", justifyContent: "center", width: "100%" }}><GaugeChart value={m.copq / 100000} label={rupee(m.copq)} subtext={m.copqDiff} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }), value: rupee(m.copq) })}>
                      <GaugeChart value={m.copq / 100000} label={rupee(m.copq)} subtext={m.copqDiff} />
                    </Card>
                  )}

                  {m.savings > 0 && (
                    <Card title="Savings Opportunity Summary">
                      <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0" }}>
                        <div>
                          <span className="muted" style={{ fontSize: 11.5, display: "block" }}>Annual Recoverable Opportunity</span>
                          <strong style={{ fontSize: 22, fontFamily: "var(--font-mono)", color: "var(--positive)" }}>
                            {rupee(m.savings)}
                          </strong>
                        </div>
                        <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.4, margin: 0 }}>
                          Calculated by bringing overall rejection rates down to the Watch Limit (5.00%). Refers to finished cost inputs configured in settings.
                        </p>
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {hasRight && (
                <Card title={`COPQ Trend (${grainLabel})`} onClick={() => openModal(`COPQ Trend (${grainLabel})`, `Cost of poor quality trends across historical periods.`, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><LineChart points={m.copqTrend} fmt={rupee} /></div>, { rows: srcRows({ types: ["inspection", "rejection"] }), value: rupee(m.copq) })}>
                  <LineChart points={m.copqTrend} fmt={rupee} />
                </Card>
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
