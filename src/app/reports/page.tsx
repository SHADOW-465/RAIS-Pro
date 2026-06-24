"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
import { Card } from "@/components/app/widgets";
import Icon from "@/components/editorial/Icon";
import {
  rejectionRate,
  totalRejected,
  totalChecked,
  fpy,
  byStage,
  byDefect,
  trustScore,
} from "@/lib/analytics";
import type { Event } from "@/lib/store/types";

export default function ReportsPage() {
  const { events: contextEvents, isLoading } = useEvents();
  const events = contextEvents ?? [];

  const m = useMemo(() => {
    if (events.length === 0) return null;
    const scope = { grain: "month" as const };
    const rate = rejectionRate(events, scope).value;
    const rejected = totalRejected(events, scope).value;
    const checked = totalChecked(events, scope).value;
    const fpyVal = fpy(events, scope).value;
    const stages = byStage(events, scope);
    const defects = byDefect(events, scope);
    const trust = trustScore(events, scope);

    return {
      rate,
      rejected,
      checked,
      fpy: fpyVal,
      stages,
      defects,
      trust,
    };
  }, [events]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (events.length === 0) return;

    // 1. Map event comments
    const commentsMap = new Map<string, string[]>();
    events.forEach((e) => {
      if (e.eventType === "annotation") {
        const ann = e as any;
        if (ann.targetEventIds) {
          ann.targetEventIds.forEach((tid: string) => {
            const arr = commentsMap.get(tid) ?? [];
            if (ann.text) {
              arr.push(ann.text);
            }
            commentsMap.set(tid, arr);
          });
        }
      }
    });

    // 2. Group events by Date, Stage, Size
    interface GroupData {
      date: string;
      stageId: string;
      size: string;
      checked: number;
      rejected: number;
      accepted: number;
      defects: Record<string, number>;
      comments: Set<string>;
    }

    const groups: Record<string, GroupData> = {};

    events.forEach((e) => {
      if (e.eventType === "annotation" || e.eventType === "correction") {
        return;
      }

      const date = e.occurredOn?.start ? e.occurredOn.start.slice(0, 10) : e.recordedAt.slice(0, 10);
      const stageId = (e as any).stageId || "general";
      const size = (e as any).size || "N/A";

      const key = `${date}_${stageId}_${size}`;
      if (!groups[key]) {
        groups[key] = {
          date,
          stageId,
          size,
          checked: 0,
          rejected: 0,
          accepted: 0,
          defects: {},
          comments: new Set<string>(),
        };
      }

      const g = groups[key];

      if (e.eventType === "production") {
        g.checked += e.quantity;
      } else if (e.eventType === "inspection") {
        if ((e as any).disposition === "accepted") {
          g.accepted += e.quantity;
        } else if ((e as any).disposition === "rejected") {
          g.rejected += e.quantity;
        }
      } else if (e.eventType === "rejection") {
        const defectLabel = (e as any).defectCodeRaw || (e as any).defectCode || "Unknown";
        g.defects[defectLabel] = (g.defects[defectLabel] || 0) + e.quantity;
      }

      // Add comments associated with this event
      const annTexts = commentsMap.get(e.eventId) ?? [];
      annTexts.forEach((text) => g.comments.add(text));
    });

    // 3. Convert groups to rows
    const headers = [
      "Date",
      "Stage",
      "Size",
      "Checked Qty",
      "Rejected Qty",
      "Accepted Qty",
      "Rejection %",
      "Defect Breakdown",
      "Comments",
    ];

    const getStageName = (stageId: string) => {
      switch (stageId.toLowerCase()) {
        case "visual":
          return "Visual Inspection";
        case "eye-punching":
          return "Eye Punching";
        case "balloon":
          return "Balloon Sealing";
        case "valve-integrity":
          return "Valve Integrity";
        case "final-assembly":
        case "final":
          return "Final Assembly";
        default:
          return stageId;
      }
    };

    const rows = Object.values(groups).map((g) => {
      const defectTotal = Object.values(g.defects).reduce((sum, val) => sum + val, 0);
      const finalRejected = g.rejected || defectTotal;
      const finalChecked = g.checked || (g.accepted + finalRejected);
      const rejRate = finalChecked > 0 ? (finalRejected / finalChecked) * 100 : 0;

      const defectBreakdown = Object.entries(g.defects)
        .map(([lbl, val]) => `${lbl} (${val})`)
        .join("; ");

      const commentsStr = Array.from(g.comments).join(" | ");

      return [
        g.date,
        getStageName(g.stageId),
        g.size,
        finalChecked,
        finalRejected,
        g.accepted,
        `${rejRate.toFixed(2)}%`,
        defectBreakdown,
        commentsStr,
      ];
    });

    const csvString = [
      headers.join(","),
      ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `rais-pro-compliance-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell active="reports">
      {/* Inject print stylesheet */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide sidebar, top bar and status bar */
          aside, header, footer, .no-print, button {
            display: none !important;
          }
          /* Reset layout grid to single column */
          div[style*="display: grid"], div[style*="grid-template-columns"] {
            display: block !important;
            width: 100% !important;
          }
          body, main {
            background: #fff !important;
            color: #000 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-report-container {
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 24px !important;
            background: #fff !important;
            color: #000 !important;
          }
          .card {
            border: 1px solid #000 !important;
            background: #fff !important;
            box-shadow: none !important;
            margin-bottom: 24px !important;
            page-break-inside: avoid !important;
          }
          table {
            page-break-inside: auto !important;
          }
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
        }
      `}} />

      <div style={{ width: "100%", paddingBottom: 48 }} className="print-report-container">
        
        {/* Header (No Print) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 24 }} className="no-print">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>
              Monthly Review Compiler
            </h1>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Generate executive-ready, printer-friendly reports and download raw compliance spreadsheets.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleExportCSV} disabled={events.length === 0} style={btnGhost}>
              <Icon name="file" size={13} /> Export Audit CSV
            </button>
            <button onClick={handlePrint} disabled={events.length === 0} style={btnPrimary}>
              <Icon name="print" size={13} /> Print Report (PDF)
            </button>
          </div>
        </div>

        {/* Printable Report Wrapper */}
        {isLoading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }} className="no-print">
            Compiling report statistics...
          </div>
        ) : !m ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }} className="no-print">
            No data on file. Ingest sheets to compile the monthly report.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            
            {/* Editorial Masthead for Print */}
            <div style={{ borderBottom: "2px solid #000", paddingBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800 }}>
                  RAIS PRO
                </span>
                <span className="muted" style={{ fontSize: 11, marginLeft: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  · Factory Quality Intelligence Report
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textAlign: "right" }}>
                <div>Date: {new Date().toLocaleDateString()}</div>
                <div>Scope: YTD Ingestion Ledger</div>
              </div>
            </div>

            {/* Executive Summary Card */}
            <div className="card" style={reportCardStyle}>
              <h3 style={reportHeadingStyle}>01. Executive Overview</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 16px", color: "var(--text-2)" }}>
                The factory intelligence ledger has compiled and verified all stage inspection audits. The current combined rejection rate stands at <strong>{(m.rate * 100).toFixed(2)}%</strong> across <strong>{m.checked.toLocaleString()}</strong> total checked catheters.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
                  <span className="muted" style={{ fontSize: 11, display: "block" }}>First Pass Yield (FPY)</span>
                  <strong style={{ fontSize: 20, fontFamily: "var(--font-mono)" }}>{(m.fpy * 100).toFixed(2)}%</strong>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11, display: "block" }}>Total Defect Volume</span>
                  <strong style={{ fontSize: 20, fontFamily: "var(--font-mono)", color: "var(--critical)" }}>{m.rejected.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11, display: "block" }}>Data Trust score</span>
                  <strong style={{ fontSize: 20, fontFamily: "var(--font-mono)", color: "var(--positive)" }}>{m.trust.pct.toFixed(1)}%</strong>
                </div>
              </div>
            </div>

            {/* Stage-wise Breakdown Card */}
            <div className="card" style={reportCardStyle}>
              <h3 style={reportHeadingStyle}>02. Stage-wise Inspection Analysis</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                <thead>
                  <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: "1.5px solid #000" }}>
                    <th style={{ padding: "6px 0" }}>Inspection Stage</th>
                    <th style={{ padding: "6px 0", textAlign: "right" }}>Total Checked</th>
                    <th style={{ padding: "6px 0", textAlign: "right" }}>Total Rejected</th>
                    <th style={{ padding: "6px 0", textAlign: "right" }}>Rejection %</th>
                  </tr>
                </thead>
                <tbody>
                  {m.stages.map((s) => {
                    const rate = s.checked > 0 ? (s.rejected / s.checked) * 100 : 0;
                    return (
                      <tr key={s.stageId} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 0", fontWeight: 600 }}>
                          {s.stageId === "visual" ? "Visual Inspection" : s.stageId === "eye-punching" ? "Eye Punching" : s.stageId === "balloon" ? "Balloon Sealing" : s.stageId === "valve-integrity" ? "Valve Integrity" : "Final Assembly"}
                        </td>
                        <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{s.checked.toLocaleString()}</td>
                        <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--critical)" }}>{s.rejected.toLocaleString()}</td>
                        <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{rate.toFixed(2)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Defect Pareto Card */}
            <div className="card" style={reportCardStyle}>
              <h3 style={reportHeadingStyle}>03. Vital Defect Categories (Pareto)</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                <thead>
                  <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: "1.5px solid #000" }}>
                    <th style={{ padding: "6px 0" }}>Rank</th>
                    <th style={{ padding: "6px 0" }}>Defect Class</th>
                    <th style={{ padding: "6px 0", textAlign: "right" }}>Defect Count</th>
                    <th style={{ padding: "6px 0", textAlign: "right" }}>Contribution %</th>
                  </tr>
                </thead>
                <tbody>
                  {m.defects.slice(0, 8).map((d, i) => (
                    <tr key={d.label} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 0", fontFamily: "var(--font-mono)" }}>{String(i + 1).padStart(2, "0")}</td>
                      <td style={{ padding: "8px 0", fontWeight: 600 }}>{d.label}</td>
                      <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{d.rejected.toLocaleString()}</td>
                      <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{d.pct.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Colophon */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 12 }}>
              <span>RAIS Pro · Executive Diagnostic compiler</span>
              <span>Report Hash: {events.length.toString(16).toUpperCase()}-LE-VERIFIED</span>
              <span>End of Review</span>
            </div>

          </div>
        )}

      </div>
    </AppShell>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert)",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "8px 18px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  boxShadow: "var(--shadow-1)"
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "8px 18px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6
};

const reportCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: 20
};

const reportHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "17px",
  fontWeight: 800,
  margin: "0 0 12px 0",
  color: "var(--text)"
};
