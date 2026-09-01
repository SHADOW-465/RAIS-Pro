"use client";

import React from "react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import BatchIdField from "@/components/entry/BatchIdField";
import LotProgress from "@/components/LotProgress";
import type { CatheterCategory, CatheterType } from "@/lib/entry/disposafe-matrix";
import {
  CATHETER_CATEGORIES,
  CATHETER_TYPES,
  ENTRY_ROLES,
  type MacroId,
} from "@/lib/entry/disposafe-matrix";

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
}: BatchIdentityZoneProps) {
  const isAssembly = macro === "assembly";

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
              disabled={category === "Female" || category === "Peadiatric"}
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
              fontSize: 11.5,
              fontWeight: 700,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Lot Identification
          </div>

          <div>
            <BatchIdField
              batchId={batchId}
              onBatchIdChange={onBatchIdChange}
              batchDate={batchDate}
              onBatchDateChange={onBatchDateChange}
              size={size}
              recordedOn={date}
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}
            >
              Inspection Sequence
            </label>
            <Select
              value={String(pass)}
              onChange={(v) => onPassChange(parseInt(v, 10) || 1)}
              options={[
                { value: "1", label: "Pass 1 (Normal Standard Run)" },
                { value: "2", label: "Pass 2 (Repeat / Re-inspection)" },
                { value: "3", label: "Pass 3 (Special Re-work / Audit)" },
              ]}
              block
              ariaLabel="Inspection Sequence Pass"
            />
          </div>

          {pass > 1 && (
            <div>
              <label
                style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}
              >
                Reason for Repeat Pass (Required for GM)
              </label>
              <input
                type="text"
                value={passReason}
                onChange={(e) => onPassReasonChange(e.target.value)}
                placeholder="e.g. Line calibration re-check after stop"
                style={{
                  width: "100%",
                  height: 38,
                  padding: "0 10px",
                  borderRadius: "var(--radius-sm, 6px)",
                  border: "1.5px solid var(--accent)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
