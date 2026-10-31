"use client";

// The active Data Entry schema (registry) — the SAME /api/schema "no presetId"
// default the server itself falls back to, fetched once here so every
// analytics page shares one copy instead of independently calling
// DISPOSAFE_REGISTRY as a hardcoded default.
//
// Mounted by the shell, not the root layout, so signed-out routes (login)
// do not request it. Waits for a session before calling /api/schema.

import { DEFAULT_POLICY, type CalculationPolicyT } from "@/core/policy/policy";
import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePersona } from "@/components/app/PersonaContext";
import { fetchSchema } from "@/lib/client/fetchers";
import { invalidateAfterWrite } from "@/lib/client/invalidate";
import { EVENTS_STALE_MS } from "@/lib/client/ledger-window";
import { schemaQueryKey } from "@/lib/client/query-keys";

export type RefreshRegistryOpts = { force?: boolean };

interface RegistryContextType {
  registry: any | null;
  /** Plant calculation policy — served by the same /api/schema call, so no
   *  second fetch and no second provider. Never null: falls back to the
   *  shipped defaults so screens never render under undefined conventions. */
  policy: CalculationPolicyT;
  isLoading: boolean;
  isValidating: boolean;
  /** `catalog.updatedAt` from the last successful /api/schema read. Data Entry
   *  refetches its template when this changes after a schema mutation. */
  schemaRev: string | null;
  configured: boolean;
  refreshRegistry: (opts?: RefreshRegistryOpts) => Promise<void>;
}

const RegistryContext = createContext<RegistryContextType | undefined>(undefined);

const EMPTY = {
  registry: null as any | null,
  policy: DEFAULT_POLICY,
  schemaRev: null as string | null,
  configured: false,
};

export function RegistryProvider({ children }: { children: React.ReactNode }) {
  const { authEnabled, authUser, authReady } = usePersona();
  const queryClient = useQueryClient();
  const blocked = authReady && authEnabled && !authUser;
  const canFetch = authReady && !blocked;
  const user = authUser?.username ?? "";

  const query = useQuery({
    queryKey: schemaQueryKey(user),
    queryFn: async () => {
      try {
        return await fetchSchema();
      } catch (err) {
        console.error("Failed to fetch active registry:", err);
        throw err;
      }
    },
    enabled: canFetch,
    staleTime: EVENTS_STALE_MS,
  });

  const refreshRegistry = useCallback(async (_opts?: RefreshRegistryOpts) => {
    await invalidateAfterWrite("schema", queryClient);
  }, [queryClient]);

  const value = useMemo<RegistryContextType>(() => {
    if (!authReady) {
      return { ...EMPTY, isLoading: true, isValidating: false, refreshRegistry };
    }
    if (blocked || query.data?.unauthorized) {
      return { ...EMPTY, isLoading: false, isValidating: false, refreshRegistry };
    }
    const data = query.data;
    return {
      registry: data?.registry ?? null,
      policy: data?.policy ?? DEFAULT_POLICY,
      schemaRev: data?.schemaRev ?? null,
      configured: data?.configured ?? false,
      isLoading: !data && query.isPending,
      isValidating: !!data && query.isFetching,
      refreshRegistry,
    };
  }, [authReady, blocked, query.data, query.isFetching, query.isPending, refreshRegistry]);

  return (
    <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>
  );
}

export function useRegistry() {
  const context = useContext(RegistryContext);
  if (!context) {
    throw new Error("useRegistry must be used within a RegistryProvider");
  }
  return context;
}

/** Policy only — same object as useRegistry().policy for screens that do not need the catalog. */
export function usePolicy(): CalculationPolicyT {
  return useRegistry().policy;
}
