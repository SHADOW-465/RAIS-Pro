"use client";

// One Scope chip for the top bar (plan §3b): date range, grain, view/station,
// sources and the holidays toggle live in a single popover. It only renders the
// controls the current page actually consumes. Selection is shown with weight,
// a check mark and a border, never by accent colour (accent = primary action).

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/editorial/Icon";
import DatePicker from "@/components/ui/DatePicker";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { dateBounds, presetDateWindow } from "@/lib/analytics/scope";
import { GRAIN_LABEL, scopeSummary } from "@/components/app/scope-summary";

type Grain = keyof typeof GRAIN_LABEL;

const PRESETS: { id: string; label: string }[] = [
  { id: "all", label: "All data" },
  { id: "this-day", label: "This day" },
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "last-3-months", label: "Last 3 months" },
  { id: "last-12-months", label: "Last 12 months" },
  { id: "this-fy", label: "This FY" },
  { id: "custom", label: "Custom range…" },
];

const sectionLabel: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  color: "var(--text-3)",
  marginBottom: 8,
};

function optionStyle(selected: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    minHeight: 32,
    padding: "4px 8px",
    fontSize: "var(--text-md)",
    fontWeight: selected ? 600 : 400,
    fontFamily: "inherit",
    textAlign: "left",
    cursor: "pointer",
    color: "var(--text)",
    background: selected ? "var(--surface-2)" : "transparent",
    border: `1px solid ${selected ? "var(--border-strong)" : "transparent"}`,
    borderRadius: "var(--radius-sm)",
  };
}

export interface ScopeChipProps {
  events: Parameters<typeof dateBounds>[0] | null | undefined;
  controls: { view: boolean; interval: boolean; range: boolean; sources: boolean };
  suggestedGrain: Grain;
  rangeLabel: string;
  sourcesLabel: string;
  viewLabel: string;
  stationOptions: { id: string; label: string }[];
  stationsEmptyLabel: string;
  onOpenSources: () => void;
}

export default function ScopeChip({
  events, controls, suggestedGrain, rangeLabel, sourcesLabel, viewLabel,
  stationOptions, stationsEmptyLabel, onOpenSources,
}: ScopeChipProps) {
  const { t, setTweak } = useTweaks();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      return;
    }
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      // The calendar renders in a portal, so it is "outside" the DOM subtree.
      if (root.current?.contains(el) || el.closest("[data-moid-datepicker]")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const holidays = t.showCalendarHolidays ?? true;
  const summary = scopeSummary({
    range: controls.range ? rangeLabel : null,
    grain: controls.interval ? (t.grain as Grain) : null,
    view: controls.view ? viewLabel : null,
    sources: controls.sources ? sourcesLabel : null,
  });
  const customOpen = draft !== null || t.datePreset === "custom";
  const evs = events ?? [];

  return (
    <div ref={root} style={{ position: "relative", minWidth: 0 }}>
      <button
        type="button"
        data-testid="scope-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Scope: date range, grain, view, sources, holidays"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && t.datePreset === "custom") setDraft({ from: t.dateFrom, to: t.dateTo });
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 36,
          maxWidth: 560, // fixed cap: a % of the auto-width slot collapses on mobile
          padding: "0 12px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-strong)",
          background: open ? "var(--surface-2)" : "var(--surface)",
          color: "var(--text)",
          fontFamily: "inherit",
          fontSize: "var(--text-md)",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <Icon name="history" size={16} style={{ color: "var(--text-3)", flexShrink: 0 }} aria-hidden />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
        <Icon name="chevron-down" size={16} style={{ color: "var(--text-3)", flexShrink: 0 }} aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Scope"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 8,
            width: 360,
            maxHeight: "calc(100vh - 96px)",
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 200,
          }}
        >
          {controls.range && (
            <section>
              <div style={sectionLabel}>Date range</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {PRESETS.map(({ id, label }) => {
                  const selected =
                    id === "custom"
                      ? customOpen
                      : draft === null && (t.datePreset === id || (id === "last-3-months" && t.datePreset === "last-3-month"));
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        if (id === "custom") {
                          setDraft((p) => p ?? {
                            from: t.datePreset === "custom" ? t.dateFrom : "",
                            to: t.datePreset === "custom" ? t.dateTo : "",
                          });
                          return;
                        }
                        setDraft(null);
                        const { from, to } = presetDateWindow(id as Parameters<typeof presetDateWindow>[0], evs);
                        setTweak("dateFrom", from);
                        setTweak("dateTo", to);
                        setTweak("datePreset", id as typeof t.datePreset);
                      }}
                      style={optionStyle(selected)}
                    >
                      <span>{label}</span>
                      {selected && <Icon name="check" size={16} aria-hidden />}
                    </button>
                  );
                })}
              </div>

              {draft !== null && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="muted" style={{ fontSize: "var(--text-xs)", width: 32 }}>From</span>
                    <DatePicker
                      value={draft.from}
                      onChange={(d) => setDraft((p) => ({ from: d, to: p?.to ?? "" }))}
                      ariaLabel="Scope from date"
                      size="sm"
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="muted" style={{ fontSize: "var(--text-xs)", width: 32 }}>To</span>
                    <DatePicker
                      value={draft.to}
                      onChange={(d) => setDraft((p) => ({ from: p?.from ?? "", to: d }))}
                      ariaLabel="Scope to date"
                      size="sm"
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const { max } = dateBounds(evs);
                        const a = max ? new Date(`${max}T00:00:00Z`) : new Date();
                        const y = a.getUTCFullYear();
                        const m = a.getUTCMonth();
                        const mm = String(m + 1).padStart(2, "0");
                        const last = String(new Date(Date.UTC(y, m + 1, 0)).getUTCDate()).padStart(2, "0");
                        setDraft({ from: `${y}-${mm}-01`, to: `${y}-${mm}-${last}` });
                      }}
                      style={{ ...optionStyle(false), width: "auto", border: "1px solid var(--border-strong)" }}
                    >
                      Fill this month
                    </button>
                    <button
                      type="button"
                      disabled={!draft.from || !draft.to}
                      onClick={() => {
                        if (!draft.from || !draft.to) return;
                        setTweak("dateFrom", draft.from);
                        setTweak("dateTo", draft.to);
                        setTweak("datePreset", "custom");
                        setDraft(null);
                      }}
                      style={{
                        ...optionStyle(true),
                        width: "auto",
                        opacity: draft.from && draft.to ? 1 : 0.5,
                        cursor: draft.from && draft.to ? "pointer" : "not-allowed",
                      }}
                    >
                      Apply range
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {controls.interval && (
            <section>
              <div style={sectionLabel}>Grain</div>
              <div role="group" aria-label="Grain" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                {(Object.keys(GRAIN_LABEL) as Grain[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={t.grain === g}
                    onClick={() => setTweak("grain", g)}
                    style={{ ...optionStyle(t.grain === g), justifyContent: "center" }}
                  >
                    {GRAIN_LABEL[g]}
                  </button>
                ))}
              </div>
              {suggestedGrain !== t.grain && (
                <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 8 }}>
                  Suggested for this range: {GRAIN_LABEL[suggestedGrain]}
                </div>
              )}
            </section>
          )}

          {controls.view && (
            <section>
              <div style={sectionLabel}>View</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 176, overflowY: "auto" }}>
                {[{ id: "cumulative", label: "Factory Overview" }, ...stationOptions].map((v) => {
                  const selected = (t.stageView || "cumulative") === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setTweak("stageView", v.id)}
                      style={optionStyle(selected)}
                    >
                      <span>{v.label}</span>
                      {selected && <Icon name="check" size={16} aria-hidden />}
                    </button>
                  );
                })}
                {stationOptions.length === 0 && (
                  <div className="muted" style={{ fontSize: "var(--text-xs)", padding: "4px 8px" }}>{stationsEmptyLabel}</div>
                )}
              </div>
            </section>
          )}

          {controls.sources && (
            <section>
              <div style={sectionLabel}>Sources</div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenSources();
                }}
                style={{ ...optionStyle(false), border: "1px solid var(--border-strong)" }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sourcesLabel}</span>
                <span className="muted" style={{ fontSize: "var(--text-xs)", flexShrink: 0 }}>Sections, batches, files…</span>
              </button>
            </section>
          )}

          <section style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <button
              type="button"
              role="switch"
              aria-checked={holidays}
              title={holidays ? "Holidays are marked across the dashboard (click to hide)" : "Mark holidays across the dashboard"}
              onClick={() => setTweak("showCalendarHolidays", !holidays)}
              style={{ ...optionStyle(false), minHeight: 36 }}
            >
              <span>Mark holidays</span>
              <span style={{ fontWeight: 600, fontSize: "var(--text-xs)" }}>
                {holidays ? "On" : "Off"}
              </span>
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
