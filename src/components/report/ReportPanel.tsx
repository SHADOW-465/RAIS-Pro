"use client";

// Build report panel — presets · sections · preview.
// Print clones the document into a full-page body portal so PDF is never
// constrained by the modal's 3-column grid (the previous crush/blank-page bug).

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useConfirm } from "@/components/ui/ConfirmContext";
import ReportDocument from "./ReportDocument";
import {
  presetFor,
  availableBlocks,
  moveBlock,
  BLOCK_LABEL,
  cloneSpec,
  type ReportSpec,
  type ReportBlock,
} from "@/lib/report/blocks";
import {
  listNamedPresets,
  saveNamedPreset,
  deleteNamedPreset,
  getNamedPreset,
  type NamedReportPreset,
} from "@/lib/report/presets-store";
import { buildPresetsZip } from "@/lib/report/presets-package";
import type { NavKey } from "@/lib/nav-keys";
import {
  describeSourceFilter,
  listExcelSourceFiles,
  listBatchIds,
  type Scope,
} from "@/lib/analytics/scope";
import type { Event } from "@/lib/store/types";
import type { Registry } from "@/lib/analytics/rejection";
import { useTweaks } from "@/components/editorial/TweaksContext";

/** Global print rules — only active while body has .rp-printing. */
const PRINT_SURFACE_CSS = `
/* Screen: print surface off-canvas so it never paints the live UI */
.rp-print-surface {
  position: fixed !important;
  left: -10000px !important;
  top: 0 !important;
  width: 190mm !important;
  max-width: 190mm !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
  z-index: -1 !important;
  background: #fff !important;
  color: #14181f !important;
  /* Measure charts at paper content width */
  --text: #14181f;
  --text-2: #3a4450;
  --text-3: #5a6570;
  --border: #c8ced6;
  --border-strong: #9aa3ad;
  --surface: #ffffff;
  --surface-2: #eef1f4;
  --bg: #ffffff;
  --accent: #C8421C;
  --accent-weak: rgba(200, 66, 28, 0.14);
}

@media print {
  @page {
    size: A4 portrait;
    margin: 12mm;
  }

  html, body {
    background: #fff !important;
    color: #14181f !important;
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    width: 100% !important;
  }

  body.rp-printing > *:not(.rp-print-surface) {
    display: none !important;
  }

  body.rp-printing .rp-print-surface {
    display: block !important;
    position: static !important;
    left: auto !important;
    top: auto !important;
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    pointer-events: auto !important;
    z-index: auto !important;
    background: #fff !important;
    color: #14181f !important;
    box-shadow: none !important;
    border: none !important;
  }

  body.rp-printing .rp-print-surface,
  body.rp-printing .rp-print-surface * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body.rp-printing .rp-print-surface svg {
    max-width: 100% !important;
  }

  body.rp-printing .rp-print-surface .chart-line-stroke {
    stroke: #C8421C !important;
  }

  body.rp-printing .no-print {
    display: none !important;
  }
}
`;

export default function ReportPanel({
  page,
  events,
  scope,
  periodLabel,
  onClose,
  embedded = false,
  registry,
  initialPresetId,
}: {
  page: NavKey;
  events: Event[];
  scope: Scope;
  periodLabel: string;
  onClose?: () => void;
  embedded?: boolean;
  registry?: Registry | null;
  initialPresetId?: string;
}) {
  const { t, setTweak } = useTweaks();
  const [presets, setPresets] = useState<NamedReportPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(initialPresetId ?? null);
  const [spec, setSpec] = useState<ReportSpec | null>(() => {
    if (initialPresetId) {
      const p = getNamedPreset(initialPresetId);
      if (p) return cloneSpec(p.spec);
    }
    return presetFor(page);
  });
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  /** When true, a full-page print portal is mounted on document.body. */
  const [printing, setPrinting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keep print CSS in <head> so it still applies when the modal (and its
  // inline <style> tags) are display:none'd during the print pass.
  useEffect(() => {
    const id = "rp-print-surface-css";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = PRINT_SURFACE_CSS;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);

  const refreshPresets = () => setPresets(listNamedPresets());

  useEffect(() => {
    refreshPresets();
  }, []);

  // After the portal paints, fire window.print(); clean up on afterprint.
  useEffect(() => {
    if (!printing) return;

    document.body.classList.add("rp-printing");
    let cancelled = false;
    let fallbackTimer: number | undefined;
    let raf1 = 0;
    let raf2 = 0;

    const cleanup = () => {
      if (cancelled) return;
      cancelled = true;
      document.body.classList.remove("rp-printing");
      setPrinting(false);
      window.removeEventListener("afterprint", cleanup);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };

    window.addEventListener("afterprint", cleanup);
    // Some browsers never fire afterprint — don't leave the portal forever.
    fallbackTimer = window.setTimeout(cleanup, 90_000);

    // Double rAF: ensure portal + styles are in the layout before the print snapshot.
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) window.print();
      });
    });

    return cleanup;
  }, [printing]);

  const shelf = useMemo(() => availableBlocks(page), [page]);
  const excelFiles = useMemo(() => listExcelSourceFiles(events), [events]);
  const batchIds = useMemo(() => listBatchIds(events), [events]);
  const sourcesSummary = useMemo(() => describeSourceFilter(scope), [scope]);

  if (!spec) return null;

  const setBlocks = (blocks: ReportBlock[]) => setSpec({ ...spec, blocks });
  const remove = (id: string) => setBlocks(spec.blocks.filter((b) => b.id !== id));
  const add = (block: ReportBlock) =>
    setBlocks([
      ...spec.blocks,
      {
        ...block,
        id: `${block.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      },
    ]);

  function loadPreset(id: string) {
    const p = getNamedPreset(id) ?? listNamedPresets().find((x) => x.id === id);
    if (!p) return;
    setSpec(cloneSpec(p.spec));
    setActivePresetId(p.id);
    setSaveName(p.builtIn ? `${p.name} (copy)` : p.name);
    setMsg(null);
  }

  function handleSave() {
    const name = saveName.trim() || spec!.title;
    const existing =
      activePresetId && !activePresetId.startsWith("builtin:") ? activePresetId : undefined;
    const saved = saveNamedPreset(name, spec!, existing);
    setActivePresetId(saved.id);
    setSaveName(saved.name);
    setShowSave(false);
    refreshPresets();
    setMsg(`Saved “${saved.name}”`);
  }

  const { confirm: confirmModal } = useConfirm();

  async function handleDelete() {
    if (!activePresetId || activePresetId.startsWith("builtin:")) return;
    const ok = await confirmModal({
      title: "Delete saved preset?",
      description: "Delete this custom report layout preset? This cannot be undone.",
      confirmText: "Delete Preset",
      variant: "danger",
    });
    if (!ok) return;
    deleteNamedPreset(activePresetId);
    setActivePresetId(null);
    refreshPresets();
    const fresh = presetFor(page);
    if (fresh) setSpec(cloneSpec(fresh));
    setMsg("Preset deleted");
  }

  /** Mount a body-level print surface at full page width, then print. */
  function handlePrint() {
    if (events.length === 0) {
      setMsg("No data in this period — nothing to print.");
      return;
    }
    setMsg(null);
    setPrinting(true);
  }

  async function handleZipPresets() {
    setZipping(true);
    setMsg(null);
    try {
      const { blob, fileName } = await buildPresetsZip(events, scope, periodLabel);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Downloaded ${fileName}`);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "ZIP failed");
    } finally {
      setZipping(false);
    }
  }

  const doc = (
    <ReportDocument
      spec={spec}
      events={events}
      scope={scope}
      periodLabel={periodLabel}
      registry={registry}
    />
  );

  const panelHeight = embedded ? "min(86vh, 920px)" : "min(92vh, 920px)";

  const shell = (
    <div
      className="rp-panel-shell"
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border-strong)",
        borderRadius: embedded ? 12 : 14,
        boxShadow: embedded ? "none" : "var(--shadow-lg)",
        width: embedded ? "100%" : "min(1180px, 96vw)",
        height: panelHeight,
        maxHeight: panelHeight,
        display: "grid",
        gridTemplateColumns: "minmax(200px, 260px) minmax(260px, 300px) minmax(0, 1fr)",
        gridTemplateRows: "minmax(0, 1fr)",
        overflow: "hidden",
      }}
    >
      {/* ── Named presets ─────────────────────────────────────────────── */}
      <div className="no-print" style={{ ...col, borderRight: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <div style={colHeader}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Named presets</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
            Built-in packs and your saves
          </div>
        </div>
        <div style={colScroll}>
          {presets.map((p) => {
            const on = p.id === activePresetId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => loadPreset(p.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 10px",
                  marginBottom: 6,
                  borderRadius: 8,
                  border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: on ? "var(--accent-weak)" : "var(--surface)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{p.name}</div>
                {p.description && (
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 3, lineHeight: 1.35 }}>
                    {p.description}
                  </div>
                )}
                {p.builtIn && (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-3)" }}>
                    Built-in
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sections editor ───────────────────────────────────────────── */}
      <div className="no-print" style={{ ...col, borderRight: "1px solid var(--border)" }}>
        <div style={colHeader}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{embedded ? "Report editor" : "Build report"}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {periodLabel}
          </div>
        </div>

        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <label className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
            Report title
          </label>
          <input
            value={spec.title}
            onChange={(e) => setSpec({ ...spec, title: e.target.value })}
            style={{
              width: "100%",
              marginTop: 5,
              padding: "6px 9px",
              borderRadius: 7,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Collapsible sources — does not steal the sections column */}
        <div style={{ borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--surface-2)" }}>
          <button
            type="button"
            onClick={() => setSourcesOpen((o) => !o)}
            aria-expanded={sourcesOpen}
            aria-controls="rp-sources-panel"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "10px 16px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-3)" }}>
                Sources {sourcesOpen ? "▾" : "▸"}
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sourcesSummary}
              </div>
            </div>
          </button>
          {sourcesOpen && (
            <div id="rp-sources-panel" style={{ padding: "0 16px 12px", maxHeight: 160, overflowY: "auto" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={t.includeExcel}
                  onChange={(e) => {
                    setTweak("includeExcel", e.target.checked);
                    if (!e.target.checked) setTweak("excelFiles", []);
                  }}
                />
                Excel uploads
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={t.includeDirectEntry}
                  onChange={(e) => setTweak("includeDirectEntry", e.target.checked)}
                />
                Data entry
              </label>
              {batchIds.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                    Batches {t.batchIds.length === 0 ? "(full plant)" : `(${t.batchIds.length})`}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => setTweak("batchIds", [...batchIds])} style={miniBtn}>
                      All batches
                    </button>
                    <button type="button" onClick={() => setTweak("batchIds", [])} style={miniBtn}>
                      Clear
                    </button>
                  </div>
                  {batchIds.map((b) => {
                    const selected = t.batchIds.includes(b);
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() =>
                          setTweak(
                            "batchIds",
                            selected ? t.batchIds.filter((x) => x !== b) : [...t.batchIds, b],
                          )
                        }
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          fontSize: 11,
                          marginBottom: 3,
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
                          background: selected ? "var(--accent)" : "var(--surface)",
                          color: selected ? "var(--text-invert, #fff)" : "var(--text)",
                          cursor: "pointer",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                        }}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
              )}
              {t.includeExcel && excelFiles.length > 0 && (
                <div>
                  <button type="button" onClick={() => setTweak("excelFiles", [])} style={{ ...miniBtn, marginBottom: 6 }}>
                    All Excel files
                  </button>
                  {excelFiles.map((f) => {
                    const checked = t.excelFiles.length === 0 || t.excelFiles.includes(f);
                    return (
                      <label
                        key={f}
                        style={{ display: "flex", gap: 6, fontSize: 11, marginBottom: 3, cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            if (t.excelFiles.length === 0) {
                              setTweak("excelFiles", excelFiles.filter((x) => x !== f));
                            } else if (t.excelFiles.includes(f)) {
                              setTweak("excelFiles", t.excelFiles.filter((x) => x !== f));
                            } else {
                              const next = [...t.excelFiles, f];
                              setTweak("excelFiles", next.length === excelFiles.length ? [] : next);
                            }
                          }}
                        />
                        <span style={{ wordBreak: "break-word" }}>{f}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sections — primary scroll area of this column */}
        <div style={{ ...colScroll, padding: "12px 16px", flex: 1 }}>
          <>
              <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Sections ({spec.blocks.length})
              </div>
              {spec.blocks.map((b, i) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 8px",
                    marginBottom: 6,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.title}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>{BLOCK_LABEL[b.kind]}</div>
                  </div>
                  <button type="button" onClick={() => setBlocks(moveBlock(spec.blocks, i, -1))} disabled={i === 0} aria-label={`Move ${b.title} up`} style={iconBtn(i === 0)}>↑</button>
                  <button type="button" onClick={() => setBlocks(moveBlock(spec.blocks, i, 1))} disabled={i === spec.blocks.length - 1} aria-label={`Move ${b.title} down`} style={iconBtn(i === spec.blocks.length - 1)}>↓</button>
                  <button type="button" onClick={() => remove(b.id)} aria-label={`Remove ${b.title}`} style={{ ...iconBtn(false), color: "var(--status-bad)" }}>×</button>
                </div>
              ))}

              <div className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, margin: "16px 0 8px" }}>
                Add a section
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {shelf.map((b, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => add(b)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 9999,
                      border: "1px dashed var(--border-strong)",
                      background: "transparent",
                      color: "var(--text-2)",
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    + {b.title}
                  </button>
                ))}
              </div>
            </>

          {msg && (
            <div role="status" style={{ marginTop: 12, fontSize: 14, color: msg.toLowerCase().includes("fail") || msg.toLowerCase().includes("nothing") ? "var(--critical)" : "var(--positive)", fontWeight: 600 }}>{msg}</div>
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          {showSave ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Preset name"
                style={{
                  padding: "7px 10px",
                  borderRadius: 7,
                  border: "1px solid var(--border-strong)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontSize: 13,
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={handleSave} style={primaryBtn}>Save</button>
                <button type="button" onClick={() => setShowSave(false)} style={ghostBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSaveName(spec.title);
                setShowSave(true);
              }}
              style={ghostBtn}
            >
              Save as named preset…
            </button>
          )}
          {activePresetId && !activePresetId.startsWith("builtin:") && (
            <button type="button" onClick={handleDelete} style={{ ...ghostBtn, color: "var(--status-bad)" }}>
              Delete this preset
            </button>
          )}
          <button type="button" onClick={handlePrint} style={primaryBtn} disabled={printing}>
            {printing ? "Preparing print…" : "Print / Save as PDF"}
          </button>
          <button type="button" onClick={() => void handleZipPresets()} disabled={zipping} style={ghostBtn}>
            {zipping ? "Building ZIP…" : "Download layout-preset HTML stubs (charts omitted)"}
          </button>
          {onClose && !embedded && (
            <button type="button" onClick={onClose} style={{ ...ghostBtn, border: "none" }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ── On-screen preview only (not used for print) ───────────────── */}
      <div className="no-print" style={{ ...col, background: "var(--surface-2)" }}>
        <div style={{ ...colHeader }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Preview</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
            Scroll here · Print exports a full-width page layout
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            {sourcesSummary}
          </div>
        </div>
        <div style={{ ...colScroll, padding: 20 }} className="rp-preview-scroll">
          {events.length === 0 ? (
            <div className="muted" style={{ padding: 40, textAlign: "center", fontSize: 13 }}>
              No data in this period yet — the report has nothing to show.
            </div>
          ) : (
            <div className="rp-preview-root" style={{ maxWidth: 720, margin: "0 auto" }}>
              {doc}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Full-page print portal — sibling of the app root, never inside the modal grid.
  const printPortal =
    mounted &&
    printing &&
    createPortal(
      <div className="rp-print-surface" aria-hidden="true">
        {doc}
      </div>,
      document.body,
    );

  if (embedded) {
    return (
      <>
        {shell}
        {printPortal}
      </>
    );
  }

  return (
    <>
      <div
        className="rp-modal-root no-print"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 400,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "2vh 2vw",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        <div
          className="no-print"
          onClick={onClose}
          style={{
            position: "absolute",
            inset: 0,
            background: "color-mix(in srgb, #000 45%, transparent)",
          }}
        />
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ maxHeight: "96vh", minHeight: 0, position: "relative", zIndex: 1 }}
        >
          {shell}
        </div>
      </div>
      {printPortal}
    </>
  );
}

const col: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  minWidth: 0,
  height: "100%",
  overflow: "hidden",
};

const colHeader: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid var(--border)",
  flexShrink: 0,
};

const colScroll: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehavior: "contain",
  padding: 10,
  WebkitOverflowScrolling: "touch",
};

const iconBtn = (disabled: boolean): React.CSSProperties => ({
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 6,
  width: 44,
  height: 44,
  lineHeight: 1,
  fontSize: 16,
  color: "var(--text-2)",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.35 : 1,
  flexShrink: 0,
});

const ghostBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 9999,
  border: "1px solid var(--border-strong)",
  background: "transparent",
  color: "var(--text-2)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 9999,
  border: "none",
  background: "var(--accent)",
  color: "var(--text-invert, #fff)",
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
  fontFamily: "inherit",
};

const miniBtn: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "2px 8px",
  background: "var(--surface)",
  cursor: "pointer",
  fontFamily: "inherit",
  color: "var(--text)",
};
