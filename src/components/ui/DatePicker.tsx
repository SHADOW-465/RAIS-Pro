// src/components/ui/DatePicker.tsx
"use client";

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

export interface DatePickerProps {
  value: string; // ISO "YYYY-MM-DD"
  onChange: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
  block?: boolean;
  style?: React.CSSProperties;
  className?: string;
  id?: string;
  /**
   * Render the calendar in-flow instead of a portaled popover.
   * Required inside another overlay (e.g. the lot-date Change panel): a
   * portaled calendar sits outside that panel, so picking a day is treated as
   * an outside click and the parent closes before onChange fires.
   */
  inline?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function toIso(year: number, monthIndex: number, day: number) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function parseIso(iso: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, monthIndex: m - 1, day: d };
}

function formatDisplayDate(iso: string) {
  const parsed = parseIso(iso);
  if (!parsed) return "";
  const d = new Date(Date.UTC(parsed.year, parsed.monthIndex, parsed.day));
  return `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

export default function DatePicker({
  value,
  onChange,
  placeholder = "Select date...",
  disabled = false,
  min,
  max,
  ariaLabel = "Date picker",
  size = "md",
  block = true,
  style,
  className,
  id,
  inline = false,
}: DatePickerProps) {
  const reactId = useId();
  const pickerId = id ?? reactId;
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; drop: "down" | "up" } | null>(null);

  const parsedValue = useMemo(() => parseIso(value), [value]);

  // View state for the calendar month/year
  const today = useMemo(() => {
    const d = new Date();
    return { year: d.getFullYear(), monthIndex: d.getMonth(), day: d.getDate() };
  }, []);

  const [viewYear, setViewYear] = useState(() => parsedValue?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState(() => parsedValue?.monthIndex ?? today.monthIndex);

  // Sync view when value changes externally
  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.year);
      setViewMonth(parsedValue.monthIndex);
    }
  }, [parsedValue]);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const popoverH = 320;
    const drop = spaceBelow < popoverH && spaceAbove > spaceBelow ? "up" : "down";
    setRect({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 290)),
      top: drop === "down" ? r.bottom + 4 : Math.max(8, r.top - popoverH - 4),
      width: Math.max(r.width, 270),
      drop,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const handleScroll = () => measure();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open, measure]);

  // Click outside & Escape handling
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const selectDate = (year: number, monthIndex: number, day: number) => {
    const iso = toIso(year, monthIndex, day);
    if (min && iso < min) return;
    if (max && iso > max) return;
    onChange(iso);
    if (!inline) {
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Build calendar matrix (42 cells: 6 weeks x 7 days)
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    // Sunday is 0 in JS Date, but we start with Monday = 0
    let startDayOfWeek = (firstDay.getDay() + 6) % 7;
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: { year: number; month: number; day: number; isCurrentMonth: boolean }[] = [];

    // Prev month days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({
        year: prevY,
        month: prevM,
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      cells.push({
        year: viewYear,
        month: viewMonth,
        day: d,
        isCurrentMonth: true,
      });
    }

    // Next month days to fill 35 or 42 cells
    const remaining = 35 - cells.length > 0 ? 35 - cells.length : 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push({
        year: nextY,
        month: nextM,
        day: d,
        isCurrentMonth: false,
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  const isSmall = size === "sm";

  const calendar = (
            <>
            {/* Header: Prev / Month Year / Next */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <button
                type="button"
                onClick={prevMonth}
                aria-label="Previous month"
                style={{
                  background: "var(--surface-2, #0C121C)",
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                  borderRadius: "var(--radius-sm, 4px)",
                  color: "var(--text-2, #8E9BAE)",
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 12L6 8l4-4" />
                </svg>
              </button>

              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text, #E2EBF5)" }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </div>

              <button
                type="button"
                onClick={nextMonth}
                aria-label="Next month"
                style={{
                  background: "var(--surface-2, #0C121C)",
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                  borderRadius: "var(--radius-sm, 4px)",
                  color: "var(--text-2, #8E9BAE)",
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
            </div>

            {/* Quick Action Chips */}
            <div
              style={{
                display: "flex",
                gap: 4,
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
              }}
            >
              <button
                type="button"
                onClick={() => selectDate(today.year, today.monthIndex, today.day)}
                style={{
                  flex: 1,
                  padding: "3px 6px",
                  fontSize: 11,
                  fontWeight: 500,
                  borderRadius: "var(--radius-sm, 4px)",
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                  background: "var(--surface-2, #0C121C)",
                  color: "var(--text-2, #8E9BAE)",
                  cursor: "pointer",
                }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  selectDate(y.getFullYear(), y.getMonth(), y.getDate());
                }}
                style={{
                  flex: 1,
                  padding: "3px 6px",
                  fontSize: 11,
                  fontWeight: 500,
                  borderRadius: "var(--radius-sm, 4px)",
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                  background: "var(--surface-2, #0C121C)",
                  color: "var(--text-2, #8E9BAE)",
                  cursor: "pointer",
                }}
              >
                Yesterday
              </button>
            </div>

            {/* Weekday headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              {WEEKDAYS.map((w) => (
                <span
                  key={w}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: "var(--text-3, #5A6980)",
                    padding: "2px 0",
                  }}
                >
                  {w}
                </span>
              ))}
            </div>

            {/* Days Matrix */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 2,
              }}
            >
              {calendarCells.map((cell, idx) => {
                const cellIso = toIso(cell.year, cell.month, cell.day);
                const isSelected = value === cellIso;
                const isToday =
                  cell.year === today.year &&
                  cell.month === today.monthIndex &&
                  cell.day === today.day;

                const isDis = Boolean((min && cellIso < min) || (max && cellIso > max));

                return (
                  <button
                    key={`${cellIso}-${idx}`}
                    type="button"
                    disabled={isDis}
                    onClick={() => selectDate(cell.year, cell.month, cell.day)}
                    style={{
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "var(--radius-sm, 4px)",
                      border: isToday && !isSelected ? "1px solid var(--accent, #0066A1)" : "none",
                      background: isSelected
                        ? "var(--accent, #0066A1)"
                        : "transparent",
                      color: isSelected
                        ? "#FFFFFF"
                        : cell.isCurrentMonth
                          ? isDis
                            ? "var(--text-3, #5A6980)"
                            : "var(--text, #E2EBF5)"
                          : "var(--text-3, rgba(255, 255, 255, 0.25))",
                      fontSize: 12,
                      fontFamily: "inherit",
                      cursor: isDis ? "not-allowed" : "pointer",
                      opacity: isDis ? 0.35 : 1,
                      fontWeight: isSelected || isToday ? 600 : 400,
                      padding: 0,
                    }}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
            </>
  );

  if (inline) {
    return (
      <div
        data-moid-datepicker=""
        className={className}
        style={{ width: "100%", ...style }}
      >
        {calendar}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        display: block ? "flex" : "inline-flex",
        width: block ? "100%" : "auto",
        ...style,
      }}
      className={className}
    >
      <button
        ref={triggerRef}
        id={pickerId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          width: "100%",
          padding: isSmall ? "4px 8px" : "6px 10px",
          borderRadius: "var(--radius-sm, 6px)",
          border: "1px solid var(--border, rgba(255, 255, 255, 0.12))",
          background: "var(--surface, #141D2B)",
          color: value ? "var(--text, #E2EBF5)" : "var(--text-3, #5A6980)",
          fontSize: isSmall ? 12 : 13,
          fontFamily: "inherit",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          textAlign: "left",
          transition: "border-color var(--duration-fast, 120ms), background var(--duration-fast, 120ms)",
        }}
      >
        <span style={{ fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          style={{ flexShrink: 0, color: "var(--text-3, #5A6980)" }}
        >
          <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <line x1="2" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1.5" />
          <line x1="5" y1="1.5" x2="5" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="1.5" x2="11" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            data-moid-datepicker=""
            role="dialog"
            aria-label="Calendar date picker"
            style={{
              position: "fixed",
              left: rect.left,
              top: rect.top,
              width: 274,
              zIndex: 99999,
              background: "var(--surface, #141D2B)",
              border: "1px solid var(--border, rgba(255, 255, 255, 0.12))",
              borderRadius: "var(--radius-md, 8px)",
              boxShadow: "var(--shadow-lg, 0 12px 30px rgba(0, 0, 0, 0.45))",
              padding: 12,
              backdropFilter: "blur(12px)",
              userSelect: "none",
            }}
          >
            {calendar}
          </div>,
          document.body,
        )}
    </div>
  );
}

