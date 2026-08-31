"use client";

import React from "react";
import QtyInput from "@/components/entry/QtyInput";
import type { MacroId } from "@/lib/entry/disposafe-matrix";

interface QuantityReconciliationZoneProps {
  macro: MacroId | string;
  processName: string;
  showChecked: boolean;
  showAccept: boolean;
  capturesHold: boolean;
  showReject: boolean;
  showTrolleys: boolean;
  showBin: boolean;
  checked: number;
  accept: number;
  hold: number;
  reject: number;
  trolleys: number;
  bin: string;
  onSetQty: (field: "checked" | "trolleys" | "accept" | "hold" | "reject", n: number | null) => void;
  onSetBin: (bin: string) => void;
  prefillNote: string | null;
  impliedRejectFromBalance: number;
  defectCoverage: {
    sum: number;
    reject: number;
    unexplained: number;
    state: "empty" | "complete" | "short" | "over";
  } | null;
}

export default function QuantityReconciliationZone({
  macro,
  processName,
  showChecked,
  showAccept,
  capturesHold,
  showReject,
  showTrolleys,
  showBin,
  checked,
  accept,
  hold,
  reject,
  trolleys,
  bin,
  onSetQty,
  onSetBin,
  prefillNote,
  impliedRejectFromBalance,
  defectCoverage,
}: QuantityReconciliationZoneProps) {
  const isPrimary = macro === "primary";
  const isSecondary = macro === "secondary";
  const qtyLabel = isPrimary ? "Quantity Produced" : isSecondary ? "Quantity" : "Checked Qty";

  const holdPart = capturesHold ? hold : 0;
  const sumParts = (showAccept ? accept : 0) + holdPart + (showReject ? reject : 0);
  const isBalanced = showReject ? checked > 0 && checked === sumParts : true;
  const difference = sumParts - checked;

  return (
    <section
      aria-label="Quantity Recording and Reconciliation"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg, 12px)",
        padding: "20px",
        marginBottom: 20,
        boxShadow: "var(--shadow-1)",
      }}
    >
      {/* Header */}
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
        <div>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            Quantity Entry & Balance Verification
          </h2>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            Values for {processName}
          </span>
        </div>

        {/* Live Balance Status Badge */}
        {showReject && checked > 0 && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              color: isBalanced ? "var(--positive)" : "var(--status-warn, #d97706)",
              background: isBalanced
                ? "var(--positive-weak)"
                : "color-mix(in srgb, var(--status-warn, #d97706) 12%, var(--surface))",
              border: `1px solid ${
                isBalanced
                  ? "color-mix(in srgb, var(--positive) 30%, transparent)"
                  : "color-mix(in srgb, var(--status-warn, #d97706) 35%, transparent)"
              }`,
            }}
          >
            <span>{isBalanced ? "✓ Balanced" : "⚠ Not Balanced"}</span>
            {!isBalanced && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                ({difference > 0 ? `+${difference}` : difference})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Upstream Assist Notification */}
      {prefillNote && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: "var(--radius-md, 8px)",
            background: "color-mix(in srgb, var(--accent) 8%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
            fontSize: 12.5,
            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>⚡ Upstream Assist:</span>
          <span>{prefillNote}</span>
        </div>
      )}

      {/* Quantity Input Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(130px, 1fr))`,
          gap: 14,
          marginBottom: 16,
        }}
      >
        {/* Checked / Produced Qty */}
        {showChecked && (
          <div
            style={{
              background: "var(--surface-2)",
              padding: "12px 14px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border)",
            }}
          >
            <label
              htmlFor="qty-checked"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              {qtyLabel}
            </label>
            <QtyInput
              id="qty-checked"
              value={checked || null}
              onChange={(n) => onSetQty("checked", n)}
              aria-label={qtyLabel}
              placeholder="0"
              style={{
                width: "100%",
                height: 46,
                fontSize: 19,
                fontWeight: 700,
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                background: "var(--surface)",
                border: "1.5px solid var(--border-strong)",
                borderRadius: "var(--radius-sm, 6px)",
                color: "var(--text)",
              }}
            />
          </div>
        )}

        {/* Trolleys (Primary) */}
        {showTrolleys && (
          <div
            style={{
              background: "var(--surface-2)",
              padding: "12px 14px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border)",
            }}
          >
            <label
              htmlFor="qty-trolleys"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-2)",
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              Trolleys
            </label>
            <QtyInput
              id="qty-trolleys"
              value={trolleys || null}
              onChange={(n) => onSetQty("trolleys", n)}
              aria-label="Trolleys"
              placeholder="0"
              style={{
                width: "100%",
                height: 46,
                fontSize: 18,
                fontWeight: 700,
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-sm, 6px)",
                color: "var(--text)",
              }}
            />
          </div>
        )}

        {/* Bin Location (Secondary) */}
        {showBin && (
          <div
            style={{
              background: "var(--surface-2)",
              padding: "12px 14px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border)",
            }}
          >
            <label
              htmlFor="bin-location"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-2)",
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              Bin Location
            </label>
            <input
              id="bin-location"
              type="text"
              value={bin}
              onChange={(e) => onSetBin(e.target.value)}
              placeholder="e.g. B-04"
              style={{
                width: "100%",
                height: 46,
                fontSize: 16,
                fontWeight: 600,
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-sm, 6px)",
                color: "var(--text)",
                outline: "none",
              }}
            />
          </div>
        )}

        {/* Accepted Qty */}
        {showAccept && (
          <div
            style={{
              background: "var(--surface-2)",
              padding: "12px 14px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border)",
            }}
          >
            <label
              htmlFor="qty-accept"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--positive)",
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              Accepted (Good)
            </label>
            <QtyInput
              id="qty-accept"
              value={accept || null}
              onChange={(n) => onSetQty("accept", n)}
              aria-label="Accepted quantity"
              placeholder="0"
              style={{
                width: "100%",
                height: 46,
                fontSize: 19,
                fontWeight: 700,
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                background: "var(--surface)",
                border: "1.5px solid color-mix(in srgb, var(--positive) 40%, var(--border))",
                borderRadius: "var(--radius-sm, 6px)",
                color: "var(--positive)",
              }}
            />
          </div>
        )}

        {/* Hold / Rework Qty */}
        {capturesHold && (
          <div
            style={{
              background: "var(--surface-2)",
              padding: "12px 14px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border)",
            }}
          >
            <label
              htmlFor="qty-hold"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--status-warn, #d97706)",
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              Hold / Rework
            </label>
            <QtyInput
              id="qty-hold"
              value={hold || null}
              onChange={(n) => onSetQty("hold", n)}
              aria-label="Hold or rework quantity"
              placeholder="0"
              style={{
                width: "100%",
                height: 46,
                fontSize: 19,
                fontWeight: 700,
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                background: "var(--surface)",
                border: "1.5px solid color-mix(in srgb, var(--status-warn, #d97706) 40%, var(--border))",
                borderRadius: "var(--radius-sm, 6px)",
                color: "var(--status-warn, #d97706)",
              }}
            />
          </div>
        )}

        {/* Rejected Qty (Auto-Derived from balance) */}
        {showReject && (
          <div
            style={{
              background: "var(--surface-2)",
              padding: "12px 14px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border)",
            }}
          >
            <label
              htmlFor="qty-reject"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 700,
                color: reject > 0 ? "var(--critical)" : "var(--text-2)",
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              Rejected
            </label>
            <QtyInput
              id="qty-reject"
              value={reject || null}
              onChange={(n) => onSetQty("reject", n)}
              aria-label="Rejected quantity"
              placeholder="0"
              style={{
                width: "100%",
                height: 46,
                fontSize: 19,
                fontWeight: 700,
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                background: "var(--surface)",
                border: `1.5px solid ${
                  reject > 0
                    ? "color-mix(in srgb, var(--critical) 40%, var(--border))"
                    : "var(--border-strong)"
                }`,
                borderRadius: "var(--radius-sm, 6px)",
                color: reject > 0 ? "var(--critical)" : "var(--text-3)",
              }}
            />
          </div>
        )}
      </div>

      {/* Reconciliation Equation Strip */}
      {showReject && checked > 0 && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-md, 8px)",
            background: isBalanced ? "var(--surface-2)" : "var(--warning-weak)",
            border: `1px solid ${
              isBalanced ? "var(--border)" : "color-mix(in srgb, var(--status-warn, #d97706) 40%, transparent)"
            }`,
            fontSize: 13,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
            }}
          >
            <span>
              {qtyLabel} <strong>{checked}</strong> = Accept <strong>{accept}</strong>
              {capturesHold ? ` + Hold ${hold}` : ""} + Reject <strong>{reject}</strong>
            </span>
            <span style={{ color: isBalanced ? "var(--positive)" : "var(--status-warn, #d97706)" }}>
              Sum: {sumParts} {isBalanced ? "(Matches 100%)" : `(Mismatch: ${difference > 0 ? `+${difference}` : difference})`}
            </span>
          </div>

          <div style={{ fontSize: 12, color: "var(--text-3)", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>
              Balance formula: Reject = {impliedRejectFromBalance} ({checked} − {accept} {capturesHold ? `− ${hold}` : ""})
            </span>
            {defectCoverage && defectCoverage.state === "short" && (
              <span style={{ color: "var(--warning)", fontWeight: 600 }}>
                • {defectCoverage.unexplained} of {reject} rejected pieces need reasons below
              </span>
            )}
            {defectCoverage && defectCoverage.state === "complete" && (
              <span style={{ color: "var(--positive)", fontWeight: 600 }}>
                • 100% of rejected pieces are accounted for in defect log
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
