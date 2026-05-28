"use client";

import type { ReactNode } from "react";

type Tone = "ink" | "accent" | "outline" | "soft" | "critical" | "positive";

const STYLES: Record<Tone, { bg: string; fg: string; border?: string }> = {
  ink:      { bg: "var(--ink)",        fg: "var(--paper-soft)" },
  accent:   { bg: "var(--accent)",     fg: "var(--paper-soft)" },
  outline:  { bg: "transparent",       fg: "var(--ink)", border: "1px solid var(--ink)" },
  soft:     { bg: "var(--paper-deep)", fg: "var(--ink)" },
  critical: { bg: "var(--critical)",   fg: "#FCE7E7" },
  positive: { bg: "var(--positive)",   fg: "#E7F5EC" },
};

export default function Pill({
  children,
  tone = "ink",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const s = STYLES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "var(--sans)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "4px 8px",
        background: s.bg,
        color: s.fg,
        border: s.border ?? "none",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
