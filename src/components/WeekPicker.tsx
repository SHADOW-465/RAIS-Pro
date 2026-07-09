"use client";

// src/components/WeekPicker.tsx
// Report Date control for the "week" grain on /data-entry. Opens a small
// popover calendar where day cells are laid out 7-per-row starting from the
// 1st of the month (NOT real Monday-Sunday weeks) — matching the week-of-month
// bucketing weekOfMonthBounds()/periodKey() already use everywhere else in the
// app. Clicking any cell in a row selects and highlights that whole row.
// See docs/superpowers/specs/2026-07-09-data-entry-grain-aware-design.md §4.

import React, { useEffect, useRef, useState } from "react";
import { weekOfMonthBounds } from "@/lib/analytics/scope";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function partsOf(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function WeekPicker({ value, onChange }: { value: string; onChange: (anchorDate: string) => void }) {
  const initial = partsOf(value);
  const [open, setOpen] = useState(false);
  const [browseYear, setBrowseYear] = useState(initial.year);
  const [browseMonth, setBrowseMonth] = useState(initial.month);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  const selected = partsOf(value);
  const selectedBucket = weekOfMonthBounds(selected.year, selected.month, selected.day);

  const total = daysInMonth(browseYear, browseMonth);
  const rows: number[][] = [];
  for (let d = 1; d <= total; d += 7) {
    const row: number[] = [];
    for (let x = d; x <= Math.min(d + 6, total); x++) row.push(x);
    rows.push(row);
  }

  const goMonth = (delta: number) => {
    let m = browseMonth + delta;
    let y = browseYear;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setBrowseMonth(m);
    setBrowseYear(y);
  };

  const pickRow = (row: number[]) => {
    onChange(isoDate(browseYear, browseMonth, row[0]));
    setOpen(false);
  };

  const label = `Week ${selectedBucket.week} (${selectedBucket.startDay}-${selectedBucket.endDay} ${MONTH_NAMES[selected.month - 1].slice(0, 3)} ${selected.year})`;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
          border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px",
          background: "var(--bg)", color: "var(--text)", cursor: "pointer", width: 160,
        }}
      >
        {label}
      </div>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 200,
            background: "var(--surface)", border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", padding: 12, width: 240,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontWeight: 700, fontSize: 13 }}>
            <button onClick={() => goMonth(-1)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14 }}>‹</button>
            <span>{MONTH_NAMES[browseMonth - 1]} {browseYear}</span>
            <button onClick={() => goMonth(1)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14 }}>›</button>
          </div>

          {rows.map((row, i) => {
            const isSelectedRow = browseYear === selected.year && browseMonth === selected.month && row[0] === selectedBucket.startDay;
            return (
              <div
                key={i}
                onClick={() => pickRow(row)}
                style={{
                  display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2,
                  borderRadius: 6, cursor: "pointer",
                  background: isSelectedRow ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
                }}
              >
                {row.map((d) => (
                  <div key={d} style={{
                    textAlign: "center", padding: "4px 0", fontSize: 12, fontFamily: "var(--font-mono)",
                    fontWeight: isSelectedRow ? 800 : 500,
                    color: isSelectedRow ? "var(--accent)" : "var(--text)",
                  }}>
                    {d}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
