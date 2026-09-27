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
import { DEFAULT_STAGE_CATEGORIES, type StageCategory } from "@/core/ontology/plant-catalog";

export type Theme = "light" | "dark";

export interface Tweaks {
  theme: Theme;
  showBeams: boolean;
  grain: "day" | "week" | "month" | "fy";
  datePreset: "all" | "this-month" | "last-90-days" | "last-12-months" | "this-fy" | "custom";
  dateFrom: string;
  dateTo: string;
  /** Global stage scope: "cumulative" (all stages combined) or a registry stageId.
   *  Drives EVERY analytics screen so the whole app shows one process at a time. */
  stageView: string;
  /**
   * Source channels for analytics. Both true = full plant view.
   * Excel = uploaded workbooks; Direct entry = Data Entry / batch matrix.
   */
  includeExcel: boolean;
  includeDirectEntry: boolean;
  /**
   * When includeExcel: empty = all Excel files; otherwise only these basenames.
   */
  excelFiles: string[];
  /**
   * Batch-wise scope for dashboard / analytics. Empty = all batches.
   * Non-empty = only these batch IDs (as entered in Data Entry / on Excel rows).
   */
  batchIds: string[];
  /**
   * Shop-floor sections feeding analytics. Defaults to assembly ONLY — the
   * plant's own reports mean assembly when they say "rejection %", so mixing
   * primary/secondary in by default would silently change every KPI.
   */
  stageCategories: StageCategory[];
}

export const TWEAK_DEFAULTS: Tweaks = {
  theme: "light",
  showBeams: true,
  grain: "month",
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
  stageView: "cumulative",
  includeExcel: true,
  includeDirectEntry: true,
  excelFiles: [],
  batchIds: [],
  stageCategories: [...DEFAULT_STAGE_CATEGORIES],
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
