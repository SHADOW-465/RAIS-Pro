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

// Seed from the data-theme the pre-paint inline script (in layout.tsx) already
// set, so there is no flash and the saved preference is never clobbered.
function initialTheme(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  }
  return TWEAK_DEFAULTS.theme;
}

export function TweaksProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Tweaks>(() => ({ ...TWEAK_DEFAULTS, theme: initialTheme() }));

  // Sync theme changes with the document attribute + persisted preference.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
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
