"use client";

// One tab vocabulary for the whole product.
//
// Before this, Data Entry, Audit and the Excel screens each drew their own
// segmented control with different heights, radii and active treatments. Same
// conceptual thing, three looks — the clearest kind of unfinished.
//
// `href` tabs render as links (cross-route, e.g. Import <-> Files); `onSelect`
// tabs render as buttons (in-page). Both share one appearance.

import React from "react";

export interface TabItem {
  id: string;
  label: string;
  /** Trailing count / status, e.g. "12". */
  badge?: string | number;
  href?: string;
  disabled?: boolean;
}

export default function Tabs({
  items,
  active,
  onSelect,
  ariaLabel,
  size = "md",
}: {
  items: TabItem[];
  active: string;
  onSelect?: (id: string) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "5px 12px" : "7px 15px";
  const font = size === "sm" ? "var(--text-xs)" : "var(--text-sm)";
  const minH = size === "sm" ? 30 : 36;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 3,
        borderRadius: "var(--radius-md)",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        maxWidth: "100%",
        overflowX: "auto",
      }}
    >
      {items.map((t) => {
        const on = t.id === active;
        const shared: React.CSSProperties = {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: pad,
          minHeight: minH,
          whiteSpace: "nowrap",
          borderRadius: "var(--radius-sm)",
          border: "1px solid transparent",
          background: on ? "var(--surface)" : "transparent",
          borderColor: on ? "var(--border)" : "transparent",
          boxShadow: on ? "var(--shadow-1)" : "none",
          color: on ? "var(--text)" : "var(--text-3)",
          fontFamily: "inherit",
          fontSize: font,
          fontWeight: on ? 600 : 500,
          cursor: t.disabled ? "not-allowed" : "pointer",
          opacity: t.disabled ? 0.5 : 1,
          transition:
            "background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
        };

        const inner = (
          <>
            {t.label}
            {t.badge !== undefined && t.badge !== "" && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-2xs)",
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: "var(--radius-pill)",
                  background: on ? "var(--accent-weak)" : "var(--surface-3)",
                  color: on ? "var(--accent-text)" : "var(--text-3)",
                }}
              >
                {t.badge}
              </span>
            )}
          </>
        );

        return t.href && !t.disabled ? (
          <a key={t.id} href={t.href} role="tab" aria-selected={on} style={shared}>
            {inner}
          </a>
        ) : (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={t.disabled}
            onClick={() => onSelect?.(t.id)}
            style={shared}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
