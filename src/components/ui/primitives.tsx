"use client";

// Shared tiles/badges/buttons for the redesign (plan §3c). Token-driven inline
// styles, like the editorial primitives. Accent blue is reserved for
// PrimaryAction: one per screen.

import React from "react";
import Icon from "@/components/editorial/Icon";
import { STATUS_META, formatKpiValue, type Status, type Direction } from "./shared-logic";

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const m = STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px",
        borderRadius: "var(--radius-pill)", background: m.bg, color: m.fg,
        fontSize: "var(--text-xs)", fontWeight: 500, whiteSpace: "nowrap",
      }}
    >
      <Icon name={m.icon} size={12} stroke={2} aria-hidden />
      {label ?? m.label}
    </span>
  );
}

export function PrimaryAction({
  children, onClick, disabled, type = "button",
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, minHeight: 36, padding: "0 16px",
        borderRadius: "var(--radius-md)", border: "1px solid transparent",
        background: "var(--accent)", color: "var(--on-accent)",
        fontFamily: "inherit", fontSize: "var(--text-md)", fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** Neutral secondary button; everything that is not THE primary action. */
export function GhostButton({
  children, onClick, disabled, ariaLabel,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, minHeight: 36, padding: "0 12px",
        borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)",
        background: "var(--surface)", color: "var(--text)",
        fontFamily: "inherit", fontSize: "var(--text-md)", fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export interface KpiTileProps {
  label: string;
  value: number | string | null | undefined;
  /** Appended to a numeric value, e.g. "%". */
  suffix?: string;
  digits?: number;
  /** Change text from `formatDelta`, plus its direction. */
  delta?: { text: string; direction: Direction; good: boolean | null } | null;
  status?: Status;
  /** Short context line, e.g. "vs last period". */
  hint?: string;
  /** Makes the whole tile a button (opens the detail drawer). */
  onOpen?: () => void;
  /** Value is a name (stage, defect), not a number: sans 20px, truncated with a tooltip. */
  word?: boolean;
}

export function KpiTile({ label, value, suffix, digits, delta, status, hint, onOpen, word }: KpiTileProps) {
  const Tag = onOpen ? "button" : "div";
  const arrow = delta?.direction === "up" ? "trend-up" : delta?.direction === "down" ? "trend-down" : "minus";
  const deltaColor = delta?.good === true ? "var(--positive)" : delta?.good === false ? "var(--critical)" : "var(--text-3)";
  return (
    <Tag
      {...(onOpen ? { type: "button" as const, onClick: onOpen } : {})}
      style={{
        display: "flex", flexDirection: "column", gap: 8, padding: "var(--pad-card)", textAlign: "left",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-1)", fontFamily: "inherit", color: "var(--text)",
        cursor: onOpen ? "pointer" : "default", minWidth: 0,
      }}
    >
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-3)", fontWeight: 500 }}>{label}</span>
        {/* neutral only means something when there is no value to show */}
        {status && (status !== "neutral" || formatKpiValue(value, digits, suffix) === "—") && <StatusBadge status={status} />}
      </span>
      <span
        title={word ? formatKpiValue(value, digits, suffix) : undefined}
        style={{
          fontFamily: word ? "var(--font-sans)" : "var(--font-mono)",
          fontSize: word ? "var(--text-kpi-word)" : "var(--text-kpi-lg)",
          fontWeight: 600, lineHeight: word ? 1.3 : 1.1, minHeight: "calc(var(--text-kpi-lg) * 1.1)",
          overflow: "hidden", overflowWrap: "anywhere",
          ...(word
            ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }
            : { display: "flex", alignItems: "center", whiteSpace: "nowrap" as const }),
        }}
      >
        {formatKpiValue(value, digits, suffix)}
      </span>
      {(delta || hint) && (
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>
          {delta && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: deltaColor, fontFamily: "var(--font-mono)" }}>
              <Icon name={arrow} size={12} aria-hidden />
              {delta.text}
            </span>
          )}
          {hint}
        </span>
      )}
    </Tag>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>{title}</div>
      {body && <div style={{ fontSize: "var(--text-md)", color: "var(--text-3)", maxWidth: "70ch" }}>{body}</div>}
      {action}
    </div>
  );
}
