// Deterministic jump targets for the command palette (EX-2 / EX-4).
// Pure over events + static destinations — no AI.

import type { Event } from "@/lib/store/types";
import type { NavKey } from "@/lib/nav-keys";
import {
  listInvestigationRecents,
  type InvestigationRecent,
} from "./investigation-state";
import { buildEntitySets, scoreMatch } from "./intent-vocab";

export type SearchHitKind =
  | "destination"
  | "batch"
  | "stage"
  | "size"
  | "defect"
  | "recent";

export interface SearchHit {
  id: string;
  kind: SearchHitKind;
  /** Primary label */
  label: string;
  /** Secondary line */
  sub?: string;
  href: string;
  /** Optional nav key for persona filtering of destinations */
  navKey?: NavKey;
  score: number;
}

const DESTINATIONS: { navKey: NavKey; label: string; href: string; keywords: string }[] = [
  { navKey: "dashboard", label: "Dashboard", href: "/", keywords: "home status factory overview" },
  { navKey: "data-entry", label: "Data Entry", href: "/data-entry", keywords: "batch matrix log capture" },
  { navKey: "staging", label: "Staging & Review", href: "/staging", keywords: "excel upload import" },
  { navKey: "stage", label: "Stage Analysis", href: "/stage-analysis", keywords: "gate visual balloon valve" },
  { navKey: "size", label: "Size Analysis", href: "/size-analysis", keywords: "fr french size" },
  { navKey: "defect", label: "Defect Analysis", href: "/defect-analysis", keywords: "pareto reason" },
  { navKey: "spc", label: "SPC & Control Charts", href: "/spc", keywords: "control chart xbar" },
  { navKey: "process-flow", label: "Process Flow", href: "/process-flow", keywords: "fpy flow" },
  { navKey: "copq", label: "COPQ & Savings", href: "/copq", keywords: "cost rupee money" },
  { navKey: "reports", label: "Reports", href: "/reports", keywords: "print monthly pack" },
  { navKey: "capa", label: "CAPA & Actions", href: "/capa", keywords: "action owner" },
  { navKey: "ask", label: "Ask MOID", href: "/chat", keywords: "ai chat" },
  { navKey: "audit", label: "Audit Trail", href: "/audit", keywords: "provenance trust" },
  { navKey: "schema", label: "Data Schema", href: "/schema", keywords: "registry stages defects" },
  { navKey: "settings", label: "Settings", href: "/settings", keywords: "target cost theme" },
  { navKey: "workbooks", label: "Workbooks", href: "/workbooks", keywords: "mod ontology" },
];

const STAGE_LABELS: Record<string, string> = {
  visual: "Visual Inspection",
  balloon: "Balloon",
  "valve-integrity": "Valve Integrity",
  final: "Final Inspection",
  "eye-punching": "Eye Punching",
};

export interface SearchIndexInput {
  events: Event[];
  /** When set, destination hits are filtered to these nav keys. */
  allowedNavKeys?: readonly NavKey[];
  recents?: InvestigationRecent[];
}

/** Build ranked jump targets for a query (empty query → destinations + recents). */
export function searchJumpTargets(
  query: string,
  input: SearchIndexInput
): SearchHit[] {
  const q = query.trim();
  const allowed = input.allowedNavKeys
    ? new Set(input.allowedNavKeys)
    : null;
  const hits: SearchHit[] = [];

  // Destinations
  for (const d of DESTINATIONS) {
    if (allowed && !allowed.has(d.navKey)) continue;
    const sc = q
      ? scoreMatch(q, d.label, d.keywords, d.href)
      : 0.4;
    if (sc > 0) {
      hits.push({
        id: `dest:${d.navKey}`,
        kind: "destination",
        label: d.label,
        sub: "Go to page",
        href: d.href,
        navKey: d.navKey,
        score: sc,
      });
    }
  }

  // Recents (always surface when query empty or matches label)
  const recents = input.recents ?? listInvestigationRecents();
  for (const r of recents) {
    const label =
      r.state.label ||
      [r.state.stage, r.state.size, r.state.metric].filter(Boolean).join(" · ") ||
      "Investigation";
    const sc = q
      ? scoreMatch(q, label, r.href, r.state.batch ?? "", r.state.stage ?? "")
      : 0.85;
    if (sc > 0) {
      hits.push({
        id: `recent:${r.savedAt}:${r.href}`,
        kind: "recent",
        label: `Recent: ${label}`,
        sub: r.href,
        href: r.href,
        score: sc + 0.05, // slight boost over cold destinations
      });
    }
  }

  // Entity index from events
  const { batches, stages, sizes, defects } = buildEntitySets(input.events);

  for (const b of batches) {
    const sc = q ? scoreMatch(q, b) : 0;
    if (sc > 0.5) {
      hits.push({
        id: `batch:${b}`,
        kind: "batch",
        label: `Batch ${b}`,
        sub: "Jump to Data Entry (filter by batch id in grid)",
        href: `/data-entry?batch=${encodeURIComponent(b)}`,
        navKey: "data-entry",
        score: sc,
      });
    }
  }

  for (const st of stages) {
    const label = STAGE_LABELS[st] ?? st;
    const sc = q ? scoreMatch(q, st, label) : 0;
    if (sc > 0.5) {
      hits.push({
        id: `stage:${st}`,
        kind: "stage",
        label,
        sub: "Stage analysis · this gate",
        href: `/stage-analysis?stage=${encodeURIComponent(st)}&metric=stage`,
        navKey: "stage",
        score: sc,
      });
    }
  }

  for (const sz of sizes) {
    const sc = q ? scoreMatch(q, sz) : 0;
    if (sc > 0.5) {
      hits.push({
        id: `size:${sz}`,
        kind: "size",
        label: `Size ${sz}`,
        sub: "Size analysis",
        href: `/size-analysis?size=${encodeURIComponent(sz)}&metric=size`,
        navKey: "size",
        score: sc,
      });
    }
  }

  for (const df of defects) {
    const sc = q ? scoreMatch(q, df) : 0;
    if (sc > 0.5) {
      hits.push({
        id: `defect:${df}`,
        kind: "defect",
        label: df,
        sub: "Defect analysis",
        href: `/defect-analysis?metric=defect&label=${encodeURIComponent(df)}`,
        navKey: "defect",
        score: sc,
      });
    }
  }

  // Persona filter entity hits that point at denied nav
  const filtered = allowed
    ? hits.filter((h) => !h.navKey || allowed.has(h.navKey))
    : hits;

  filtered.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  // Deduplicate by id
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of filtered) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
    if (out.length >= 20) break;
  }
  return out;
}
