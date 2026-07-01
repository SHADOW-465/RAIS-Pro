"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Icon, { type IconName } from "@/components/editorial/Icon";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { useEvents } from "@/components/app/EventsContext";

export type NavKey =
  | "dashboard" | "data-entry" | "staging" | "stage" | "size" | "defect"
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

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "table", href: "/" },
  { key: "data-entry", label: "Data Entry", icon: "file", href: "/data-entry" },
  { key: "staging", label: "Staging & Review", icon: "upload", href: "/staging", badge: 12 },
  { key: "stage", label: "Stage Analysis", icon: "trend-up", href: "/stage-analysis" },
  { key: "size", label: "Size Analysis", icon: "tally", href: "/size-analysis" },
  { key: "defect", label: "Defect Analysis", icon: "spark", href: "/defect-analysis" },
  { key: "spc", label: "SPC & Control Charts", icon: "trend-down", href: "/spc" },
  { key: "process-flow", label: "Process Flow", icon: "split", href: "/process-flow" },
  { key: "copq", label: "COPQ & Savings", icon: "lightning", href: "/copq" },
  { key: "reports", label: "Reports", icon: "print", href: "/reports" },
  { key: "capa", label: "CAPA & Actions", icon: "check", href: "/capa" },
  { key: "ask", label: "Ask RAIS", icon: "comment", href: "/chat", aiBadge: true },
  { key: "audit", label: "Audit Trail", icon: "search", href: "/audit" },
  { key: "schema", label: "Data Schema", icon: "split", href: "/schema" },
  { key: "settings", label: "Settings", icon: "external", href: "/settings" },
];

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
  active, trustScore, statusCounts, dateRange, children,
}: {
  active: NavKey;
  trustScore?: number | null;
  statusCounts?: { alerts?: number; capa?: number; overdue?: number; anomalies?: number };
  dateRange?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { t, setTweak } = useTweaks();
  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [analyticsExpanded] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [viewStages, setViewStages] = useState<{ id: string; label: string }[]>([]);
  const [datasetTabs, setDatasetTabs] = useState<{ id: string; label: string }[]>([]);
  const [dateMinMax, setDateMinMax] = useState<{ min: string; max: string } | null>(null);

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
  }, []);

  useEffect(() => {
    fetch("/api/datasets")
      .then((res) => res.json())
      .then((data) => {
        const list = (data.datasets ?? []) as { id: string; title: string }[];
        // Prefix with "dataset:" so these ids can never collide with a legacy
        // stageId (which are short kebab-case strings like "visual"), and so
        // page.tsx can cheaply tell the two kinds of tab apart.
        setDatasetTabs(list.map((d) => ({ id: `dataset:${d.id}`, label: d.title })));
      })
      .catch(() => {
        // best-effort — the existing stage tabs still render fine without this
      });
  }, []);

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

  const isDark = t.theme === "dark";
  const toggleTheme = () => {
    setTweak("theme", isDark ? "light" : "dark");
  };

  const sc = statusCounts ?? {};

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "var(--bg)", 
      color: "var(--text)", 
      display: "grid", 
      gridTemplateColumns: "240px 1fr", 
      gridTemplateRows: "70px 1fr 44px", 
      gridTemplateAreas: `"side top" "side main" "side status"` 
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
        zIndex: 100
      }}>
        {/* logo */}
        <div style={{ 
          padding: "20px 18px", 
          display: "flex", 
          alignItems: "center", 
          gap: 6, 
          borderBottom: "1px solid var(--border)" 
        }}>
          <span style={{ 
            fontFamily: "var(--font-display)", 
            fontWeight: 800, 
            fontSize: 24, 
            color: "var(--text)",
            letterSpacing: "-0.03em"
          }}>
            MO<span style={{ color: "#C8421C" }}>!</span>D
          </span>
          <span className="muted" style={{ 
            fontSize: 8.5, 
            lineHeight: 1.15,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginLeft: 8
          }}>
            Manufacturing Operational<br />Intelligence &amp; Diagnostics
          </span>
        </div>

        {/* nav links */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
          {NAV.map((n) => {
            const isActive = n.key === active;
            const isAnalyticsChild = n.indent;
            
            if (isAnalyticsChild && !analyticsExpanded) return null;

            // Render header item for Analytics group
            if (n.key === "stage" && isAnalyticsChild && NAV.find(item => item.key === "stage")?.key === n.key) {
              // We inject the Analytics group header before Stage Analysis
            }

            return (
              <button key={n.key} disabled={n.soon}
                onClick={() => {
                  if (n.href) {
                    router.push(n.href);
                  }
                }}
                title={n.soon ? "Coming soon" : n.label}
                style={{
                  width: "100%", 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 10, 
                  padding: isAnalyticsChild ? "8px 16px 8px 32px" : "10px 16px",
                  marginBottom: 2,
                  background: isActive 
                    ? "var(--accent-weak)" 
                    : "transparent",
                  borderRadius: "var(--radius-sm)",
                  color: isActive 
                    ? "var(--text)" 
                    : n.soon 
                      ? "var(--text-3)" 
                      : "var(--text-2)",
                  border: "none", 
                  cursor: n.soon ? "default" : "pointer",
                  fontSize: isAnalyticsChild ? 12.5 : 13.5, 
                  fontWeight: isActive ? 600 : 500, 
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  position: "relative"
                }}>
                {isActive && (
                  <div style={{
                    position: "absolute",
                    left: 0,
                    top: "15%",
                    height: "70%",
                    width: 3,
                    background: "#C8421C",
                    borderRadius: "0 2px 2px 0"
                  }} />
                )}
                <Icon name={n.icon} size={isAnalyticsChild ? 13 : 15} stroke={isActive ? 2 : 1.5} />
                <span style={{ flex: 1 }}>{n.label}</span>
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
                {n.soon ? <span className="muted" style={{ fontSize: 9 }}>soon</span> : null}
              </button>
            );
          })}
        </nav>

        {/* Data Trust Score */}
        <div style={{ 
          padding: "16px", 
          borderTop: "1px solid var(--border)",
          background: "var(--surface-2)"
        }}>
          <div className="muted" style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
            Data Trust Score
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--positive-weak)",
              display: "grid",
              placeItems: "center",
              color: "var(--positive)"
            }}>
              <Icon name="check" size={16} stroke={2.5} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ 
                  fontFamily: "var(--font-mono)", 
                  fontSize: 20, 
                  fontWeight: 800, 
                  color: "var(--positive)" 
                }}>
                  {trustScore != null ? `${trustScore.toFixed(1)}%` : "—"}
                </span>
                {trustScore != null && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--positive)" }}>
                    {trustScore >= 95 ? "Excellent" : trustScore >= 85 ? "Good" : "Review"}
                  </span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 9, marginTop: 1 }}>
                {trustScore != null ? "Computed from the live ledger" : "No data ingested yet"}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Topbar / Masthead */}
      <header style={{ 
        gridArea: "top", 
        borderBottom: "1px solid var(--border)", 
        background: "var(--surface)", 
        padding: "0 24px", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        position: "sticky", 
        top: 0, 
        zIndex: 50
      }}>
        {/* left filter selectors */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Selector label="Plant" value="Disposable Baddi" />
          <Selector label="Line" value="FBC Line 1" />

          {/* Global View (stage) selector — scopes the ENTIRE app to one process */}
          <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
            <span className="muted" style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
              View
            </span>
            <div style={{ display: "flex", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: 2, background: "var(--surface-2)", alignItems: "center" }}>
              {[{ id: "cumulative", label: "Cumulative" }, ...(viewStages.length ? viewStages : VIEW_OPTIONS.slice(1)), ...datasetTabs].map((v) => {
                const active = t.stageView === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setTweak("stageView", v.id)}
                    style={{
                      padding: "2px 9px",
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 3,
                      background: active ? "var(--accent)" : "transparent",
                      color: active ? "var(--text-invert)" : "var(--text-2)",
                      transition: "all 0.12s ease",
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
        padding: "24px",
        background: "var(--bg)",
        position: "relative"
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
      </main>

      {/* Footer Status Bar */}
      <footer style={{ 
        gridArea: "status", 
        borderTop: "1px solid var(--border)", 
        background: "var(--surface)", 
        padding: "0 24px", 
        display: "flex", 
        alignItems: "center",
        justifyContent: "space-between", 
        fontSize: 12
      }}>
        <div style={{ display: "flex", gap: 24 }}>
          <Status tone="var(--critical)" label="Active Alerts" value={`${sc.alerts ?? 0} Critical`} />
          <Status tone="var(--positive)" label="Pending CAPA" value={`${sc.capa ?? 0} Actions`} />
          <Status tone="var(--warning)" label="Overdue Actions" value={`${sc.overdue ?? 0}`} />
          <Status tone="var(--accent)" label="Data Anomalies" value={`${sc.anomalies ?? 0}`} />
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

function Selector({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
      <span className="muted" style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
        {label}
      </span>
      <div style={{ 
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
      }}>
        {icon === "calendar" && <Icon name="file" size={12} style={{ color: "var(--text-3)" }} />}
        <span>{value}</span>
        <Icon name="arrow-right" size={10} style={{ transform: "rotate(90deg)", color: "var(--text-3)" }} />
      </div>
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
