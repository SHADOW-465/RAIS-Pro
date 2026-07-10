"use client";

// The active Data Entry schema (registry) — the SAME /api/schema "no presetId"
// default the server itself falls back to, fetched once here so every
// analytics page shares one copy instead of independently calling
// DISPOSAFE_REGISTRY as a hardcoded default. Mirrors EventsContext exactly.
//
// This is the fix for the root cause traced in this session: rejectionRate(),
// totalChecked(), fpy(), byStage(), byDefect(), stageTrend(), stageBySize()
// (src/lib/analytics/rejection.ts, defect.ts) all default their `registry`
// parameter to the hardcoded DISPOSAFE_REGISTRY, and no page was passing a
// dynamic one in. perStageAgg() filters ledger events against registry.stages
// — any event whose stageId isn't one of the 13 hardcoded ones was silently
// invisible to every headline KPI, even though it was correctly stored in the
// canonical event ledger. Pages should pass `registry` from useRegistry() into
// every selector call instead of relying on the hardcoded default.

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface RegistryContextType {
  registry: any | null;
  isLoading: boolean;
  refreshRegistry: () => Promise<void>;
}

const RegistryContext = createContext<RegistryContextType | undefined>(undefined);

export function RegistryProvider({ children }: { children: React.ReactNode }) {
  const [registry, setRegistry] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshRegistry = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/schema");
      const data = await res.json();
      setRegistry(data.registry ?? null);
    } catch (err) {
      console.error("Failed to fetch active registry:", err);
      setRegistry(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRegistry();
  }, [refreshRegistry]);

  return (
    <RegistryContext.Provider value={{ registry, isLoading, refreshRegistry }}>
      {children}
    </RegistryContext.Provider>
  );
}

export function useRegistry() {
  const context = useContext(RegistryContext);
  if (!context) {
    throw new Error("useRegistry must be used within a RegistryProvider");
  }
  return context;
}
