/** Shared nav destination keys (AppShell + persona filter + command palette). */
export type NavKey =
  | "dashboard"
  | "workbooks"
  | "data-entry"
  | "staging"
  | "stage"
  | "size"
  | "defect"
  | "hold"
  | "open-lots"
  | "spc"
  | "process-flow"
  | "copq"
  | "reports"
  | "capa"
  | "remedies"
  | "alerts"
  | "ask"
  | "audit"
  | "schema"
  | "settings";

/** Sidebar groupings, in the order the sidebar shows them. */
export const NAV_SECTIONS = ["overview", "data", "analysis", "management"] as const;
export type NavSectionId = (typeof NAV_SECTIONS)[number];

export const NAV_SECTION_LABELS: Record<NavSectionId, string> = {
  overview: "Overview",
  data: "Your data",
  analysis: "Analysis",
  management: "Management",
};

/**
 * Where each destination lives, and what people call it.
 *
 * One table. Deleting the /chat route meant editing four separate hardcoded
 * lists of the same fifteen screens — the sidebar, the Jump index, the intent
 * router's href map and the guide catalog — and missing any one of them left a
 * dead link that nothing type-checked. They read from here now.
 *
 * `href: null` means the destination is not a route: Ask MOID is a panel that
 * opens over whatever screen you are already on.
 */
export interface NavRoute {
  label: string;
  href: string | null;
  /** Extra words people type when they mean this screen. */
  keywords: string;
  /**
   * Which sidebar group this destination belongs to.
   *
   * Recorded here for the same reason everything else in this table is: the
   * grouping was previously written out only inside AppShell, and the access
   * tree on Settings needs the identical structure. Two hand-kept copies of
   * "which screens are Analysis" is how the dead-link bug in the note above
   * happened. AppShell still owns the icons; it should read the grouping from
   * here when the sidebar moves onto grants.
   */
  section: NavSectionId;
}

export const NAV_ROUTES: Record<NavKey, NavRoute> = {
  dashboard: { label: "Dashboard", href: "/", keywords: "home status factory overview", section: "overview" },
  "data-entry": { label: "Data Entry", href: "/data-entry", keywords: "batch matrix log capture", section: "data" },
  staging: { label: "Import from Excel", href: "/staging", keywords: "excel upload import", section: "data" },
  workbooks: { label: "Excel Data", href: "/workbooks", keywords: "mod ontology files", section: "data" },
  stage: { label: "By Stage", href: "/stage-analysis", keywords: "gate visual balloon valve", section: "analysis" },
  size: { label: "By Size", href: "/size-analysis", keywords: "fr french size", section: "analysis" },
  defect: { label: "By Defect", href: "/defect-analysis", keywords: "pareto reason", section: "analysis" },
  hold: { label: "Hold Quantity", href: "/hold", keywords: "hold rework visual lot stage", section: "analysis" },
  "open-lots": { label: "Open Lots", href: "/open-lots", keywords: "wip stalled waiting batch open complete", section: "analysis" },
  spc: { label: "SPC & Control Charts", href: "/spc", keywords: "control chart xbar", section: "analysis" },
  "process-flow": { label: "Process Flow", href: "/process-flow", keywords: "fpy flow", section: "analysis" },
  copq: { label: "Cost of Rejection", href: "/copq", keywords: "cost rupee money", section: "analysis" },
  reports: { label: "Reports", href: "/reports", keywords: "print monthly pack", section: "management" },
  capa: { label: "CAPA & Actions", href: "/capa", keywords: "action owner", section: "management" },
  remedies: { label: "Defect Remedies", href: "/remedies", keywords: "remedy description primary secondary tertiary spike dip", section: "management" },
  alerts: { label: "Alerts", href: "/alerts", keywords: "notification history timeline exception", section: "management" },
  ask: { label: "Ask MOID", href: null, keywords: "assistant copilot chat", section: "management" },
  audit: { label: "Audit Trail", href: "/audit", keywords: "provenance trust", section: "management" },
  schema: { label: "Plant Schema", href: "/schema", keywords: "registry stages defects", section: "management" },
  settings: { label: "Settings", href: "/settings", keywords: "target cost theme", section: "management" },
};

/** Destinations that are actually routes — everything Jump can navigate to. */
export const ROUTED_NAV_KEYS = (Object.keys(NAV_ROUTES) as NavKey[]).filter(
  (k) => NAV_ROUTES[k].href !== null,
);

/** Href for a destination; falls back to the dashboard for panel-only keys. */
export function navHref(key: NavKey): string {
  return NAV_ROUTES[key].href ?? "/";
}

/**
 * Which destination a URL belongs to, or null for anything that is not a
 * screen (API routes, /login, static paths).
 *
 * Longest match wins so `/settings/rules` resolves to Settings rather than to
 * nothing, and `/` is matched exactly — every path starts with it.
 *
 * Deliberately dependency-free: `src/proxy.ts` runs this on every request in
 * the Edge runtime, so this file must stay importable there.
 */
export function navKeyForPath(pathname: string): NavKey | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === "/") return "dashboard";

  let best: NavKey | null = null;
  let bestLen = 0;
  for (const key of ROUTED_NAV_KEYS) {
    const href = NAV_ROUTES[key].href as string;
    if (href === "/") continue;
    if ((path === href || path.startsWith(`${href}/`)) && href.length > bestLen) {
      best = key;
      bestLen = href.length;
    }
  }
  return best;
}
