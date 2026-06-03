"use client";

import Icon from "@/components/editorial/Icon";

interface StatusAlertProps {
  message: string;
  type?: "danger" | "warning" | "info";
  onClose?: () => void;
}

const TONES = {
  danger:  { bg: "var(--critical-weak)",  fg: "var(--critical)", rule: "var(--critical)", label: "CRITICAL" },
  warning: { bg: "var(--warning-weak)",   fg: "var(--warning)",  rule: "var(--warning)",  label: "WATCH" },
  info:    { bg: "var(--accent-weak)",    fg: "var(--accent)",   rule: "var(--accent)",   label: "NOTE" },
} as const;

export default function StatusAlert({ message, type = "danger", onClose }: StatusAlertProps) {
  const t = TONES[type];

  // Split message into title + detail if it contains " — " or ": "
  const splitIdx = message.indexOf(" — ");
  const altSplit = splitIdx === -1 ? message.indexOf(": ") : splitIdx;
  const title = altSplit > 0 ? message.slice(0, altSplit) : message;
  const detail = altSplit > 0 ? message.slice(altSplit + (splitIdx === -1 ? 2 : 3)) : null;

  return (
    <div
      style={{
        background: t.bg,
        color: t.fg,
        padding: "16px 20px",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        border: `1px solid ${t.rule}`,
        borderLeft: `6px solid ${t.rule}`,
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ marginTop: 2 }}>
        <Icon name="alert" size={20} stroke={1.8} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 8px",
              border: `1px solid ${t.fg}`,
              borderRadius: "var(--radius-sm)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontFamily: "var(--font-sans)",
            }}
          >
            {t.label}
          </span>
          <span style={{ fontSize: 11, fontFamily: "var(--font-sans)", letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.7, fontWeight: 600 }}>
            Anomaly detection · auto-flagged
          </span>
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 800,
            marginTop: 8,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </div>
        {detail && (
          <div style={{ fontSize: 13, marginTop: 4, opacity: 0.85, fontFamily: "var(--font-sans)" }}>{detail}</div>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          style={{ color: t.fg, opacity: 0.7 }}
          aria-label="Dismiss"
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
