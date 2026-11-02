"use client";

// The app's one dropdown.
//
// Replaces native <select>, whose menu is drawn by the OS: it ignores every
// token in globals.css, looks different on Windows / macOS / Linux, can't show
// a check on the current value, and can't be searched. 23 of them across the
// product was the single biggest reason the UI read as unfinished.
//
// Rendered in a fixed-position layer so it escapes `overflow: hidden` and
// `overflow: auto` ancestors — the reason absolutely-positioned menus get
// clipped inside cards and tables.
//
// Keyboard contract matches the native control: Arrow/Home/End move, Enter or
// Space commits, Escape cancels, typing jumps to a matching option.

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  /** Second line under the label — units, counts, hints. */
  hint?: string;
  disabled?: boolean;
  /** Options sharing a group render under one heading. */
  group?: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Renders the invalid state and wires aria-invalid. */
  error?: boolean;
  /** Spinner in the trigger; the menu stays closed. */
  loading?: boolean;
  /** Filter box above the list. Auto-enables past 8 options. */
  searchable?: boolean;
  size?: "sm" | "md";
  /** Mono type in the trigger + list — for ids, codes, cell refs. */
  mono?: boolean;
  /**
   * "quiet" (default): text + chevron, box only on hover/focus/open — the
   * right density when several selects sit inline with plain text.
   * "pill": always-boxed filled chip. For a standalone filter bar, where the
   * control needs to read as a control even before the pointer arrives.
   */
  variant?: "quiet" | "pill";
  ariaLabel?: string;
  id?: string;
  /** Applied to the trigger button. */
  style?: React.CSSProperties;
  className?: string;
  /** Stretch to the container. Default true, matching a native select. */
  block?: boolean;
}

const MENU_MAX_H = 288;
const GAP = 6;

export default function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  error = false,
  loading = false,
  searchable,
  size = "md",
  mono = false,
  ariaLabel,
  id,
  style,
  className,
  block = true,
  variant = "quiet",
}: SelectProps) {
  const reactId = useId();
  const listId = `${id ?? reactId}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; drop: "down" | "up" } | null>(
    null,
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });

  const useSearch = searchable ?? options.length > 8;
  const selected = options.find((o) => o.value === value) ?? null;

  const visible = useMemo(() => {
    if (!useSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query, useSearch]);

  /** Position against the viewport; flip up when the menu would overflow. */
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const drop = below < Math.min(MENU_MAX_H, 200) && r.top > below ? "up" : "down";
    const menuWidth = Math.max(r.width, 180);
    setRect({
      left: Math.max(8, Math.min(r.left, window.innerWidth - menuWidth - 8)),
      top: drop === "down" ? r.bottom + GAP : r.top - GAP,
      width: r.width,
      drop,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Reposition rather than close: a select inside a scrolling table should
    // track its trigger, not vanish when the user nudges the wheel.
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const i = options.findIndex((o) => o.value === value);
      setActiveIndex(i >= 0 ? i : options.findIndex((o) => !o.disabled));
      setQuery("");
      if (useSearch) requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, options, value, useSearch]);

  // Keep the highlighted row in view during keyboard travel.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    menuRef.current
      ?.querySelector(`[data-idx="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const commit = (opt: SelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const step = (dir: 1 | -1) => {
    if (visible.length === 0) return;
    const cur = visible.findIndex((o) => o === options[activeIndex]);
    let next = cur;
    for (let n = 0; n < visible.length; n++) {
      next = (next + dir + visible.length) % visible.length;
      if (!visible[next].disabled) break;
    }
    setActiveIndex(options.indexOf(visible[next]));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || loading) return;

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      case "ArrowDown":
        e.preventDefault();
        step(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        step(-1);
        return;
      case "Home":
        e.preventDefault();
        setActiveIndex(options.indexOf(visible.find((o) => !o.disabled) ?? visible[0]));
        return;
      case "End":
        e.preventDefault();
        setActiveIndex(options.indexOf([...visible].reverse().find((o) => !o.disabled) ?? visible[0]));
        return;
      case "Enter":
      case " ":
        if (e.key === " " && useSearch) return; // space belongs to the search box
        e.preventDefault();
        if (activeIndex >= 0 && options[activeIndex]) commit(options[activeIndex]);
        return;
      case "Tab":
        setOpen(false);
        return;
    }

    // Type-ahead, native-select style. Skipped when a search box has focus.
    if (!useSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const t = typeahead.current;
      t.buffer = now - t.at > 800 ? e.key : t.buffer + e.key;
      t.at = now;
      const hit = options.findIndex(
        (o) => !o.disabled && o.label.toLowerCase().startsWith(t.buffer.toLowerCase()),
      );
      if (hit >= 0) setActiveIndex(hit);
    }
  };

  const pill = variant === "pill";

  // Quiet by default. A dropdown is a value the user reads far more often than
  // a control they click, so at rest it is text plus a small chevron; the box
  // only draws itself on hover, focus and while open. Boxing every one of them
  // at full strength is what made a screen of six read as heavy.
  //
  // The pill variant inverts that: a standalone filter bar has no surrounding
  // text for a quiet control to blend into, so each filter needs to read as a
  // control from the first glance — always boxed, always showing its chevron.
  const pad = pill
    ? size === "sm"
      ? "6px 10px 6px 12px"
      : "8px 12px 8px 14px"
    : size === "sm"
      ? "3px 6px 3px 8px"
      : "5px 8px 5px 10px";
  const font = size === "sm" ? "var(--text-xs)" : "var(--text-sm)";
  const minH = pill ? (size === "sm" ? 32 : 36) : size === "sm" ? 26 : 30;

  const resting = pill || hover || open || error;
  const borderColor = error
    ? "var(--critical)"
    : open
      ? "var(--accent)"
      : pill
        ? "var(--border-strong)"
        : hover
          ? "var(--border-strong)"
          : "transparent";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        onClick={() => !loading && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={className}
        data-select-open={open || undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          width: block ? "100%" : undefined,
          minHeight: minH,
          padding: pad,
          textAlign: "left",
          borderRadius: pill ? "var(--radius-pill)" : "var(--radius-sm)",
          border: `1px solid ${borderColor}`,
          background: disabled
            ? "transparent"
            : resting
              ? pill
                ? "var(--surface-2)"
                : "var(--surface)"
              : "transparent",
          color: selected ? "var(--text)" : "var(--text-3)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          fontSize: font,
          fontWeight: pill ? 600 : 500,
          cursor: disabled || loading ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          transition:
            "border-color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out)",
          ...style,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Loading…" : (selected?.label ?? placeholder)}
        </span>
        <Chevron open={open} />
      </button>

      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="select-menu"
            style={{
              position: "fixed",
              left: rect.left,
              top: rect.drop === "down" ? rect.top : undefined,
              bottom: rect.drop === "up" ? window.innerHeight - rect.top : undefined,
              width: Math.max(rect.width, 180),
              maxHeight: MENU_MAX_H,
              display: "flex",
              flexDirection: "column",
              zIndex: 99999,
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-3), 0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent)",
              overflow: "hidden",
              transformOrigin: rect.drop === "down" ? "top center" : "bottom center",
            }}
          >
          {useSearch && (
            <div style={{ padding: 6, borderBottom: "1px solid var(--border)" }}>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Filter…"
                aria-label="Filter options"
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontSize: "var(--text-sm)",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          <div style={{ overflowY: "auto", padding: 4 }}>
            {visible.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: "14px 10px",
                  fontSize: "var(--text-sm)",
                  color: "var(--text-3)",
                  textAlign: "center",
                }}
              >
                No match for “{query.trim()}”
              </p>
            ) : (
              visible.map((o, i) => {
                const idx = options.indexOf(o);
                const isSel = o.value === value;
                const isActive = idx === activeIndex;
                const newGroup = o.group && (i === 0 || visible[i - 1].group !== o.group);
                return (
                  <React.Fragment key={o.value}>
                    {newGroup && (
                      <div
                        role="presentation"
                        style={{
                          padding: "8px 10px 4px",
                          fontSize: "var(--text-2xs)",
                          fontWeight: 600,
                          letterSpacing: "var(--tracking-label)",
                          textTransform: "uppercase",
                          color: "var(--text-3)",
                        }}
                      >
                        {o.group}
                      </div>
                    )}
                    <div
                      role="option"
                      aria-selected={isSel}
                      aria-disabled={o.disabled || undefined}
                      data-idx={idx}
                      onMouseEnter={() => !o.disabled && setActiveIndex(idx)}
                      onClick={() => commit(o)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 9px",
                        borderRadius: "var(--radius-sm)",
                        cursor: o.disabled ? "not-allowed" : "pointer",
                        opacity: o.disabled ? 0.45 : 1,
                        background: isActive ? "var(--accent-weak)" : "transparent",
                        color: isSel ? "var(--accent-text)" : "var(--text)",
                        fontWeight: isSel ? 600 : 400,
                        fontSize: "var(--text-sm)",
                        fontFamily: mono ? "var(--font-mono)" : "inherit",
                        lineHeight: 1.35,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {o.label}
                        </span>
                        {o.hint && (
                          <span
                            style={{
                              display: "block",
                              fontSize: "var(--text-xs)",
                              color: "var(--text-3)",
                              fontWeight: 400,
                              fontFamily: "var(--font-sans)",
                            }}
                          >
                            {o.hint}
                          </span>
                        )}
                      </span>
                      <Tick shown={isSel} />
                    </div>
                  </React.Fragment>
                );
              })
            )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        color: "var(--text-3)",
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform var(--duration-fast) var(--ease-out)",
      }}
    >
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tick({ shown }: { shown: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, opacity: shown ? 1 : 0, color: "var(--accent)" }}
    >
      <path d="M2.5 6.8 5.2 9.5 10.5 3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Build options from plain strings, where label === value. */
export function toOptions(values: readonly string[]): SelectOption[] {
  return values.map((v) => ({ value: v, label: v }));
}
