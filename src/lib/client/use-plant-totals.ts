"use client";

// One totals read for the plant screens. The occurred-on window is the same
// window useEvents already used, so a failed request can keep the local
// selectors without the two disagreeing about which rows exist.

import { useQuery } from "@tanstack/react-query";
import { usePersona } from "@/components/app/PersonaContext";
import { useTweaks, type Tweaks } from "@/components/editorial/TweaksContext";
import { fetchLedgerBounds, fetchPlantTotals, type PlantTotalsRequest } from "./fetchers";
import { EVENTS_STALE_MS, ledgerFetchWindow, presetNeedsAnchor } from "./ledger-window";
import { boundsQueryKey } from "./query-keys";

export interface PlantTotalsTweaks {
  grain?: Tweaks["grain"];
  datePreset?: Tweaks["datePreset"];
  dateFrom?: string;
  dateTo?: string;
  stageView?: string;
  stageCategories?: Tweaks["stageCategories"];
  includeExcel?: boolean;
  includeDirectEntry?: boolean;
  excelFiles?: string[];
  batchIds?: string[];
}

export function usePlantTotals(args?: {
  basis?: "lot" | "entry";
  entryFrom?: string;
  entryTo?: string;
  /** Analytics scope. The ledger slice still follows the header date preset. */
  tweaks?: PlantTotalsTweaks;
  enabled?: boolean;
}) {
  const { authEnabled, authUser, authReady } = usePersona();
  const { t } = useTweaks();
  const basis = args?.basis ?? "lot";
  const blocked = authReady && authEnabled && !authUser;
  const canFetch = authReady && !blocked;
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
    { ready: anchorReady, min: bounds.data?.min, max: bounds.data?.max, maxEnd: bounds.data?.maxEnd },
    { unscoped },
  );

  const over = args?.tweaks;
  const entryReady = basis !== "entry" || (!!args?.entryFrom && !!args?.entryTo);
  const body: PlantTotalsRequest = {
    dateBasis: basis,
    grain: over?.grain ?? t.grain,
    datePreset: basis === "entry" ? "all" : (over?.datePreset ?? t.datePreset),
    dateFrom: over?.dateFrom ?? t.dateFrom,
    dateTo: over?.dateTo ?? t.dateTo,
    stageView: over?.stageView ?? t.stageView,
    stageCategories: over?.stageCategories ?? t.stageCategories,
    includeExcel: over?.includeExcel ?? t.includeExcel,
    includeDirectEntry: over?.includeDirectEntry ?? t.includeDirectEntry,
    excelFiles: over?.excelFiles ?? t.excelFiles,
    batchIds: over?.batchIds ?? t.batchIds,
    from: window.from,
    to: window.to,
    span: window.span,
    entryFrom: args?.entryFrom,
    entryTo: args?.entryTo,
  };

  return useQuery({
    queryKey: ["plant-totals", user, body],
    queryFn: async () => {
      try {
        return await fetchPlantTotals(body);
      } catch (err) {
        console.warn("[totals] server totals unavailable; keeping the on-screen JS aggregation", err);
        throw err;
      }
    },
    enabled: canFetch && !window.needsAnchor && entryReady && args?.enabled !== false,
    staleTime: EVENTS_STALE_MS,
  });
}
