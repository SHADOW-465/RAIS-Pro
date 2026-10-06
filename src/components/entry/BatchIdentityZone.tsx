"use client";

import React from "react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import BatchIdField from "@/components/entry/BatchIdField";
import LotProgress from "@/components/LotProgress";
import type { CatheterCategory, CatheterType } from "@/lib/entry/disposafe-matrix";
import { parseBatchId } from "@/lib/entry/batch-id";
import { STAGE_LABELS, resolveStageId } from "@/core/ontology/plant-catalog";
import {
  CATHETER_CATEGORIES,
  CATHETER_TYPES,
  ENTRY_ROLES,
  type MacroId,
} from "@/lib/entry/disposafe-matrix";

function shortMonth(monthIndex: number): string {
  return new Date(Date.UTC(2000, monthIndex, 1)).toLocaleString("en", {
    month: "short",
    timeZone: "UTC",
  });
}

export interface ConversionFlowInfo {
  fromBatch: string;
  toBatch?: string | null;
  fromSize?: string | null;
  toSize?: string | null;
  convertedOn?: string | null;
  reason?: string | null;
  originalChecked?: number | null;
  originalAccepted?: number | null;
  originalRejected?: number | null;
  /** Pieces that changed size. This is the quantity the converted lot starts with. */
  changedQty?: number | null;
  stageId?: string | null;
}

interface BatchIdentityZoneProps {
  date: string;
  onDateChange: (date: string) => void;
  shift: string;
  onShiftChange: (shift: string) => void;
  operator: string;
  onOperatorChange: (op: string) => void;
  category: CatheterCategory;
  onCategoryChange: (cat: CatheterCategory) => void;
  catheterType: CatheterType;
  onCatheterTypeChange: (type: CatheterType) => void;
  size: string;
  onSizeChange: (size: string) => void;
  catheterSizeOptions: readonly string[] | string[];
  batchId: string;
  onBatchIdChange: (id: string) => void;
  batchDate: string;
  onBatchDateChange: (d: string) => void;
  pass: number;
  onPassChange: (pass: number) => void;
  passReason: string;
  onPassReasonChange: (reason: string) => void;
  lotProgress: any;
  processName: string;
  macro: MacroId | string;
  editingId: string | null;
  memoryOn?: boolean;
  onToggleMemory?: () => void;
  hideConvertBatch?: boolean;
  conversionFlow?: ConversionFlowInfo | null;
  /** Active stage ID — carried to batch-conversion via URL so the page opens in context */
  stageId?: string;
  /** Quantity currently in the checked field — pre-fills conversion page */
  checked?: number;
  /** Quantity currently accepted — pre-fills conversion page */
  accepted?: number;
  /** Quantity currently on hold — pre-fills conversion page */
  hold?: number;
  /** Quantity currently rejected — pre-fills conversion page */
  reject?: number;
}

export default function BatchIdentityZone({
  date,
  onDateChange,
  shift,
  onShiftChange,
  operator,
  onOperatorChange,
  category,
  onCategoryChange,
  catheterType,
  onCatheterTypeChange,
  size,
  onSizeChange,
  catheterSizeOptions,
  batchId,
  onBatchIdChange,
  batchDate,
  onBatchDateChange,
  pass,
  onPassChange,
  passReason,
  onPassReasonChange,
  lotProgress,
  processName,
  macro,
  editingId,
  memoryOn = false,
  onToggleMemory,
  hideConvertBatch = false,
  conversionFlow,
  stageId,
  checked,
  accepted,
  hold,
  reject,
}: BatchIdentityZoneProps) {
  const isAssembly = macro === "assembly";

  const effectiveConvertedBatch =
    conversionFlow?.toBatch || (conversionFlow?.fromBatch !== batchId && batchId ? batchId : null);
  const convertedParsed = effectiveConvertedBatch ? parseBatchId(effectiveConvertedBatch) : null;

  return (
    <section
      aria-label="Batch Identity and Operational Context"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg, 12px)",
        padding: "20px",
        marginBottom: 20,
        boxShadow: "var(--shadow-1)",
      }}
    >
      {conversionFlow ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 16,
            borderBottom: "1px solid var(--border)",
            paddingBottom: 12,
          }}
        >
          {/* Conversion Flow Indicator: fromBatch CT toBatch */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--accent)",
                background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
                border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                padding: "3px 8px",
                borderRadius: 4,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M2 5.5h8.5a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M7 3 4.5 5.5 7 8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Batch Conversion</span>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                padding: "3px 8px",
                borderRadius: "var(--radius-sm, 6px)",
              }}
            >
              {/* Original batch */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text-2)",
                  letterSpacing: "0.02em",
                }}
              >
                {conversionFlow.fromBatch}
              </span>
              {conversionFlow.fromSize && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-3)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    padding: "1px 4px",
                    borderRadius: 3,
                  }}
                >
                  {conversionFlow.fromSize}
                </span>
              )}
              {(conversionFlow.changedQty ?? 0) > 0 && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-2)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    padding: "1px 6px",
                    borderRadius: 3,
                  }}
                  title="Pieces that changed size. The rest stay on the original lot."
                >
                  <span style={{ color: "var(--text-3)", fontSize: 9.5, fontWeight: 700 }}>CHANGED </span>
                  {conversionFlow.changedQty!.toLocaleString()}
                </span>
              )}
              {conversionFlow.stageId && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-2)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    padding: "1px 6px",
                    borderRadius: 3,
                  }}
                  title="Entry on the converted lot starts at this station"
                >
                  {STAGE_LABELS[resolveStageId(conversionFlow.stageId) ?? ""] ?? conversionFlow.stageId}
                </span>
              )}

              {/* CT flow indicator badge */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  color: "var(--accent)",
                  background: "color-mix(in srgb, var(--accent) 14%, var(--surface))",
                  border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                  padding: "1px 6px",
                  borderRadius: 4,
                  margin: "0 2px",
                }}
              >
                CT
                <span style={{ fontSize: 11, lineHeight: 1 }}>➔</span>
              </span>

              {/* Converted batch */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "var(--text)",
                  letterSpacing: "0.02em",
                }}
              >
                {effectiveConvertedBatch || "Select size…"}
              </span>
              {conversionFlow.toSize && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: "var(--font-mono)",
                    color: "var(--accent)",
                    fontWeight: 700,
                    background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
                    border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                    padding: "1px 5px",
                    borderRadius: 3,
                  }}
                >
                  {conversionFlow.toSize}
                </span>
              )}
            </div>
          </div>

          {/* Right side: breakdown of the converted batch ID */}
          {convertedParsed ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm, 6px)",
                padding: "4px 10px",
              }}
              title={`Breakdown of converted batch ID: ${effectiveConvertedBatch}`}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Converted Breakdown
              </span>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                <span style={{ color: "var(--text-2)" }}>
                  <span style={{ color: "var(--text-3)", fontSize: 9.5, fontWeight: 600 }}>YR </span>
                  {convertedParsed.year2}
                </span>
                <span style={{ color: "var(--border-strong)", fontSize: 10 }}>·</span>
                <span style={{ color: "var(--text-2)" }}>
                  <span style={{ color: "var(--text-3)", fontSize: 9.5, fontWeight: 600 }}>MO </span>
                  {shortMonth(convertedParsed.monthIndex)}
                </span>
                <span style={{ color: "var(--border-strong)", fontSize: 10 }}>·</span>
                <span style={{ color: "var(--text-2)" }}>
                  <span style={{ color: "var(--text-3)", fontSize: 9.5, fontWeight: 600 }}>DAY </span>
                  {convertedParsed.day}
                </span>
                <span style={{ color: "var(--border-strong)", fontSize: 10 }}>·</span>
                <span style={{ color: "var(--accent)", fontWeight: 800 }}>
                  <span style={{ color: "var(--text-3)", fontSize: 9.5, fontWeight: 600 }}>SZ </span>
                  {convertedParsed.sizeFr ? `${convertedParsed.sizeFr} FR` : conversionFlow.toSize || "—"}
                </span>
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-3)",
                background: "var(--surface-2)",
                padding: "3px 8px",
                borderRadius: 4,
              }}
            >
              Breakdown pending target size
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            borderBottom: "1px solid var(--border)",
            paddingBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Batch Identity & Product Specification
            </h2>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-3)",
                background: "var(--surface-2)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {batchId || "LOT CODE"}
            </span>
          </div>

          {isAssembly && lotProgress && (
            <div style={{ maxWidth: 280, width: "100%" }}>
              <LotProgress progress={lotProgress} />
            </div>
          )}
        </div>
      )}

      {/* 3-Column Responsive Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {/* Panel 1: Shift & Operator Context */}
        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: "var(--radius-md, 8px)",
            padding: "14px",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Work Context
          </div>

          <div>
            <label
              htmlFor="recorded-on-date"
              style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}
            >
              Recorded on (Day run)
            </label>
            <DatePicker
              value={date}
              onChange={onDateChange}
              ariaLabel="Date run at this station"
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}
            >
              Shift Window
            </label>
            <Select
              value={shift}
              onChange={onShiftChange}
              options={[
                { value: "Day Shift", label: "Day Shift (08:00–16:00)" },
                { value: "Evening Shift", label: "Evening Shift (16:00–00:00)" },
                { value: "Night Shift", label: "Night Shift (00:00–08:00)" },
              ]}
              block
              ariaLabel="Shift Selection"
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}
            >
              Operator Role
            </label>
            <Select
              value={operator}
              onChange={onOperatorChange}
              options={ENTRY_ROLES.map((r) => ({ value: r, label: r }))}
              block
              ariaLabel="Operator Role Selection"
            />
          </div>
        </div>

        {/* Panel 2: Product Specifications */}
        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: "var(--radius-md, 8px)",
            padding: "14px",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Product Specs
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}
            >
              Category
            </label>
            <Select
              value={category}
              onChange={(v) => onCategoryChange(v as CatheterCategory)}
              options={CATHETER_CATEGORIES.map((c) => ({ value: c, label: c }))}
              disabled={memoryOn}
              block
              ariaLabel="Catheter Category"
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}
            >
              Catheter Type
            </label>
            <Select
              value={catheterType}
              onChange={(v) => onCatheterTypeChange(v as CatheterType)}
              options={CATHETER_TYPES.map((t) => ({ value: t, label: t }))}
              disabled={memoryOn || category === "Female" || category === "Peadiatric"}
              block
              ariaLabel="Catheter Type"
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}
            >
              Product Size (Fr)
            </label>
            <Select
              value={size}
              onChange={onSizeChange}
              options={catheterSizeOptions.map((s) => ({ value: s, label: s }))}
              disabled={memoryOn}
              block
              ariaLabel="Product Size"
            />
          </div>
        </div>

        {/* Panel 3: Lot ID & Sequence */}
        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: "var(--radius-md, 8px)",
            padding: "14px",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: "var(--text-3)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Lot Identification
            </div>
            {conversionFlow && (
              <span
                style={{
                  fontSize: 10.5,
                  fontFamily: "var(--font-mono)",
                  color: "var(--accent)",
                  fontWeight: 600,
                  background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
                  padding: "1px 6px",
                  borderRadius: 4,
                  border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                }}
              >
                from {conversionFlow.fromBatch}
              </span>
            )}
          </div>

          <div>
            <BatchIdField
              batchId={batchId}
              onBatchIdChange={onBatchIdChange}
              batchDate={batchDate}
              onBatchDateChange={onBatchDateChange}
              size={size}
              recordedOn={date}
              disabled={memoryOn}
              memoryOn={memoryOn}
              onToggleMemory={onToggleMemory}
            />
          </div>

          {!hideConvertBatch && !conversionFlow && (
          <div style={{ marginTop: "auto", paddingTop: 8 }}>
            <a
              href={(() => {
                if (!batchId) return "/batch-conversion";
                const p = new URLSearchParams();
                p.set("fromBatch", batchId);
                p.set("date", date);
                if (stageId) p.set("stageId", stageId);
                if (checked != null && checked > 0) p.set("checked", String(checked));
                if (accepted != null && accepted > 0) p.set("accepted", String(accepted));
                if (hold != null && hold > 0) p.set("hold", String(hold));
                if (reject != null && reject > 0) p.set("reject", String(reject));
                return `/batch-conversion?${p.toString()}`;
              })()}
              title={
                batchId
                  ? `Convert batch ${batchId} to another size in Batch Conversion`
                  : "Open Batch Conversion"
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                height: 38,
                borderRadius: "var(--radius-sm, 6px)",
                background: "color-mix(in srgb, var(--accent) 12%, var(--surface))",
                border: "1px solid color-mix(in srgb, var(--accent) 45%, var(--border))",
                color: "var(--accent)",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "var(--font-sans)",
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.15s var(--ease-out)",
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>⇄</span>
              <span>Convert Batch</span>
              {batchId && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    background: "var(--surface)",
                    padding: "1px 6px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    color: "var(--text-2)",
                    marginLeft: 2,
                  }}
                >
                  {batchId}
                </span>
              )}
            </a>
            <p
              className="muted"
              style={{
                fontSize: 11,
                margin: "6px 0 0",
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              Carry batch memory &amp; size directly to Batch Conversion
            </p>
          </div>
          )}
        </div>
      </div>
    </section>
  );
}
