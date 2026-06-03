"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

export interface Tweaks {
  theme: Theme;
  showBeams: boolean;
}

export const TWEAK_DEFAULTS: Tweaks = {
  theme: "light",
  showBeams: true,
};

interface Ctx {
  t: Tweaks;
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
  reset: () => void;
}

const TweaksCtx = createContext<Ctx | null>(null);

export function TweaksProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Tweaks>(TWEAK_DEFAULTS);

  // Initialize theme on client mount to prevent hydration mismatch
  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme;
    if (stored === "light" || stored === "dark") {
      setT({ theme: stored, showBeams: true });
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setT({ theme: prefersDark ? "dark" : "light", showBeams: true });
    }
  }, []);

  // Sync theme changes with document attribute
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", t.theme);
    localStorage.setItem("theme", t.theme);
  }, [t.theme]);

  const setTweak = useCallback(
    <K extends keyof Tweaks>(key: K, value: Tweaks[K]) =>
      setT((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const reset = useCallback(() => setT(TWEAK_DEFAULTS), []);

  const value = useMemo(() => ({ t, setTweak, reset }), [t, setTweak, reset]);
  return <TweaksCtx.Provider value={value}>{children}</TweaksCtx.Provider>;
}

export function useTweaks() {
  const ctx = useContext(TweaksCtx);
  if (!ctx) throw new Error("useTweaks must be used inside <TweaksProvider>");
  return ctx;
}
