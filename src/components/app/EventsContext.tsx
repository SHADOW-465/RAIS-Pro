"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event } from "@/lib/store/types";
import { usePersona } from "@/components/app/PersonaContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { fetchEvents, fetchLedgerBounds } from "@/lib/client/fetchers";
import { invalidateAfterWrite } from "@/lib/client/invalidate";
import {
  EVENTS_STALE_MS,
  ledgerFetchWindow,
  presetNeedsAnchor,
} from "@/lib/client/ledger-window";
import { boundsQueryKey, eventsCacheCovers, eventsPendingKey, eventsQueryKey } from "@/lib/client/query-keys";

interface EventsContextType {
  events: Event[] | null;
  isLoading: boolean;
  /** True while a background revalidate is in flight (UI already has data). */
  isValidating: boolean;
  /** Set when the last load failed; cleared by the next success. */
  error: string | null;
  refreshEvents: () => Promise<void>;
}

const EventsContext = createContext<EventsContextType | undefined>(undefined);

/**
 * Ledger cache for the shell. One TanStack Query per signed-in user and date
 * window: the first load shows loading, and a later window keeps the previous
 * rows only when that cache already covers the new one. The query is not
 * started on screens that never read events, and a focused tab does not
 * refetch (staleTime, refetchOnWindowFocus off).
 *
 * Relative presets ("last 90 days", …) need the latest event day first. That
 * is a dates-only read (`?bounds=1`). If it is missing, the screen warns and
 * reads the ledger without a window rather than showing an empty plant.
 */
export function EventsProvider({
  enabled = true,
  children,
}: {
  /** False on screens that only need refreshEvents() after a write. */
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const { authEnabled, authUser, authReady } = usePersona();
  const { t } = useTweaks();
  const queryClient = useQueryClient();
  const blocked = authReady && authEnabled && !authUser;
  const canFetch = authReady && !blocked && enabled;
  const user = authUser?.username ?? "";
  const wantsAnchor = presetNeedsAnchor(t.datePreset);

  const bounds = useQuery({
    queryKey: boundsQueryKey(user),
    queryFn: fetchLedgerBounds,
    enabled: canFetch && wantsAnchor,
    staleTime: EVENTS_STALE_MS,
  });

  const unscoped = bounds.data?.unavailable === true;
  const anchorReady = !wantsAnchor || unscoped || bounds.isFetched;
  const window = ledgerFetchWindow(
    { datePreset: t.datePreset, dateFrom: t.dateFrom, dateTo: t.dateTo },
    { ready: anchorReady, max: bounds.data?.max },
    { unscoped },
  );

  const eventsQuery = useQuery({
    queryKey: window.needsAnchor ? eventsPendingKey(user) : eventsQueryKey(user, window),
    queryFn: async () => {
      try {
        return await fetchEvents({ from: window.from, to: window.to });
      } catch (err) {
        console.error("Failed to fetch events:", err);
        throw err;
      }
    },
    enabled: canFetch && !window.needsAnchor,
    staleTime: EVENTS_STALE_MS,
    // Keep the rows on screen only when they already cover the new window.
    placeholderData: (previous, previousQuery) => {
      if (!previous || !previousQuery) return undefined;
      if (!eventsCacheCovers(previousQuery.queryKey, { user, from: window.from, to: window.to })) {
        return undefined;
      }
      return previous;
    },
  });

  const refreshEvents = useCallback(async () => {
    await invalidateAfterWrite("events", queryClient);
  }, [queryClient]);

  const value = useMemo<EventsContextType>(() => {
    if (!authReady) {
      return { events: null, isLoading: true, isValidating: false, error: null, refreshEvents };
    }
    if (blocked) {
      return { events: [], isLoading: false, isValidating: false, error: null, refreshEvents };
    }

    const payload = eventsQuery.data;
    const failed = eventsQuery.isError && !payload;
    const events = payload?.unauthorized
      ? []
      : payload?.events ?? (failed ? [] : null);
    const waiting =
      canFetch &&
      events == null &&
      !failed &&
      (window.needsAnchor || eventsQuery.isPending || eventsQuery.isFetching);
    const error = eventsQuery.isError
      ? eventsQuery.error instanceof Error
        ? eventsQuery.error.message
        : "Could not load the ledger."
      : null;
    return {
      events,
      isLoading: waiting,
      isValidating: !waiting && (eventsQuery.isFetching || (wantsAnchor && bounds.isFetching)),
      error,
      refreshEvents,
    };
  }, [
    authReady,
    blocked,
    bounds.isFetching,
    canFetch,
    eventsQuery.data,
    eventsQuery.error,
    eventsQuery.isError,
    eventsQuery.isFetching,
    eventsQuery.isPending,
    refreshEvents,
    wantsAnchor,
    window.needsAnchor,
  ]);

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents() {
  const context = useContext(EventsContext);
  if (!context) {
    throw new Error("useEvents must be used within an EventsProvider");
  }
  return context;
}
