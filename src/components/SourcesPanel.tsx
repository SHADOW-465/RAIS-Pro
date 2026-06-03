// src/components/SourcesPanel.tsx
"use client";

import { useState } from "react";
import Icon from "@/components/editorial/Icon";
import type { MergePlan } from "@/types/analysis";

interface SourcesPanelProps {
  mergePlan: MergePlan;
  sectionNum?: string;
}

export default function SourcesPanel({ mergePlan, sectionNum = "06" }: SourcesPanelProps) {
  const [open, setOpen] = useState(true);
  const totalIncluded = mergePlan.groups.reduce((n, g) => n + g.sheets.length, 0);
  const hasExclusions = mergePlan.excludedSheets.length > 0;
  const hasWarnings = mergePlan.warnings.length > 0;

  return (
    <section
      className="card"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        padding: "var(--pad-card)",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
      >
        <div className="flex gap-4" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <div className="eyebrow accent" style={{ fontWeight: 700 }}>{sectionNum} · The Receipts</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: 0, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, color: "var(--text)" }}>
            Sources &amp; merge audit
            <span style={{ fontSize: 10, fontStyle: "normal", color: "var(--positive)", border: "1px solid var(--positive)", padding: "2px 8px", borderRadius: "12px", display: "inline-flex", alignItems: "center", gap: 4, textTransform: "uppercase", fontWeight: 700, fontFamily: "var(--font-sans)", letterSpacing: "0.04em" }}>
              <Icon name="check" size={10} stroke={3} /> Verified
            </span>
          </h2>
        </div>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} />
      </button>

      {open && (
        <div
          className="fade-up"
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr",
            gap: 32,
          }}
        >
          {/* Included */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 10, fontWeight: 700 }}>
              Included ({totalIncluded})
            </div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                {mergePlan.groups.flatMap((g) =>
                  g.sheets.map((sheet, j) => (
                    <tr key={`${g.label}-${sheet}-${j}`} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td
                        className="num"
                        style={{ padding: "8px 0", fontSize: 11, fontWeight: 600, color: "var(--text)" }}
                      >
                        {sheet}
                      </td>
                      <td
                        className="num"
                        style={{ padding: "8px 8px", fontSize: 11, color: "var(--text-3)" }}
                      >
                        {g.label}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>

          {/* Excluded + strategy */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 10, color: "var(--accent)", fontWeight: 700 }}>
              Excluded ({mergePlan.excludedSheets.length})
            </div>
            {hasExclusions ? (
              mergePlan.excludedSheets.map((s, i) => (
                <div
                  key={i}
                  style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}
                >
                  <div className="num" style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>
                    {s.sheet}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-2)" }}>
                    {s.reason}
                  </div>
                </div>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>None — every sheet was used.</div>
            )}
            <div className="mt-3">
              <div className="eyebrow" style={{ marginBottom: 6, fontWeight: 700 }}>Strategy</div>
              <div
                className="num"
                style={{
                  fontSize: 11,
                  padding: 10,
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-sm)",
                  lineHeight: 1.5,
                  color: "var(--text-2)",
                }}
              >
                {mergePlan.crossFileStrategy === "sum"
                  ? "Sum across all included sources"
                  : "Sources kept separate (no roll-up)"}
              </div>
            </div>
          </div>

          {/* Warnings */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 10, color: "var(--warning)", fontWeight: 700 }}>
              Warnings ({mergePlan.warnings.length})
            </div>
            {hasWarnings ? (
              mergePlan.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex gap-2"
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border)",
                    alignItems: "flex-start",
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                >
                  <Icon name="alert" size={14} stroke={1.8} />
                  <span>{w}</span>
                </div>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>No warnings.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
