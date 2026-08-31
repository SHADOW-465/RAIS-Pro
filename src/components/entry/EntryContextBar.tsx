"use client";

import React from "react";
import type { ResolvedEntrySchema, EntryStation } from "@/lib/entry/entry-schema";
import type { MacroId } from "@/lib/entry/disposafe-matrix";

interface EntryContextBarProps {
  macro: MacroId | string;
  onSelectMacro: (macro: MacroId) => void;
  stageId: string;
  onSelectStage: (stageId: string) => void;
  schema: ResolvedEntrySchema | null;
  shift: string;
  withinShift: boolean;
  hasGrant: boolean;
  editingId: string | null;
  onCancelEdit?: () => void;
  persona: string;
}

const SECTIONS: { id: MacroId; label: string; sub: string }[] = [
  { id: "assembly", label: "Final Assembly & Inspection", sub: "Visual · Balloon · Valve · Final" },
  { id: "primary", label: "Primary Production", sub: "Extrusion & Molding" },
  { id: "secondary", label: "Secondary Processing", sub: "Assembly & Binning" },
];

export default function EntryContextBar({
  macro,
  onSelectMacro,
  stageId,
  onSelectStage,
  schema,
  shift,
  withinShift,
  hasGrant,
  editingId,
  onCancelEdit,
  persona,
}: EntryContextBarProps) {
  const stations: EntryStation[] = React.useMemo(() => {
    if (!schema) return [];
    return schema.stations.filter((s) => s.category === macro);
  }, [schema, macro]);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg, 12px)",
        padding: "16px 20px",
        marginBottom: 20,
        boxShadow: "var(--shadow-1)",
      }}
    >
      {/* Top row: Section Switcher & Status Chips */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          paddingBottom: 14,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Section Segmented Control */}
        <div
          role="tablist"
          aria-label="Manufacturing Line Sections"
          style={{
            display: "inline-flex",
            background: "var(--surface-2)",
            padding: 3,
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border)",
            gap: 2,
          }}
        >
          {SECTIONS.map((sec) => {
            const active = macro === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectMacro(sec.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-sm, 6px)",
                  border: "none",
                  background: active ? "var(--surface)" : "transparent",
                  color: active ? "var(--text)" : "var(--text-2)",
                  fontWeight: active ? 700 : 500,
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: active ? "var(--shadow-1)" : "none",
                  transition: "all var(--duration-fast, 120ms) ease",
                }}
              >
                {sec.label}
              </button>
            );
          })}
        </div>

        {/* Operational Status Badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {editingId && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 700,
                color: "var(--accent)",
                background: "var(--accent-weak)",
                border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
              }}
            >
              <span>● Revising Record</span>
              {onCancelEdit && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  aria-label="Cancel editing mode"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    cursor: "pointer",
                    fontWeight: 700,
                    padding: "0 2px",
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 9px",
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 600,
              color: withinShift ? "var(--positive)" : hasGrant ? "var(--accent)" : "var(--warning)",
              background: withinShift
                ? "var(--positive-weak)"
                : hasGrant
                  ? "var(--accent-weak)"
                  : "var(--warning-weak)",
              border: `1px solid ${
                withinShift
                  ? "color-mix(in srgb, var(--positive) 30%, transparent)"
                  : hasGrant
                    ? "color-mix(in srgb, var(--accent) 30%, transparent)"
                    : "color-mix(in srgb, var(--warning) 30%, transparent)"
              }`,
            }}
          >
            <span>●</span>
            <span>
              {shift} · {withinShift ? "Window Active" : hasGrant ? "GM Grant Active" : "Shift Closed"}
            </span>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 9px",
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 500,
              color: "var(--text-3)",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            {schema?.source === "catalog" ? "Catalog Schema" : "Default Schema"}
          </div>
        </div>
      </div>

      {/* Bottom row: Station Pills */}
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--text-3)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 8,
          }}
        >
          Station / Inspection Gate
        </div>

        <div
          role="group"
          aria-label="Inspection Stations"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {stations.map((st) => {
            const active = stageId === st.stageId;
            return (
              <button
                key={st.stageId}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectStage(st.stageId)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md, 8px)",
                  border: active
                    ? "1.5px solid var(--accent)"
                    : "1px solid var(--border)",
                  background: active
                    ? "color-mix(in srgb, var(--accent) 8%, var(--surface))"
                    : "var(--surface-2)",
                  color: active ? "var(--accent)" : "var(--text)",
                  fontWeight: active ? 700 : 500,
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: active ? "0 1px 3px rgba(200, 66, 28, 0.12)" : "none",
                  transition: "all var(--duration-fast, 120ms) ease",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: active ? "var(--accent)" : "var(--text-3)",
                    opacity: active ? 1 : 0.4,
                  }}
                />
                {st.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
