"use client";

// Right-hand "Details" drawer (plan §3c). Tabs are supplied by the caller, so
// it can wrap the existing FloatingDetailModal panels (Batches / History /
// Spreadsheet / Source) unchanged until the modal is retired in phase 14.
// Escape closes; focus moves into the drawer and returns to the opener.

import React, { useEffect, useRef, useState } from "react";
import Icon from "@/components/editorial/Icon";
import Tabs from "./Tabs";

export interface DrawerTab { id: string; label: string; badge?: string | number; content: React.ReactNode }

export default function DetailDrawer({
  open, onClose, title, subtitle, tabs, actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  tabs: DrawerTab[];
  /** Header slot, e.g. an Export button. */
  actions?: React.ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); opener?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <div onClick={onClose} aria-hidden style={{ position: "absolute", inset: 0, background: "var(--scrim)" }} />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: "min(560px, 100vw)",
          display: "flex", flexDirection: "column", background: "var(--surface)",
          borderLeft: "1px solid var(--border)", boxShadow: "var(--shadow-3)", outline: "none",
        }}
      >
        <header style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 16, borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 600 }}>{title}</h2>
            {subtitle && <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--text-3)", maxWidth: "70ch" }}>{subtitle}</p>}
          </div>
          {actions}
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            style={{ all: "unset", cursor: "pointer", display: "inline-flex", padding: 8, color: "var(--text-3)" }}
          >
            <Icon name="x" size={20} aria-hidden />
          </button>
        </header>
        {tabs.length > 1 && (
          <div style={{ padding: "12px 16px 0" }}>
            <Tabs
              ariaLabel="Detail sections"
              items={tabs.map(({ id, label, badge }) => ({ id, label, badge }))}
              active={current.id}
              onSelect={setActive}
              size="sm"
            />
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>{current?.content}</div>
      </aside>
    </div>
  );
}
