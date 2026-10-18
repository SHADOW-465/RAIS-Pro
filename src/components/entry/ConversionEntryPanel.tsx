"use client";

import type { CSSProperties, ReactNode } from "react";

export type ConversionPanelTone = "source" | "converted";

export default function ConversionEntryPanel({
  tone,
  batchId,
  size,
  stageLabel,
  focused,
  relatedBatch,
  children,
}: {
  tone: ConversionPanelTone;
  batchId: string;
  size?: string | null;
  stageLabel?: string;
  focused?: boolean;
  relatedBatch?: string | null;
  children: ReactNode;
}) {
  const isSource = tone === "source";
  const label = isSource ? "Original batch" : "Converted batch";
  const relation = isSource
    ? relatedBatch
      ? `Parent identity · converts to ${relatedBatch}`
      : "Parent identity · source lot stays the reference"
    : relatedBatch
      ? `Child identity · converted from ${relatedBatch}`
      : "Child identity · new size on the same start date";

  const accent = isSource ? "var(--text-2)" : "var(--accent)";

  const wrap: CSSProperties = {
    minWidth: 0,
    background: "var(--paper, var(--bg))",
    border: focused
      ? "1.5px solid var(--accent)"
      : isSource
        ? "1px solid var(--border)"
        : "1px solid color-mix(in srgb, var(--accent) 45%, var(--border))",
    borderRadius: "var(--radius-lg, 12px)",
    boxShadow: focused ? "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)" : "var(--shadow-1)",
    overflow: "hidden",
  };

  return (
    <section
      id={`conversion-panel-${tone}`}
      aria-label={label}
      data-panel-tone={tone}
      style={wrap}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: isSource
            ? "var(--surface-2)"
            : "color-mix(in srgb, var(--accent) 10%, var(--surface))",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: accent,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.03em",
              color: "var(--text)",
              marginTop: 2,
            }}
          >
            {batchId || "—"}
            {size ? (
              <span style={{ marginLeft: 8, color: "var(--text-3)", fontWeight: 600, fontSize: 12 }}>
                {size}
              </span>
            ) : null}
          </div>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.4 }}>
            {relation}
            {stageLabel ? ` · ${stageLabel}` : ""}
          </p>
        </div>
      </header>
      <div style={{ padding: "12px 12px 8px" }}>{children}</div>
    </section>
  );
}
