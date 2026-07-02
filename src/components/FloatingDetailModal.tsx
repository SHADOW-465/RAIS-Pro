"use client";

import React, { useState, useRef, useLayoutEffect, useCallback, useEffect, useMemo } from "react";
import Icon from "@/components/editorial/Icon";
import type { RawSheet } from "@/types/dashboard";

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
  /** The raw workbook sheets to render original Excel schema */
  rawSheets?: RawSheet[];
}

interface Beam { x1: number; y1: number; x2: number; y2: number; key: string }

function colIndexToLabel(idx: number): string {
  let label = "";
  let temp = idx;
  while (temp >= 0) {
    label = String.fromCharCode((temp % 26) + 65) + label;
    temp = Math.floor(temp / 26) - 1;
  }
  return label;
}

export default function FloatingDetailModal({
  isOpen,
  onClose,
  title,
  insight,
  children,
  primaryValue,
  sourceRows,
  rawSheets,
}: FloatingDetailModalProps) {
  const [showSource, setShowSource] = useState(false);
  const [isInsightExpanded, setIsInsightExpanded] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [beams, setBeams] = useState<Beam[]>([]);

  // Find sheets that contributed to this metric based on sourceRows
  const contributingSheets = useMemo(() => {
    if (!sourceRows) return [];
    const sheets = new Set<string>();
    sourceRows.forEach(r => {
      if (r.sheet) sheets.add(r.sheet);
    });
    return Array.from(sheets);
  }, [sourceRows]);

  // Find raw sheets matching contributing sheets
  const activeRawSheets = useMemo(() => {
    if (!rawSheets || contributingSheets.length === 0) return [];
    return rawSheets.filter(s => 
      contributingSheets.some(cs => {
        const cleanS = s.name.toLowerCase().trim();
        const cleanCs = cs.toLowerCase().trim();
        return cleanS === cleanCs || cleanS.endsWith(cleanCs) || cleanCs.endsWith(cleanS);
      })
    );
  }, [rawSheets, contributingSheets]);

  const [activeTab, setActiveTab] = useState<string>("");

  // Set default tab on open or change
  useEffect(() => {
    if (activeRawSheets.length > 0) {
      setActiveTab(activeRawSheets[0].name);
    } else {
      setActiveTab("");
    }
  }, [activeRawSheets]);

  // Reset the source view whenever the modal opens for a new metric.
  useEffect(() => {
    if (!isOpen) {
      setShowSource(false);
    }
  }, [isOpen]);

  // Escape closes; page behind stays put (scroll lock) while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

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

    if (activeRawSheets.length > 0) {
      // Draw beams to visible highlighted cells
      let beamCount = 0;
      cellRefs.current.forEach((el, key) => {
        if (beamCount >= 15) return; // Limit beams to keep it clean
        const r = el.getBoundingClientRect();
        // Clip beams whose cell is scrolled out of the source table viewport.
        if (scroll && (r.top + r.height / 2 < scroll.top || r.top + r.height / 2 > scroll.bottom)) return;
        next.push({
          key: `b-${key}`,
          x1: fromX,
          y1: fromY,
          x2: r.left - base.left,
          y2: r.top + r.height / 2 - base.top,
        });
        beamCount++;
      });
    } else {
      // Fallback: draw beams to rows
      rowRefs.current.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (scroll && (r.top + r.height / 2 < scroll.top || r.top + r.height / 2 > scroll.bottom)) return;
        next.push({
          key: `b-${i}`,
          x1: fromX,
          y1: fromY,
          x2: r.left - base.left,
          y2: r.top + r.height / 2 - base.top,
        });
      });
    }
    setBeams(next);
  }, [showSource, activeRawSheets, activeTab]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(computeBeams);
    return () => cancelAnimationFrame(id);
  }, [isOpen, showSource, computeBeams, visibleRows.length, activeTab]);

  useEffect(() => {
    if (!showSource) return;
    let raf = 0;
    const handler = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(computeBeams); };
    const scroller = tableScrollRef.current;
    scroller?.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
    return () => { cancelAnimationFrame(raf); scroller?.removeEventListener("scroll", handler); window.removeEventListener("resize", handler); };
  }, [showSource, computeBeams, activeTab]);

  // Clear cellRefs on tab change
  useEffect(() => {
    cellRefs.current.clear();
  }, [activeTab]);

  if (!isOpen) return null;
  const insights = Array.isArray(insight) ? insight : [insight];

  return (
    <div
      className="modal-backdrop"
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(18,16,14,0.55)", zIndex: 1000, display: "grid", placeItems: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-panel"
        style={{
          width: "98vw",
          maxWidth: showSource ? 1640 : 1320,
          background: "var(--bg)",
          border: "1.5px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 50px -12px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "96vh",
          overflow: "hidden",
          transition: "max-width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {/* Title bar — slim */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, background: "var(--accent)", color: "var(--text-invert)", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>RAIS</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{title}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasSource && (
              <button
                onClick={() => setShowSource((s) => !s)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: "var(--radius-sm)",
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
              {/* Collapsible AI Insights panel */}
              {insights.filter(Boolean).length > 0 && (
                <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)", overflow: "hidden" }}>
                  <div
                    onClick={() => setIsInsightExpanded(prev => !prev)}
                    style={{
                      padding: "10px 14px",
                      background: "var(--surface-2)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      userSelect: "none",
                      borderBottom: isInsightExpanded ? "1px solid var(--border)" : "none"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                      <Icon name="spark" size={13} style={{ color: "var(--accent)" }} />
                      <span>AI Advisory Insights</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span className="muted" style={{ fontSize: 11 }}>{isInsightExpanded ? "Collapse" : "Expand"}</span>
                      <Icon name={isInsightExpanded ? "chevron-up" : "chevron-down"} size={14} />
                    </div>
                  </div>
                  {isInsightExpanded && (
                    <div style={{ padding: "14px 18px", background: "var(--accent-weak)", display: "flex", flexDirection: "column", gap: 8 }}>
                      {insights.filter(Boolean).map((item, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: 12, lineHeight: 1.5, flexShrink: 0 }}>›</span>
                          <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* SOURCE TRACE: computed value ⟶ source schema rows, beam-connected */}
              <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 28, alignItems: "start" }}>
                <div ref={anchorRef} style={{ position: "sticky", top: 0, border: "1px solid var(--accent)", borderRadius: "var(--radius-md)", background: "var(--surface)", padding: "16px 18px" }}>
                  <span className="eyebrow accent" style={{ fontWeight: 700, fontSize: 10.5 }}>Computed value</span>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 800, color: "var(--accent)", margin: "6px 0 4px", wordBreak: "break-word" }}>{primaryValue ?? "—"}</div>
                  <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: "0 0 14px" }}>
                    Traced to <strong style={{ color: "var(--text)" }}>{(sourceRows ?? []).length.toLocaleString()}</strong> source record{(sourceRows ?? []).length === 1 ? "" : "s"} below.
                  </p>
                  <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 12, fontSize: 11.5, lineHeight: 1.5, color: "var(--text-2)" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 700, color: "var(--status-good)", marginBottom: 6 }}>
                      <Icon name="check" size={12} stroke={3} />
                      <span>Excel Schema Verified</span>
                    </div>
                    Beams map this computed value directly to the exact file, sheet, row, and column letters in the staged Excel schema.
                  </div>
                </div>

                <div>
                  {activeRawSheets.length > 0 ? (
                    <div>
                      {/* Sheet Tabs */}
                      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
                        {activeRawSheets.map((s) => {
                          const sheetLabel = s.name.split(" - ").slice(-1)[0];
                          const isActive = s.name === activeTab;
                          return (
                            <button
                              key={s.name}
                              onClick={() => setActiveTab(s.name)}
                              style={{
                                padding: "6px 12px",
                                borderRadius: "var(--radius-sm)",
                                fontSize: 11.5,
                                fontWeight: 700,
                                cursor: "pointer",
                                border: `1px solid ${isActive ? "var(--accent)" : "var(--border-strong)"}`,
                                background: isActive ? "var(--accent)" : "var(--surface)",
                                color: isActive ? "var(--text-invert)" : "var(--text-2)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {sheetLabel}
                            </button>
                          );
                        })}
                      </div>

                      {activeRawSheets.map((sheet) => {
                        if (sheet.name !== activeTab) return null;
                        const visibleSheetRows = sheet.rows.slice(0, 100);

                        return (
                          <div key={sheet.name} className="fade-up">
                            <span className="eyebrow" style={{ fontWeight: 700, fontSize: 10.5, color: "var(--text-3)", display: "block", marginBottom: 6 }}>
                              Excel spreadsheet schema (staged workbook)
                            </span>
                            <div ref={tableScrollRef} style={{ maxHeight: "68vh", overflow: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead style={{ position: "sticky", top: 0, background: "var(--surface-2)", zIndex: 10 }}>
                                  <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                    <th style={{ ...th, width: 40, borderRight: "1px solid var(--border-strong)", textAlign: "center" }}>#</th>
                                    {sheet.columns.map((col, cIdx) => {
                                      const colLetter = sheet.colLetters?.[col] || colIndexToLabel(cIdx);
                                      const isColumnUsed = sourceRows?.some(r => 
                                        r.sheet === sheet.name && 
                                        (r.cell.includes(`!${colLetter}`) || r.cell.endsWith(`!${colLetter}`))
                                      );
                                      return (
                                        <th key={col} style={{ ...th, background: isColumnUsed ? "var(--accent-weak)" : "var(--surface-2)", color: isColumnUsed ? "var(--accent)" : "var(--text-3)" }}>
                                          <div style={{ display: "flex", flexDirection: "column" }}>
                                            <span style={{ fontSize: 9, opacity: 0.7, fontFamily: "var(--font-mono)" }}>{colLetter}</span>
                                            <span style={{ whiteSpace: "nowrap" }}>{col}</span>
                                          </div>
                                        </th>
                                      );
                                    })}
                                  </tr>
                                </thead>
                                <tbody>
                                  {visibleSheetRows.map((row, rIdx) => {
                                    const rowNum = (row.__rowNum as number) || rIdx + 1;
                                    return (
                                      <tr key={rIdx} style={{ borderTop: "1px solid var(--border)" }}>
                                        <td style={{ ...td, width: 40, textAlign: "center", fontFamily: "var(--font-mono)", borderRight: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--text-3)" }}>
                                          {rowNum}
                                        </td>
                                        {sheet.columns.map((col, cIdx) => {
                                          const colLetter = sheet.colLetters?.[col] || colIndexToLabel(cIdx);
                                          const shortSheetName = sheet.name.split(" - ").slice(-1)[0];
                                          const cellRef1 = `${sheet.name}!${colLetter}${rowNum}`;
                                          const cellRef2 = `${shortSheetName}!${colLetter}${rowNum}`;

                                          const matchingSource = sourceRows?.find(r => 
                                            r.cell === cellRef1 || 
                                            r.cell === cellRef2 ||
                                            (r.sheet === sheet.name && r.cell.endsWith(`${colLetter}${rowNum}`)) ||
                                            (r.sheet === shortSheetName && r.cell.endsWith(`${colLetter}${rowNum}`))
                                          );
                                          
                                          const isHighlighted = !!matchingSource;
                                          const cellKey = `${sheet.name}-${colLetter}-${rowNum}`;

                                          return (
                                            <td
                                              key={col}
                                              ref={(el) => {
                                                if (el && isHighlighted) {
                                                  cellRefs.current.set(cellKey, el);
                                                } else {
                                                  cellRefs.current.delete(cellKey);
                                                }
                                              }}
                                              style={{
                                                ...td,
                                                background: isHighlighted ? "var(--accent-weak)" : "transparent",
                                                color: isHighlighted ? "var(--accent)" : "var(--text)",
                                                fontWeight: isHighlighted ? 700 : 400,
                                                border: isHighlighted ? "1px solid var(--accent)" : "none",
                                                fontFamily: typeof row[col] === "number" ? "var(--font-mono)" : "var(--font-sans)",
                                                textAlign: typeof row[col] === "number" ? "right" : "left",
                                                whiteSpace: "nowrap",
                                              }}
                                              title={isHighlighted ? `Qty: ${matchingSource.qty} (${matchingSource.type})\nCell: ${matchingSource.cell}` : undefined}
                                            >
                                              {String(row[col] ?? "")}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {sheet.rows.length > 100 && (
                              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                                Showing first 100 rows of {sheet.rows.length} rows in {sheet.name}.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <span className="eyebrow" style={{ fontWeight: 700, fontSize: 10.5, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Source records (provenance)</span>
                      <div ref={tableScrollRef} style={{ maxHeight: "72vh", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
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
                    </>
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

const th: React.CSSProperties = { padding: "8px 12px", fontWeight: 800, fontSize: 11 };
const td: React.CSSProperties = { padding: "8px 12px", color: "var(--text)" };

