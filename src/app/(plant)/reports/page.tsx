"use client";

// THESIS: Reports is an evidence workstation — choose type, lock Date of Entry, see whether the ledger can support the export — not a preset collage or forensic theatre.
// FORM: Operate / established Linear–Stripe register / specified brief.
// Plan §4 Reports: L1 tiles, the report pack workspace, and "Custom chart"
// (the ChartBuilder that used to sit on Home and Excel files) as a second tab.

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import ReportsWorkspace from "@/components/report/ReportsWorkspace";
import { QualityHeader } from "@/components/app/QualityParts";
import Tabs from "@/components/ui/Tabs";
import { useApplyInvestigationFromUrl } from "@/lib/analytics/use-investigation-scope";
import PageLoader from "@/components/app/PageLoader";
import { defaultFyStartYear } from "@/lib/report/report-scope";
import { fyLabel } from "@/lib/report/financial-year";
import { listWorkspacePresets } from "@/lib/report/workspace-presets";
import { qualityStatus, resolveScope } from "@/lib/analytics";

const ChartBuilder = dynamic(() => import("@/components/ChartBuilder"), {
  ssr: false,
  loading: () => <PageLoader message="Loading chart builder…" minHeight="30vh" />,
});

export default function ReportsPage() {
  const { events, isLoading } = useEvents();
  const { registry, policy } = useRegistry();
  const { t } = useTweaks();
  useApplyInvestigationFromUrl();
  const [tab, setTab] = useState<"pack" | "chart">("pack");
  const [savedPresets, setSavedPresets] = useState<number | null>(null);
  useEffect(() => {
    const r = listWorkspacePresets();
    if (r.ok) setSavedPresets(r.value.filter((p) => !p.id.startsWith("builtin:")).length);
  }, [tab]);

  const periodLabel = useMemo(() => fyLabel(defaultFyStartYear(events ?? [])), [events]);
  const scope = useMemo(() => resolveScope((events ?? []) as never[], t, policy), [events, t, policy]);
  const issues = useMemo(
    () => (events && events.length > 0 ? qualityStatus(events as never[], scope).integrityIssues : []),
    [events, scope],
  );
  const critical = issues.filter((i) => i.severity === "critical").length;

  return (
    <AppShell active="reports" dateRange={periodLabel}>
      {isLoading ? (
        <PageLoader message="Loading ledger for report…" minHeight="40vh" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <QualityHeader
            tiles={[
              { label: "Ledger events", value: events?.length ?? 0, status: "neutral", hint: "Every report reads from these" },
              { label: "Saved presets", value: savedPresets ?? "—", status: "neutral", hint: "Your own report setups" },
              {
                label: "Open integrity issues", value: issues.length,
                status: critical > 0 ? "critical" : issues.length > 0 ? "warning" : "ok",
                hint: critical > 0 ? `${critical} critical in the Scope chip's range` : "In the Scope chip's range",
              },
            ]}
          />
          <Tabs
            ariaLabel="Reports"
            active={tab}
            onSelect={(id) => setTab(id as "pack" | "chart")}
            items={[{ id: "pack", label: "Report pack" }, { id: "chart", label: "Custom chart" }]}
          />
          {tab === "pack" ? (
            <ReportsWorkspace events={events ?? []} registry={registry} policy={policy} />
          ) : (
            <ChartBuilder
              events={events ?? []}
              storageId="dashboard"
              base={{ dateFrom: scope.dateFrom, dateTo: scope.dateTo, stageIds: scope.stageIds, sourceChannels: scope.sourceChannels, sourceFiles: scope.sourceFiles }}
              sub="Anything the fixed screens don't answer. Follows the Scope chip: date range, view and sources (pick one Excel file there to chart only that file)."
            />
          )}
        </div>
      )}
    </AppShell>
  );
}
