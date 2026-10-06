"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { Event } from "@/lib/store/types";
import { usePersona } from "@/components/app/PersonaContext";
import { createTrailingRefresh } from "@/lib/client/trailing-refresh";

interface EventsContextType {
  events: Event[] | null;
  isLoading: boolean;
  /** True while a background revalidate is in flight (UI already has data). */
  isValidating: boolean;
  refreshEvents: () => Promise<void>;
}

const EventsContext = createContext<EventsContextType | undefined>(undefined);

/**
 * Shared ledger cache for the shell.
 *
 * SWR-style: first load shows loading; later refreshes keep stale data on screen
 * (isValidating) so navigating / agent ingest / entry save never blank the UI.
 * One in-flight fetch is coalesced so concurrent refreshEvents() share a promise.
 *
 * When plant auth is on, we wait for a session before calling /api/events so a
 * signed-out shell does not spam 401s, and we re-fetch as soon as the user signs in.
 */
export function EventsProvider({ children }: { children: React.ReactNode }) {
  const { authEnabled, authUser, authReady } = usePersona();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const hasData = useRef(false);

  /** Session required before private APIs: auth on and no user yet. */
  const blockedByAuth = authReady && authEnabled && !authUser;
  const canFetch = authReady && !blockedByAuth;
  const canFetchRef = useRef(canFetch);
  canFetchRef.current = canFetch;

  const load = useCallback(async () => {
    if (!canFetchRef.current) {
      setEvents([]);
      setIsLoading(false);
      setIsValidating(false);
      return;
    }
    if (hasData.current) setIsValidating(true);
    else setIsLoading(true);
    try {
      const res = await fetch("/api/events", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (res.status === 401) {
        setEvents([]);
        hasData.current = false;
        return;
      }
      if (!res.ok) throw new Error(`events ${res.status}`);
      const data = await res.json();
      const next = (data.events ?? []) as Event[];
      setEvents(next);
      hasData.current = true;
    } catch (err) {
      console.error("Failed to fetch events:", err);
      setEvents((prev) => (prev != null ? prev : []));
      throw err;
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  }, []);

  const refreshRef = useRef(createTrailingRefresh(() => load()));
  const refreshEvents = useCallback(() => refreshRef.current(), []);

  // Load (or clear) whenever auth readiness / session changes — including post-login.
  useEffect(() => {
    if (!authReady) return;
    if (blockedByAuth) {
      setEvents([]);
      hasData.current = false;
      setIsLoading(false);
      setIsValidating(false);
      return;
    }
    void refreshEvents().catch(() => {});
  }, [authReady, blockedByAuth, authUser?.username, refreshEvents]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && hasData.current && canFetch) {
        void refreshEvents().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshEvents, canFetch]);

  const value = useMemo(
    () => ({ events, isLoading, isValidating, refreshEvents }),
    [events, isLoading, isValidating, refreshEvents],
  );

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
}

export function useEvents() {
  const context = useContext(EventsContext);
  if (!context) {
    throw new Error("useEvents must be used within an EventsProvider");
  }
  return context;
}
