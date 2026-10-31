"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePersona } from "@/components/app/PersonaContext";
import { fetchConversions, type ConversionsPayload } from "@/lib/client/fetchers";
import { invalidateAfterWrite } from "@/lib/client/invalidate";
import { EVENTS_STALE_MS } from "@/lib/client/ledger-window";
import { conversionsQueryKey } from "@/lib/client/query-keys";
import type { BatchConversion } from "@/lib/lineage";

interface LineageContextType {
  conversions: BatchConversion[];
  isLoading: boolean;
  error: string | null;
  refreshConversions: () => Promise<void>;
  /** Show a row the server just stored, before the refetch returns. */
  noteConversion: (row: BatchConversion) => void;
}

const LineageContext = createContext<LineageContextType | undefined>(undefined);

export function LineageProvider({ children }: { children: React.ReactNode }) {
  const { authEnabled, authUser, authReady } = usePersona();
  const queryClient = useQueryClient();
  const blocked = authReady && authEnabled && !authUser;
  const canFetch = authReady && !blocked;
  const user = authUser?.username ?? "";
  const queryKey = conversionsQueryKey(user);

  const query = useQuery({
    queryKey,
    queryFn: fetchConversions,
    enabled: canFetch,
    staleTime: EVENTS_STALE_MS,
  });

  const refreshConversions = useCallback(async () => {
    await invalidateAfterWrite("conversions", queryClient);
  }, [queryClient]);

  const noteConversion = useCallback((row: BatchConversion) => {
    queryClient.setQueryData<ConversionsPayload>(queryKey, (prev) => {
      const rest = (prev?.conversions ?? []).filter((c) => c.id !== row.id);
      return { conversions: [row, ...rest], error: null, unauthorized: false };
    });
  }, [queryClient, queryKey]);

  const value = useMemo<LineageContextType>(() => {
    if (blocked || query.data?.unauthorized) {
      return {
        conversions: [],
        isLoading: false,
        error: null,
        refreshConversions,
        noteConversion,
      };
    }
    const data = query.data;
    return {
      conversions: data?.conversions ?? [],
      isLoading: !authReady || (!data && query.isPending),
      error: data?.error ?? null,
      refreshConversions,
      noteConversion,
    };
  }, [
    authReady,
    blocked,
    noteConversion,
    query.data,
    query.isPending,
    refreshConversions,
  ]);

  return <LineageContext.Provider value={value}>{children}</LineageContext.Provider>;
}

export function useLineage() {
  const ctx = useContext(LineageContext);
  if (!ctx) throw new Error("useLineage must be used within a LineageProvider");
  return ctx;
}
