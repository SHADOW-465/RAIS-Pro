"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { EventsProvider } from "@/components/app/EventsContext";
import { LineageProvider } from "@/components/app/LineageContext";
import { RegistryProvider } from "@/components/app/RegistryContext";
import { routeReadsLedger, routeReadsLineage } from "@/lib/client/page-data";
import { navKeyForPath } from "@/lib/nav-keys";

/**
 * Data providers for signed-in screens. The page components call useEvents /
 * useRegistry / useLineage before they render AppShell, so the providers have
 * to sit above the page. Login stays outside this layout and does not mount them.
 * The ledger fetch is still per screen: staging, CAPA, alerts and ask do not
 * start it.
 */
export function PlantProviders({ children }: { children: ReactNode }) {
  const active = navKeyForPath(usePathname() || "/");
  const withLineage =
    active && routeReadsLineage(active) ? <LineageProvider>{children}</LineageProvider> : children;
  return (
    <RegistryProvider>
      <EventsProvider enabled={!!active && routeReadsLedger(active)}>{withLineage}</EventsProvider>
    </RegistryProvider>
  );
}
