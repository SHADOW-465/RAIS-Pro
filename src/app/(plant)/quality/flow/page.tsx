"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import { resolveStageId, sortStageIds } from "@/core/ontology/plant-catalog";
import { groupByEntryLine } from "@/lib/entry/entry-line";
import FloatingDetailModal, { type SourceRow } from "@/components/FloatingDetailModal";
import { QualityHeader } from "@/components/app/QualityParts";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  ProcessFlow,
  ScopeBasis,
  pct,
  num,
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import {
  byStage,
  periodsIn,
  periodKey,
  periodLabel,
  resolveScope,
  scopeEvents,
  toSourceRows,
  type Scope,
  lotScopeLabel,
  STAGE_LABELS,
} from "@/lib/analytics";
import { FBC_PROCESS } from "./fbc-process-data";
import type { StageRow } from "@/lib/analytics";

export default function ProcessFlowPage() {
  const { t } = useTweaks();
  const { events: contextEvents, isLoading } = useEvents();
  const { registry, policy } = useRegistry();
  const activeRegistry = registry || EMPTY_REGISTRY;
  const events = contextEvents ? (contextEvents as any[]) : null;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalInitialShowSource, setModalInitialShowSource] = useState(false);

  const openModal = (title: string, insight: string | string[], content: React.ReactNode, rows?: SourceRow[]) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(rows);
    setModalInitialShowSource(!!rows);
    setModalOpen(true);
  };

  const scope: Scope = useMemo(
    () => resolveScope(events ?? [], t, policy),
    [events, t, policy],
  );

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;

    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    const order = (rows: StageRow[]) => {
      const stageRank = new Map(sortStageIds(rows.map((s) => s.stageId)).map((id, i) => [id, i]));
      return [...rows].sort(
        (a, b) => (stageRank.get(a.stageId) ?? 99) - (stageRank.get(b.stageId) ?? 99),
      );
    };
    const stages = order(byStage(events, scope, activeRegistry));
    // The flow chart is the whole line. Header KPIs stay on the selected section,
    // so Eye Punching (secondary) is visible here even when the header is Assembly.
    const flowStages = order(byStage(events, { ...scope, stageIds: undefined }, activeRegistry));

    return {
      stages,
      flowStages,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain, activeRegistry]);

  return (
    <AppShell active="process-flow" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect cumulative yield, checked volumes, and bottleneck stages across the catheter assembly line.
          </p>
          <ScopeBasis />
        </div>

        {isLoading && (
          <PageLoader message="Aggregating process pipeline metrics..." minHeight="40vh" />
        )}

        {!isLoading && (!events || events.length === 0) && (
          <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              No Data Available
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>
              Upload monthly inspection workbooks under Excel files to populate these metrics.
            </p>
            <a
              href="/excel/import"
              style={{
                display: "inline-block", textDecoration: "none", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 12.5,
                color: "var(--on-accent)", background: "var(--accent)", border: "none",
                padding: "8px 16px", borderRadius: "var(--radius-md)", cursor: "pointer"
              }}
            >
              Go to Excel import →
            </a>
          </div>
        )}

        {m && (() => {
          const worst = m.stages.reduce<StageRow | null>((w, s) => (s.checked > 0 && (!w || s.rejRate > w.rejRate) ? s : w), null);
          const totalChecked = m.stages.reduce((a, s) => a + s.checked, 0);
          const totalRejected = m.stages.reduce((a, s) => a + s.rejected, 0);
          return (
          <>
          <QualityHeader
            tiles={[
              { label: "Worst gate", word: true, value: worst ? worst.label : "—", status: worst && worst.rejRate > 0.05 ? "critical" : worst ? "warning" : "neutral",
                hint: worst ? `${pct(worst.rejRate)} rejection rate` : "No inspected stage in scope" },
              { label: "Rejected", value: num(totalRejected), status: "neutral", hint: `of ${num(totalChecked)} checked across gates` },
              { label: "Stages with records", value: m.stages.filter((s) => s.checked > 0 || s.rejected > 0).length, status: "neutral", hint: `of ${m.flowStages.length} on the line` },
            ]}
            actionLabel="See batches"
            onAction={worst ? () => openModal(`${worst.label} — batches`, `${worst.label} has the highest rejection rate (${pct(worst.rejRate)}) in this scope.`, <div style={{ minHeight: 80 }} />, events ? toSourceRows(scopeEvents(events, scope), { types: ["production", "inspection"], stageId: worst.stageId }) : []) : undefined}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 20, alignItems: "start" }}>
            <Card title="Quality gates" sub={lotScopeLabel(t, STAGE_LABELS)} onClick={() => openModal("Quality gates", "Each process and its stages, in the same order as Data Entry, with current yields for the selected period.", <div style={{ minHeight: 240 }}><EntryLineFlow rows={m.stages} sectionStageIds={scope.stageIds} /></div>)}>
              <EntryLineFlow rows={m.stages} sectionStageIds={scope.stageIds} />
            </Card>
            <Card title="FBC Process Flow — DS/ANX/02:00" sub="Whole plant – lot date. Includes secondary stages such as Eye Punching. * = critical operation">
              <FbcProcessFlow stages={m.flowStages} />
            </Card>
          </div>
          </>
          );
        })()}
      </div>

      <FloatingDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        insight={modalInsight}
        sourceRows={modalSourceRows}
        initialShowSource={modalInitialShowSource}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}

/** Stages grouped the way Data Entry is: Production Dipping, Secondary, Assembly.
 *  A station with no records in the period stays listed, quietly. */
function EntryLineFlow({ rows, sectionStageIds }: { rows: StageRow[]; sectionStageIds?: string[] }) {
  const allowed = sectionStageIds
    ? new Set(sectionStageIds.flatMap((id) => [id, resolveStageId(id) ?? id]))
    : null;
  const groups = groupByEntryLine(rows)
    .map((g) => ({ ...g, stations: g.stations.filter((s) => !allowed || allowed.has(s.stageId)) }))
    .filter((g) => g.stations.length > 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {groups.map((g, gi) => (
        <section key={g.id}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text-3)" }}>{gi + 1}</span>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{g.label}</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.stations.map((st) =>
              st.row ? (
                <ProcessFlow key={st.stageId} rows={[st.row]} />
              ) : (
                <div
                  key={st.stageId}
                  style={{
                    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px",
                    background: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{st.label}</span>
                  <span className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>no records in this date range</span>
                </div>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The official 27-step Foley Balloon Catheter flow (DS/ANX/02:00). Inspection
 *  steps that have data for the selected period are highlighted with their yield;
 *  critical (*) operations are flagged; other steps stay visible but quiet. */
function FbcProcessFlow({ stages }: { stages: StageRow[] }) {
  const byId = new Map(stages.map((s) => [s.stageId, s]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 520, overflowY: "auto" }}>
      {FBC_PROCESS.map((step) => {
        const data = step.stageId ? byId.get(step.stageId) : undefined;
        const hasData = !!data && (data.checked > 0 || data.rejected > 0);
        return (
          <div key={step.code} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            background: hasData ? "var(--surface)" : "var(--surface-2)",
            opacity: step.stageId ? 1 : 0.75,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 11, color: "var(--text-3)", minWidth: 32 }}>{step.code}</span>
            <span style={{ fontSize: 12, fontWeight: step.stageId ? 600 : 500, color: "var(--text)", flex: 1 }}>
              {step.label}
              {step.critical && <span title="Critical operation — special control" style={{ color: "var(--critical)", fontWeight: 600, marginLeft: 6 }}>*</span>}
            </span>
            {step.stageId ? (
              <span style={{
                fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 11.5, padding: "2px 7px", borderRadius: 4,
                color: hasData ? (data!.rejRate > 0.05 ? "var(--critical)" : "var(--positive)") : "var(--text-3)",
                background: hasData ? (data!.rejRate > 0.05 ? "var(--critical-weak)" : "var(--positive-weak)") : "transparent",
              }}>
                {hasData ? `${(data!.rejRate * 100).toFixed(1)}%` : "no records in this date range"}
              </span>
            ) : (
              <span className="muted" style={{ fontSize: 10 }}>process</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
