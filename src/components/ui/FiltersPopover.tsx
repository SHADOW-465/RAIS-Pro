"use client";

// One "Filters (n)" button + popover. Callers pass the controls as children
// and the live count (see `activeFilterCount`). Closes on Escape/outside click.

import React, { useEffect, useRef, useState } from "react";
import Icon from "@/components/editorial/Icon";

export default function FiltersPopover({
  count, children, onClear,
}: { count: number; children: React.ReactNode; onClear?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, minHeight: 36, padding: "0 12px",
          borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)",
          background: "var(--surface)", color: "var(--text)", fontFamily: "inherit",
          fontSize: "var(--text-md)", fontWeight: 500, cursor: "pointer",
        }}
      >
        <Icon name="settings" size={16} aria-hidden />
        Filters{count > 0 ? ` (${count})` : ""}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Filters"
          style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 40, minWidth: 280,
            display: "flex", flexDirection: "column", gap: 12, padding: 16,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-3)",
          }}
        >
          {children}
          {onClear && count > 0 && (
            <button
              type="button"
              onClick={onClear}
              style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, color: "var(--text-3)", fontFamily: "inherit", fontSize: "var(--text-sm)", textDecoration: "underline", cursor: "pointer" }}
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
