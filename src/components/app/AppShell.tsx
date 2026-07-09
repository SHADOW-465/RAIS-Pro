"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo, useRef } from "react";
import Icon, { type IconName } from "@/components/editorial/Icon";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { useEvents } from "@/components/app/EventsContext";
import { resolveScope } from "@/lib/analytics/scope";
import { trustScore as computeTrustScore } from "@/lib/analytics/trust";

export type NavKey =
  | "dashboard" | "workbooks" | "data-entry" | "staging" | "stage" | "size" | "defect"
  | "spc" | "process-flow" | "copq" | "reports" | "capa" | "ask" | "audit" | "schema" | "settings" | "clear-data";

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
      { key: "staging", label: "Staging & Review", icon: "upload", href: "/staging", badge: 12 },
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
      { key: "ask", label: "Ask RAIS", icon: "comment", href: "/chat", aiBadge: true },
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
  const { t, setTweak } = useTweaks();
  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
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
  const [datasetTabs, setDatasetTabs] = useState<{ id: string; label: string }[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [dateMinMax, setDateMinMax] = useState<{ min: string; max: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("rais_sidebar_collapsed") === "true";
    }
    return false;
  });

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

  const { events } = useEvents();

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
    fetch(presetId ? `/api/schema?presetId=${encodeURIComponent(presetId)}` : "/api/schema")
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
    fetch("/api/datasets")
      .then((res) => res.json())
      .then((data) => {
        const list = (data.datasets ?? []) as { id: string; title: string; recognizedStageId?: string | null }[];
        // A recognized dataset duplicates a legacy stage tab only once that
        // stage actually HAS event data (i.e. the dataset was published, or the
        // stage was fed by the classic pipeline). Until then the dataset tab is
        // the ONLY place its data — and its Publish action — can be seen, so it
        // must stay visible; it self-hides after publishing lands events.
        const legacyIds = new Set(
          (viewStages.length ? viewStages : VIEW_OPTIONS.slice(1)).map((v) => v.id),
        );
        const stagesWithData = new Set((events ?? []).map((e: any) => e.stageId).filter(Boolean));
        // Prefix with "dataset:" so these ids can never collide with a legacy
        // stageId (which are short kebab-case strings like "visual"), and so
        // page.tsx can cheaply tell the two kinds of tab apart.
        setDatasetTabs(
          list
            .filter(
              (d) =>
                !d.recognizedStageId ||
                !legacyIds.has(d.recognizedStageId) ||
                !stagesWithData.has(d.recognizedStageId),
            )
            .map((d) => ({ id: `dataset:${d.id}`, label: d.title })),
        );
      })
      .catch(() => {
        // best-effort — the existing stage tabs still render fine without this
      });
    // viewStages / events each load asynchronously; re-filter when either
    // arrives so fetch completion order doesn't change which tabs are hidden.
  }, [viewStages, events]);

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
  }, [active, sidebarCollapsed, collapsedSections, mounted, viewStages, datasetTabs]);

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
  const allViewOptions = [{ id: "cumulative", label: "Factory Overview" }, ...stationOptions, ...datasetTabs];
  const currentView = allViewOptions.find((v) => v.id === t.stageView)
    ?? { id: t.stageView, label: t.stageView === "cumulative" ? "Factory Overview" : t.stageView };

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "var(--bg)", 
      color: "var(--text)", 
      display: "grid", 
      gridTemplateColumns: sidebarCollapsed ? "56px 1fr" : "208px 1fr", 
      gridTemplateRows: "var(--header-h) 1fr var(--footer-h)", 
      gridTemplateAreas: `"side top" "side main" "side status"`,
      transition: "grid-template-columns 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
    }}>
      {/* Sidebar Navigation */}
      <aside style={{ 
        gridArea: "side", 
        borderRight: "1px solid var(--border)", 
        background: "var(--surface)", 
        display: "flex", 
        flexDirection: "column", 
        position: "sticky", 
        top: 0, 
        height: "100vh",
        zIndex: 100,
        width: sidebarCollapsed ? "56px" : "208px",
        transition: "width 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
        overflow: "hidden"
      }}>
        {/* logo and collapse toggle */}
        <div style={{ 
          padding: sidebarCollapsed ? "10px 14px" : "10px 12px", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "flex-start",
          borderBottom: "1px solid var(--border)",
          minHeight: "calc(var(--header-h) - 1px)",
          transition: "padding 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
          overflow: "hidden"
        }}>
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 6,
            opacity: sidebarCollapsed ? 0 : 1,
            maxWidth: sidebarCollapsed ? 0 : "152px",
            overflow: "hidden",
            whiteSpace: "nowrap",
            marginRight: sidebarCollapsed ? 0 : 6,
            flexShrink: 0,
            transition: "opacity 0.2s ease, max-width 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), margin-right 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
          }}>
            <span style={{ 
              fontFamily: "var(--font-display)", 
              fontWeight: 800, 
              fontSize: "clamp(20px, 1.8vw, 24px)", 
              color: "var(--text)",
              letterSpacing: "-0.03em"
            }}>
              MO<span style={{ color: "#C8421C" }}>!</span>D
            </span>
            <span className="muted" style={{ 
              fontSize: 8, 
              lineHeight: 1.15,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginLeft: 6
            }}>
              Manufacturing Operational<br />Intelligence &amp; Diagnostics
            </span>
          </div>
          <button 
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-3)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              padding: 4,
              borderRadius: "var(--radius-sm)",
              transition: "background 0.2s",
              flexShrink: 0,
              marginLeft: "auto"
            }}
            onMouseOver={(e) => e.currentTarget.style.background = "var(--surface-3)"}
            onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
          >
            <Icon name={sidebarCollapsed ? "arrow-right" : "arrow-left"} size={14} />
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
            background: "color-mix(in srgb, var(--accent) 8%, var(--surface-2))",
            border: "1px solid color-mix(in srgb, var(--accent) 15%, var(--border-strong))",
            pointerEvents: "none",
            transition: highlightReady ? "transform 0.28s cubic-bezier(0.25, 1, 0.5, 1), width 0.28s cubic-bezier(0.25, 1, 0.5, 1), height 0.28s cubic-bezier(0.25, 1, 0.5, 1)" : "none",
            transform: `translate(${activeOffsetLeft}px, ${activeOffsetTop}px)`,
            opacity: activeOffsetTop === -1000 ? 0 : 1,
            zIndex: 0
          }} />
          {NAV_SECTIONS.map((section) => {
            const isCollapsed = !!collapsedSections[section.title];
            return (
              <div key={section.title} style={{ marginBottom: 4 }}>
                <div style={{ 
                  height: sidebarCollapsed ? 1 : 0, 
                  borderTop: sidebarCollapsed ? "1px solid var(--border)" : "0px solid transparent", 
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
                      color: "var(--text-3)",
                    }}>
                      {section.title}
                    </span>
                    <Icon
                      name={isCollapsed ? "chevron-down" : "chevron-up"}
                      size={10}
                      style={{ color: "var(--text-3)" }}
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
                        justifyContent: "flex-start",
                        gap: sidebarCollapsed ? 0 : 8,
                        padding: sidebarCollapsed ? "8px 16px" : (isAnalyticsChild ? "6px 12px 6px 20px" : "8px 12px"),
                        marginBottom: 1,
                        background: "transparent",
                        borderRadius: "30px",
                        color: isActive
                          ? "var(--accent)"
                          : n.soon
                            ? "var(--text-3)"
                            : "var(--text-2)",
                        border: "none",
                        cursor: n.soon ? "default" : "pointer",
                        fontSize: isAnalyticsChild ? 11.5 : 12.5,
                        fontWeight: isActive ? 700 : 500,
                        textAlign: "left",
                        transition: "padding 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), gap 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.15s ease",
                        position: "relative",
                        zIndex: 1
                      }}>
                      <Icon name={n.icon} size={isAnalyticsChild ? 12 : 14} stroke={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
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
        borderBottom: "1px solid var(--border)", 
        background: "var(--surface)", 
        padding: "0 var(--space-4)", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        position: "sticky", 
        top: 0, 
        zIndex: 50
      }}>
        {/* left filter selectors */}
        <div style={{ display: "flex", gap: "clamp(8px, 1vw, 16px)", alignItems: "center" }}>

          {/* Global View (stage) selector — scopes the ENTIRE app to one process.
              Compact dropdown (styled like Date Range below) replacing the old
              always-visible 13-button strip; grouped into Factory Overview /
              Stations (live data only) / Uploaded Data. */}
          <div className="view-picker-container" style={{ display: "flex", flexDirection: "column", textAlign: "left", position: "relative" }}>
            <span className="muted" style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
              View
            </span>
            <div
              onClick={(e) => { e.stopPropagation(); setShowViewMenu(!showViewMenu); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12.5,
                fontWeight: 600,
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 10px",
                background: "var(--surface-2)",
                cursor: "pointer",
                minWidth: 140,
              }}
            >
              <Icon name="table" size={12} style={{ color: "var(--text-3)" }} />
              <span style={{ flex: 1 }}>{currentView.label}</span>
              <Icon name="arrow-right" size={10} style={{ transform: "rotate(90deg)", color: "var(--text-3)" }} />
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
                <ViewMenuGroup
                  label="Uploaded Data"
                  options={datasetTabs}
                  emptyLabel="No uploaded datasets yet"
                  activeId={t.stageView}
                  onSelect={(id) => { setTweak("stageView", id); setShowViewMenu(false); }}
                />
              </div>
            )}
          </div>

          {/* D, W, M, FY Segmented Control */}
          <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
            <span className="muted" style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
              <span>Grain</span>
              {suggestedGrain && (
                <span style={{
                  fontSize: 8,
                  background: "var(--accent-weak)",
                  color: "var(--accent)",
                  padding: "1px 4px",
                  borderRadius: 3,
                  fontWeight: 700,
                  textTransform: "uppercase"
                }}>
                  {suggestedGrain === "fy" ? "FY" : suggestedGrain} Suggested
                </span>
              )}
            </span>
            <div style={{ 
              display: "flex",
              border: "1px solid var(--border-strong)", 
              borderRadius: "var(--radius-sm)", 
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
                      borderRadius: 3,
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

          {/* Interactive Date Range Selector */}
          <div className="date-picker-container" style={{ display: "flex", flexDirection: "column", textAlign: "left", position: "relative" }}>
            <span className="muted" style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
              Date Range
            </span>
            <div 
              onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker); }}
              style={{ 
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12.5, 
                fontWeight: 600, 
                border: "1px solid var(--border-strong)", 
                borderRadius: "var(--radius-sm)", 
                padding: "4px 10px", 
                background: "var(--surface-2)",
                cursor: "pointer"
              }}
            >
              <Icon name="file" size={12} style={{ color: "var(--text-3)" }} />
              <span>
                {t.datePreset === "all" && "All Data"}
                {t.datePreset === "last-90-days" && "Last 90 Days"}
                {t.datePreset === "last-12-months" && "Last 12 Months"}
                {t.datePreset === "this-fy" && "This FY"}
                {t.datePreset === "custom" && (t.dateFrom && t.dateTo ? `${t.dateFrom} to ${t.dateTo}` : "Custom Range")}
              </span>
              <Icon name="arrow-right" size={10} style={{ transform: "rotate(90deg)", color: "var(--text-3)" }} />
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

        {/* right profile / actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "clamp(8px, 1vw, 16px)" }}>
          {/* Notifications */}
          <button style={{ 
            position: "relative",
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid var(--border)",
            display: "grid",
            placeItems: "center",
            background: "var(--surface-2)"
          }}>
            <Icon name="alert" size={16} />
            <span style={{
              position: "absolute",
              top: -2,
              right: -2,
              background: "var(--critical)",
              color: "#fff",
              fontSize: 9,
              fontWeight: 800,
              width: 15,
              height: 15,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center"
            }}>4</span>
          </button>

          {/* Theme Toggle */}
          <button 
            onClick={toggleTheme}
            style={{ 
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid var(--border)",
              display: "grid",
              placeItems: "center",
              background: "var(--surface-2)",
              transition: "transform 0.2s"
            }}>
            <Icon name={mounted && isDark ? "sun" : "moon"} size={16} />
          </button>

          {/* User Profile */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ 
              width: 34, 
              height: 34, 
              borderRadius: "50%", 
              background: "var(--surface-3)", 
              color: "var(--text)", 
              display: "grid", 
              placeItems: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 12.5,
              border: "1px solid var(--border-strong)"
            }}>
              RK
            </div>
            <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Rajesh Kumar</span>
              <span className="muted" style={{ fontSize: 10.5 }}>Quality Manager</span>
            </div>
          </div>

          {/* Export Action */}
          <button onClick={handleExport} disabled={exporting} style={{
            background: "var(--accent)",
            color: "var(--text-invert)", 
            border: "none", 
            borderRadius: "var(--radius-md)", 
            padding: "8px 16px", 
            fontSize: 13, 
            fontWeight: 600, 
            cursor: "pointer", 
            display: "inline-flex", 
            gap: 6, 
            alignItems: "center",
            boxShadow: "var(--shadow-1)",
            minHeight: 36
          }}>
            <Icon name="print" size={13} /> {exporting ? "Exporting…" : "Export"} <Icon name="arrow-right" size={10} style={{ transform: "rotate(90deg)" }} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ 
        gridArea: "main", 
        overflowY: "auto", 
        padding: "clamp(10px, 1.2vh, 16px) var(--space-4)",
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
        borderTop: "1px solid var(--border)", 
        background: "var(--surface)", 
        padding: "0 var(--space-4)", 
        display: "flex", 
        alignItems: "center",
        justifyContent: "space-between", 
        fontSize: 11
      }}>
        <div style={{ display: "flex", gap: "clamp(12px, 1.5vw, 24px)" }}>
          <Status tone="var(--critical)" label="Active Alerts" value={`${sc.alerts ?? 0} Critical`} />
          <Status tone="var(--positive)" label="Pending CAPA" value={`${sc.capa ?? 0} Actions`} />
          <Status tone="var(--warning)" label="Overdue Actions" value={`${sc.overdue ?? 0}`} />
          <Status tone="var(--warning)" label="Data Anomalies" value={`${sc.anomalies ?? 0}`} />
        </div>
        
        {/* Ask RAIS text input field */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: 340 }}>
          <span className="muted" style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 11.5 }}>
            <Icon name="comment" size={12} style={{ color: "var(--accent)" }} /> Ask RAIS:
          </span>
          <input 
            type="text" 
            placeholder="Ask Rejection Advisory System..." 
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                router.push(`/chat?q=${encodeURIComponent(e.currentTarget.value.trim())}`);
                e.currentTarget.value = "";
              }
            }}
            style={{ 
              flex: 1, 
              fontSize: 11.5, 
              padding: "4px 10px", 
              border: "1px solid var(--border-strong)", 
              borderRadius: "var(--radius-sm)",
              background: "var(--bg)",
              outline: "none"
            }} 
          />
        </div>
      </footer>
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
