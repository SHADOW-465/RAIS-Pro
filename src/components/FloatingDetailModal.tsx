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
  fileHash?: string | null; // content hash into raw_files — lets Verify Mode
                             // fetch this file's bytes even if it wasn't part
                             // of the CURRENT browser session's upload
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
  /** Optional rect of the element that triggered the modal for FLIP transitions */
  originRect?: DOMRect | null;
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

/** Parse a provenance ref ("SHEET!D7") into exact parts. Loose endsWith
 *  matching is forbidden here: "…!AD7".endsWith("D7") and sheet "4FR" vs
 *  "14FR" both false-positive, lighting up the wrong cells. */
const A1_REF = /^(.+)!([A-Z]+)(\d+)$/;
function parseRef(cell: string): { sheet: string; col: string; row: number } | null {
  const m = A1_REF.exec(cell);
  return m ? { sheet: m[1].trim().toLowerCase(), col: m[2], row: Number(m[3]) } : null;
}

/** True when a RawSheet (named "<file> - <sheet>") IS the given bare sheet.
 *  Strips the known fileName prefix rather than suffix-matching, then compares
 *  TRIMMED names — real workbooks contain sheets like " MAY 25" whose leading
 *  space breaks any raw string comparison. */
function rawSheetMatches(raw: { name: string; fileName: string }, bareSheet: string): boolean {
  const bare = raw.name.startsWith(`${raw.fileName} - `)
    ? raw.name.slice(raw.fileName.length + 3)
    : raw.name;
  return bare.trim().toLowerCase() === bareSheet.trim().toLowerCase();
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
  originRect,
}: FloatingDetailModalProps) {
  const [showSource, setShowSource] = useState(false);
  const [isInsightExpanded, setIsInsightExpanded] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [beams, setBeams] = useState<Beam[]>([]);

  // FLIP Transition logic using Web Animations API
  useEffect(() => {
    if (isOpen && originRect && panelRef.current) {
      const panel = panelRef.current;
      const targetRect = panel.getBoundingClientRect();
      const scaleX = originRect.width / targetRect.width;
      const scaleY = originRect.height / targetRect.height;
      const transX = originRect.left - targetRect.left;
      const transY = originRect.top - targetRect.top;

      panel.animate([
        { transform: `translate(${transX}px, ${transY}px) scale(${scaleX}, ${scaleY})`, transformOrigin: 'top left', opacity: 0, borderRadius: 'var(--radius-lg)' },
        { transform: `translate(0, 0) scale(1)`, transformOrigin: 'top left', opacity: 1, borderRadius: 'var(--radius-lg)' }
      ], {
        duration: 500,
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", // Soft spring overshoot
        fill: "forwards"
      });
    }
  }, [isOpen, originRect]);

  // rawSheets (prop) only ever holds the CURRENT browser session's cached
  // upload — sourceRows can span the full historical ledger, built from
  // files uploaded in past sessions. Those files' bytes are archived
  // durably in raw_files, keyed by the fileHash every event already carries
  // (see /api/archive-upload, /api/raw-file). Fetch+parse whichever
  // contributing files aren't already covered, on demand, so "View Source"
  // reconstructs the real worksheet for ledger-wide metrics too, not just
  // the last-uploaded file.
  const [fetchedRawSheets, setFetchedRawSheets] = useState<RawSheet[]>([]);
  const fetchingHashes = useRef<Set<string>>(new Set());

  const allRawSheets = useMemo(() => [...(rawSheets ?? []), ...fetchedRawSheets], [rawSheets, fetchedRawSheets]);

  useEffect(() => {
    if (!showSource || !sourceRows) return;
    // Compare by BASENAME: seeded events carry full paths ("DATA/VISUAL/1
    // APRIL 25.xlsx") while session RawSheets carry File.name basenames —
    // a raw string compare re-fetches the same workbook and duplicates every
    // sheet tab in the source dropdown.
    const base = (p: string) => p.split(/[\\/]/).pop()!.toLowerCase();
    const covered = new Set(allRawSheets.map((s) => base(s.fileName)));
    const toFetch = new Map<string, string>(); // fileHash -> file name
    for (const r of sourceRows) {
      if (!r.fileHash || !r.file || covered.has(base(r.file)) || fetchingHashes.current.has(r.fileHash)) continue;
      toFetch.set(r.fileHash, r.file);
    }
    if (toFetch.size === 0) return;

    (async () => {
      const { parseWorkbookBuffer } = await import("@/lib/parser");
      for (const [hash, fileName] of toFetch) {
        fetchingHashes.current.add(hash);
        try {
          const res = await fetch(`/api/raw-file?hash=${encodeURIComponent(hash)}`);
          if (!res.ok) continue; // best-effort — falls back to the flat provenance table
          const buf = await res.arrayBuffer();
          const { rawSheets: parsed } = parseWorkbookBuffer(buf, fileName);
          setFetchedRawSheets((prev) => {
            const have = new Set(prev.map((s) => s.name.toLowerCase()));
            return [...prev, ...parsed.filter((s) => !have.has(s.name.toLowerCase()))];
          });
        } catch {
          // best-effort — never blocks the modal
        }
      }
    })();
  }, [showSource, sourceRows, allRawSheets]);

  // Find sheets that contributed to this metric based on sourceRows
  const contributingSheets = useMemo(() => {
    if (!sourceRows) return [];
    const sheets = new Set<string>();
    sourceRows.forEach(r => {
      if (r.sheet) sheets.add(r.sheet);
    });
    return Array.from(sheets);
  }, [sourceRows]);

  // Find raw sheets matching contributing sheets (exact bare-name match on the
  // "<file> - <sheet>" suffix — loose endsWith made "4FR" claim "14FR"/"24FR").
  const activeRawSheets = useMemo(() => {
    if (allRawSheets.length === 0 || contributingSheets.length === 0) return [];
    return allRawSheets.filter(s => contributingSheets.some(cs => rawSheetMatches(s, cs)));
  }, [allRawSheets, contributingSheets]);

  // Tab label: bare stage stem, UNLESS more than one contributing raw sheet
  // shares that stem (a metric aggregated across several monthly files) —
  // then disambiguate by source file so tabs are never visually duplicated.
  const sheetLabel = useCallback((s: RawSheet) => {
    const stem = s.name.split(" - ").slice(-1)[0];
    const collisions = activeRawSheets.filter((x) => x.name.split(" - ").slice(-1)[0] === stem).length;
    return collisions > 1 ? `${stem} — ${s.fileName}` : stem;
  }, [activeRawSheets]);

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

  const insights = Array.isArray(insight) ? insight : [insight];

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(10, 9, 8, 0.88)",
        backdropFilter: "blur(20px)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 24,
        opacity: isOpen ? 1 : 0,
        visibility: isOpen ? "visible" : "hidden",
        transition: "opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.45s cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        className="modal-panel"
        style={{
          width: "95vw",
          maxWidth: showSource ? 1720 : 1440,
          height: "92vh",
          background: "var(--bg)",
          border: "1.5px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 30px 60px -15px rgba(0,0,0,0.65)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "92vh",
          overflow: "hidden",
          opacity: isOpen && !originRect ? 1 : (originRect ? undefined : 0),
          transform: isOpen && !originRect ? "translateY(0) scale(1)" : (originRect ? undefined : "translateY(24px) scale(0.985)"),
          transition: originRect ? "max-width var(--duration-medium) var(--ease-out)" : "max-width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Title bar — transparent / no borders */}
        <div style={{ padding: "24px 28px 12px", background: "transparent", borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, background: "var(--accent)", color: "var(--text-invert)", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>RAIS</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{title}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {hasSource && (
              <button
                onClick={() => setShowSource((s) => !s)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 18px",
                  borderRadius: "9999px",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: `1.5px solid ${showSource ? "var(--accent)" : "var(--border-strong)"}`,
                  background: showSource ? "var(--accent)" : "var(--surface)",
                  color: showSource ? "var(--text-invert)" : "var(--text)",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.18)",
                  transition: "all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
                }}
              >
                <Icon name="search" size={12} /> {showSource ? "Hide Source" : "View Source"}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "var(--surface)",
                border: "1.5px solid var(--border-strong)",
                color: "var(--text-2)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                padding: 8,
                borderRadius: "50%",
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.18)",
                transition: "all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "var(--surface-3)";
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "var(--surface)";
                e.currentTarget.style.transform = "none";
              }}
            >
              <Icon name="plus" size={14} style={{ transform: "rotate(45deg)" }} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={containerRef} style={{ position: "relative", flex: 1, overflowY: "auto", padding: "12px 28px 28px" }}>
          {!showSource ? (
            <>
              {/* Chart big, full width — full bleed, no border */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 450 }}>
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
                      {/* Sheet Select Dropdown */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          Source File:
                        </span>
                        <select
                          value={activeTab}
                          onChange={(e) => setActiveTab(e.target.value)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-strong)",
                            background: "var(--surface)",
                            color: "var(--text)",
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: "pointer",
                            outline: "none",
                            fontFamily: "var(--font-sans)",
                          }}
                        >
                          {activeRawSheets.map((s) => (
                            <option key={s.name} value={s.name} style={{ background: "var(--surface)", color: "var(--text)" }}>
                              {sheetLabel(s)}
                            </option>
                          ))}
                        </select>
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
                                      const isColumnUsed = sourceRows?.some(r => {
                                        const ref = parseRef(r.cell);
                                        return ref && ref.col === colLetter && rawSheetMatches(sheet, ref.sheet);
                                      });
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
                                          const matchingSource = sourceRows?.find(r => {
                                            const ref = parseRef(r.cell);
                                            return ref && ref.col === colLetter && ref.row === rowNum && rawSheetMatches(sheet, ref.sheet);
                                          });

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
                      fill="none" stroke="var(--accent)" strokeWidth="1.3" opacity="0.5" markerEnd="url(#modal-beam-arrow)"
                      pathLength="1" className="draw-line" style={{ animationDuration: "0.6s" }} />
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

