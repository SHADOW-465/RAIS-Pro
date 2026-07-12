"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import FloatingDetailModal from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  ProcessFlow
} from "@/components/app/widgets";
import type { Event } from "@/lib/store/types";
import {
  byStage,
  periodsIn,
  periodKey,
  periodLabel,
  resolveScope,
  type Scope
} from "@/lib/analytics";
import { FBC_PROCESS } from "@/lib/registry/fbc-process";
import type { StageRow } from "@/lib/analytics";

export default function ProcessFlowPage() {
  const { t } = useTweaks();
  const { events: contextEvents, isLoading } = useEvents();
  const { registry } = useRegistry();
  const activeRegistry = registry || EMPTY_REGISTRY;
  const events = contextEvents ? (contextEvents as any[]) : null;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);

  const openModal = (title: string, insight: string | string[], content: React.ReactNode) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalOpen(true);
  };

  const scope: Scope = useMemo(
    () => resolveScope(events ?? [], t),
    [events, t.grain, t.datePreset, t.dateFrom, t.dateTo, t.stageView],
  );

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;

    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    const stages = byStage(events, scope, activeRegistry);
    const order = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const orderedStages = [...stages].sort((a, b) => order.indexOf(a.stageId) - order.indexOf(b.stageId));

    return {
      stages: orderedStages,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain, activeRegistry]);

  return (
    <AppShell active="process-flow" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            Process Flow Overview
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Inspect cumulative yield, checked volumes, and bottleneck stages across the catheter assembly line.
          </p>
        </div>

        {isLoading && (
          <PageLoader message="Aggregating process pipeline metrics..." minHeight="40vh" />
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

        {m && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
            <Card title="Inspection Stages (Quality Gates)" onClick={() => openModal("Inspection Stages", "The four rejection inspection gates with their current yields for the selected period.", <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><ProcessFlow rows={m.stages} /></div>)}>
              <ProcessFlow rows={m.stages} />
            </Card>
            <Card title="FBC Process Flow — DS/ANX/02:00" sub="* = critical operation">
              <FbcProcessFlow stages={m.stages} />
            </Card>
          </div>
        )}
      </div>

      <FloatingDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        insight={modalInsight}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
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
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11, color: "var(--text-3)", minWidth: 32 }}>{step.code}</span>
            <span style={{ fontSize: 12, fontWeight: step.stageId ? 700 : 500, color: "var(--text)", flex: 1 }}>
              {step.label}
              {step.critical && <span title="Critical operation — special control" style={{ color: "var(--critical)", fontWeight: 800, marginLeft: 6 }}>*</span>}
            </span>
            {step.stageId ? (
              <span style={{
                fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 11.5, padding: "2px 7px", borderRadius: 4,
                color: hasData ? (data!.rejRate > 0.05 ? "var(--critical)" : "var(--positive)") : "var(--text-3)",
                background: hasData ? (data!.rejRate > 0.05 ? "var(--critical-weak)" : "var(--positive-weak)") : "transparent",
              }}>
                {hasData ? `${(data!.rejRate * 100).toFixed(1)}%` : "no data"}
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
