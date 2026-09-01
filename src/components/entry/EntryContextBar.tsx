"use client";

import React from "react";
import {
  schemaCategories,
  stationsIn,
  type ResolvedEntrySchema,
  type EntryStation,
} from "@/lib/entry/entry-schema";
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
}: EntryContextBarProps) {
  const sections = React.useMemo(() => {
    if (!schema) {
      return [
        { id: "primary", label: "Production Dipping" },
        { id: "secondary", label: "Secondary (P10–P14)" },
        { id: "assembly", label: "Assembly (P15–P27)" },
      ];
    }
    return schemaCategories(schema);
  }, [schema]);

  const stations: EntryStation[] = React.useMemo(() => {
    if (!schema) return [];
    return stationsIn(schema, macro);
  }, [schema, macro]);

  const activeIdx = Math.max(0, sections.findIndex((s) => s.id === macro));

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg, 12px)",
        padding: "18px 20px 16px",
        marginBottom: 20,
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.02em",
            }}
          >
            Line
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2, maxWidth: "54ch" }}>
            Dipping accepted feeds Secondary. Secondary accepted feeds Visual. Then Balloon → Valve → Final.
          </div>
        </div>

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
              <span>Revising</span>
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
            {shift} · {withinShift ? "Window active" : hasGrant ? "GM grant" : "Shift closed"}
          </div>

          <a
            href="/schema"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 9px",
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 600,
              color: schema?.source === "catalog" ? "var(--text-2)" : "var(--warning)",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              textDecoration: "none",
            }}
            title="Plant schema drives these stations and columns"
          >
            {schema?.source === "catalog"
              ? `Plant schema · ${schema.stations.length} stations`
              : "Default schema — open Plant schema"}
          </a>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Process on the line"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(sections.length, 1)}, minmax(0, 1fr))`,
          gap: 6,
        }}
      >
        {sections.map((sec, i) => {
          const active = macro === sec.id;
          const done = i < activeIdx;
          return (
            <button
              key={sec.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectMacro(sec.id as MacroId)}
              style={{
                position: "relative",
                textAlign: "left",
                padding: "10px 12px 11px",
                borderRadius: 10,
                border: active
                  ? "1.5px solid var(--accent)"
                  : "1px solid var(--border)",
                background: active
                  ? "color-mix(in srgb, var(--accent) 7%, var(--surface))"
                  : "var(--surface-2)",
                color: "var(--text)",
                cursor: "pointer",
                boxShadow: active ? "0 1px 3px rgba(200, 66, 28, 0.10)" : "none",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: active ? "var(--accent)" : done ? "var(--text-2)" : "var(--text-3)",
                  marginBottom: 3,
                }}
              >
                {i + 1} / {sections.length}
              </div>
              <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, lineHeight: 1.25 }}>
                {sec.label}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--text-3)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Station
        </div>
        <div
          role="group"
          aria-label="Stations in this process"
          style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
        >
          {stations.length === 0 ? (
            <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              No stations in this process on the plant schema.
            </span>
          ) : (
            stations.map((st, i) => {
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
                    gap: 8,
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: active ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    background: active
                      ? "color-mix(in srgb, var(--accent) 8%, var(--surface))"
                      : "var(--surface-2)",
                    color: active ? "var(--accent)" : "var(--text)",
                    fontWeight: active ? 700 : 500,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: active ? "var(--accent)" : "var(--text-3)",
                      minWidth: 14,
                    }}
                  >
                    {i + 1}
                  </span>
                  {st.label}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
