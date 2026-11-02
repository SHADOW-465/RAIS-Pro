// Place an alert on the plant: which page, which process, which station.
// Grouping and the timeline are derived here so the Alerts page never invents them.

import { NAV_ROUTES, modernPath, type NavKey } from "@/lib/nav-keys";
import {
  STAGE_CATEGORIES,
  STAGE_LABELS,
  stageCategoryOf,
  resolveStageId,
} from "@/core/ontology/plant-catalog";
import { periodKey, periodLabel, type Grain } from "@/lib/analytics/scope";
import type { PlantNotification } from "./types";

export type AlertGroupBy = "page" | "process" | "stage";

export type AlertPlace = {
  page: NavKey;
  pageLabel: string;
  process: string | null;
  processLabel: string;
  stageId: string | null;
  stageLabel: string;
};

function payloadOf(n: PlantNotification): Record<string, unknown> {
  return (n.payload ?? {}) as Record<string, unknown>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function pageFromPath(path: string | null | undefined): NavKey {
  const p = modernPath((path ?? "").trim());
  if (!p || p === "/") return p === "/" ? "dashboard" : "data-entry";
  let best: NavKey | null = null;
  let bestLen = 0;
  for (const key of Object.keys(NAV_ROUTES) as NavKey[]) {
    const href = NAV_ROUTES[key].href;
    if (!href || href === "/") continue;
    if (p === href || p.startsWith(`${href}/`) || p.startsWith(`${href}?`)) {
      if (href.length > bestLen) {
        best = key;
        bestLen = href.length;
      }
    }
  }
  return best ?? "data-entry";
}

export function classifyAlert(n: PlantNotification): AlertPlace {
  const p = payloadOf(n);
  const path = str(p.path);
  const page: NavKey =
    n.type === "entry_exception" || n.type === "edit_request" || n.type === "edit_granted"
      ? pageFromPath(path) === "dashboard"
        ? "data-entry"
        : pageFromPath(path)
      : pageFromPath(path);

  const rawStage = str(p.stageId) ?? str(p.stageName) ?? str(p.processName);
  const stageId = rawStage ? resolveStageId(rawStage) ?? rawStage : null;
  const process = stageId ? stageCategoryOf(stageId) ?? null : null;
  const processLabel =
    process
      ? (STAGE_CATEGORIES.find((c) => c.id === process)?.label.replace(/\s*\(.*\)$/, "") ?? process)
      : "Unspecified process";
  const stageLabel = stageId
    ? STAGE_LABELS[stageId] ?? str(p.stageName) ?? str(p.processName) ?? stageId
    : "Unspecified station";

  return {
    page,
    pageLabel: NAV_ROUTES[page]?.label ?? page,
    process,
    processLabel,
    stageId,
    stageLabel,
  };
}

export type AlertGroup = {
  key: string;
  label: string;
  items: PlantNotification[];
};

export function groupAlerts(list: PlantNotification[], by: AlertGroupBy): AlertGroup[] {
  const buckets = new Map<string, AlertGroup>();
  for (const n of list) {
    const place = classifyAlert(n);
    const key =
      by === "page" ? place.page : by === "process" ? place.process ?? "unspecified" : place.stageId ?? "unspecified";
    const label =
      by === "page" ? place.pageLabel : by === "process" ? place.processLabel : place.stageLabel;
    const g = buckets.get(key) ?? { key, label, items: [] };
    g.items.push(n);
    buckets.set(key, g);
  }
  return [...buckets.values()].sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
}

export type TimelineGrain = Grain | "all";

export type TimelineBucket = {
  period: string;
  label: string;
  items: PlantNotification[];
};

export function alertDay(n: PlantNotification): string {
  return (n.createdAt ?? "").slice(0, 10);
}

export function inRange(n: PlantNotification, from?: string, to?: string): boolean {
  const d = alertDay(n);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function timelineBuckets(
  list: PlantNotification[],
  grain: TimelineGrain,
): TimelineBucket[] {
  if (grain === "all") {
    return [{ period: "all", label: "All time", items: list.slice() }];
  }
  const map = new Map<string, PlantNotification[]>();
  for (const n of list) {
    const d = alertDay(n);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const key = periodKey(d, grain);
    const arr = map.get(key) ?? [];
    arr.push(n);
    map.set(key, arr);
  }
  return [...map.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((period) => ({
      period,
      label: periodLabel(period),
      items: map.get(period)!,
    }));
}
