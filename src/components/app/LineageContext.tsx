"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePersona } from "@/components/app/PersonaContext";
import { createTrailingRefresh } from "@/lib/client/trailing-refresh";
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
  const [conversions, setConversions] = useState<BatchConversion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasData = useRef(false);

  const blockedByAuth = authReady && authEnabled && !authUser;
  const canFetch = authReady && !blockedByAuth;
  const canFetchRef = useRef(canFetch);
  canFetchRef.current = canFetch;

  const load = useCallback(async () => {
    if (!canFetchRef.current) {
      setConversions([]);
      setError(null);
      setIsLoading(false);
      hasData.current = false;
      return;
    }
    if (!hasData.current) setIsLoading(true);
    setError(null);
    const res = await fetch("/api/batch-conversions", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (res.status === 401) {
      setConversions([]);
      hasData.current = false;
      setIsLoading(false);
      return;
    }
    if (!res.ok) {
      setError(res.status === 401 ? "Sign in required." : "Could not load conversions.");
      setIsLoading(false);
      return;
    }
    const data = (await res.json()) as { conversions?: BatchConversion[] };
    setConversions(data.conversions ?? []);
    hasData.current = true;
    setIsLoading(false);
  }, []);

  const refreshRef = useRef(createTrailingRefresh(() => load()));
  const refreshConversions = useCallback(() => refreshRef.current(), []);

  const noteConversion = useCallback((row: BatchConversion) => {
    setConversions((prev) => {
      const rest = prev.filter((c) => c.id !== row.id);
      return [row, ...rest];
    });
    hasData.current = true;
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (blockedByAuth) {
      setConversions([]);
      hasData.current = false;
      setIsLoading(false);
      setError(null);
      return;
    }
    void refreshConversions().catch(() => {});
  }, [authReady, blockedByAuth, authUser?.username, refreshConversions]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && canFetchRef.current) {
        void refreshConversions().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshConversions]);

  const value = useMemo(
    () => ({ conversions, isLoading, error, refreshConversions, noteConversion }),
    [conversions, isLoading, error, refreshConversions, noteConversion],
  );

  return <LineageContext.Provider value={value}>{children}</LineageContext.Provider>;
}

export function useLineage() {
  const ctx = useContext(LineageContext);
  if (!ctx) throw new Error("useLineage must be used within a LineageProvider");
  return ctx;
}
