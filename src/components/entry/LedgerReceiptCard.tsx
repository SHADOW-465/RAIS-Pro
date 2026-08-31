"use client";

import React from "react";
import type { EntryIssue } from "@/components/BatchMatrixEntry";

interface LedgerReceiptCardProps {
  receipt: {
    batchId: string;
    stageName: string;
    size: string;
    checked: number;
    accept: number;
    reject: number;
    savedAt: string;
    synced: boolean;
    error?: string | null;
  } | null;
  lastIssues: {
    batchId: string;
    stage: string;
    issues: { code: string; severity: string; field: string; message: string }[];
  } | null;
  onDismissReceipt: () => void;
  onDismissIssues: () => void;
  onRetrySync?: () => void;
  isRetryingSync?: boolean;
}

export default function LedgerReceiptCard({
  receipt,
  lastIssues,
  onDismissReceipt,
  onDismissIssues,
  onRetrySync,
  isRetryingSync,
}: LedgerReceiptCardProps) {
  if (!receipt && (!lastIssues || lastIssues.issues.length === 0)) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
      {/* 1. Durable Ledger Receipt */}
      {receipt && (
        <div
          role="status"
          style={{
            background: receipt.synced ? "var(--positive-weak)" : "var(--warning-weak)",
            border: `1.5px solid ${
              receipt.synced
                ? "color-mix(in srgb, var(--positive) 50%, var(--border))"
                : "color-mix(in srgb, var(--status-warn, #d97706) 50%, var(--border))"
            }`,
            borderRadius: "var(--radius-lg, 12px)",
            padding: "16px 20px",
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
              borderBottom: `1px solid ${
                receipt.synced
                  ? "color-mix(in srgb, var(--positive) 25%, transparent)"
                  : "color-mix(in srgb, var(--status-warn, #d97706) 25%, transparent)"
              }`,
              paddingBottom: 10,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: receipt.synced ? "var(--positive)" : "var(--status-warn, #d97706)",
                }}
              >
                {receipt.synced ? "✓" : "●"}
              </span>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: receipt.synced ? "var(--positive)" : "var(--status-warn, #d97706)",
                  }}
                >
                  {receipt.synced
                    ? "Receipt: Confirmed on Plant Event Ledger"
                    : "Receipt: Stored on This Workstation Only"}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                  {new Date(receipt.savedAt).toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!receipt.synced && onRetrySync && (
                <button
                  type="button"
                  onClick={onRetrySync}
                  disabled={isRetryingSync}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--radius-sm, 6px)",
                    background: "var(--accent)",
                    color: "var(--text-invert)",
                    border: "none",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isRetryingSync ? "not-allowed" : "pointer",
                  }}
                >
                  {isRetryingSync ? "Retrying…" : "⚡ Retry Ledger Sync"}
                </button>
              )}
              <button
                type="button"
                onClick={onDismissReceipt}
                aria-label="Dismiss receipt"
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 16,
                  color: "var(--text-3)",
                  cursor: "pointer",
                  fontWeight: 700,
                  lineHeight: 1,
                  padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 12,
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-sans)" }}>Lot Code</div>
              <strong>{receipt.batchId}</strong>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-sans)" }}>Station</div>
              <strong>{receipt.stageName}</strong>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-sans)" }}>Size</div>
              <strong>{receipt.size}</strong>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-sans)" }}>Checked Qty</div>
              <strong>{receipt.checked}</strong>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-sans)" }}>Accepted / Yield</div>
              <strong>
                {receipt.accept} (
                {receipt.checked > 0 ? ((receipt.accept / receipt.checked) * 100).toFixed(1) + "%" : "—"})
              </strong>
            </div>
          </div>

          {receipt.error && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                borderRadius: 6,
                background: "var(--surface)",
                fontSize: 12,
                color: "var(--critical)",
                border: "1px solid color-mix(in srgb, var(--critical) 30%, transparent)",
              }}
            >
              <strong>Sync Error:</strong> {receipt.error}. The record is preserved locally and will retry automatically.
            </div>
          )}
        </div>
      )}

      {/* 2. Server Findings & Clarifications */}
      {lastIssues && lastIssues.issues.length > 0 && (
        <div
          role="status"
          style={{
            background: "var(--surface)",
            border: "1px solid color-mix(in srgb, var(--warning) 45%, transparent)",
            borderRadius: "var(--radius-lg, 12px)",
            padding: "16px 20px",
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
              borderBottom: "1px solid var(--border)",
              paddingBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--warning)" }}>
                Auditor & Ledger Clarifications ({lastIssues.issues.length})
              </span>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {lastIssues.batchId} · {lastIssues.stage}
              </span>
            </div>
            <button
              type="button"
              onClick={onDismissIssues}
              aria-label="Dismiss clarifications"
              style={{
                background: "transparent",
                border: "none",
                fontSize: 14,
                color: "var(--text-3)",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>

          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {lastIssues.issues.map((i, idx) => (
              <li key={`${i.code}-${idx}`} style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.4 }}>
                {i.message}{" "}
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: 11 }}>
                  ({i.code})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
