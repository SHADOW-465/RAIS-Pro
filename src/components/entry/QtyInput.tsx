"use client";

// Shared non-negative quantity input for shop-floor / staging grids.
//
// Why this exists: the previous pattern was
//   value={n || ""}
//   onChange={(e) => setN(parseInt(e.target.value, 10) || 0)}
// That coerces every keystroke to a number, collapses empty/partial input,
// hides legitimate zeros, and (with type=number + scroll) silently changes
// values. Operators reported "I typed X and it became Y."
//
// Rules:
//  - Display is a string draft while focused so partial edits are stable.
//  - Only non-negative integers are committed (empty → null when allowEmpty).
//  - Never mutates sibling fields — parent decides what each field means.
//  - Wheel over a focused field does not bump the value.
//  - External value updates only apply when the field is not focused.

import React, { useEffect, useRef, useState } from "react";

export type QtyInputProps = {
  /** Committed quantity. null/undefined = blank. */
  value: number | null | undefined;
  /** Fires with a non-negative integer, or null when cleared (if allowEmpty). */
  onChange: (next: number | null) => void;
  allowEmpty?: boolean;
  min?: number;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  "aria-label"?: string;
  style?: React.CSSProperties;
  className?: string;
  id?: string;
};

function formatCommitted(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  return String(n);
}

/** Parse a draft string into a non-negative integer, or null if empty/invalid. */
export function parseQtyDraft(raw: string, allowEmpty: boolean): number | null | "invalid" {
  const t = raw.trim();
  if (t === "") return allowEmpty ? null : "invalid";
  // Reject decimals, signs, e-notation, leading junk — only plain digits.
  if (!/^\d+$/.test(t)) return "invalid";
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  // Guard against Number precision issues for absurd lengths.
  if (t.length > 12) return "invalid";
  return n;
}

export default function QtyInput({
  value,
  onChange,
  allowEmpty = true,
  min = 0,
  disabled,
  placeholder = "0",
  title,
  "aria-label": ariaLabel,
  style,
  className,
  id,
}: QtyInputProps) {
  const [draft, setDraft] = useState(() => formatCommitted(value));
  const focused = useRef(false);

  // Sync external commits only when not mid-edit.
  useEffect(() => {
    if (focused.current) return;
    setDraft(formatCommitted(value));
  }, [value]);

  const commitDraft = (raw: string) => {
    const parsed = parseQtyDraft(raw, allowEmpty);
    if (parsed === "invalid") {
      // Revert display to last committed value.
      setDraft(formatCommitted(value));
      return;
    }
    if (parsed != null && parsed < min) {
      setDraft(formatCommitted(value));
      return;
    }
    setDraft(parsed == null ? "" : String(parsed));
    // Skip no-op commits so parents don't mark dirty unnecessarily.
    const prev = value == null ? null : value;
    if (prev !== parsed) onChange(parsed);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      className={className}
      value={draft}
      style={style}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commitDraft(draft);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Allow empty while typing; strip non-digits so paste of "1,234" → "1234".
        const cleaned = raw.replace(/[^\d]/g, "");
        setDraft(cleaned);
        // Live-commit when the draft is a complete non-negative integer so
        // parent state (totals, balance flags) stays current without waiting
        // for blur — but never invent a value the user didn't type.
        if (cleaned === "") {
          if (allowEmpty) onChange(null);
          return;
        }
        if (/^\d+$/.test(cleaned) && cleaned.length <= 12) {
          const n = Number(cleaned);
          if (Number.isFinite(n) && n >= min && n !== value) onChange(n);
        }
      }}
      onKeyDown={(e) => {
        // Block e/E/+/-/. that type=number used to accept as intermediate junk.
        if (e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-" || e.key === ".") {
          e.preventDefault();
        }
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      onWheel={(e) => {
        // Text inputs used to change on scroll-over; text + this is belt-and-braces.
        if (document.activeElement === e.currentTarget) e.currentTarget.blur();
      }}
    />
  );
}
