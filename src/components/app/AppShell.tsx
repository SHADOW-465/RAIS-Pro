"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Icon, { type IconName } from "@/components/editorial/Icon";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { useEvents } from "@/components/app/EventsContext";
import { useConfirm } from "@/components/ui/ConfirmContext";
import DatePicker from "@/components/ui/DatePicker";
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
import { resolveScope, DEFAULT_STAGE_CATEGORIES, STAGE_CATEGORY } from "@/lib/analytics/scope";
import { trustScore as computeTrustScore } from "@/lib/analytics/trust";

import { NAV_ROUTES, type NavKey } from "@/lib/nav-keys";
export type { NavKey };
import {
  PERSONAS,
  PERSONA_ORDER,
  personaAllowsNav,
  type PersonaId,
} from "@/lib/persona";
import { useCommandPaletteHotkey } from "@/components/app/CommandPaletteHotkey";
import { canReport } from "@/lib/report/blocks";
import { subscribeNavBanner, emitNavBanner, type NavBanner } from "@/lib/analytics/nav-banner";
import { usePersona } from "@/components/app/PersonaContext";
import { useActiveMetric } from "@/components/app/ActiveMetricContext";

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
  key: NavKey;
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

// Operator path first: Dashboard → daily entry → one-time Excel import.
// Analysis pages are pure views of the same event ledger.
/** Icons and grouping are chrome and live here; labels and hrefs come from the
 *  one route table so the sidebar cannot drift from Jump and the guide. */
const nav = (key: NavKey, icon: NavItem["icon"], extra: Partial<NavItem> = {}): NavItem => ({
  key,
  label: NAV_ROUTES[key].label,
  href: NAV_ROUTES[key].href ?? undefined,
  icon,
  ...extra,
});

const NAV_SECTIONS: NavSection[] = [
  { title: "Overview", items: [nav("dashboard", "table")] },
  {
    title: "Your data",
    items: [
      nav("data-entry", "file"),
      // One destination, two tabs (Import - Files). They used to be two sidebar
      // entries that linked to each other in their own body copy.
      nav("workbooks", "folder"),
    ],
  },
  {
    title: "Analysis",
    items: [
      nav("stage", "trend-up"),
      nav("size", "tally"),
      nav("defect", "spark"),
      nav("spc", "trend-down"),
      nav("process-flow", "split"),
      nav("copq", "lightning"),
    ],
  },
  {
    title: "Management",
    items: [
      nav("reports", "print"),
      nav("capa", "check"),
      // No href: Ask MOID is the side panel, not a route.
      nav("ask", "comment", { aiBadge: true }),
      nav("audit", "search"),
      nav("schema", "split"),
      nav("settings", "external"),
    ],
  },
];

const NAV_COLLAPSE_KEY = "moid_nav_collapsed";

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
  spc: ["view", "interval", "range", "sources"],
  "process-flow": ["view", "interval", "range", "sources"],
  copq: ["view", "interval", "range", "sources"],
  "data-entry": ["interval"],
  reports: ["range", "sources"],
  capa: ["range", "sources"],
  audit: ["range", "sources"],
};

export default function AppShell({
  active, trustScore: trustScoreProp, statusCounts, dateRange, children, presetId: _presetId,
}: {
  active: NavKey;
  trustScore?: number | null;
  statusCounts?: { alerts?: number; capa?: number; overdue?: number; anomalies?: number };
  dateRange?: string;
  children: React.ReactNode;
  /** Which Data Entry preset's registry to load for stage-gate nav. Omit for the default preset. */
  presetId?: string | null;
}) {
  const router = useRouter();
  const { events, refreshEvents } = useEvents();
  const { t, setTweak } = useTweaks();
  const { registry, policy, configured: registryConfigured } = useRegistry();
  const {
    persona,
    setPersona,
    canConfigure,
    canWrite,
    authEnabled,
    authUser,
    personaLocked,
    signOut,
  } = usePersona();
  const { notify } = useConfirm();
  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  /** Draft From/To while the Custom range form is open. Live tweaks (and KPIs)
   *  stay on the previous preset until Apply with both dates. */
  const [customDraft, setCustomDraft] = useState<{ from: string; to: string } | null>(null);
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
    router.push(PERSONAS[id].homeHref);
  };

  const visibleNavSections = useMemo(() => {
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((n) => personaAllowsNav(persona, n.key)),
    })).filter((section) => section.items.length > 0);
  }, [persona]);

  const personaDef = PERSONAS[persona];
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
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [viewStages, setViewStages] = useState<{ id: string; label: string }[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [dateMinMax, setDateMinMax] = useState<{ min: string; max: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("rais_sidebar_collapsed") === "true";
    }
    return false;
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

      const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
      const rupee = (n: number) => `₹${(n / 100000).toFixed(2)}L`;
      const num = (n: number) => n.toLocaleString();

      const computedConfig: DashboardConfig = {
        dashboardTitle: "Live Staging Ledger",
        executiveSummary: `Overall rejection rate is ${pct(rate)}. Visual Inspection contributes the highest rejection volume.`,
        kpis: [
          { label: "Rejection Rate", value: pct(rate), unit: "", trend: 0, context: "YTD average" },
          { label: "Total Rejections", value: num(rejected), unit: "", trend: 0, context: "YTD total" },
          { label: "First Pass Yield (FPY)", value: pct(fpyVal), unit: "", trend: 0, context: "YTD FPY" },
          { label: "COPQ (This Month)", value: rupee(copqRes?.value ?? 0), trend: 0, context: "Month total" },
          { label: "Savings Opportunity", value: rupee(savings ?? 0), trend: 0, context: "Annual Potential" },
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
      try {
        window.localStorage.setItem("rais_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const getSuggestedGrain = (): "day" | "week" | "month" | "fy" => {
    let days = 30;
    if (t.datePreset === "last-90-days") {
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
        return "month";
      }
    }

    if (days < 90) return "day";
    if (days < 365) return "week";
    if (days <= 1095) return "month";
    return "fy";
  };

  const suggestedGrain = mounted ? getSuggestedGrain() : "month";



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

      // Auto-suggest grain on initial load if preset is all
      if (t.datePreset === "all") {
        const d1 = new Date(min + "T00:00:00Z");
        const d2 = new Date(max + "T00:00:00Z");
        const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
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
    }
  }, [events, t.datePreset, setTweak]);

  const lastDateSettingsRef = useRef({ preset: t.datePreset, from: t.dateFrom, to: t.dateTo });

  useEffect(() => {
    const prev = lastDateSettingsRef.current;
    const changed = prev.preset !== t.datePreset || prev.from !== t.dateFrom || prev.to !== t.dateTo;
    if (changed) {
      lastDateSettingsRef.current = { preset: t.datePreset, from: t.dateFrom, to: t.dateTo };
      
      let days = 30;
      if (t.datePreset === "last-90-days") {
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

  useEffect(() => {
    if (!showPicker) {
      setCustomDraft(null);
      return;
    }
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".date-picker-container")) {
        setShowPicker(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPicker(false);
    };
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [showPicker]);

  // Load persisted sidebar section collapse state once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NAV_COLLAPSE_KEY);
      if (raw) setCollapsedSections(JSON.parse(raw));
    } catch {
      // ignore malformed/unavailable localStorage
    }
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
      try {
        window.localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        // ignore write failures (private browsing, quota, etc.)
      }
      return next;
    });
  }

  // Close the View dropdown on outside click / Escape — same pattern as the
  // Date Range picker above.
  useEffect(() => {
    if (!showViewMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".view-picker-container")) {
        setShowViewMenu(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowViewMenu(false);
    };
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [showViewMenu]);

  // If Sources turns off the section that owns the pinned station, drop the pin
  // so the View chip doesn't show a station outside the active sections.
  useEffect(() => {
    if (!t.stageView || t.stageView === "cumulative") return;
    const cat = STAGE_CATEGORY[t.stageView];
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

  const sc = statusCounts ?? {};

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
    const cat = STAGE_CATEGORY[v.id];
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
                fontWeight: 800, 
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
                e.currentTarget.style.color = "#FFFFFF";
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
                      fontWeight: 700,
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
                  const isActive = n.key === active;
                  const isAnalyticsChild = n.indent;
                  const isSpotlight = spotlightNav === n.key;
 
                  return (
                    <button key={n.key} disabled={n.soon}
                      data-nav-active={isActive}
                      data-nav-spotlight={isSpotlight || undefined}
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
                        fontWeight: isActive || isSpotlight ? 700 : 500,
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
                            color: "#fff",
                            fontSize: 10,
                            borderRadius: "var(--radius-sm)",
                            padding: "2px 6px",
                            fontWeight: 700,
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
                            fontWeight: 800,
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

      {/* Topbar / Masthead */}
      <header className="app-topbar" style={{ 
        gridArea: "top", 
        background: "var(--bg)", 
        margin: "var(--space-4) var(--space-4) 0 var(--space-4)", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        position: "sticky", 
        top: "var(--space-4)", 
        zIndex: 50,
        height: "var(--header-h)"
      }}>
        {/* Scope selectors — only the ones this screen actually reads. */}
        <div style={{ 
          display: scopeControls.length > 0 ? "flex" : "none", 
          alignItems: "center", 
          gap: 8, 
          background: "var(--surface)", 
          border: "1px solid var(--border-strong)", 
          borderRadius: "30px", 
          padding: "4px 10px", 
          boxShadow: "var(--shadow-sm)",
          height: 38
        }}>
          {showView && (
          <div className="view-picker-container" style={{ display: "flex", alignItems: "center", position: "relative" }}>
            <div
              onClick={(e) => {
                e.stopPropagation();
                setShowViewMenu(!showViewMenu);
                setShowPicker(false);
                setShowSourcesPanel(false);
              }}
              title="View"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: "20px",
                padding: "3px 8px",
                background: showViewMenu ? "var(--accent-weak)" : "var(--surface-2)",
                color: showViewMenu ? "var(--accent)" : "var(--text)",
                cursor: "pointer",
                maxWidth: 160,
              }}
            >
              <Icon name="table" size={11} style={{ color: "var(--text-3)", flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentView.label}</span>
              <Icon name="arrow-right" size={9} style={{ transform: "rotate(90deg)", color: "var(--text-3)", flexShrink: 0 }} />
            </div>

            {showViewMenu && (
              <div
                className="dropdown-panel"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 6,
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-lg)",
                  padding: 8,
                  zIndex: 200,
                  width: 260,
                  maxHeight: 420,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <ViewMenuGroup
                  label="Factory Overview"
                  options={[{ id: "cumulative", label: "Factory Overview" }]}
                  activeId={t.stageView}
                  onSelect={(id) => { setTweak("stageView", id); setShowViewMenu(false); }}
                />
                <ViewMenuGroup
                  label="Stations"
                  options={stationOptions}
                  emptyLabel={
                    enabledSections.size === 0
                      ? "Enable a section in Sources first"
                      : enabledSections.has("assembly") && enabledSections.size === 1
                        ? "No assembly stations with data yet — enable Primary/Secondary in Sources for those stations"
                        : "No stations have data in the selected sections"
                  }
                  activeId={t.stageView}
                  onSelect={(id) => { setTweak("stageView", id); setShowViewMenu(false); }}
                />
              </div>
            )}
          </div>
          )}

          {showView && (showInterval || showRange) && (
            <div style={{ width: 1, height: 16, background: "var(--border)" }} />
          )}

          {/* Period: grain (D/W/M/FY) + date window as one control */}
          {(showInterval || showRange) && (
          <div
            className="date-picker-container"
            style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}
          >
            {showInterval && (
            <div style={{
              display: "flex",
              borderRadius: "20px",
              padding: 2,
              background: "var(--surface-2)",
              alignItems: "center",
            }}>
              {(["day", "week", "month", "fy"] as const).map((g) => {
                const activeGrain = t.grain === g;
                const isSuggested = suggestedGrain === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setTweak("grain", g)}
                    title={isSuggested ? `${g.toUpperCase()} (Suggested)` : g.toUpperCase()}
                    style={{
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 10,
                      background: activeGrain ? "var(--accent)" : "transparent",
                      color: activeGrain ? "var(--text-invert)" : "var(--text-2)",
                      transition: "all 0.12s ease",
                      textTransform: "uppercase",
                      position: "relative",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {g === "fy" ? "FY" : g[0]}
                    {isSuggested && (
                      <span style={{
                        position: "absolute",
                        top: 1,
                        right: 1,
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        background: activeGrain ? "var(--text-invert)" : "var(--accent)",
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
            )}

            {showRange && (
            <>
            <div
              onClick={(e) => {
                e.stopPropagation();
                const next = !showPicker;
                setShowPicker(next);
                if (next && t.datePreset === "custom") {
                  setCustomDraft({ from: t.dateFrom, to: t.dateTo });
                }
                setShowViewMenu(false);
                setShowSourcesPanel(false);
              }}
              title="Date range"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: "20px",
                padding: "3px 8px",
                background: showPicker ? "var(--accent-weak)" : "var(--surface-2)",
                color: showPicker ? "var(--accent)" : "var(--text)",
                cursor: "pointer",
                maxWidth: 180,
              }}
            >
              <Icon name="file" size={11} style={{ color: "var(--text-3)", flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rangeLabel}
              </span>
              <Icon name="arrow-right" size={9} style={{ transform: "rotate(90deg)", color: "var(--text-3)", flexShrink: 0 }} />
            </div>

            {showPicker && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 6,
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-lg)",
                  padding: 12,
                  zIndex: 200,
                  width: 260,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)" }}>
                  Date range
                </div>
                {(["all", "last-90-days", "last-12-months", "this-fy", "custom"] as const).map((preset) => {
                  const customActive = customDraft !== null || t.datePreset === "custom";
                  const selected =
                    preset === "custom"
                      ? customActive
                      : customDraft === null && t.datePreset === preset;
                  return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      if (preset === "custom") {
                        setCustomDraft((prev) =>
                          prev ?? {
                            from: t.datePreset === "custom" ? t.dateFrom : "",
                            to: t.datePreset === "custom" ? t.dateTo : "",
                          },
                        );
                        return;
                      }
                      setCustomDraft(null);
                      setTweak("datePreset", preset);
                      setShowPicker(false);
                    }}
                    style={{
                      padding: "6px 8px",
                      fontSize: 12,
                      fontWeight: selected ? 700 : 500,
                      background: selected ? "var(--accent-weak)" : "transparent",
                      color: selected ? "var(--accent)" : "var(--text)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      textAlign: "left",
                      cursor: "pointer",
                      width: "100%",
                      fontFamily: "inherit",
                    }}
                  >
                    {preset === "all" && "All data"}
                    {preset === "last-90-days" && "Last 90 days"}
                    {preset === "last-12-months" && "Last 12 months"}
                    {preset === "this-fy" && "This FY"}
                    {preset === "custom" && "Custom range…"}
                  </button>
                  );
                })}

                {customDraft !== null && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--text-3)", width: 30 }}>From</span>
                      <DatePicker
                        value={customDraft.from}
                        onChange={(d) => setCustomDraft((prev) => ({ from: d, to: prev?.to ?? "" }))}
                        ariaLabel="Topbar from date"
                        size="sm"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--text-3)", width: 30 }}>To</span>
                      <DatePicker
                        value={customDraft.to}
                        onChange={(d) => setCustomDraft((prev) => ({ from: prev?.from ?? "", to: d }))}
                        ariaLabel="Topbar to date"
                        size="sm"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!customDraft.from || !customDraft.to}
                      onClick={() => {
                        if (!customDraft.from || !customDraft.to) return;
                        setTweak("dateFrom", customDraft.from);
                        setTweak("dateTo", customDraft.to);
                        setTweak("datePreset", "custom");
                        setCustomDraft(null);
                        setShowPicker(false);
                      }}
                      style={{
                        marginTop: 4,
                        padding: "6px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        background: "var(--accent)",
                        color: "var(--text-invert)",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        cursor: customDraft.from && customDraft.to ? "pointer" : "default",
                        opacity: customDraft.from && customDraft.to ? 1 : 0.45,
                        fontFamily: "inherit",
                      }}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            )}
            </>
            )}
          </div>
          )}

          {(showRange || showInterval || showView) && showSources && (
            <div style={{ width: 1, height: 16, background: "var(--border)" }} />
          )}

          {showSources && (
          <div
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            aria-expanded={showSourcesPanel}
            onClick={(e) => {
              e.stopPropagation();
              setShowSourcesPanel(true);
              setShowPicker(false);
              setShowViewMenu(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setShowSourcesPanel(true);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              borderRadius: "20px",
              padding: "3px 10px",
              background:
                showSourcesPanel || sourcesScoped
                  ? "var(--accent-weak)"
                  : "var(--surface-2)",
              color:
                showSourcesPanel || sourcesScoped
                  ? "var(--accent)"
                  : "var(--text)",
              cursor: "pointer",
              maxWidth: 180,
            }}
            title="Sources, sections, batches & Excel files"
          >
            <Icon name="split" size={11} style={{ color: "var(--text-3)", flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sourcesLabel}
            </span>
            <Icon name="arrow-right" size={9} style={{ transform: "rotate(90deg)", color: "var(--text-3)", flexShrink: 0 }} />
          </div>
          )}
        </div>

        {/* right profile / actions: styled cleanly in pillbox cards */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Jump / command palette */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title="Jump (Ctrl+K)"
            style={{
              height: 32,
              borderRadius: "30px",
              border: "1px solid var(--border-strong)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "0 12px",
              background: "var(--surface)",
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--text-2)",
              fontFamily: "inherit",
            }}
          >
            <Icon name="search" size={13} />
            Jump
            <kbd style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "1px 4px",
              color: "var(--text-3)",
            }}>⌘K</kbd>
          </button>

          {/* Theme Toggle */}
          <button 
            onClick={toggleTheme}
            style={{ 
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "1px solid var(--border-strong)",
              display: "grid",
              placeItems: "center",
              background: "var(--surface)",
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
              transition: "transform 0.2s"
            }}>
            <Icon name={mounted && isDark ? "sun" : "moon"} size={14} />
          </button>

          {/* Role selector — sidebar visibility only; no auth / data impact */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowPersonaMenu((v) => !v)}
              title="Switch dashboard role view"
              aria-haspopup="listbox"
              aria-expanded={showPersonaMenu}
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 8, 
                background: "var(--surface)", 
                border: "1px solid var(--border-strong)", 
                borderRadius: "30px", 
                padding: "2px 10px 2px 2px", 
                boxShadow: "var(--shadow-sm)", 
                height: 32,
                cursor: "pointer",
                fontFamily: "inherit",
                maxWidth: 220,
              }}
            >
              <div style={{ 
                width: 26, 
                height: 26, 
                borderRadius: "50%", 
                background: "var(--surface-3)", 
                color: "var(--text)", 
                display: "grid", 
                placeItems: "center",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 11,
                border: "1px solid var(--border-strong)",
                flexShrink: 0,
              }}>
                {personaDef.initial}
              </div>
              <div style={{ display: "flex", flexDirection: "column", textAlign: "left", minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {personaDef.label}
                </span>
                <span className="muted" style={{ fontSize: 9, lineHeight: 1.1 }}>
                  {authEnabled ? "Signed in" : personaDef.title}
                </span>
              </div>
            </button>
            {showPersonaMenu && (
              <div
                role="listbox"
                aria-label={personaLocked ? "Account" : "Dashboard role"}
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 6,
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-lg)",
                  padding: 6,
                  zIndex: 220,
                  width: 240,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-3)", padding: "4px 8px 6px" }}>
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
                        role="option"
                        aria-selected={on}
                        onClick={() => setPersonaAndStore(id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          borderRadius: "var(--radius-sm)",
                          padding: "8px 10px",
                          cursor: "pointer",
                          background: on ? "var(--accent-weak)" : "transparent",
                          fontFamily: "inherit",
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                        }}
                      >
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{p.label}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{p.title}</span>
                      </button>
                    );
                  })}
                {personaLocked && (
                  <div style={{ padding: "6px 10px 10px", fontSize: 12, color: "var(--text-2)", lineHeight: 1.4 }}>
                    Role is set by your account ({personaDef.label}). It cannot be switched from the UI.
                  </div>
                )}
                {authEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPersonaMenu(false);
                      void signOut();
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      borderTop: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px",
                      cursor: "pointer",
                      background: "transparent",
                      fontFamily: "inherit",
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: "var(--status-bad, #b91c1c)",
                      marginTop: 4,
                    }}
                  >
                    Sign out
                  </button>
                )}
              </div>
            )}
          </div>

          <NotificationsPanel />

          {/* Export: report builder (analysis screens) · entries JSON (data-entry) · audit ZIP (else) */}
          <button 
            onClick={() => (canReport(active) ? setReportOpen(true) : void handleExport())} 
            disabled={exporting} 
            title={
              canReport(active)
                ? "Build a report from this screen"
                : active === "data-entry"
                  ? "Configure and download data entries"
                  : "Download the audit data package"
            }
            style={{
              background: "var(--surface)",
              color: "var(--text)", 
              border: "1px solid var(--border-strong)", 
              borderRadius: "30px", 
              padding: "6px 14px", 
              fontSize: 11.5, 
              fontWeight: 700, 
              cursor: "pointer", 
              display: "inline-flex", 
              gap: 6, 
              alignItems: "center",
              boxShadow: "var(--shadow-sm)",
              transition: "all 0.2s ease",
              minHeight: 32
            }}
            onMouseOver={(e) => {
              if (!exporting) {
                e.currentTarget.style.background = "var(--accent)";
                e.currentTarget.style.color = "var(--text-invert)";
                e.currentTarget.style.borderColor = "var(--accent)";
              }
            }}
            onMouseOut={(e) => {
              if (!exporting) {
                e.currentTarget.style.background = "var(--surface)";
                e.currentTarget.style.color = "var(--text)";
                e.currentTarget.style.borderColor = "var(--border-strong)";
              }
            }}
          >
            <Icon name="print" size={11} /> 
            {exporting
              ? "Exporting…"
              : canReport(active)
                ? "Export report"
                : active === "data-entry"
                  ? "Export entries"
                  : "Export"}
          </button>
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
          maxWidth: "1400px",
          margin: "0 auto"
        }}>
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
          <Status tone="var(--critical)" label="Active Alerts" value={`${sc.alerts ?? 0} Critical`} />
          <Status tone="var(--positive)" label="Pending CAPA" value={`${sc.capa ?? 0} Actions`} />
          <Status tone="var(--warning)" label="Overdue Actions" value={`${sc.overdue ?? 0}`} />
          <Status tone="var(--warning)" label="Data Anomalies" value={`${sc.anomalies ?? 0}`} />
        </div>
      </footer>

      {/* Floating Ask MOID Chat Widget */}
      {showChatWidget && (
        <div style={{
          position: "fixed",
          bottom: 84,
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
            background: "var(--accent)",
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800 }}>Ask MOID</span>
              <span style={{ fontSize: 9.5, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Guide · Navigate · Summarize</span>
            </div>
            <button 
              onClick={() => setShowChatWidget(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
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
                            color: a.kind === "confirm_ingest" || i === 0 ? "#FFFFFF" : "var(--text)",
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
                color: "#FFFFFF",
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

      {/* Floating M Toggle Button */}
      <button 
        onClick={() => setShowChatWidget(!showChatWidget)}
        title="Ask MOID — guide, navigate, summarize"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--accent)",
          color: "#FFFFFF",
          border: "none",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          zIndex: 1000,
          fontWeight: 800,
          fontSize: 18,
          fontFamily: "var(--font-sans)",
          transition: "transform 0.2s"
        }}
        onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
        onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      >
        M
      </button>
    </div>
  );
}

/** One labeled group of options inside the View dropdown panel. Renders
 *  nothing (not even the header) when there are no options and no emptyLabel
 *  was given, so the Factory Overview group (always exactly one option)
 *  reads cleanly. */
function ViewMenuGroup({ label, options, activeId, onSelect, emptyLabel }: {
  label: string;
  options: { id: string; label: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  emptyLabel?: string;
}) {
  if (options.length === 0 && !emptyLabel) return null;
  return (
    <div>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--text-3)",
        padding: "6px 8px 4px",
      }}>
        {label}
      </div>
      {options.length === 0 ? (
        <div className="muted" style={{ fontSize: 11.5, padding: "4px 8px 8px" }}>{emptyLabel}</div>
      ) : (
        options.map((v) => {
          const active = activeId === v.id;
          return (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                fontSize: 12.5,
                fontWeight: active ? 700 : 500,
                background: active ? "var(--accent-weak)" : "transparent",
                color: active ? "var(--accent)" : "var(--text)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              {v.label}
            </button>
          );
        })
      )}
    </div>
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
