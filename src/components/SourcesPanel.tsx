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
      style={{
        background: "var(--paper-soft)",
        border: "1px solid var(--ink)",
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
        }}
      >
        <div className="flex gap-4" style={{ alignItems: "baseline" }}>
          <div className="eyebrow accent">{sectionNum} · The Receipts</div>
          <h2 className="serif tracked-tight" style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>
            Sources &amp; merge audit
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
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Included ({totalIncluded})
            </div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                {mergePlan.groups.flatMap((g) =>
                  g.sheets.map((sheet, j) => (
                    <tr key={`${g.label}-${sheet}-${j}`} style={{ borderBottom: "1px solid var(--hairline)" }}>
                      <td
                        className="mono"
                        style={{ padding: "8px 0", fontSize: 11, fontWeight: 500 }}
                      >
                        {sheet}
                      </td>
                      <td
                        className="mono muted"
                        style={{ padding: "8px 8px", fontSize: 11 }}
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
            <div className="eyebrow" style={{ marginBottom: 10, color: "var(--accent)" }}>
              Excluded ({mergePlan.excludedSheets.length})
            </div>
            {hasExclusions ? (
              mergePlan.excludedSheets.map((s, i) => (
                <div
                  key={i}
                  style={{ padding: "10px 0", borderBottom: "1px solid var(--hairline)" }}
                >
                  <div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
                    {s.sheet}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, color: "var(--ink-soft)" }}>
                    {s.reason}
                  </div>
                </div>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>None — every sheet was used.</div>
            )}
            <div className="mt-3">
              <div className="eyebrow" style={{ marginBottom: 6 }}>Strategy</div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  padding: 10,
                  background: "var(--paper-deep)",
                  lineHeight: 1.5,
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
            <div className="eyebrow" style={{ marginBottom: 10, color: "var(--warning)" }}>
              Warnings ({mergePlan.warnings.length})
            </div>
            {hasWarnings ? (
              mergePlan.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex gap-2"
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid var(--hairline)",
                    alignItems: "flex-start",
                    fontSize: 12,
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
