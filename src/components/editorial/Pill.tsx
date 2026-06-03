"use client";

import type { ReactNode } from "react";

type Tone = "ink" | "accent" | "outline" | "soft" | "critical" | "positive" | "warning";

const STYLES: Record<Tone, { bg: string; fg: string; border?: string }> = {
  ink:      { bg: "var(--text)",        fg: "var(--text-invert)" },
  accent:   { bg: "var(--accent-weak)", fg: "var(--accent-text)" },
  outline:  { bg: "transparent",        fg: "var(--text-2)", border: "1px solid var(--border-strong)" },
  soft:     { bg: "var(--surface-2)",   fg: "var(--text-2)" },
  critical: { bg: "var(--critical-weak)", fg: "var(--critical)" },
  positive: { bg: "var(--positive-weak)", fg: "var(--positive)" },
  warning:  { bg: "var(--warning-weak)",  fg: "var(--warning)" },
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
        fontFamily: "var(--font-sans)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "4px 10px",
        background: s.bg,
        color: s.fg,
        border: s.border ?? "none",
        borderRadius: "var(--radius-pill)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
