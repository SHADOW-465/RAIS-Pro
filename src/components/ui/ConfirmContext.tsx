// src/components/ui/ConfirmContext.tsx
"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import ConfirmDialog, { type ConfirmDialogOptions } from "./ConfirmDialog";

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  variant?: "info" | "success" | "error" | "warning";
}

interface ConfirmContextType {
  confirm: (options: ConfirmDialogOptions | string) => Promise<boolean>;
  notify: (message: string, variant?: ToastItem["variant"], title?: string) => void;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<{
    options: ConfirmDialogOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const confirm = useCallback((options: ConfirmDialogOptions | string): Promise<boolean> => {
    const opts: ConfirmDialogOptions =
      typeof options === "string"
        ? {
            title: "Are you sure?",
            description: options,
            confirmText: "Confirm",
            cancelText: "Cancel",
            variant: "default",
          }
        : options;

    return new Promise<boolean>((resolve) => {
      setDialog({ options: opts, resolve });
    });
  }, []);

  const notify = useCallback(
    (message: string, variant: ToastItem["variant"] = "info", title?: string) => {
      const id = Math.random().toString(36).slice(2, 9);
      setToasts((prev) => [...prev, { id, message, variant, title }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    [],
  );

  const handleClose = (result: boolean) => {
    if (dialog) {
      dialog.resolve(result);
      setDialog(null);
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm, notify }}>
      {children}
      {dialog && (
        <ConfirmDialog
          open={true}
          options={dialog.options}
          onConfirm={() => handleClose(true)}
          onCancel={() => handleClose(false)}
        />
      )}

      {/* Floating Toast Notification Container */}
      {toasts.length > 0 && (
        <div
          role="region"
          aria-label="Notifications"
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 99999,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: 380,
            pointerEvents: "none",
          }}
        >
          {toasts.map((toast) => {
            const isErr = toast.variant === "error";
            const isWarn = toast.variant === "warning";
            const isSuccess = toast.variant === "success";

            const border = isErr
              ? "1px solid var(--negative)"
              : isWarn
                ? "1px solid var(--warning)"
                : isSuccess
                  ? "1px solid var(--positive)"
                  : "1px solid var(--border)";

            const bg = isErr
              ? "var(--negative-weak, rgba(230, 57, 70, 0.12))"
              : isWarn
                ? "var(--warning-weak, rgba(245, 158, 11, 0.12))"
                : isSuccess
                  ? "var(--positive-weak, rgba(16, 185, 129, 0.12))"
                  : "var(--surface)";

            const textCol = isErr
              ? "var(--negative)"
              : isWarn
                ? "var(--warning)"
                : isSuccess
                  ? "var(--positive)"
                  : "var(--text)";

            return (
              <div
                key={toast.id}
                className="fade-up"
                style={{
                  pointerEvents: "auto",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md, 8px)",
                  background: bg,
                  border,
                  boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.25))",
                  color: textCol,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  backdropFilter: "blur(12px)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {toast.title && (
                    <div style={{ fontWeight: 600, marginBottom: 2, color: "var(--text)" }}>
                      {toast.title}
                    </div>
                  )}
                  <div style={{ color: "var(--text-2)", lineHeight: 1.4, wordBreak: "break-word" }}>
                    {toast.message}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  aria-label="Dismiss"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-3)",
                    fontSize: 16,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback if rendered outside provider (e.g. tests)
    return {
      confirm: async (options: ConfirmDialogOptions | string) => {
        const msg = typeof options === "string" ? options : `${options.title}\n\n${options.description ?? ""}`;
        if (typeof window !== "undefined" && typeof window.confirm === "function") {
          return window.confirm(msg);
        }
        return true;
      },
      notify: (message: string) => {
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert(message);
        }
      },
    };
  }
  return ctx;
}
