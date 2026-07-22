"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Icon, { type IconName } from "@/components/editorial/Icon";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { useEvents } from "@/components/app/EventsContext";
import {
  rejectionRate,
  totalRejected,
  totalChecked,
  fpy,
  copq,
  savingsOpportunity,
  trustScore,
} from "@/lib/analytics";
import type { DashboardConfig } from "@/types/dashboard";
import { resolveScope } from "@/lib/analytics/scope";
import { trustScore as computeTrustScore } from "@/lib/analytics/trust";

import type { NavKey } from "@/lib/nav-keys";
export type { NavKey };
import {
  PERSONAS,
  PERSONA_ORDER,
  DEFAULT_PERSONA,
  readStoredPersona,
  writeStoredPersona,
  personaAllowsNav,
  type PersonaId,
} from "@/lib/persona";
import CommandPalette, { useCommandPaletteHotkey } from "@/components/app/CommandPalette";

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
const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", icon: "table", href: "/" },
    ],
  },
  {
    title: "Workbooks",
    items: [
      { key: "workbooks", label: "Workbooks", icon: "folder", href: "/workbooks" },
    ],
  },
  {
    title: "Data",
    items: [
      { key: "data-entry", label: "Data Entry", icon: "file", href: "/data-entry" },
      { key: "staging", label: "Staging & Review", icon: "upload", href: "/staging" },
    ],
  },
  {
    title: "Analysis",
    items: [
      { key: "stage", label: "Stage Analysis", icon: "trend-up", href: "/stage-analysis" },
      { key: "size", label: "Size Analysis", icon: "tally", href: "/size-analysis" },
      { key: "defect", label: "Defect Analysis", icon: "spark", href: "/defect-analysis" },
      { key: "spc", label: "SPC & Control Charts", icon: "trend-down", href: "/spc" },
      { key: "process-flow", label: "Process Flow", icon: "split", href: "/process-flow" },
      { key: "copq", label: "COPQ & Savings", icon: "lightning", href: "/copq" },
    ],
  },
  {
    title: "Management",
    items: [
      { key: "reports", label: "Reports", icon: "print", href: "/reports" },
      { key: "capa", label: "CAPA & Actions", icon: "check", href: "/capa" },
      { key: "ask", label: "Ask MOID", icon: "comment", href: "/chat", aiBadge: true },
      { key: "audit", label: "Audit Trail", icon: "search", href: "/audit" },
      { key: "schema", label: "Data Schema", icon: "split", href: "/schema" },
      { key: "settings", label: "Settings", icon: "external", href: "/settings" },
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

export default function AppShell({
  active, trustScore: trustScoreProp, statusCounts, dateRange, children, presetId,
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
  const { events } = useEvents();
  const { t, setTweak } = useTweaks();
  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [persona, setPersona] = useState<PersonaId>(DEFAULT_PERSONA);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useCommandPaletteHotkey(useCallback(() => setPaletteOpen(true), []));

  useEffect(() => {
    setPersona(readStoredPersona());
  }, []);

  const setPersonaAndStore = (id: PersonaId) => {
    setPersona(id);
    writeStoredPersona(id);
    setShowPersonaMenu(false);
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

  // Floating Ask MOID Chat Widget States
  const [showChatWidget, setShowChatWidget] = useState(false);
  const [widgetInput, setWidgetInput] = useState("");
  const [widgetMessages, setWidgetMessages] = useState<any[]>([
    {
      id: "welcome",
      sender: "moid",
      text: "Hello! I am MOID, your Manufacturing Operational Intelligence assistant. How can I help you analyze rejection trends or diagnostic metrics today?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [activeConfig, setActiveConfig] = useState<DashboardConfig | null>(null);



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

  const submitWidgetQuery = async () => {
    const question = widgetInput.trim();
    if (!question || widgetLoading) return;

    setWidgetLoading(true);
    setWidgetInput("");

    // Add user message
    const userMsg = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setWidgetMessages((prev) => [...prev, userMsg]);

    try {
      const currentConfig = activeConfig || {
        dashboardTitle: "Live Staging Ledger",
        executiveSummary: "Operational analytics loaded.",
        kpis: [
          { label: "Rejection Rate", value: "0.00%", unit: "", trend: 0, context: "No active data" }
        ],
        charts: [],
        insights: [],
        recommendations: [],
        alerts: [],
        sections: [],
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          dataSummary: JSON.stringify(currentConfig.insights),
          currentConfig,
        }),
      });

      if (!res.ok) {
        throw new Error("Chat request failed");
      }

      const result = await res.json();
      const text = result.type === "slide" && result.slide ? result.slide.headline : (result.text || "I was unable to construct a response.");

      const moidMsg = {
        id: `moid-${Date.now()}`,
        sender: "moid",
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setWidgetMessages((prev) => [...prev, moidMsg]);
    } catch (err: any) {
      setWidgetMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "moid",
          text: `Error: ${err.message ?? "Operational AI returned a timeout error."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setWidgetLoading(false);
    }
  };

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
      grain: suggestedGrain, datePreset: t.datePreset, dateFrom: t.dateFrom, dateTo: t.dateTo,
    });
    return computeTrustScore(events, scope).pct;
  }, [events, suggestedGrain, t.datePreset, t.dateFrom, t.dateTo]);
  const trustScore = trustScoreProp !== undefined ? trustScoreProp : fallbackTrustScore;

  useEffect(() => {
    setMounted(true);
    fetch("/api/schema")
      .then((res) => res.json())
      .then((data) => {
        setIsConfigured(data.configured !== false);
        const gates = (data.registry?.stages || []).filter((s: any) => s.isQualityGate ?? true);
        setViewStages(gates.map((s: any) => ({ id: s.stageId, label: s.label })));
      })
      .catch(() => {
        setIsConfigured(true);
      });
  }, [presetId]);


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

  // Export the audit-ready package: CSV extracts (rejection summary, stage-wise,
  // defect Pareto, size-wise, monthly trend, full ledger) + manifest.json with a
  // SHA-256 of every file, zipped (MOID-SPEC §365, ALCOA+). Pulls the live
  // (already-canonicalized) ledger; no server round-trip beyond /api/events.
  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const exportEvents = events ?? [];
      const { buildAuditPackage } = await import("@/lib/audit-package");
      const { blob, fileName } = await buildAuditPackage(exportEvents, { grain: "month" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Audit export failed:", e);
      window.print(); // fallback: print the current view to PDF
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".date-picker-container")) {
        setShowPicker(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
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

  const isDark = t.theme === "dark";
  const toggleTheme = () => {
    setTweak("theme", isDark ? "light" : "dark");
  };

  const sc = statusCounts ?? {};

  // Grouped View options — same three groups the plan specifies. "Stations"
  // only includes stages that actually have event data (derived from the
  // already-fetched `events`, mapped through viewStages for labels) so the
  // dropdown never shows an empty station. Uses the exact same visibility
  // filter as before for dataset tabs (computed in the effect above).
  const stationCandidates = viewStages.length ? viewStages : VIEW_OPTIONS.slice(1);
  const stagesWithData = new Set((events ?? []).map((e: any) => e.stageId).filter(Boolean));
  const stationOptions = stationCandidates.filter((v) => stagesWithData.has(v.id));
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
    <div style={{ 
      minHeight: "100vh", 
      background: "var(--bg)", 
      color: "var(--text)", 
      display: "grid", 
      gridTemplateColumns: sidebarCollapsed 
        ? "calc(48px + var(--space-4)) 1fr" 
        : "calc(180px + var(--space-4)) 1fr", 
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
 
                  return (
                    <button key={n.key} disabled={n.soon}
                      data-nav-active={isActive}
                      onClick={() => {
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
                        background: "transparent",
                        borderRadius: "30px",
                        color: navTextColor(isActive, n.soon),
                        border: "none",
                        cursor: n.soon ? "default" : "pointer",
                        fontSize: isAnalyticsChild ? 11.5 : 12.5,
                        fontWeight: isActive ? 700 : 500,
                        textAlign: "left",
                        transition: "padding 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), gap 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.15s ease",
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
      <header style={{ 
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
        {/* left filter selectors: Wrapped in a floating pillbox */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: 12, 
          background: "var(--surface)", 
          border: "1px solid var(--border-strong)", 
          borderRadius: "30px", 
          padding: "4px 12px", 
          boxShadow: "var(--shadow-sm)",
          height: 38
        }}>
          {/* Global View Selector */}
          <div className="view-picker-container" style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
            <span className="ui-label">
              View
            </span>
            <div
              onClick={(e) => { e.stopPropagation(); setShowViewMenu(!showViewMenu); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: "20px",
                padding: "3px 8px",
                background: "var(--surface-2)",
                cursor: "pointer",
                minWidth: 130,
              }}
            >
              <Icon name="table" size={11} style={{ color: "var(--text-3)" }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentView.label}</span>
              <Icon name="arrow-right" size={9} style={{ transform: "rotate(90deg)", color: "var(--text-3)" }} />
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
                  emptyLabel="No stations have data yet"
                  activeId={t.stageView}
                  onSelect={(id) => { setTweak("stageView", id); setShowViewMenu(false); }}
                />
                              </div>
            )}
          </div>

          <div style={{ width: 1, height: 16, background: "var(--border)" }} />

          {/* D, W, M, FY Segmented Control */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ui-label">
              Interval
            </span>
            <div style={{ 
              display: "flex",
              borderRadius: "20px", 
              padding: 2, 
              background: "var(--surface-2)",
              alignItems: "center"
            }}>
              {(["day", "week", "month", "fy"] as const).map((g) => {
                const active = t.grain === g;
                const isSuggested = suggestedGrain === g;
                return (
                  <button
                    key={g}
                    onClick={() => setTweak("grain", g)}
                    title={isSuggested ? `${g.toUpperCase()} (Suggested)` : g.toUpperCase()}
                    style={{
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 10,
                      background: active ? "var(--accent)" : "transparent",
                      color: active ? "var(--text-invert)" : "var(--text-2)",
                      transition: "all 0.12s ease",
                      textTransform: "uppercase",
                      position: "relative"
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
                        background: active ? "var(--text-invert)" : "var(--accent)",
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ width: 1, height: 16, background: "var(--border)" }} />

          {/* Interactive Date Range Selector */}
          <div className="date-picker-container" style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
            <span className="ui-label" style={{ whiteSpace: "nowrap" }}>
              Range
            </span>
            <div 
              onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker); }}
              style={{ 
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12, 
                fontWeight: 600, 
                borderRadius: "20px", 
                padding: "3px 8px", 
                background: "var(--surface-2)",
                cursor: "pointer"
              }}
            >
              <Icon name="file" size={11} style={{ color: "var(--text-3)" }} />
              <span>
                {t.datePreset === "all" && "All Data"}
                {t.datePreset === "last-90-days" && "Last 90 Days"}
                {t.datePreset === "last-12-months" && "Last 12 Months"}
                {t.datePreset === "this-fy" && "This FY"}
                {t.datePreset === "custom" && (t.dateFrom && t.dateTo ? `${t.dateFrom} to ${t.dateTo}` : "Custom Range")}
              </span>
              <Icon name="arrow-right" size={9} style={{ transform: "rotate(90deg)", color: "var(--text-3)" }} />
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
                  width: 240,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>
                  Select Range
                </div>
                {(["all", "last-90-days", "last-12-months", "this-fy", "custom"] as const).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setTweak("datePreset", preset);
                      if (preset !== "custom") {
                        setShowPicker(false);
                      }
                    }}
                    style={{
                      padding: "6px 8px",
                      fontSize: 12,
                      fontWeight: t.datePreset === preset ? 700 : 500,
                      background: t.datePreset === preset ? "var(--accent-weak)" : "transparent",
                      color: t.datePreset === preset ? "var(--accent)" : "var(--text)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      textAlign: "left",
                      cursor: "pointer",
                      width: "100%"
                    }}
                  >
                    {preset === "all" && "All Data"}
                    {preset === "last-90-days" && "Last 90 Days"}
                    {preset === "last-12-months" && "Last 12 Months"}
                    {preset === "this-fy" && "This FY"}
                    {preset === "custom" && "Custom Range..."}
                  </button>
                ))}

                {t.datePreset === "custom" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--text-3)", width: 30 }}>From</span>
                      <input 
                        type="date"
                        value={t.dateFrom}
                        onChange={(e) => setTweak("dateFrom", e.target.value)}
                        style={{
                          flex: 1,
                          fontSize: 11,
                          padding: "2px 4px",
                          border: "1px solid var(--border-strong)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--surface)",
                          color: "var(--text)"
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--text-3)", width: 30 }}>To</span>
                      <input 
                        type="date"
                        value={t.dateTo}
                        onChange={(e) => setTweak("dateTo", e.target.value)}
                        style={{
                          flex: 1,
                          fontSize: 11,
                          padding: "2px 4px",
                          border: "1px solid var(--border-strong)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--surface)",
                          color: "var(--text)"
                        }}
                      />
                    </div>
                    <button
                      onClick={() => setShowPicker(false)}
                      style={{
                        marginTop: 4,
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        background: "var(--accent)",
                        color: "var(--text-invert)",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer"
                      }}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
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

          {/* Persona proxy (interim until real auth) */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowPersonaMenu((v) => !v)}
              title="Switch role view (interim proxy)"
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
                border: "1px solid var(--border-strong)"
              }}>
                {personaDef.initial}
              </div>
              <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
                <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1 }}>{personaDef.label}</span>
                <span className="muted" style={{ fontSize: 9, lineHeight: 1.1 }}>{personaDef.title}</span>
              </div>
            </button>
            {showPersonaMenu && (
              <div
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
                  width: 220,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-3)", padding: "4px 8px 6px" }}>
                  Role view (proxy)
                </div>
                {PERSONA_ORDER.map((id) => {
                  const p = PERSONAS[id];
                  const on = id === persona;
                  return (
                    <button
                      key={id}
                      type="button"
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
              </div>
            )}
          </div>

          {/* Export Action: Pillbox Card Button */}
          <button 
            onClick={handleExport} 
            disabled={exporting} 
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
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </header>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        events={events}
        persona={persona}
      />

      {/* Main Content Area */}
      <main style={{ 
        gridArea: "main", 
        overflowY: "auto", 
        padding: "var(--space-4)",
        background: "var(--bg)",
        position: "relative"
      }}>
        <div style={{
          width: "100%",
          maxWidth: "1400px",
          margin: "0 auto"
        }}>
        {isConfigured === false && active !== "staging" && active !== "settings" && active !== "clear-data" ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "70vh",
            width: "100%"
          }}>
            <div style={{
              background: "var(--paper)",
              border: "2px solid var(--ink)",
              borderRadius: "var(--radius-lg)",
              padding: "40px",
              boxShadow: "8px 8px 0px var(--ink)",
              maxWidth: "600px",
              width: "100%",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20
            }}>
              <div style={{
                background: "color-mix(in srgb, var(--status-bad) 12%, transparent)",
                color: "var(--status-bad)",
                border: "2px solid var(--ink)",
                borderRadius: "50%",
                width: 64,
                height: 64,
                display: "grid",
                placeItems: "center",
                boxShadow: "3px 3px 0 var(--ink)"
              }}>
                <Icon name="alert" size={32} />
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: 0, color: "var(--ink)", fontWeight: 800 }}>
                Cockpit Locked
              </h2>
              <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: "1.6", margin: 0 }}>
                The manufacturing cockpit is currently unconfigured. No plant-wide schema, stages, or defect types have been established in the database ledger.
              </p>
              <div style={{
                background: "var(--surface-2)",
                border: "1.5px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                padding: "14px 18px",
                fontSize: 13,
                color: "var(--text-2)",
                textAlign: "left",
                fontFamily: "var(--font-sans)",
                margin: "10px 0",
                borderStyle: "dashed"
              }}>
                <strong>Administrative Action Required:</strong> Ingest a pristine master workbook on the Staging page to extract your manufacturing line's stages and defects and unlock all analytics.
              </div>
              <button 
                onClick={() => router.push("/staging")}
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "2px solid var(--ink)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 28px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "4px 4px 0 var(--ink)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8
                }}
              >
                <Icon name="upload" size={16} /> Establish Master Schema Configuration
              </button>
            </div>
          </div>
        ) : (
          children
        )}
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
              <span style={{ fontSize: 9.5, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Operational Intelligence</span>
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
          <div style={{
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
                  maxWidth: "85%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3
                }}
              >
                <div style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  fontSize: 12.5,
                  lineHeight: 1.4,
                  background: m.sender === "user" ? "var(--surface-2)" : "var(--surface)",
                  color: "var(--text)",
                  border: m.sender === "user" ? "1px solid var(--border)" : "1px solid var(--border-strong)",
                  boxShadow: "2px 2px 0 rgba(0,0,0,0.05)"
                }}>
                  {m.text}
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
                MOID is thinking...
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
              placeholder="Ask anything about ledger..."
              value={widgetInput}
              onChange={(e) => setWidgetInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitWidgetQuery();
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
              onClick={submitWidgetQuery}
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
        title="Ask MOID AI Assistant"
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
