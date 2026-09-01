"use client";

import React from "react";

interface StickySaveBarProps {
  batchId: string;
  processName: string;
  size: string;
  qtyLabel: string;
  checked: number;
  showReject: boolean;
  qtyMismatch: boolean;
  defectMismatch: boolean;
  defectSum: number;
  reject: number;
  editingId: string | null;
  onCancelEdit: () => void;
  onSubmitForm: () => void;
  saveDisabled: boolean;
  saving: boolean;
  blockMessage?: string;
}

export default function StickySaveBar({
  batchId,
  processName,
  size,
  qtyLabel,
  checked,
  showReject,
  qtyMismatch,
  defectMismatch,
  defectSum,
  reject,
  editingId,
  onCancelEdit,
  onSubmitForm,
  saveDisabled,
  saving,
  blockMessage,
}: StickySaveBarProps) {
  const saveLabel = saving
    ? "Saving to Ledger…"
    : editingId
      ? "Replace This Ledger Entry"
      : "Save to Plant Ledger";

  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 20,
        margin: "24px -16px -16px",
        padding: "14px 24px",
        background: "var(--surface)",
        borderTop: "1.5px solid var(--border-strong)",
        boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.06)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 14,
      }}
    >
      {/* Live Status Summary */}
      <div style={{ fontSize: 13, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {checked === 0 ? (
          <span style={{ color: "var(--text-3)" }}>
            Enter {qtyLabel} above to enable ledger commitment.
          </span>
        ) : (
          <>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text)" }}>
              {batchId}
            </span>
            <span>•</span>
            <span style={{ fontWeight: 600 }}>{processName}</span>
            <span>•</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{size}</span>
            <span>•</span>
            <span>
              {qtyLabel}: <strong>{checked}</strong>
            </span>
            {showReject && (
              <>
                <span>•</span>
                <span
                  style={{
                    color: qtyMismatch ? "var(--status-warn, #d97706)" : "var(--positive)",
                    fontWeight: 700,
                  }}
                >
                  {qtyMismatch ? "⚠ Math Mismatch" : "✓ Balanced"}
                </span>
              </>
            )}
            {showReject && defectMismatch && (
              <span style={{ color: "var(--critical)", fontWeight: 700 }}>
                • Defects {defectSum}/{reject}
              </span>
            )}
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {editingId && (
          <button
            type="button"
            onClick={onCancelEdit}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--radius-md, 8px)",
              background: "var(--surface-2)",
              color: "var(--text-2)",
              border: "1px solid var(--border-strong)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel Edit
          </button>
        )}

        <button
          type="button"
          onClick={onSubmitForm}
          disabled={saveDisabled}
          title={blockMessage || (saveDisabled ? "Resolve the issues above before saving" : "Commit to ledger")}
          style={{
            padding: "11px 26px",
            borderRadius: "var(--radius-md, 8px)",
            background: saveDisabled ? "var(--surface-3)" : "var(--accent)",
            color: saveDisabled ? "var(--text-3)" : "var(--text-invert)",
            border: "none",
            fontSize: 14,
            fontWeight: 700,
            cursor: saveDisabled ? "not-allowed" : "pointer",
            boxShadow: saveDisabled ? "none" : "0 2px 8px rgba(200, 66, 28, 0.25)",
            transition: "all var(--duration-fast, 120ms) ease",
          }}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
