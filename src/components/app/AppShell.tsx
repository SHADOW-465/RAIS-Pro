"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from "react";
import Icon, { type IconName } from "@/components/editorial/Icon";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { useEvents } from "@/components/app/EventsContext";
import { prefetchNav, routeReadsLedger } from "@/lib/client/page-data";
import { useConfirm } from "@/components/ui/ConfirmContext";
import ScopeChip from "@/components/app/ScopeChip";
import {
  rejectionRate,
  stagesFor,
  STAGE_CATEGORIES,
  totalRejected,
  totalChecked,
  fpy,
  copq,
  savingsOpportunity,
  trustScore,
  goInvestigation,
  investigationToTweaksPatch,
  type InvestigationState,
} from "@/lib/analytics";
import type { DashboardConfig } from "@/types/dashboard";
import { resolveScope, DEFAULT_STAGE_CATEGORIES, stageCategoryOf } from "@/lib/analytics/scope";
import { trustScore as computeTrustScore } from "@/lib/analytics/trust";
import { qualityStatus } from "@/lib/analytics/status";

import {
  NAV_ROUTES,
  NAV_DESTINATIONS,
  NAV_SECTIONS as NAV_GROUPS,
  NAV_SECTION_LABELS,
  destinationForKey,
  type NavKey,
} from "@/lib/nav-keys";
export type { NavKey };
import {
  PERSONAS,
  PERSONA_ORDER,
  personaDef,
  type PersonaId,
} from "@/lib/persona";
import { sidebarCollapsed as sidebarCollapsedPref, navSectionsCollapsed } from "@/lib/ui-prefs";
import { useCommandPaletteHotkey } from "@/components/app/CommandPaletteHotkey";
import SharedStateBanner from "@/components/app/SharedStateBanner";
import DestinationTabs from "@/components/app/DestinationTabs";
import { canReport } from "@/lib/report/blocks";
import { subscribeNavBanner, emitNavBanner, type NavBanner } from "@/lib/analytics/nav-banner";
import { usePersona } from "@/components/app/PersonaContext";
import { ActiveMetricProvider, useActiveMetric } from "@/components/app/ActiveMetricContext";

// Heavy chrome — code-split; only fetched when the operator opens the surface.
const CommandPalette = dynamic(() => import("@/components/app/CommandPalette"), {
  ssr: false,
  loading: () => null,
});
const ReportPanel = dynamic(() => import("@/components/report/ReportPanel"), {
  ssr: false,
  loading: () => null,
});
const EntryExportPanelLazy = dynamic(
  () => import("@/components/entry/EntryExportPanel"),
  { ssr: false, loading: () => null },
);
const SourcesScopePanel = dynamic(() => import("@/components/app/SourcesScopePanel"), {
  ssr: false,
  loading: () => null,
});
const NotificationsPanel = dynamic(() => import("@/components/app/NotificationsPanel"), {
  ssr: false,
  loading: () => null,
});
import {
  buildScopedDashboardConfig,
  formatScopedSummaryText,
} from "@/lib/guide";
import {
  runTurn,
  turnAfterIngestSuccess,
  turnAfterIngestFailure,
  loadSession,
  saveSession,
  draftToShiftRecord,
  roleStarterChips,
  writePrefill,
  prefillFromDraft,
  type AgentSession,
  type AgentAction,
  type AgentDraft,
  type ToolIntent,
  type EntryDraft,
} from "@/lib/agent";
import { toStageDayRecord } from "@/lib/entry/to-stage-day-record";

interface WidgetMessage {
  id: string;
  sender: "user" | "moid";
  text: string;
  timestamp: string;
  steps?: string[];
  actions?: AgentAction[];
  draft?: AgentDraft;
}

interface NavItem {
  /** Destination id (home, log, quality, …). */
  id: string;
  /** Screen the item opens: the first tab the signed-in role may see. */
  key: NavKey;
  /** Every screen that lives under this destination (any of them = active). */
  keys: readonly NavKey[];
  label: string;
  icon: IconName;
  href?: string;
  badge?: number;
  soon?: boolean;
  indent?: boolean;
  aiBadge?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

/** Icons are chrome and live here; ids, labels, grouping and tab membership
 *  come from NAV_DESTINATIONS so the sidebar, tab bar and Jump cannot drift. */
const DESTINATION_ICONS: Record<string, IconName> = {
  home: "table",
  log: "file",
  excel: "folder",
  quality: "trend-up",
  lots: "history",
  cost: "lightning",
  actions: "check",
  reports: "print",
  setup: "external",
};

// Global stage scope. "cumulative" = all stages combined; the rest scope every
// screen (KPIs, trends, view-source, SPC) to a single inspection process.
const VIEW_OPTIONS: { id: string; label: string }[] = [
  { id: "cumulative", label: "Cumulative" },
  { id: "visual", label: "Visual" },
  { id: "balloon", label: "Balloon" },
  { id: "valve-integrity", label: "Valve" },
  { id: "final", label: "Final" },
];

/**
 * Which topbar scope controls each screen actually consumes.
 *
 * A control that sometimes does nothing teaches people that controls do
 * nothing — so View / Interval / Range are rendered per page rather than
 * globally. Anything absent from this map shows no scope controls at all.
 */
const SCOPE_CONTROLS: Partial<Record<NavKey, ("view" | "interval" | "range" | "sources")[]>> = {
  dashboard: ["view", "interval", "range", "sources"],
  stage: ["view", "interval", "range", "sources"],
  size: ["view", "interval", "range", "sources"],
  defect: ["view", "interval", "range", "sources"],
  hold: ["view", "interval", "range", "sources"],
  "open-lots": ["interval", "range", "sources"],
  spc: ["view", "interval", "range", "sources"],
  "process-flow": ["view", "interval", "range", "sources"],
  copq: ["view", "interval", "range", "sources"],
  "data-entry": ["interval"],
  "batch-conversion": ["interval"],
  reports: ["range", "sources"],
  capa: ["range", "sources"],
  audit: ["range", "sources"],
};

const topbarBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 36,
  padding: "0 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: "var(--text-md)",
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const menuRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  width: "100%",
  minHeight: 36,
  padding: "6px 8px",
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--text)",
  fontFamily: "inherit",
  cursor: "pointer",
};

function AppShellView({
  active, trustScore: trustScoreProp, statusCounts, dateRange, children, presetId: _presetId,
  toolbarExtra, wide, ownTabs,
}: {
  active: NavKey;
  trustScore?: number | null;
  statusCounts?: { alerts?: number; capa?: number; overdue?: number; anomalies?: number };
  dateRange?: string;
  children: React.ReactNode;
  /** Which Data Entry preset's registry to load for stage-gate nav. Omit for the default preset. */
  presetId?: string | null;
  /** Extra controls in the masthead, immediately left of Jump. */
  toolbarExtra?: ReactNode;
  /** Dashboard uses the full main pane — no 1400px cap, so side gutters go away. */
  wide?: boolean;
  /** The page draws its own tab row (Lots, Log), so skip the destination tabs. */
  ownTabs?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { events, refreshEvents, isLoading: eventsLoading, error: eventsError } = useEvents();
  const { t, setTweak } = useTweaks();
  const { registry, policy, configured: registryConfigured, isLoading: registryLoading } = useRegistry();
  const {
    persona,
    setPersona,
    canConfigure,
    canWrite,
    authEnabled,
    authUser,
    personaLocked,
    signOut,
    def: personaDefinition,
    allowsNav,
  } = usePersona();
  const { notify } = useConfirm();
  const [mounted, setMounted] = useState(false);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [banner, setBanner] = useState<NavBanner | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [entryExportOpen, setEntryExportOpen] = useState(false);

  /** The window the report covers — resolved exactly as the screens resolve it,
   *  so a report always answers the same question the page is answering. */
  const reportScope = useMemo(
    () => resolveScope(events ?? [], t, policy),
    [events, t, policy],
  );

  useCommandPaletteHotkey(useCallback(() => setPaletteOpen(true), []));

  const scopeControls = SCOPE_CONTROLS[active] ?? [];
  const showView = scopeControls.includes("view");
  const showInterval = scopeControls.includes("interval");
  const showRange = scopeControls.includes("range");
  const showSources = scopeControls.includes("sources");
  const [showSourcesPanel, setShowSourcesPanel] = useState(false);

  const sourcesLabel = useMemo(() => {
    const ex = t.includeExcel;
    const de = t.includeDirectEntry;
    const batches = t.batchIds;
    const cats = t.stageCategories;
    const pinned = t.stageView && t.stageView !== "cumulative" ? t.stageView : null;

    // Batch selection wins the chip label when set — primary investigation intent.
    if (batches.length === 1) return batches[0];
    if (batches.length > 1) return `${batches.length} batches`;

    // Station pin (from Sources tree or View menu).
    if (pinned) return pinned.replace(/-/g, " ");

    // Sections: adding Primary changes every KPI — must show on the chip.
    if (cats.length === 0) return "No sections";
    if (!(cats.length === 1 && cats[0] === "assembly")) {
      return cats.length === STAGE_CATEGORIES.length
        ? "All sections"
        : cats.map((c) => c[0].toUpperCase() + c.slice(1, 4)).join(" + ");
    }

    if (ex && de && t.excelFiles.length === 0) return "Plant default";
    if (ex && de && t.excelFiles.length > 0) {
      return `Entry + ${t.excelFiles.length} file${t.excelFiles.length === 1 ? "" : "s"}`;
    }
    if (ex && !de) {
      if (t.excelFiles.length === 0) return "Excel only";
      if (t.excelFiles.length === 1) return t.excelFiles[0].slice(0, 22);
      return `${t.excelFiles.length} Excel files`;
    }
    if (!ex && de) return "Data entry only";
    return "No sources";
  }, [t.includeExcel, t.includeDirectEntry, t.excelFiles, t.batchIds, t.stageCategories, t.stageView]);

  /** Accent when scope is not plant default (or panel open). */
  const sourcesScoped = useMemo(() => {
    const cats = t.stageCategories;
    const assemblyOnly = cats.length === 1 && cats[0] === "assembly";
    const defaultView = !t.stageView || t.stageView === "cumulative";
    return (
      t.batchIds.length > 0 ||
      t.excelFiles.length > 0 ||
      !t.includeExcel ||
      !t.includeDirectEntry ||
      !assemblyOnly ||
      !defaultView
    );
  }, [t.includeExcel, t.includeDirectEntry, t.excelFiles, t.batchIds, t.stageCategories, t.stageView]);

  /** Compact label for the merged date-window chip next to D/W/M/FY. */
  const rangeLabel = useMemo(() => {
    switch (t.datePreset) {
      case "all":
        return "All data";
      case "this-day":
        return "This day";
      case "this-week":
        return "This week";
      case "last-week":
        return "Last week";
      case "this-month":
        return "This month";
      case "last-month":
        return "Last month";
      case "last-3-months":
      case "last-3-month":
        return "Last 3mo";
      case "last-90-days":
        return "Last 90d";
      case "last-12-months":
        return "Last 12mo";
      case "this-fy":
        return "This FY";
      case "custom":
        if (t.dateFrom && t.dateTo) {
          // Short ISO → "Apr 1 – Jun 30" when same year, else keep ISO slices
          const fmt = (iso: string) => {
            const d = new Date(iso + "T00:00:00");
            if (Number.isNaN(d.getTime())) return iso;
            return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          };
          return `${fmt(t.dateFrom)} – ${fmt(t.dateTo)}`;
        }
        return "Custom";
      default:
        return "Range";
    }
  }, [t.datePreset, t.dateFrom, t.dateTo]);

  useEffect(() => subscribeNavBanner(setBanner), []);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 8000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const setPersonaAndStore = (id: PersonaId) => {
    if (personaLocked) {
      setShowPersonaMenu(false);
      return;
    }
    if (id === persona) {
      setShowPersonaMenu(false);
      return;
    }
    setPersona(id);
    setShowPersonaMenu(false);
    router.push(personaDef(id).homeHref);
  };

  // Filtered by the signed-in role's OWN destinations, which the server sends
  // with /api/auth/me. Indexing the built-in bundle here meant a role the plant
  // created matched nothing and fell through to the default persona — a
  // full-access GM — so a supervisor saw every screen, Settings included.
  const visibleNavSections = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      title: NAV_SECTION_LABELS[group],
      items: NAV_DESTINATIONS.filter((d) => d.group === group).flatMap((d): NavItem[] => {
        const open = d.keys.find((k) => allowsNav(k));
        if (!open) return [];
        return [{
          id: d.id,
          key: open,
          keys: d.keys,
          label: d.label,
          icon: DESTINATION_ICONS[d.id] ?? "table",
          href: NAV_ROUTES[open].href ?? undefined,
        }];
      }),
    })).filter((section) => section.items.length > 0);
  }, [allowsNav]);

  const activePersona = personaDefinition;
  const navRef = useRef<HTMLDivElement>(null);
  const lastPos = typeof window !== "undefined" ? (window as any).__last_nav_pos : null;
  const [activeOffsetTop, setActiveOffsetTop] = useState(lastPos ? lastPos.top : -1000);
  const [activeOffsetLeft, setActiveOffsetLeft] = useState(lastPos ? lastPos.left : 0);
  const [activeHeight, setActiveHeight] = useState(lastPos ? lastPos.height : 0);
  const [activeWidth, setActiveWidth] = useState(lastPos ? lastPos.width : 0);
  // ponytail: highlight only glides once it has a real position to glide FROM.
  // Every navigation remounts AppShell (fresh state), so without this flag the
  // pill would tween in from its (-1000, 0) placeholder — reading as "always
  // slides in from the top-left" — on every single tab change.
  const [highlightReady, setHighlightReady] = useState(!!lastPos);
  const [exporting, setExporting] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [viewStages, setViewStages] = useState<{ id: string; label: string }[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [dateMinMax, setDateMinMax] = useState<{ min: string; max: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return sidebarCollapsedPref.get() ?? false;
  });

  // Floating Ask MOID — multi-turn task agent (enter / report / guide)
  const [showChatWidget, setShowChatWidget] = useState(false);
  const [widgetInput, setWidgetInput] = useState("");
  const [widgetMessages, setWidgetMessages] = useState<WidgetMessage[]>([
    {
      id: "welcome",
      sender: "moid",
      text:
        "I'm MOID — I can **do the work**, not just point at menus.\n" +
        "• Enter data: “assembly checked 400 accepted 390 coag 5 sd 3 bl 2”\n" +
        "• Reports: “summarize july first week report”\n" +
        "• How-to: “how do I import Excel?”\n" +
        "If something’s missing I’ll ask here, then confirm before saving.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [activeConfig, setActiveConfig] = useState<DashboardConfig | null>(null);
  const [agentSession, setAgentSession] = useState<AgentSession | null>(null);
  const agentSessionRef = useRef<AgentSession | null>(null);
  const widgetScrollRef = useRef<HTMLDivElement>(null);
  const [spotlightNav, setSpotlightNav] = useState<string | null>(null);
  const { metric: activeMetric, pulse: pulseMetric } = useActiveMetric();

  const pulseSpotlight = useCallback((navKey: string) => {
    setSpotlightNav(navKey);
    window.setTimeout(() => setSpotlightNav(null), 4500);
  }, []);

  useEffect(() => {
    agentSessionRef.current = agentSession;
    saveSession(agentSession);
  }, [agentSession]);

  useEffect(() => {
    const s = loadSession();
    if (s && (s.status === "collecting" || s.status === "confirming")) {
      setAgentSession(s);
    }
  }, []);

  useEffect(() => {
    if (!showChatWidget) return;
    const el = widgetScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [widgetMessages, widgetLoading, showChatWidget]);

  const applyScopeState = useCallback(
    (state: InvestigationState) => {
      const patch = investigationToTweaksPatch(state);
      if (patch.grain) setTweak("grain", patch.grain);
      if (patch.datePreset) setTweak("datePreset", patch.datePreset);
      if (patch.dateFrom != null) setTweak("dateFrom", patch.dateFrom);
      if (patch.dateTo != null) setTweak("dateTo", patch.dateTo);
      if (patch.stageView) setTweak("stageView", patch.stageView);
    },
    [setTweak],
  );

  const navigateWithState = useCallback(
    (href: string, state?: InvestigationState, label?: string, reason?: string) => {
      const fromHref =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/";
      emitNavBanner({
        label: label || "Ask MOID",
        reason: reason || "Ask MOID",
        fromHref,
      });
      if (state) {
        applyScopeState(state);
        goInvestigation((h) => router.push(h), href, state);
      } else {
        router.push(href);
      }
    },
    [router, applyScopeState],
  );

  const pushMoid = useCallback((partial: Omit<WidgetMessage, "id" | "sender" | "timestamp">) => {
    const msg: WidgetMessage = {
      id: `moid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: "moid",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ...partial,
    };
    setWidgetMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const runSummarizeTool = useCallback(
    async (state: InvestigationState, periodLabel: string, question: string) => {
      const evs = events ?? [];
      const scoped = buildScopedDashboardConfig(evs, state, undefined, periodLabel);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            currentConfig: scoped,
            mode: "summary",
          }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result.type === "slide" && result.slide) {
            const bullets = (result.slide.bullets as string[] | undefined)?.length
              ? "\n" + (result.slide.bullets as string[]).map((b: string) => `• ${b}`).join("\n")
              : "";
            return `**${result.slide.headline}**${bullets}`;
          }
          if (result.text) return result.text as string;
        }
      } catch {
        /* fall through */
      }
      return formatScopedSummaryText(scoped);
    },
    [events],
  );

  const executeIngest = useCallback(
    async (draft: EntryDraft) => {
      const rec = draftToShiftRecord(draft);
      const ingestionId = `moid-agent-${Date.now()}`;
      const payload = [toStageDayRecord(rec, ingestionId)];
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingestionId,
          fileName: "Ask MOID Entry",
          records: payload,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `Ingest failed (${res.status})`);
      }
      await refreshEvents();
    },
    [refreshEvents],
  );

  const executeTools = useCallback(
    async (tools: ToolIntent[], question: string) => {
      let summaryText: string | null = null;
      for (const tool of tools) {
        if (tool.type === "apply_scope") {
          applyScopeState(tool.state);
        } else if (tool.type === "navigate") {
          window.setTimeout(
            () => navigateWithState(tool.href, tool.state, tool.label, question),
            400,
          );
        } else if (tool.type === "open_reports") {
          applyScopeState(tool.state);
          window.setTimeout(
            () => navigateWithState("/reports", tool.state, "Reports", question),
            400,
          );
        } else if (tool.type === "summarize") {
          summaryText = await runSummarizeTool(tool.state, tool.periodLabel, tool.question);
        } else if (tool.type === "spotlight") {
          pulseSpotlight(tool.navKey);
        } else if (tool.type === "spotlight_metric") {
          pulseMetric();
        } else if (tool.type === "export_report") {
          // Same two actions the top-bar Export button runs — this only picks
          // between them the way that button already does.
          if (canReport(active)) setReportOpen(true);
          else await handleExport();
        } else if (tool.type === "prefill_entry") {
          writePrefill(prefillFromDraft(tool.draft));
          window.setTimeout(
            () => navigateWithState(tool.href, undefined, "Data Entry", "Ask MOID prefill"),
            200,
          );
        } else if (tool.type === "copy_link") {
          try {
            await navigator.clipboard.writeText(tool.url);
          } catch {
            /* ignore */
          }
        } else if (tool.type === "ingest") {
          await executeIngest(tool.draft);
          const done = turnAfterIngestSuccess(tool.draft);
          setAgentSession(null);
          pushMoid({
            text: done.reply.text,
            actions: done.reply.actions,
          });
          return { ingested: true as const };
        }
      }
      return { ingested: false as const, summaryText };
    },
    [
      applyScopeState,
      navigateWithState,
      runSummarizeTool,
      executeIngest,
      pushMoid,
      pulseSpotlight,
      pulseMetric,
      active,
      setReportOpen,
      handleExport,
    ],
  );

  useEffect(() => {
    const evs = events ?? [];
    if (evs.length > 0) {
      const scope = { grain: "month" as const };
      const rate = rejectionRate(evs, scope).value;
      const rejected = totalRejected(evs, scope).value;
      const checked = totalChecked(evs, scope).value;
      const fpyVal = fpy(evs, scope).value;
      const copqRes = copq(evs, scope);
      const savings = savingsOpportunity(evs, scope);

      const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—");
      const rupee = (n: number) => (Number.isFinite(n) ? `₹${(n / 100000).toFixed(2)}L` : "—");
      const num = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : "—");

      const computedConfig: DashboardConfig = {
        dashboardTitle: "Live Staging Ledger",
        executiveSummary: `Overall rejection rate is ${pct(rate)}. Visual Inspection contributes the highest rejection volume.`,
        kpis: [
          { label: "Rejection Rate", value: pct(rate), unit: "", trend: 0, context: "Whole plant – lot date" },
          { label: "Total Rejections", value: num(rejected), unit: "", trend: 0, context: "Whole plant – lot date" },
          { label: "First Pass Yield (FPY)", value: pct(fpyVal), unit: "", trend: 0, context: "Whole plant – lot date" },
          { label: "COPQ (This Month)", value: rupee(copqRes?.value ?? 0), trend: 0, context: "Whole plant – lot date" },
          { label: "Savings Opportunity", value: rupee(savings ?? 0), trend: 0, context: "Whole plant – lot date" },
        ],
        charts: [],
        insights: [
          `Total production checked is ${num(checked)} units.`,
          `Discrepancy count stands at ${num(rejected)} rejected.`,
        ],
        recommendations: [],
        alerts: [],
        sections: [],
      };

      setActiveConfig(computedConfig);
    }
  }, [events]);

  const submitWidgetQuery = async (preset?: string) => {
    const question = (preset ?? widgetInput).trim();
    if (!question || widgetLoading) return;

    setWidgetLoading(true);
    if (!preset) setWidgetInput("");

    // Confirm button reuses submit with special token
    const isConfirmClick = question === "__confirm__";
    const userVisible = isConfirmClick ? "Confirm & save" : question;

    if (!isConfirmClick) {
      setWidgetMessages((prev) => [
        ...prev,
        {
          id: `usr-${Date.now()}`,
          sender: "user",
          text: userVisible,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } else {
      setWidgetMessages((prev) => [
        ...prev,
        {
          id: `usr-${Date.now()}`,
          sender: "user",
          text: "Confirm & save",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }

    try {
      const evs = events ?? [];
      const dates = evs
        .map((e) => e.occurredOn?.start)
        .filter((d): d is string => !!d)
        .sort();
      const dataMaxIso = dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10);
      const todayIso = new Date().toISOString().slice(0, 10);
      const path =
        typeof window !== "undefined" ? window.location.pathname : undefined;

      const turnMsg = isConfirmClick ? "confirm" : question;
      const turn = runTurn(
        agentSessionRef.current,
        turnMsg,
        {
          dataMaxIso,
          todayIso,
          persona,
          canWrite,
          currentPath: path,
          eventCount: evs.length,
          activeMetric,
          canExportReport: canReport(active),
        },
        evs,
        persona,
      );

      setAgentSession(turn.session);

      // Execute tools (scope / navigate / summarize / ingest)
      let finalText = turn.reply.text;
      if (turn.reply.autoTools.length) {
        try {
          const result = await executeTools(turn.reply.autoTools, question);
          if (result.ingested) {
            return; // success message already pushed
          }
          if (result.summaryText) {
            finalText = turn.reply.text.replace(
              /_Summary loading from verified ledger figures…_/,
              result.summaryText,
            );
            if (!finalText.includes(result.summaryText)) {
              finalText = `${turn.reply.text}\n\n${result.summaryText}`;
            }
          }
        } catch (err: unknown) {
          if (turn.reply.autoTools.some((t) => t.type === "ingest")) {
            const msg = err instanceof Error ? err.message : "Ingest failed";
            const fail = turnAfterIngestFailure(msg, turn.session);
            setAgentSession(fail.session);
            pushMoid({
              text: fail.reply.text,
              actions: fail.reply.actions,
              draft: fail.reply.draft,
            });
            return;
          }
          throw err;
        }
      }

      pushMoid({
        text: finalText,
        steps: turn.reply.steps,
        actions: turn.reply.actions,
        draft: turn.reply.draft,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      pushMoid({
        text: `Error: ${message}. You can still use Data Entry, Excel Data, or Reports from the sidebar.`,
      });
    } finally {
      setWidgetLoading(false);
    }
  };

  const onAgentAction = useCallback(
    (action: AgentAction) => {
      if (action.kind === "confirm_ingest") {
        void submitWidgetQuery("__confirm__");
        return;
      }
      if (action.kind === "workflow_next") {
        void submitWidgetQuery(action.chipText || "next");
        return;
      }
      if (action.kind === "cancel" || (action.kind === "chip" && action.chipText === "cancel")) {
        void submitWidgetQuery("cancel");
        return;
      }
      if (action.kind === "chip" && action.chipText) {
        void submitWidgetQuery(action.chipText);
        return;
      }
      if (action.kind === "copy_link" && action.copyText) {
        void navigator.clipboard.writeText(action.copyText).then(
          () => pushMoid({ text: "Share link copied to clipboard." }),
          () => pushMoid({ text: `Copy this link:\n${action.copyText}` }),
        );
        return;
      }
      if (action.kind === "prefill_entry" && action.href) {
        const draft = agentSessionRef.current?.draft;
        if (draft && draft.kind === "enter_data") {
          writePrefill(prefillFromDraft(draft));
        }
        if (action.spotlightNav) pulseSpotlight(action.spotlightNav);
        navigateWithState(action.href, action.state, action.label, "Ask MOID prefill");
        return;
      }
      if (action.kind === "navigate" && action.href) {
        if (action.spotlightNav) pulseSpotlight(action.spotlightNav);
        navigateWithState(action.href, action.state, action.label);
        return;
      }
      if (action.kind === "open_reports") {
        navigateWithState(action.href || "/reports", action.state, "Reports");
      }
      if (action.kind === "spotlight") {
        // With a navKey it's a sidebar item (e.g. from a how-to answer);
        // without one it's the "Highlight it" button on an explain reply.
        if (action.spotlightNav) pulseSpotlight(action.spotlightNav);
        else pulseMetric();
      }
    },
    // submitWidgetQuery recreated each render — intentional for latest session
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigateWithState, agentSession, canWrite, persona, events, pulseSpotlight, pulseMetric, pushMoid],
  );

  // Command palette / external: open Ask MOID with a seed query
  useEffect(() => {
    const onSeed = (ev: CustomEvent<{ q?: string }>) => {
      const q = ev.detail?.q;
      if (!q) return;
      setShowChatWidget(true);
      window.setTimeout(() => void submitWidgetQuery(q), 50);
    };
    window.addEventListener("moid-ask", onSeed as EventListener);
    return () => window.removeEventListener("moid-ask", onSeed as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      sidebarCollapsedPref.set(next);
      return next;
    });
  };

  const getSuggestedGrain = (): "day" | "week" | "month" | "fy" => {
    let days = 30;
    if (t.datePreset === "this-day") {
      days = 1;
    } else if (t.datePreset === "this-week" || t.datePreset === "last-week") {
      days = 7;
    } else if (t.datePreset === "this-month" || t.datePreset === "last-month") {
      days = 30;
    } else if (t.datePreset === "last-3-months" || t.datePreset === "last-3-month" || t.datePreset === "last-90-days") {
      days = 90;
    } else if (t.datePreset === "last-12-months" || t.datePreset === "this-fy") {
      days = 365;
    } else if (t.datePreset === "all") {
      return "day";
    } else if (t.datePreset === "custom") {
      if (t.dateFrom && t.dateTo) {
        const d1 = new Date(t.dateFrom + "T00:00:00Z");
        const d2 = new Date(t.dateTo + "T00:00:00Z");
        days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
      } else {
        return "day";
      }
    }

    if (days < 90) return "day";
    if (days < 365) return "week";
    if (days <= 1095) return "month";
    return "fy";
  };

  const suggestedGrain = mounted ? getSuggestedGrain() : "day";



  // Pages that don't explicitly compute/pass a trustScore prop (most of them —
  // only Dashboard and Reports did) used to show a permanent "No data ingested
  // yet" in this sidebar regardless of the actual ledger. Fall back to
  // computing it here from the same shared events cache + global date-range
  // tweaks, so every page reflects real data. An explicitly-passed prop
  // (including `null` while a page's own fetch is still loading) still wins.
  const fallbackTrustScore = useMemo(() => {
    if (!events) return null;
    const scope = resolveScope(events, {
      grain: suggestedGrain,
      datePreset: t.datePreset,
      dateFrom: t.dateFrom,
      dateTo: t.dateTo,
      includeExcel: t.includeExcel,
      includeDirectEntry: t.includeDirectEntry,
      excelFiles: t.excelFiles,
      batchIds: t.batchIds,
      stageCategories: t.stageCategories,
    }, policy);
    return computeTrustScore(events, scope).pct;
  }, [events, suggestedGrain, t.datePreset, t.dateFrom, t.dateTo, t.includeExcel, t.includeDirectEntry, t.excelFiles, t.batchIds, policy]);
  const trustScore = trustScoreProp !== undefined ? trustScoreProp : fallbackTrustScore;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!registry) return;
    setIsConfigured(registryConfigured);
    const gates = (registry.stages || []).filter((s: any) => s.isQualityGate ?? true);
    setViewStages(gates.map((s: any) => ({ id: s.stageId, label: s.label })));
  }, [registry, registryConfigured]);


  useEffect(() => {
    if (events && events.length > 0) {
      const dates = events.map((e: any) => e.occurredOn.start).sort();
      const min = dates[0];
      const max = dates[dates.length - 1];
      setDateMinMax({ min, max });

      // Day is default and recommended when opening the dashboard
      if (t.datePreset === "all") {
        setTweak("grain", "day");
      }
    }
  }, [events, t.datePreset, setTweak]);

  const lastDateSettingsRef = useRef({ preset: t.datePreset, from: t.dateFrom, to: t.dateTo });

  useEffect(() => {
    const prev = lastDateSettingsRef.current;
    const changed = prev.preset !== t.datePreset || prev.from !== t.dateFrom || prev.to !== t.dateTo;
    if (changed) {
      lastDateSettingsRef.current = { preset: t.datePreset, from: t.dateFrom, to: t.dateTo };
      
      let days = 30;
      if (t.datePreset === "this-day") {
        days = 1;
      } else if (t.datePreset === "this-week" || t.datePreset === "last-week") {
        days = 7;
      } else if (t.datePreset === "this-month" || t.datePreset === "last-month") {
        days = 30;
      } else if (t.datePreset === "last-3-months" || t.datePreset === "last-3-month" || t.datePreset === "last-90-days") {
        days = 90;
      } else if (t.datePreset === "last-12-months" || t.datePreset === "this-fy") {
        days = 365;
      } else if (t.datePreset === "all") {
        if (dateMinMax) {
          const d1 = new Date(dateMinMax.min + "T00:00:00Z");
          const d2 = new Date(dateMinMax.max + "T00:00:00Z");
          days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
        } else {
          days = 365;
        }
      } else if (t.datePreset === "custom") {
        if (t.dateFrom && t.dateTo) {
          const d1 = new Date(t.dateFrom + "T00:00:00Z");
          const d2 = new Date(t.dateTo + "T00:00:00Z");
          days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
        } else {
          return;
        }
      }

      let suggested: "day" | "week" | "month" | "fy" = "month";
      if (days < 90) {
        suggested = "day";
      } else if (days < 365) {
        suggested = "week";
      } else if (days <= 1095) {
        suggested = "month";
      } else {
        suggested = "fy";
      }

      setTweak("grain", suggested);
    }
  }, [t.datePreset, t.dateFrom, t.dateTo, dateMinMax, setTweak]);

  // Export:
  // - Data Entry: open floating configurator (EntryExportPanel).
  // - Other screens: full ALCOA+ audit package ZIP (or Report panel when canReport).
  async function handleExport() {
    if (active === "data-entry") {
      setEntryExportOpen(true);
      return;
    }
    if (exporting) return;
    setExporting(true);
    try {
      const exportEvents = events ?? [];
      const { buildAuditPackage } = await import("@/lib/audit-package");
      const { blob, fileName } = await buildAuditPackage(exportEvents, {
        grain: "month",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
      notify(
        e instanceof Error ? e.message : "Export failed. Try again.",
        "error",
      );
    } finally {
      setExporting(false);
    }
  }

  // Load persisted sidebar section collapse state once on mount.
  useEffect(() => {
    const saved = navSectionsCollapsed.get();
    if (saved) setCollapsedSections(saved);
  }, []);

  // Calculate active navigation element coordinates relative to <nav> container
  useEffect(() => {
    if (!mounted || !navRef.current) return;
    
    const updatePosition = () => {
      const activeEl = navRef.current?.querySelector('[data-nav-active="true"]');
      const navEl = navRef.current;
      if (activeEl && navEl && activeEl instanceof HTMLElement) {
        setActiveOffsetTop(activeEl.offsetTop);
        setActiveOffsetLeft(activeEl.offsetLeft);
        setActiveHeight(activeEl.offsetHeight);
        setActiveWidth(activeEl.offsetWidth);
      } else {
        setActiveOffsetTop(-1000);
        setActiveOffsetLeft(0);
      }
    };

    // 1. Initial measurement (placed with transitions off — see highlightReady
    // effect below — so the pill appears already in place, not sliding in)
    updatePosition();

    // 2. Observe size changes (during transitions)
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updatePosition);
    });
    observer.observe(navRef.current);

    // 3. Keep updating on window resize
    window.addEventListener("resize", updatePosition);

    // 4. Run a few delayed checks during sidebar collapse transition
    const timers = [
      setTimeout(updatePosition, 50),
      setTimeout(updatePosition, 100),
      setTimeout(updatePosition, 180),
      setTimeout(updatePosition, 250),
      setTimeout(updatePosition, 350)
    ];

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      timers.forEach(clearTimeout);
    };
  }, [active, sidebarCollapsed, collapsedSections, mounted, viewStages]);

  // Enable the pill's slide transition only after its first real position has
  // painted (two rAFs = one committed frame), so it never tweens in from the
  // (-1000, 0) placeholder on mount/navigation — only glides between tabs
  // within an already-settled sidebar.
  useEffect(() => {
    if (!mounted || activeOffsetTop === -1000) return;
    let raf1 = 0, raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setHighlightReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [mounted, activeOffsetTop]);

  function toggleSection(title: string) {
    setCollapsedSections((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      navSectionsCollapsed.set(next);
      return next;
    });
  }

  // If Sources turns off the section that owns the pinned station, drop the pin
  // so the View chip doesn't show a station outside the active sections.
  useEffect(() => {
    if (!t.stageView || t.stageView === "cumulative") return;
    const cat = stageCategoryOf(t.stageView);
    const enabled = t.stageCategories?.length
      ? t.stageCategories
      : DEFAULT_STAGE_CATEGORIES;
    if (cat && !enabled.includes(cat)) {
      setTweak("stageView", "cumulative");
    }
  }, [t.stageCategories, t.stageView, setTweak]);

  const isDark = t.theme === "dark";
  const toggleTheme = () => {
    setTweak("theme", isDark ? "light" : "dark");
  };

  // Footer health is the integrity scan for the header scope — the same
  // V-004 / V-014 check Data Schema shows. Callers cannot zero it out.
  // The scan needs BOTH the ledger and the calculation policy: scoped under the
  // default policy while /api/schema is still in flight it counts differently
  // (123 vs 124), and an unloaded or failed ledger would read as 0. Until both
  // have arrived the counts are null and the footer shows a loading dash.
  const footerReady = events != null && !eventsLoading && !eventsError && !registryLoading;
  const integrityHealth = useMemo(() => {
    if (!footerReady || !events) return null;
    if (events.length === 0) return { anomalies: 0, alerts: 0 };
    const q = qualityStatus(events, resolveScope(events, t, policy));
    const critical = q.integrityIssues.filter((i) => i.severity === "critical").length;
    return { anomalies: q.integrityIssues.length, alerts: critical };
  }, [footerReady, events, t, policy]);
  const sc = {
    capa: statusCounts?.capa ?? 0,
    overdue: statusCounts?.overdue ?? 0,
    anomalies: integrityHealth?.anomalies ?? null,
    alerts: integrityHealth?.alerts ?? null,
  };
  // Screens that do not read the ledger never start that fetch. A dash there
  // means "not computed on this page", which is different from still loading.
  const integrityPending =
    eventsLoading || (events == null && routeReadsLedger(active) && !eventsError);

  // Grouped View options. "Stations" only lists stages that:
  //   1) have ledger data, AND
  //   2) belong to a section enabled in Sources (stageCategories).
  // Plant default is Assembly only — Primary / Secondary stations appear in
  // this menu only after the user turns those sections on in Sources.
  const stationCandidates = viewStages.length
    ? stagesFor(events ?? [], { stages: viewStages.map((v) => ({ stageId: v.id, label: v.label })), defects: [], sizes: [], fiscalYearStartMonth: 4 })
        .map((s) => ({ id: s.stageId, label: s.label || s.stageId }))
    : VIEW_OPTIONS.slice(1);
  const stagesWithData = new Set((events ?? []).map((e: any) => e.stageId).filter(Boolean));
  const enabledSections = new Set(
    (t.stageCategories?.length ? t.stageCategories : DEFAULT_STAGE_CATEGORIES) as string[],
  );
  const stationOptions = stationCandidates.filter((v) => {
    if (!stagesWithData.has(v.id)) return false;
    const cat = stageCategoryOf(v.id);
    // Unknown stage ids: only show when every section is selected (or none
    // mapped yet) so we don't hide custom plant stages permanently.
    if (!cat) return enabledSections.size >= STAGE_CATEGORIES.length;
    return enabledSections.has(cat);
  });
  const allViewOptions = [{ id: "cumulative", label: "Factory Overview" }, ...stationOptions];
  const currentView = allViewOptions.find((v) => v.id === t.stageView)
    ?? { id: t.stageView, label: t.stageView === "cumulative" ? "Factory Overview" : t.stageView };
  const sidebarBg = "var(--surface)";
  const sidebarBorder = "1px solid var(--border-strong)";
  const dispoTextColor = "var(--text)";
  const navTextColor = (isActive: boolean, soon?: boolean) => {
    if (isActive) return "var(--text)";
    if (soon) return "var(--text-3)";
    return "var(--text-2)";
  };
  const navIconColor = (isActive: boolean) => {
    if (isActive) return "var(--accent)";
    return "var(--text-3)";
  };
  const highlightBg = "color-mix(in srgb, var(--accent) 8%, var(--surface-2))";
  const highlightBorder = "1px solid color-mix(in srgb, var(--accent) 15%, var(--border-strong))";
  const sepBorderColor = "var(--border)";
  const sectionHeaderColor = "var(--text-3)";
  const toggleBtnBg = "var(--surface-2)";
  const toggleBtnBorder = "1px solid var(--border-strong)";
  const toggleBtnColor = "var(--text-2)";

  return (
    <div className="app-shell" style={{ 
      minHeight: "100vh", 
      background: "var(--bg)", 
      color: "var(--text)", 
      display: "grid", 
      // minmax(0, 1fr), not 1fr: a bare 1fr track refuses to shrink below its
      // content, so the topbar's pill cluster pushed the whole page wider than
      // the viewport on narrow screens.
      gridTemplateColumns: sidebarCollapsed 
        ? "calc(48px + var(--space-4)) minmax(0, 1fr)" 
        : "calc(180px + var(--space-4)) minmax(0, 1fr)", 
      gridTemplateRows: "calc(var(--header-h) + var(--space-4)) 1fr calc(var(--footer-h) + var(--space-4))", 
      gridTemplateAreas: `"side top" "side main" "side status"`,
      transition: "grid-template-columns 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
    }}>
      {/* Sidebar Navigation */}
      <aside style={{ 
        gridArea: "side", 
        background: sidebarBg, 
        border: sidebarBorder,
        borderRadius: "16px",
        margin: "var(--space-4) 0 var(--space-4) var(--space-4)",
        display: "flex", 
        flexDirection: "column", 
        position: "sticky", 
        top: "var(--space-4)", 
        height: "calc(100vh - var(--space-4) * 2)",
        zIndex: 100,
        width: sidebarCollapsed ? "48px" : "180px",
        transition: "width 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), margin 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.25s ease, border-color 0.25s ease",
        overflow: "hidden",
        boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)"
      }}>
        {/* logo and collapse toggle */}
        <div style={{ 
          padding: sidebarCollapsed ? "14px 0" : "14px 16px", 
          display: "flex", 
          flexDirection: sidebarCollapsed ? "column" : "row",
          alignItems: "center", 
          justifyContent: sidebarCollapsed ? "center" : "space-between",
          gap: sidebarCollapsed ? 12 : 8,
          borderBottom: "none",
          minHeight: 52,
          transition: "all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
          overflow: "hidden"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <img src="/logo.png" alt="MOID Logo" style={{ width: 20, height: 20, objectFit: "contain", flexShrink: 0 }} />
            {!sidebarCollapsed && (
              <span style={{ 
                fontFamily: "var(--font-sans)", 
                fontWeight: 600, 
                fontSize: 16, 
                letterSpacing: "-0.01em",
                display: "inline-flex"
              }}>
                <span style={{ color: dispoTextColor }}>Dispo</span>
                <span style={{ color: "#009FDF" }}>safe</span>
              </span>
            )}
          </div>
          <button 
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            style={{
              background: toggleBtnBg,
              border: toggleBtnBorder,
              color: toggleBtnColor,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              width: 24,
              height: 24,
              borderRadius: "50%",
              transition: "all 0.2s",
              flexShrink: 0
            }}
            onMouseOver={(e) => {
              if (e.currentTarget) {
                e.currentTarget.style.background = "var(--accent)";
                e.currentTarget.style.color = "var(--on-accent)";
                e.currentTarget.style.borderColor = "var(--accent)";
              }
            }}
            onMouseOut={(e) => {
              if (e.currentTarget) {
                e.currentTarget.style.background = toggleBtnBg;
                e.currentTarget.style.color = toggleBtnColor;
                e.currentTarget.style.borderColor = "var(--border-strong)";
              }
            }}
          >
            <Icon name={sidebarCollapsed ? "arrow-right" : "arrow-left"} size={12} />
          </button>
        </div>

        {/* nav links — grouped into collapsible sections */}
        <nav ref={navRef} style={{ position: "relative", flex: 1, overflowY: "auto", padding: sidebarCollapsed ? "12px 4px" : "12px 6px" }}>
          {/* Sliding highlight indicator */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: activeWidth,
            height: activeHeight,
            borderRadius: "30px",
            background: highlightBg,
            border: highlightBorder,
            pointerEvents: "none",
            transition: highlightReady ? "transform 0.28s cubic-bezier(0.25, 1, 0.5, 1), width 0.28s cubic-bezier(0.25, 1, 0.5, 1), height 0.28s cubic-bezier(0.25, 1, 0.5, 1)" : "none",
            transform: `translate(${activeOffsetLeft}px, ${activeOffsetTop}px)`,
            opacity: activeOffsetTop === -1000 ? 0 : 1,
            zIndex: 0
          }} />
          {visibleNavSections.map((section) => {
            const isCollapsed = !!collapsedSections[section.title];
            return (
              <div key={section.title} style={{ marginBottom: 4 }}>
                <div style={{ 
                  height: sidebarCollapsed ? 1 : 0, 
                  borderTop: sidebarCollapsed ? `1px solid ${sepBorderColor}` : "0px solid transparent", 
                  margin: sidebarCollapsed ? "8px 4px 4px" : "0",
                  opacity: sidebarCollapsed ? 1 : 0,
                  overflow: "hidden",
                  transition: "all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
                }} />
                
                <div style={{
                  opacity: sidebarCollapsed ? 0 : 1,
                  maxHeight: sidebarCollapsed ? 0 : "24px",
                  overflow: "hidden",
                  transition: "opacity 0.15s ease, max-height 0.25s ease",
                  marginBottom: sidebarCollapsed ? 0 : 4
                }}>
                  <button
                    onClick={() => toggleSection(section.title)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                      padding: "4px 12px 2px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <span className="muted" style={{
                      fontSize: 9,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: sectionHeaderColor,
                    }}>
                      {section.title}
                    </span>
                    <Icon
                      name={isCollapsed ? "chevron-down" : "chevron-up"}
                      size={10}
                      style={{ color: sectionHeaderColor }}
                    />
                  </button>
                </div>
 
                {(!isCollapsed || sidebarCollapsed) && section.items.map((n) => {
                  const isActive = n.keys.includes(active);
                  const isAnalyticsChild = n.indent;
                  const isSpotlight = !!spotlightNav && n.keys.includes(spotlightNav as NavKey);
 
                  return (
                    <button key={n.id} disabled={n.soon}
                      data-nav-active={isActive}
                      data-nav-spotlight={isSpotlight || undefined}
                      onMouseEnter={() => {
                        if (n.href) {
                          void prefetchNav(queryClient, n.key, {
                            datePreset: t.datePreset,
                            dateFrom: t.dateFrom,
                            dateTo: t.dateTo,
                          }, authUser?.username ?? "");
                        }
                      }}
                      onFocus={() => {
                        if (n.href) {
                          void prefetchNav(queryClient, n.key, {
                            datePreset: t.datePreset,
                            dateFrom: t.dateFrom,
                            dateTo: t.dateTo,
                          }, authUser?.username ?? "");
                        }
                      }}
                      onClick={() => {
                        if (n.key === "ask") {
                          setShowChatWidget(true);
                          return;
                        }
                        if (n.href) {
                          // Save current active tab coordinate to window before navigating
                          if (typeof window !== "undefined" && navRef.current) {
                            const activeEl = navRef.current.querySelector('[data-nav-active="true"]');
                            if (activeEl && activeEl instanceof HTMLElement) {
                              (window as any).__last_nav_pos = {
                                top: activeEl.offsetTop,
                                left: activeEl.offsetLeft,
                                height: activeEl.offsetHeight,
                                width: activeEl.offsetWidth
                              };
                            }
                          }
                          router.push(n.href);
                        }
                      }}
                      title={n.soon ? "Coming soon" : n.label}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: sidebarCollapsed ? "center" : "flex-start",
                        gap: sidebarCollapsed ? 0 : 8,
                        padding: sidebarCollapsed ? "8px 0" : (isAnalyticsChild ? "6px 12px 6px 20px" : "8px 12px"),
                        marginBottom: 1,
                        background: isSpotlight ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
                        borderRadius: "30px",
                        color: navTextColor(isActive, n.soon),
                        border: isSpotlight ? "1px solid var(--accent)" : "none",
                        boxShadow: isSpotlight ? "0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)" : undefined,
                        cursor: n.soon ? "default" : "pointer",
                        fontSize: isAnalyticsChild ? 11.5 : 12.5,
                        fontWeight: isActive || isSpotlight ? 600 : 500,
                        textAlign: "left",
                        transition: "padding 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), gap 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.15s ease, box-shadow 0.2s ease",
                        position: "relative",
                        zIndex: 1
                      }}>
                      <Icon name={n.icon} size={isAnalyticsChild ? 12 : 14} stroke={isActive ? 2 : 1.5} style={{ flexShrink: 0, color: navIconColor(isActive) }} />
                      <span style={{ 
                        flex: 1,
                        opacity: sidebarCollapsed ? 0 : 1,
                        maxWidth: sidebarCollapsed ? 0 : "260px",
                        marginLeft: sidebarCollapsed ? 0 : 8,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                        transition: "opacity 0.15s ease, max-width 0.2s ease, margin-left 0.2s ease"
                      }}>
                        {n.label}
                      </span>
                      <span style={{
                        opacity: sidebarCollapsed ? 0 : 1,
                        maxWidth: sidebarCollapsed ? 0 : "50px",
                        overflow: "hidden",
                        transition: "opacity 0.15s ease, max-width 0.2s ease, margin-left 0.2s ease",
                        display: "inline-flex",
                        whiteSpace: "nowrap",
                        marginLeft: sidebarCollapsed ? 0 : 8,
                        flexShrink: 0
                      }}>
                        {n.badge ? (
                          <span style={{
                            background: "var(--critical)",
                            color: "var(--text-invert)",
                            fontSize: 10,
                            borderRadius: "var(--radius-sm)",
                            padding: "2px 6px",
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)"
                          }}>{n.badge}</span>
                        ) : null}
                        {n.aiBadge ? (
                          <span style={{
                            background: "var(--accent-weak)",
                            color: "var(--accent)",
                            fontSize: 9,
                            borderRadius: 4,
                            padding: "1px 5px",
                            fontWeight: 600,
                            border: "1px solid var(--border)"
                          }}>AI</span>
                        ) : null}
                        {n.soon ? <span className="muted" style={{ fontSize: 9, marginLeft: 4 }}>soon</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>


      </aside>

      {/* Topbar: title · one Scope chip · Export, Ask, bell, Jump, user menu */}
      <header className="app-topbar" style={{
        gridArea: "top",
        background: "var(--bg)",
        margin: "0 var(--space-4)",
        padding: "var(--space-4) 0 0 0",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: "calc(var(--header-h) + var(--space-4))",
        boxSizing: "border-box",
      }}>
        <h1 style={{
          margin: 0,
          fontSize: "var(--text-lg)",
          fontWeight: 600,
          color: "var(--text)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          {destinationForKey(active)?.label ?? NAV_ROUTES[active].label}
        </h1>

        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
          {scopeControls.length > 0 && (
            <ScopeChip
              events={events}
              controls={{ view: showView, interval: showInterval, range: showRange, sources: showSources }}
              suggestedGrain={suggestedGrain}
              rangeLabel={rangeLabel}
              sourcesLabel={sourcesLabel}
              viewLabel={currentView.label}
              stationOptions={stationOptions}
              stationsEmptyLabel={
                enabledSections.size === 0
                  ? "Enable a section in Sources first"
                  : enabledSections.has("assembly") && enabledSections.size === 1
                    ? "No assembly stations with data yet. Enable Primary/Secondary in Sources."
                    : "No stations have data in the selected sections"
              }
              onOpenSources={() => setShowSourcesPanel(true)}
            />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {toolbarExtra}

          {/* Export: report builder (analysis screens) · entries JSON (data-entry) · audit ZIP (else) */}
          <button
            type="button"
            onClick={() => (canReport(active) ? setReportOpen(true) : void handleExport())}
            disabled={exporting}
            title={
              canReport(active)
                ? "Build a report from this screen"
                : active === "data-entry"
                  ? "Configure and download data entries"
                  : "Download the audit data package"
            }
            style={topbarBtn}
          >
            <Icon name="print" size={16} aria-hidden />
            {exporting ? "Exporting…" : canReport(active) ? "Export report" : active === "data-entry" ? "Export entries" : "Export"}
          </button>

          {/* Ask MOID: the single entry point (sidebar item and floating button retired) */}
          <button
            type="button"
            onClick={() => setShowChatWidget((v) => !v)}
            aria-expanded={showChatWidget}
            title="Ask MOID: guide, navigate, summarize"
            style={{ ...topbarBtn, background: showChatWidget ? "var(--surface-2)" : "var(--surface)" }}
          >
            <Icon name="comment" size={16} aria-hidden />
            Ask
          </button>

          <NotificationsPanel />

          {/* Jump / command palette */}
          <button type="button" onClick={() => setPaletteOpen(true)} title="Jump (Ctrl+K)" style={topbarBtn}>
            <Icon name="search" size={16} aria-hidden />
            Jump
            <kbd style={{
              fontSize: "var(--text-xs)",
              fontFamily: "var(--font-mono)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-xs)",
              padding: "0 4px",
              color: "var(--text-3)",
            }}>⌘K</kbd>
          </button>

          {/* User menu: role switch (when allowed), theme, sign out */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowPersonaMenu((v) => !v)}
              title="Account, role and theme"
              aria-haspopup="menu"
              aria-expanded={showPersonaMenu}
              style={{ ...topbarBtn, padding: "0 8px 0 4px", maxWidth: 220 }}
            >
              <span style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--surface-3)",
                color: "var(--text)",
                display: "grid",
                placeItems: "center",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {activePersona.initial}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activePersona.label}</span>
              <Icon name="chevron-down" size={16} style={{ color: "var(--text-3)", flexShrink: 0 }} aria-hidden />
            </button>
            {showPersonaMenu && (
              <div
                role="menu"
                aria-label={personaLocked ? "Account" : "Dashboard role"}
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 8,
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-lg)",
                  padding: 8,
                  zIndex: 220,
                  width: 260,
                }}
              >
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-3)", padding: "4px 8px 8px" }}>
                  {personaLocked ? "Signed in" : "Dashboard role"}
                </div>
                {!personaLocked &&
                  PERSONA_ORDER.map((id) => {
                    const p = PERSONAS[id];
                    const on = id === persona;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={on}
                        onClick={() => setPersonaAndStore(id)}
                        style={{ ...menuRow, background: on ? "var(--surface-2)" : "transparent" }}
                      >
                        <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                          <span style={{ fontSize: "var(--text-md)", fontWeight: on ? 600 : 500 }}>{p.label}</span>
                          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{p.title}</span>
                        </span>
                        {on && <Icon name="check" size={16} aria-hidden />}
                      </button>
                    );
                  })}
                {personaLocked && (
                  <div style={{ padding: "4px 8px 12px", fontSize: "var(--text-sm)", color: "var(--text-2)", lineHeight: 1.5 }}>
                    Role is set by your account ({activePersona.label}). It cannot be switched from the UI.
                  </div>
                )}
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
                  <button type="button" role="menuitem" onClick={toggleTheme} style={menuRow}>
                    <span style={{ fontSize: "var(--text-md)", fontWeight: 500 }}>
                      {mounted && isDark ? "Switch to light theme" : "Switch to dark theme"}
                    </span>
                    <Icon name={mounted && isDark ? "sun" : "moon"} size={16} aria-hidden />
                  </button>
                  {authEnabled && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowPersonaMenu(false);
                        void signOut();
                      }}
                      style={{ ...menuRow, color: "var(--status-bad)" }}
                    >
                      <span style={{ fontSize: "var(--text-md)", fontWeight: 500 }}>Sign out</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {reportOpen && canReport(active) && (
        <ReportPanel
          page={active}
          events={events ?? []}
          scope={reportScope}
          periodLabel={dateRange ?? "all data"}
          onClose={() => setReportOpen(false)}
        />
      )}

      {entryExportOpen && active === "data-entry" && (
        <EntryExportPanelLazy
          events={events ?? []}
          topbarFrom={t.dateFrom}
          topbarTo={t.dateTo}
          onClose={() => setEntryExportOpen(false)}
        />
      )}

      {showSourcesPanel && (
        <SourcesScopePanel
          events={events ?? []}
          onClose={() => setShowSourcesPanel(false)}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          events={events}
          persona={persona}
        />
      )}

      {/* Main Content Area.
          No `content-visibility` / `contain` here: <main> IS the scroll
          container, so skipping its subtree leaves nothing to scroll and the
          dashboard paints blank until something forces a re-render. */}
      <main style={{
        gridArea: "main",
        overflowY: "auto",
        padding: "var(--space-4)",
        background: "var(--bg)",
        position: "relative",
      }}>
        <div style={{
          width: "100%",
          maxWidth: wide ? "none" : "1400px",
          margin: wide ? 0 : "0 auto",
        }}>
        <SharedStateBanner />
        {banner && (
          <div
            role="status"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 14px", margin: "0 0 12px",
              background: "var(--accent-weak)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)",
            }}
          >
            <span>
              Opened <strong>{banner.label}</strong>{" "}
              <span style={{ color: "var(--text-3)" }}>· {banner.reason}</span>
            </span>
            <button
              type="button"
              onClick={() => { const to = banner.fromHref; setBanner(null); router.push(to); }}
              style={{
                marginLeft: "auto", border: "1px solid var(--border-strong)",
                borderRadius: 4, padding: "2px 10px", background: "transparent",
                color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: 12,
              }}
            >
              Undo
            </button>
          </div>
        )}
        {!ownTabs && <DestinationTabs active={active} />}
        {children}
        </div>
      </main>

      {/* Footer Status Bar */}
      <footer style={{ 
        gridArea: "status", 
        background: "var(--surface)", 
        border: "1px solid var(--border-strong)", 
        borderRadius: "30px",
        margin: "0 var(--space-4) var(--space-4) var(--space-4)", 
        padding: "0 16px", 
        display: "flex", 
        alignItems: "center",
        justifyContent: "space-between", 
        fontSize: 11,
        height: "var(--footer-h)",
        boxShadow: "var(--shadow-sm)"
      }}>
        <div style={{ display: "flex", gap: "clamp(12px, 1.5vw, 24px)" }}>
          <Status tone="var(--critical)" label="Active Alerts" value={sc.alerts == null ? (integrityPending ? "…" : "—") : `${sc.alerts} Critical`} />
          <Status tone="var(--positive)" label="Pending CAPA" value={`${sc.capa ?? 0} Actions`} />
          <Status tone="var(--warning)" label="Overdue Actions" value={`${sc.overdue ?? 0}`} />
          <Status tone="var(--warning)" label="Data Anomalies" value={sc.anomalies == null ? (integrityPending ? "…" : "—") : `${sc.anomalies}`} />
        </div>
      </footer>

      {/* Floating Ask MOID Chat Widget */}
      {showChatWidget && (
        <div style={{
          position: "fixed",
          top: "calc(var(--header-h) + var(--space-8))",
          right: 24,
          width: 360,
          height: 480,
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "16px",
          boxShadow: "0 10px 40px -10px rgba(0,0,0,0.3)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px",
            background: "var(--surface)",
            color: "var(--text)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Ask MOID</span>
              <span style={{ fontSize: 9.5, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Guide · Navigate · Summarize</span>
            </div>
            <button 
              onClick={() => setShowChatWidget(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                padding: 4,
                display: "grid",
                placeItems: "center"
              }}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={widgetScrollRef}
            style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: "var(--bg)"
          }}>
            {widgetMessages.map((m) => (
              <div 
                key={m.id}
                style={{
                  alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                  maxWidth: m.sender === "moid" ? "92%" : "85%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3
                }}
              >
                <div style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  background: m.sender === "user" ? "var(--surface-2)" : "var(--surface)",
                  color: "var(--text)",
                  border: m.sender === "user" ? "1px solid var(--border)" : "1px solid var(--border-strong)",
                  boxShadow: "2px 2px 0 rgba(0,0,0,0.05)"
                }}>
                  {m.text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                    part.startsWith("**") && part.endsWith("**") ? (
                      <strong key={i}>{part.slice(2, -2)}</strong>
                    ) : (
                      <span key={i}>{part}</span>
                    ),
                  )}
                  {m.steps && m.steps.length > 0 && (
                    <ol style={{ margin: "10px 0 0", paddingLeft: 18 }}>
                      {m.steps.map((s, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{s}</li>
                      ))}
                    </ol>
                  )}
                  {m.draft && m.draft.kind === "enter_data" && (
                    <div style={{
                      marginTop: 10,
                      padding: 8,
                      borderRadius: 8,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      fontSize: 11,
                    }}>
                      {m.draft.summaryRows.map((r) => (
                        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0" }}>
                          <span style={{ color: "var(--text-3)" }}>{r.label}</span>
                          <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.actions && m.actions.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                      {m.actions.map((a, i) => (
                        <button
                          key={`${a.id}-${i}`}
                          type="button"
                          onClick={() => onAgentAction(a)}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "5px 10px",
                            borderRadius: 999,
                            border: "1px solid var(--border-strong)",
                            background: a.kind === "confirm_ingest" || i === 0 ? "var(--accent)" : "var(--bg)",
                            color: a.kind === "confirm_ingest" || i === 0 ? "var(--on-accent)" : "var(--text)",
                            cursor: "pointer",
                          }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 9,
                  color: "var(--text-3)",
                  alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                  padding: "0 4px"
                }}>
                  {m.timestamp}
                </span>
              </div>
            ))}
            {widgetLoading && (
              <div style={{ alignSelf: "flex-start", fontSize: 11, color: "var(--text-3)", fontStyle: "italic", padding: "4px 8px" }}>
                MOID is working...
              </div>
            )}
            {widgetMessages.length <= 1 && !widgetLoading && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {roleStarterChips(persona).map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    onClick={() => void submitWidgetQuery(s.text)}
                    style={{
                      fontSize: 10.5,
                      padding: "5px 9px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--text-2)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div style={{
            padding: 12,
            background: "var(--surface)",
            borderTop: "1px solid var(--border-strong)",
            display: "flex",
            gap: 8,
            alignItems: "center"
          }}>
            <input 
              type="text"
              placeholder="Enter data… / Summarize report… / How do I…"
              value={widgetInput}
              onChange={(e) => setWidgetInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitWidgetQuery();
              }}
              style={{
                flex: 1,
                fontSize: 12.5,
                padding: "8px 12px",
                borderRadius: "20px",
                border: "1px solid var(--border-strong)",
                outline: "none",
                background: "var(--bg)",
                color: "var(--text)"
              }}
            />
            <button
              onClick={() => void submitWidgetQuery()}
              disabled={widgetLoading || !widgetInput.trim()}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "var(--on-accent)",
                border: "none",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                opacity: widgetInput.trim() ? 1 : 0.5,
                transition: "opacity 0.2s"
              }}
            >
              <Icon name="arrow-right" size={14} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

/** The spotlight is shell state. Ledger, schema and lineage sit above the page
 *  (those screens call the hooks before they render this shell). */
export default function AppShell(props: React.ComponentProps<typeof AppShellView>) {
  return (
    <ActiveMetricProvider>
      <AppShellView {...props} />
    </ActiveMetricProvider>
  );
}

function Status({ tone, label, value }: { tone: string; label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ 
        width: 8, 
        height: 8, 
        borderRadius: "50%", 
        background: tone 
      }} />
      <span className="muted" style={{ fontSize: 11.5 }}>{label}:</span>
      <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{value}</strong>
    </span>
  );
}
