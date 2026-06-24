"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import FloatingDetailModal, { type SourceRow } from "@/components/FloatingDetailModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { 
  Card, 
  LineChart,
  pct,
  ChartTip,
  ZoomButton
} from "@/components/app/widgets";
import {
  useContainerWidth,
  getBaseSpacing,
  hoverIndexFromPixels,
  shouldShowLabel
} from "@/lib/chart-utils";
import type { Event } from "@/lib/store/types";
import {
  rejectionRate,
  trend,
  periodsIn,
  periodKey,
  periodLabel,
  resolveScope,
  scopeEvents,
  totalChecked,
  totalRejected,
  type Scope
} from "@/lib/analytics";

const STAGE_LABELS: Record<string, string> = {
  visual: "Visual Inspection", "eye-punching": "Eye Punching", balloon: "Balloon Testing",
  "valve-integrity": "Valve Integrity", final: "Final Inspection",
};

function toSourceRows(events: Event[], filter: { stageId?: string; defectCode?: string; size?: string; types?: string[] } = {}): SourceRow[] {
  const out: SourceRow[] = [];
  for (const e of events as any[]) {
    if (filter.types && !filter.types.includes(e.eventType)) continue;
    if (filter.stageId && e.stageId !== filter.stageId) continue;
    if (filter.size && e.size !== filter.size) continue;
    if (filter.defectCode && e.defectCodeRaw !== filter.defectCode && e.defectCode !== filter.defectCode) continue;
    const prov = e.provenance ?? {};
    out.push({
      date: e.occurredOn?.start ?? "—",
      stage: STAGE_LABELS[e.stageId] ?? e.stageId ?? "—",
      size: e.size ?? null,
      type: e.eventType + (e.disposition ? `·${e.disposition}` : "") + (e.defectCodeRaw ? ` ${e.defectCodeRaw}` : ""),
      qty: e.quantity ?? e.statedValue ?? "—",
      file: prov.file ?? "Manual Entry",
      sheet: prov.sheet,
      cell: prov.cells?.[0] ?? "ENTRY",
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function XBarChart({ points, ucl, lcl, mean }: { points: any[]; ucl: number; lcl: number; mean: number }) {
  const [zoom, setZoom] = useState(1.0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const { t } = useTweaks();
  const { ref: containerRef, width: containerWidth } = useContainerWidth(660);
  const wrapperRef = useRef<HTMLDivElement>(null);

  if (!points || points.length === 0) {
    return <div className="muted" style={{ padding: "28px 8px", fontSize: 12, textAlign: "center" }}>No control chart points available.</div>;
  }

  const H = 272, padX = 40, padTop = 28, padBottom = 70;
  const axisY = H - padBottom, plotH = H - padTop - padBottom;
  const v = points.map((p) => p.value);
  const max = Math.max(...v, ucl, 0.05);

  const numPoints = points.length;
  const baseSpacing = getBaseSpacing(numPoints);
  const currentSpacing = baseSpacing * zoom;
  const totalNeededWidth = currentSpacing * Math.max(numPoints - 1, 1) + padX * 2;
  const isScrollable = totalNeededWidth > containerWidth;
  const canvasWidth = isScrollable ? totalNeededWidth : containerWidth;

  const spacing = isScrollable 
    ? currentSpacing 
    : (containerWidth - padX * 2) / Math.max(numPoints - 1, 1);

  const x = (i: number) => padX + i * spacing;
  const y = (val: number) => axisY - (val / (max || 1)) * plotH;

  const buffer = 10;
  const startIdx = isScrollable ? Math.max(0, Math.floor((scrollLeft - padX) / spacing) - buffer) : 0;
  const endIdx = isScrollable ? Math.min(numPoints - 1, Math.ceil((scrollLeft + containerWidth - padX) / spacing) + buffer) : numPoints - 1;

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey && wrapperRef.current) {
      wrapperRef.current.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = hoverIndexFromPixels(e.clientX, rect.left, padX, spacing, points.length);
    setHover(idx);
  };

  const visiblePoints = points.slice(startIdx, endIdx + 1);
  const pathD = visiblePoints.length > 1
    ? `M ${x(startIdx)} ${y(points[startIdx].value)} ` + visiblePoints.map((p, idx) => `L ${x(startIdx + idx)} ${y(p.value)}`).join(" ")
    : "";

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", minWidth: 0 }} onMouseLeave={() => setHover(null)}>
      {/* Zoom Controls */}
      <div style={{
        position: "absolute",
        right: 12,
        top: -12,
        zIndex: 40,
        display: "flex",
        gap: 4,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "2px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
      }}>
        <ZoomButton onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(4.0, z * 1.3)); }} title="Zoom In">+</ZoomButton>
        <ZoomButton onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.25, z / 1.3)); }} title="Zoom Out">−</ZoomButton>
        <ZoomButton onClick={(e) => { e.stopPropagation(); setZoom(1.0); }} title="Fit Viewport">FIT</ZoomButton>
      </div>

      <div 
        ref={wrapperRef}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        onWheel={handleWheel}
        style={{ 
          width: "100%", 
          overflowX: "auto", 
          position: "relative",
          scrollbarWidth: "thin",
        }}
      >
        <svg 
          width={canvasWidth} 
          height={H} 
          viewBox={`0 0 ${canvasWidth} ${H}`} 
          style={{ width: canvasWidth, height: H, display: "block" }}
          onMouseMove={handleMouseMove}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <line key={i} x1={padX} y1={padTop + plotH * p} x2={canvasWidth - padX} y2={padTop + plotH * p} stroke="var(--border)" strokeWidth={0.5} />
          ))}
          <line x1={padX} y1={axisY} x2={canvasWidth - padX} y2={axisY} stroke="var(--border-strong)" strokeWidth={1} />

          <line x1={padX} y1={y(lcl)} x2={canvasWidth - padX} y2={y(lcl)} stroke="var(--positive)" strokeDasharray="3,3" strokeWidth={1.2} />
          <text x={padX + 6} y={y(lcl) - 5} fontSize={11} fill="var(--positive)" fontWeight={800}>LCL ({(lcl * 100).toFixed(2)}%)</text>
          <line x1={padX} y1={y(mean)} x2={canvasWidth - padX} y2={y(mean)} stroke="var(--warning)" strokeDasharray="5,4" strokeWidth={1.2} />
          <text x={padX + 6} y={y(mean) - 5} fontSize={11} fill="var(--warning)" fontWeight={800}>MEAN ({(mean * 100).toFixed(2)}%)</text>
          <line x1={padX} y1={y(ucl)} x2={canvasWidth - padX} y2={y(ucl)} stroke="var(--critical)" strokeDasharray="3,3" strokeWidth={1.2} />
          <text x={padX + 6} y={y(ucl) - 5} fontSize={11} fill="var(--critical)" fontWeight={800}>UCL ({(ucl * 100).toFixed(2)}%)</text>

          {pathD && (
            <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={2} />
          )}

          {/* Hover Crosshairs */}
          {hover != null && (
            <g>
              <line x1={x(hover)} y1={padTop} x2={x(hover)} y2={axisY} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
              <line x1={padX} y1={y(points[hover].value)} x2={canvasWidth - padX} y2={y(points[hover].value)} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3,3" />
            </g>
          )}

          {points.map((p, i) => {
            if (i < startIdx || i > endIdx) return null;
            const isOut = p.value > ucl || p.value < lcl;
            return (
              <g key={i}>
                <circle cx={x(i)} cy={y(p.value)} r={4} fill={isOut ? "var(--critical)" : "var(--surface)"} stroke={isOut ? "var(--critical)" : "var(--accent)"} strokeWidth={2.5} />
              </g>
            );
          })}

          {/* Rotated thinned date labels */}
          {points.map((p, i) => {
            if (i < startIdx || i > endIdx) return null;
            const show = shouldShowLabel(p.label, i, points.map(pt => pt.label), spacing, t.grain);
            if (!show) return null;
            return (
              <text key={`xl${i}`} x={x(i)} y={axisY + 10} fontSize={11.5} fontWeight={600} textAnchor="end" fill="var(--text-2)" fontFamily="var(--font-sans)" transform={`rotate(-90 ${x(i)} ${axisY + 10})`}>{p.label}</text>
            );
          })}
        </svg>

        {hover != null && (
          <ChartTip 
            leftPx={x(hover)} 
            topPx={y(points[hover].value)} 
            below={y(points[hover].value) < H * 0.32} 
            title={points[hover].label} 
            rows={[
              { label: "Rate", value: `${(points[hover].value * 100).toFixed(2)}%`, color: "var(--accent)" },
              { label: "Status", value: (points[hover].value > ucl || points[hover].value < lcl) ? "Out of Control" : "In Control", color: (points[hover].value > ucl || points[hover].value < lcl) ? "var(--critical)" : "var(--positive)" }
            ]} 
          />
        )}
      </div>
    </div>
  );
}

export default function SpcPage() {
  const { t } = useTweaks();
  const { events: contextEvents, isLoading } = useEvents();
  const events = contextEvents ? (contextEvents as any[]) : null;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [rawSheets, setRawSheets] = useState<any[] | undefined>(undefined);

  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: { rows: SourceRow[]; value: string }
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
    setModalOpen(true);
  };

  useEffect(() => {
    // Load stashed raw sheets if any are available in sessionStorage
    try {
      let activeId = sessionStorage.getItem("rais_active_session_id");
      if (!activeId) {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith("rais_raw_")) {
            activeId = key.substring("rais_raw_".length);
            break;
          }
        }
      }
      if (activeId) {
        const stored = sessionStorage.getItem(`rais_raw_${activeId}`);
        if (stored) setRawSheets(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, []);

  const scope: Scope = useMemo(
    () => resolveScope(events ?? [], t),
    [events, t.grain, t.datePreset, t.dateFrom, t.dateTo, t.stageView],
  );

  const srcRows = (filter: Parameters<typeof toSourceRows>[1] = {}): SourceRow[] =>
    events ? toSourceRows(scopeEvents(events, scope), filter) : [];

  const m = useMemo(() => {
    if (!events || events.length === 0) return null;

    const allPeriods = periodsIn(events, t.grain);
    const latestPeriod = allPeriods[allPeriods.length - 1];

    const tr = trend(events, scope);

    // Compute SPC limits (UCL / Mean / LCL) based on historical rejection rates
    // Mean = avg rejection rate, StdDev = sqrt(p * (1-p) / n) where n is average checked per period
    const rates = tr.map((p) => p.value);
    const mean = rates.reduce((sum, val) => sum + val, 0) / rates.length;
    
    // Sum total checked and total rejected in scope to get n
    const checked = totalChecked(events, scope).value;
    const rejected = totalRejected(events, scope).value;
    const overallRate = checked > 0 ? rejected / checked : 0;
    
    const avgCheckedPerPeriod = checked / tr.length;
    const stdDev = avgCheckedPerPeriod > 0 ? Math.sqrt((overallRate * (1 - overallRate)) / avgCheckedPerPeriod) : 0;
    
    const ucl = Math.min(1.0, overallRate + 3 * stdDev);
    const lcl = Math.max(0.0, overallRate - 3 * stdDev);

    // Rule violations
    let r1 = 0; // Out of UCL/LCL
    let r2 = 0; // 9 consecutive points on same side of mean
    let r3 = 0; // 6 consecutive points in trend

    // Count Rule 1 violations
    for (const r of rates) {
      if (r > ucl || r < lcl) r1++;
    }

    // Rule 2 check
    let consecSameSide = 0;
    let prevSide: "above" | "below" | null = null;
    for (const r of rates) {
      const currentSide = r >= overallRate ? "above" : "below";
      if (currentSide === prevSide) {
        consecSameSide++;
        if (consecSameSide >= 9) r2++;
      } else {
        prevSide = currentSide;
        consecSameSide = 1;
      }
    }

    // Rule 3 check (6 points in a row steadily increasing or decreasing)
    let consecTrend = 0;
    let prevDiff = 0;
    for (let i = 1; i < rates.length; i++) {
      const diff = rates[i] - rates[i - 1];
      const sameDirection = (diff > 0 && prevDiff > 0) || (diff < 0 && prevDiff < 0);
      if (sameDirection) {
        consecTrend++;
        if (consecTrend >= 5) r3++; // 5 differences is 6 consecutive points
      } else {
        prevDiff = diff;
        consecTrend = 1;
      }
    }

    return {
      tr,
      ucl,
      mean: overallRate,
      lcl,
      r1,
      r2,
      r3,
      latestPeriodLabel: latestPeriod ? periodLabel(latestPeriod) : ""
    };
  }, [events, scope, t.grain]);

  return (
    <AppShell active="spc" dateRange={m?.latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            SPC &amp; Control Charts
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Monitor statistical process control limits (UCL, LCL) and track quality shift deviations.
          </p>
        </div>

        {isLoading && (
          <PageLoader message="Running statistical analysis..." minHeight="40vh" />
        )}

        {!isLoading && (!events || events.length === 0) && (
          <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, marginBottom: 8, color: "var(--text)" }}>
              No Data Available
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>
              Please upload monthly inspection workbooks in Staging &amp; Review to populate these metrics.
            </p>
            <a
              href="/staging"
              style={{
                display: "inline-block", textDecoration: "none", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12.5,
                color: "var(--paper)", background: "var(--accent)", border: "none",
                padding: "8px 16px", borderRadius: "var(--radius-md)", cursor: "pointer"
              }}
            >
              Go to Staging &amp; Review →
            </a>
          </div>
        )}

        {m && m.tr.length > 0 ? (() => {
          const outOfControl = m.r1 > 0 || m.r2 > 0 || m.r3 > 0;
          const modalText = outOfControl
            ? `Process instability detected! Violations: Rule 1 (Outside UCL/LCL): ${m.r1}, Rule 2 (9 points same side of mean): ${m.r2}, Rule 3 (6 points trend): ${m.r3}. Immediate engineering audit recommended.`
            : `Process is in statistical control. UCL: ${(m.ucl * 100).toFixed(2)}%, Mean: ${(m.mean * 100).toFixed(2)}%, LCL: ${(m.lcl * 100).toFixed(2)}%.`;

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.2fr) minmax(0, 0.8fr)", gap: 20 }}>
                <Card title={`X-Bar Control Chart (${t.grain.toUpperCase()} Rejection Rate)`} onClick={() => openModal("Control Chart", modalText, <div style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center" }}><XBarChart points={m.tr} ucl={m.ucl} lcl={m.lcl} mean={m.mean} /></div>, { rows: srcRows({ types: ["production", "inspection"] }), value: pct(m.mean) })}>
                  <XBarChart points={m.tr} ucl={m.ucl} lcl={m.lcl} mean={m.mean} />
                </Card>

                <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                  <Card title="SPC Control Limits">
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "10px 0" }}>
                      <div className="between">
                        <span className="muted" style={{ fontSize: 12 }}>Upper Control Limit (UCL)</span>
                        <strong className="num" style={{ color: "var(--critical)" }}>{(m.ucl * 100).toFixed(2)}%</strong>
                      </div>
                      <div className="between">
                        <span className="muted" style={{ fontSize: 12 }}>Center Line (Mean)</span>
                        <strong className="num" style={{ color: "var(--warning)" }}>{(m.mean * 100).toFixed(2)}%</strong>
                      </div>
                      <div className="between">
                        <span className="muted" style={{ fontSize: 12 }}>Lower Control Limit (LCL)</span>
                        <strong className="num" style={{ color: "var(--positive)" }}>{(m.lcl * 100).toFixed(2)}%</strong>
                      </div>
                    </div>
                  </Card>

                  <Card title="Western Electric Rules">
                    <div style={{ fontSize: 12, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.r1 > 0 ? "var(--critical)" : "var(--positive)" }} />
                        <span>Rule 1: Outside 3-sigma ({m.r1} violated)</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.r2 > 0 ? "var(--warning)" : "var(--positive)" }} />
                        <span>Rule 2: 9 points on one side ({m.r2} violated)</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.r3 > 0 ? "var(--warning)" : "var(--positive)" }} />
                        <span>Rule 3: 6 points increasing/decreasing ({m.r3} violated)</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              <Card title="SPC Interpretation & Recommended Actions">
                <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13, lineHeight: 1.6 }}>
                  {outOfControl ? (
                    <>
                      <div style={{ borderLeft: "3px solid var(--critical)", paddingLeft: 12, background: "var(--accent-weak)", padding: 12, borderRadius: "var(--radius-sm)" }}>
                        <strong style={{ color: "var(--critical)", display: "block", marginBottom: 4 }}>⚠️ PROCESS OUT OF STATISTICAL CONTROL</strong>
                        Special-cause variation detected. The quality metrics oscillate heavily and show non-random patterns violating Western Electric control rules.
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                        {m.r1 > 0 && (
                          <li>
                            <strong>Rule 1 Violation (Outside Limits):</strong> {m.r1} period(s) fell outside the 3-sigma limits (UCL/LCL). This suggests sudden shifts or extreme outliers in production quality. <em>Recommended Action:</em> Perform immediate machine calibration checks and material QC audits.
                          </li>
                        )}
                        {m.r2 > 0 && (
                          <li>
                            <strong>Rule 2 Violation (Process Shift):</strong> {m.r2} run(s) of 9 consecutive points on one side of the mean. This indicates a sustained process average shift. <em>Recommended Action:</em> Inspect batch tooling adjustments, operator consistency, or setup parameter shifts.
                          </li>
                        )}
                        {m.r3 > 0 && (
                          <li>
                            <strong>Rule 3 Violation (Trending Deviation):</strong> {m.r3} run(s) of 6 consecutive points steadily increasing or decreasing. This suggests gradual tool wear or calibration decay. <em>Recommended Action:</em> Schedule preventive maintenance and check guide pins/temperature controls.
                          </li>
                        )}
                      </ul>
                    </>
                  ) : (
                    <div style={{ borderLeft: "3px solid var(--positive)", paddingLeft: 12, background: "var(--positive-weak)", padding: 12, borderRadius: "var(--radius-sm)" }}>
                      <strong style={{ color: "var(--positive)", display: "block", marginBottom: 4 }}>✓ PROCESS IN STATISTICAL CONTROL</strong>
                      Rejection rates exhibit only common-cause (random) variation. All periods fall within the 3-sigma control limits and conform to normal distribution criteria. Continue standard monitoring.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          );
        })() : m && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            No control chart data available for the selected range.
          </div>
        )}
      </div>

      <FloatingDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        insight={modalInsight}
        sourceRows={modalSourceRows}
        primaryValue={modalPrimaryValue}
        rawSheets={rawSheets}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
