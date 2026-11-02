"use client";

import React, { useEffect, useState } from "react";

export type ExceptionLine = { label: string; value: string };

export default function ExceptionModal({
  open,
  title,
  lines,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  confirmLabel = "Save with reason",
  busy = false,
}: {
  open: boolean;
  title: string;
  lines: ExceptionLine[];
  reason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  busy?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const ok = reason.trim().length >= 4;

  useEffect(() => {
    if (!open) setTouched(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exception-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "color-mix(in srgb, var(--ink) 45%, transparent)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          boxShadow: "var(--shadow-lg)",
          padding: 20,
        }}
      >
        <div
          id="exception-modal-title"
          style={{ fontWeight: 600, fontSize: 16, marginBottom: 8, color: "var(--text)" }}
        >
          {title}
        </div>
        <p className="small" style={{ color: "var(--text-2)", marginBottom: 12, lineHeight: 1.45 }}>
          Numbers do not balance. You can still save to the plant ledger — your reason is stored on the
          entry and sent to the GM as an exception alert. The GM must acknowledge it; the trail stays
          in notifications history.
        </p>
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 8,
            background: "color-mix(in srgb, var(--status-warn) 12%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--status-warn) 35%, var(--border))",
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {lines.map((l) => (
            <div key={l.label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "var(--text-3)" }}>{l.label}</span>
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{l.value}</span>
            </div>
          ))}
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-2)" }}>
          Reason for exception <span style={{ color: "var(--status-bad)" }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => {
            setTouched(true);
            onReasonChange(e.target.value);
          }}
          onBlur={() => setTouched(true)}
          placeholder="e.g. 3 units still on hold for re-inspection — defect code pending after QA review"
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            borderRadius: 8,
            border: `1px solid ${touched && !ok ? "var(--status-bad)" : "var(--border-strong)"}`,
            padding: "8px 10px",
            fontFamily: "inherit",
            fontSize: 13,
            resize: "vertical",
            background: "var(--surface-2)",
            color: "var(--text)",
            marginBottom: 6,
          }}
        />
        {touched && !ok && (
          <div style={{ fontSize: 12, color: "var(--status-bad)", marginBottom: 10 }}>
            Enter a short reason (at least 4 characters) so the GM can review this later.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              if (ok) onConfirm();
            }}
            disabled={busy || !ok}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: ok ? "var(--accent)" : "var(--surface-3)",
              color: ok ? "var(--text-invert)" : "var(--text-3)",
              cursor: busy || !ok ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontWeight: 600,
              fontSize: 13,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
