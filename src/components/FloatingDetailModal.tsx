"use client";

import React, { useState, useRef, useLayoutEffect, useCallback, useEffect } from "react";
import Icon from "@/components/editorial/Icon";

/** One provenance row — where a displayed number actually came from. */
export interface SourceRow {
  date: string;
  stage: string;
  size?: string | null;
  type: string;        // production | inspection | rejection …
  qty: number | string;
  file: string;        // source workbook / "Manual Entry"
  sheet?: string;
  cell: string;        // A1 ref or ENTRY!… token
}

interface FloatingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  insight: string | string[];
  children: React.ReactNode;
  /** Headline value the metric resolves to (anchors the source beams). */
  primaryValue?: string;
  /** The exact records that feed this metric (enables "View Source"). */
  sourceRows?: SourceRow[];
}

interface Beam { x1: number; y1: number; x2: number; y2: number; key: string }

export default function FloatingDetailModal({
  isOpen,
  onClose,
  title,
  insight,
  children,
  primaryValue,
  sourceRows,
}: FloatingDetailModalProps) {
  const [showSource, setShowSource] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [beams, setBeams] = useState<Beam[]>([]);

  // Reset the source view whenever the modal opens for a new metric.
  useEffect(() => {
    if (!isOpen) setShowSource(false);
  }, [isOpen]);

  const hasSource = !!sourceRows && sourceRows.length > 0;
  // Cap drawn rows so huge ledgers stay legible; beams only to visible rows.
  const visibleRows = (sourceRows ?? []).slice(0, 60);

  const computeBeams = useCallback(() => {
    if (!showSource || !containerRef.current || !anchorRef.current) {
      setBeams([]);
      return;
    }
    const base = containerRef.current.getBoundingClientRect();
    const a = anchorRef.current.getBoundingClientRect();
    const fromX = a.right - base.left;
    const fromY = a.top + a.height / 2 - base.top;
    const scroll = tableScrollRef.current?.getBoundingClientRect();
    const next: Beam[] = [];
    rowRefs.current.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      // Clip beams whose row is scrolled out of the source table viewport.
      if (scroll && (r.top + r.height / 2 < scroll.top || r.top + r.height / 2 > scroll.bottom)) return;
      next.push({
        key: `b-${i}`,
        x1: fromX,
        y1: fromY,
        x2: r.left - base.left,
        y2: r.top + r.height / 2 - base.top,
      });
    });
    setBeams(next);
  }, [showSource]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(computeBeams);
    return () => cancelAnimationFrame(id);
  }, [isOpen, showSource, computeBeams, visibleRows.length]);

  useEffect(() => {
    if (!showSource) return;
    let raf = 0;
    const handler = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(computeBeams); };
    const scroller = tableScrollRef.current;
    scroller?.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
    return () => { cancelAnimationFrame(raf); scroller?.removeEventListener("scroll", handler); window.removeEventListener("resize", handler); };
  }, [showSource, computeBeams]);

  if (!isOpen) return null;
  const insights = Array.isArray(insight) ? insight : [insight];

  return (
    <div
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(18,16,14,0.62)", zIndex: 1000, display: "grid", placeItems: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="fade-up"
        style={{
          width: "96vw",
          maxWidth: showSource ? 1320 : 1140,
          background: "var(--bg)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 50px -12px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "94vh",
          overflow: "hidden",
        }}
      >
        {/* Title bar — slim */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, background: "var(--accent)", color: "var(--text-invert)", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>RAIS</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{title}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasSource && (
              <button
                onClick={() => setShowSource((s) => !s)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: "var(--radius-sm)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  border: `1px solid ${showSource ? "var(--accent)" : "var(--border-strong)"}`,
                  background: showSource ? "var(--accent)" : "var(--surface)",
                  color: showSource ? "var(--text-invert)" : "var(--text)",
                }}
              >
                <Icon name="search" size={12} /> {showSource ? "Hide Source" : "View Source"}
              </button>
            )}
            <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", display: "grid", placeItems: "center", padding: 6, borderRadius: "50%" }}
              onMouseOver={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}>
              <Icon name="plus" size={15} style={{ transform: "rotate(45deg)" }} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={containerRef} style={{ position: "relative", flex: 1, overflowY: "auto", padding: "16px 18px" }}>
          {!showSource ? (
            <>
              {/* Chart big, full width */}
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)", padding: "16px 18px 8px", minHeight: 300 }}>
                {children}
              </div>
              {/* Compact insight line underneath */}
              {insights.filter(Boolean).length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {insights.filter(Boolean).map((item, i) => (
                    <div key={i} style={{ flex: "1 1 320px", minWidth: 0, display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px", borderRadius: "var(--radius-sm)", background: "var(--accent-weak)", border: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: 12, lineHeight: 1.5, flexShrink: 0 }}>›</span>
                      <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text)" }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* SOURCE TRACE: computed value ⟶ source schema rows, beam-connected */}
              <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 28, alignItems: "start" }}>
                <div ref={anchorRef} style={{ position: "sticky", top: 0, border: "1px solid var(--accent)", borderRadius: "var(--radius-md)", background: "var(--surface)", padding: "16px 18px" }}>
                  <span className="eyebrow accent" style={{ fontWeight: 700, fontSize: 10.5 }}>Computed value</span>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 800, color: "var(--accent)", margin: "6px 0 4px", wordBreak: "break-word" }}>{primaryValue ?? "—"}</div>
                  <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
                    Traced to <strong style={{ color: "var(--text)" }}>{(sourceRows ?? []).length.toLocaleString()}</strong> source record{(sourceRows ?? []).length === 1 ? "" : "s"} below — each beam maps the value to the exact cell it was read from.
                  </p>
                </div>

                <div>
                  <span className="eyebrow" style={{ fontWeight: 700, fontSize: 10.5, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Source data schema (provenance)</span>
                  <div ref={tableScrollRef} style={{ maxHeight: "62vh", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead style={{ position: "sticky", top: 0, background: "var(--surface-2)", zIndex: 1 }}>
                        <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          <th style={th}>Date</th><th style={th}>Stage</th><th style={th}>Size</th><th style={th}>Type</th>
                          <th style={{ ...th, textAlign: "right" }}>Qty</th><th style={th}>File</th><th style={th}>Cell</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((r, i) => (
                          <tr key={i} ref={(el) => { if (el) rowRefs.current.set(i, el); else rowRefs.current.delete(i); }} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ ...td, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{r.date}</td>
                            <td style={td}>{r.stage}</td>
                            <td style={td}>{r.size || "—"}</td>
                            <td style={td}><span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-2)" }}>{r.type}</span></td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{typeof r.qty === "number" ? r.qty.toLocaleString() : r.qty}</td>
                            <td style={{ ...td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.file}>{r.file}</td>
                            <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{r.cell}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(sourceRows ?? []).length > visibleRows.length && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Showing first {visibleRows.length} of {(sourceRows ?? []).length.toLocaleString()} source records.</div>
                  )}
                </div>
              </div>

              {/* Beam overlay (inside modal, relative to body) */}
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5, overflow: "visible" }}>
                <defs>
                  <marker id="modal-beam-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
                  </marker>
                </defs>
                {beams.map((b) => {
                  const dx = b.x2 - b.x1;
                  const c1x = b.x1 + Math.max(40, dx * 0.4);
                  const c2x = b.x2 - Math.max(40, dx * 0.4);
                  return (
                    <path key={b.key} d={`M ${b.x1} ${b.y1} C ${c1x} ${b.y1}, ${c2x} ${b.y2}, ${b.x2 - 3} ${b.y2}`}
                      fill="none" stroke="var(--accent)" strokeWidth="1.3" opacity="0.5" markerEnd="url(#modal-beam-arrow)" />
                  );
                })}
                {beams[0] && <circle cx={beams[0].x1} cy={beams[0].y1} r="4" fill="var(--accent)" />}
              </svg>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "7px 10px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "6px 10px", color: "var(--text)" };
