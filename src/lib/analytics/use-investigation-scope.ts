"use client";

// Apply investigation query params onto TweaksContext + local page hooks.
// Reads window.location.search so analysis pages need no Suspense boundary.

import { useEffect, useRef } from "react";
import { useTweaks } from "@/components/editorial/TweaksContext";
import {
  parseInvestigationState,
  investigationToTweaksPatch,
  type InvestigationState,
} from "./investigation-state";

export interface ApplyInvestigationHandlers {
  /** Called when `size` is present in the URL (e.g. size-analysis selection). */
  onSize?: (size: string) => void;
  /** Full state after parse (optional). */
  onState?: (state: InvestigationState) => void;
}

/**
 * On mount (and when the search string changes via client navigation), apply
 * mid-path investigation params to global grain / date / stage chrome.
 */
export function useApplyInvestigationFromUrl(
  handlers: ApplyInvestigationHandlers = {}
): void {
  const { setTweak } = useTweaks();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const appliedKey = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const apply = () => {
      const search = window.location.search;
      if (search === appliedKey.current) return;
      appliedKey.current = search;

      const params = new URLSearchParams(search);
      const state = parseInvestigationState(params);
      const hasSignal =
        params.has("grain") ||
        params.has("from") ||
        params.has("to") ||
        params.has("stage") ||
        params.has("size") ||
        params.has("batch") ||
        params.has("metric");

      if (!hasSignal) {
        handlersRef.current.onState?.(state);
        return;
      }

      const patch = investigationToTweaksPatch(state);
      if (patch.grain) setTweak("grain", patch.grain);
      if (patch.datePreset) setTweak("datePreset", patch.datePreset);
      if (patch.dateFrom != null) setTweak("dateFrom", patch.dateFrom);
      if (patch.dateTo != null) setTweak("dateTo", patch.dateTo);
      if (patch.stageView) setTweak("stageView", patch.stageView);
      if (state.size) handlersRef.current.onSize?.(state.size);
      handlersRef.current.onState?.(state);
    };

    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, [setTweak]);
}
