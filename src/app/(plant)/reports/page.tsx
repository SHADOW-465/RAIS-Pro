"use client";

// THESIS: Reports is an evidence workstation — choose type, lock Date of Entry, see whether the ledger can support the export — not a preset collage or forensic theatre.
// OWN-WORLD: Geist, paper surfaces, burnt-orange only on print/status, mono for dates and IDs.
// STORY: A GM under audit pressure knows the FY, the date basis, the sources, and whether export is honest.
// FIRST VIEWPORT: Type list, FY control with exact dates, Date of Entry, validation strip, paper preview.
// FORM: Operate / established Linear–Stripe register / specified brief.
// FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md

import { useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import ReportsWorkspace from "@/components/report/ReportsWorkspace";
import { useApplyInvestigationFromUrl } from "@/lib/analytics/use-investigation-scope";
import PageLoader from "@/components/app/PageLoader";
import { defaultFyStartYear } from "@/lib/report/report-scope";
import { fyLabel } from "@/lib/report/financial-year";

export default function ReportsPage() {
  const { events, isLoading } = useEvents();
  const { registry, policy } = useRegistry();
  useApplyInvestigationFromUrl();

  const periodLabel = useMemo(() => {
    const year = defaultFyStartYear(events ?? []);
    return fyLabel(year);
  }, [events]);

  return (
    <AppShell active="reports" dateRange={periodLabel}>
      {isLoading ? (
        <PageLoader message="Loading ledger for report…" minHeight="40vh" />
      ) : (
        <ReportsWorkspace
          events={events ?? []}
          registry={registry}
          policy={policy}
        />
      )}
    </AppShell>
  );
}
