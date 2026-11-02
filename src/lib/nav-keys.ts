/** Shared nav destination keys (AppShell + persona filter + command palette). */
export type NavKey =
  | "dashboard"
  | "workbooks"
  | "data-entry"
  | "batch-conversion"
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
  "data-entry": { label: "Data Entry", href: "/log/entry", keywords: "batch matrix log capture", section: "data" },
  "batch-conversion": {
    label: "Batch Conversion",
    href: "/log/conversion",
    keywords: "lineage size conversion convert lot french fr identity",
    section: "data",
  },
  staging: { label: "Import from Excel", href: "/excel/import", keywords: "excel upload import", section: "data" },
  workbooks: { label: "Excel Data", href: "/excel/files", keywords: "mod ontology files", section: "data" },
  stage: { label: "By Stage", href: "/quality/stage", keywords: "gate visual balloon valve", section: "analysis" },
  size: { label: "By Size", href: "/quality/size", keywords: "fr french size", section: "analysis" },
  defect: { label: "By Defect", href: "/quality/defect", keywords: "pareto reason", section: "analysis" },
  hold: { label: "Hold Quantity", href: "/lots/hold", keywords: "hold rework visual lot stage", section: "analysis" },
  "open-lots": { label: "Open Lots", href: "/lots/open", keywords: "wip stalled waiting batch open complete", section: "analysis" },
  spc: { label: "SPC & Control Charts", href: "/quality/spc", keywords: "control chart xbar", section: "analysis" },
  "process-flow": { label: "Process Flow", href: "/quality/flow", keywords: "fpy flow", section: "analysis" },
  copq: { label: "Cost of Rejection", href: "/cost", keywords: "cost rupee money", section: "analysis" },
  reports: { label: "Reports", href: "/reports", keywords: "print monthly pack", section: "management" },
  capa: { label: "CAPA & Actions", href: "/actions/capa", keywords: "action owner", section: "management" },
  remedies: { label: "Defect Remedies", href: "/actions/remedies", keywords: "remedy description primary secondary tertiary spike dip", section: "management" },
  alerts: { label: "Alerts", href: "/actions/alerts", keywords: "notification history timeline exception", section: "management" },
  ask: { label: "Ask MOID", href: null, keywords: "assistant copilot chat", section: "management" },
  audit: { label: "Audit Trail", href: "/reports/audit", keywords: "provenance trust", section: "management" },
  schema: { label: "Plant Schema", href: "/setup/schema", keywords: "registry stages defects", section: "management" },
  settings: { label: "Settings", href: "/setup/settings", keywords: "target cost theme", section: "management" },
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

/**
 * The sidebar: nine destinations, each owning one or more of the screens
 * above as tabs. NavKey stays the unit of ACCESS (roles, nav cookie, proxy), so
 * a role that may open By Stage but not SPC still gets a Quality destination
 * with only the tabs it has. Destinations are chrome only.
 */
export interface NavDestination {
  id: string;
  label: string;
  /** Sidebar group, same ids as NAV_SECTIONS. */
  group: NavSectionId;
  /** Screens that live under it, in tab order. */
  keys: readonly NavKey[];
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { id: "home", label: "Home", group: "overview", keys: ["dashboard"] },
  { id: "log", label: "Log", group: "data", keys: ["data-entry", "batch-conversion"] },
  { id: "excel", label: "Excel files", group: "data", keys: ["staging", "workbooks"] },
  { id: "quality", label: "Quality", group: "analysis", keys: ["stage", "process-flow", "size", "defect", "spc"] },
  { id: "lots", label: "Lots", group: "analysis", keys: ["open-lots", "hold"] },
  { id: "cost", label: "Cost", group: "analysis", keys: ["copq"] },
  { id: "actions", label: "Actions", group: "management", keys: ["capa", "remedies", "alerts"] },
  { id: "reports", label: "Reports", group: "management", keys: ["reports", "audit"] },
  { id: "setup", label: "Plant setup", group: "management", keys: ["schema", "settings"] },
];

/** Tab label for a screen inside its destination. */
export const NAV_TAB_LABELS: Partial<Record<NavKey, string>> = {
  "data-entry": "Data entry",
  "batch-conversion": "Batch conversion",
  staging: "Import",
  workbooks: "Files",
  stage: "Stages",
  "process-flow": "Flow",
  size: "Sizes",
  defect: "Defects",
  spc: "SPC",
  "open-lots": "Open lots",
  hold: "Hold",
  capa: "CAPA",
  remedies: "Remedies",
  alerts: "Alerts history",
  reports: "Reports",
  audit: "Audit trail",
  schema: "Plant schema",
  settings: "Settings",
};

/** The destination a screen belongs to (null for panel-only keys like Ask). */
export function destinationForKey(key: NavKey): NavDestination | null {
  return NAV_DESTINATIONS.find((d) => d.keys.includes(key)) ?? null;
}

/**
 * Old (pre-regroup) URL to its new home. next.config.ts turns this into
 * redirects so bookmarks, stored notification links and role homeHrefs keep
 * working. Query strings are carried across by Next.
 */
export const LEGACY_ROUTES: Record<string, string> = {
  "/data-entry": "/log/entry",
  "/batch-conversion": "/log/conversion",
  "/staging": "/excel/import",
  "/workbooks": "/excel/files",
  "/stage-analysis": "/quality/stage",
  "/size-analysis": "/quality/size",
  "/defect-analysis": "/quality/defect",
  "/spc": "/quality/spc",
  "/process-flow": "/quality/flow",
  "/open-lots": "/lots/open",
  "/hold": "/lots/hold",
  "/copq": "/cost",
  "/capa": "/actions/capa",
  "/remedies": "/actions/remedies",
  "/alerts": "/actions/alerts",
  "/audit": "/reports/audit",
  "/schema": "/setup/schema",
  "/settings": "/setup/settings",
};

/** Rewrite a pre-regroup path (stored links, old agent hrefs) to its current URL; anything else is returned unchanged. */
export function modernPath(path: string): string {
  for (const [from, to] of Object.entries(LEGACY_ROUTES)) {
    if (path === from || /^[/?#]/.test(path.slice(from.length)) && path.startsWith(from)) {
      return to + path.slice(from.length);
    }
  }
  return path;
}
