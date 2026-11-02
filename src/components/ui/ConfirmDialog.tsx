// src/components/ui/ConfirmDialog.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
}

export interface ConfirmDialogProps {
  open: boolean;
  options: ConfirmDialogOptions;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  options,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const {
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "default",
  } = options;

  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // Focus default button
    if (variant === "danger") {
      cancelBtnRef.current?.focus();
    } else {
      confirmBtnRef.current?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, variant, onCancel]);

  if (!open || typeof document === "undefined") return null;

  const isDanger = variant === "danger";
  const isWarning = variant === "warning";

  const confirmBg = isDanger
    ? "var(--negative)"
    : isWarning
      ? "var(--warning)"
      : "var(--accent)";

  const iconSvg = isDanger ? (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0, color: "var(--negative)" }}>
      <path d="M10 3L18 17H2L10 3Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 8V12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="10" cy="14.5" r="0.75" fill="currentColor" />
    </svg>
  ) : isWarning ? (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0, color: "var(--warning)" }}>
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 6V11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="10" cy="14" r="0.75" fill="currentColor" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0, color: "var(--accent)" }}>
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 9V14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="10" cy="6.5" r="0.75" fill="currentColor" />
    </svg>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? "confirm-dialog-desc" : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "var(--scrim, rgba(0, 0, 0, 0.65))",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="fade-up"
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--surface)",
          border: "1px solid var(--border, rgba(255, 255, 255, 0.1))",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "var(--shadow-xl, 0 20px 40px rgba(0,0,0,0.5))",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "20px 22px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div
            style={{
              padding: 8,
              borderRadius: "var(--radius-md, 8px)",
              background: isDanger
                ? "var(--negative-weak, rgba(230, 57, 70, 0.12))"
                : isWarning
                  ? "var(--warning-weak, rgba(245, 158, 11, 0.12))"
                  : "var(--accent-weak, rgba(0, 102, 161, 0.12))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {iconSvg}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id="confirm-dialog-title"
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text)",
                lineHeight: 1.3,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h2>

            {description && (
              <div
                id="confirm-dialog-desc"
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: "var(--text-2)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {description}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            padding: "12px 20px 16px",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
          }}
        >
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            style={{
              padding: "7px 14px",
              borderRadius: "var(--radius-sm, 6px)",
              border: "1px solid var(--border, rgba(255, 255, 255, 0.14))",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "background var(--duration-fast, 120ms)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface)")}
          >
            {cancelText}
          </button>

          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            style={{
              padding: "7px 15px",
              borderRadius: "var(--radius-sm, 6px)",
              border: "none",
              background: confirmBg,
              color: isDanger || isWarning ? "var(--text-invert)" : "var(--on-accent)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              transition: "opacity var(--duration-fast, 120ms)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
