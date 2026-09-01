"use client";

import React, { useState } from "react";
import type { EntryVerdict, EntryProblem } from "@/lib/entry/check-entry";
import { warningNeedsReason } from "@/lib/entry/exception-reasons";

interface IssueSummaryZoneProps {
  verdict: EntryVerdict;
  showBlocks: boolean;
  showAdvisories: boolean;
  acked: Record<string, boolean>;
  onAckChange: (code: string, checked: boolean) => void;
  ackReasons: Record<string, string>;
  onAckReasonChange: (code: string, reason: string) => void;
}

export default function IssueSummaryZone({
  verdict,
  showBlocks,
  showAdvisories,
  acked,
  onAckChange,
  ackReasons,
  onAckReasonChange,
}: IssueSummaryZoneProps) {
  const [showNotes, setShowNotes] = useState(true);

  const visibleBlocks = showBlocks ? verdict.blocks : [];
  const visibleWarnings = showAdvisories ? verdict.warnings : [];
  const visibleNotes = showAdvisories ? verdict.notes : [];

  if (visibleBlocks.length === 0 && visibleWarnings.length === 0 && visibleNotes.length === 0) {
    return null;
  }

  return (
    <div
      id="entry-verdict-zone"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        marginBottom: 20,
      }}
    >
      {/* 1. MUST FIX (BLOCKING) */}
      {visibleBlocks.length > 0 && (
        <div
          role="alert"
          style={{
            background: "var(--critical-weak)",
            border: "1px solid color-mix(in srgb, var(--critical) 40%, transparent)",
            borderRadius: "var(--radius-lg, 12px)",
            padding: "16px 20px",
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--critical)",
              marginBottom: 10,
            }}
          >
            <span>✕</span>
            <span>
              Must Fix Before Saving ({visibleBlocks.length} issue{visibleBlocks.length > 1 ? "s" : ""})
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleBlocks.map((b) => (
              <div
                key={b.code}
                style={{
                  background: "var(--surface)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md, 8px)",
                  border: "1px solid color-mix(in srgb, var(--critical) 25%, transparent)",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--critical)" }}>
                  {b.message}
                </div>
                {b.action && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-2)",
                      marginTop: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    {b.action}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. NEEDS CONFIRMATION (WARNINGS) */}
      {visibleWarnings.length > 0 && (
        <div
          style={{
            background: "var(--warning-weak)",
            border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)",
            borderRadius: "var(--radius-lg, 12px)",
            padding: "16px 20px",
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--warning)",
              marginBottom: 10,
            }}
          >
            <span>⚠</span>
            <span>
              Needs Explicit Confirmation ({visibleWarnings.length} item{visibleWarnings.length > 1 ? "s" : ""})
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visibleWarnings.map((w) => {
              const isAcked = !!acked[w.code];
              const needsReason = warningNeedsReason(w.code);

              return (
                <div
                  key={w.code}
                  style={{
                    background: isAcked ? "var(--surface)" : "var(--surface)",
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md, 8px)",
                    border: `1.5px solid ${
                      isAcked
                        ? "color-mix(in srgb, var(--positive) 50%, var(--border))"
                        : "color-mix(in srgb, var(--warning) 35%, transparent)"
                    }`,
                    transition: "all var(--duration-fast, 120ms) ease",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                    {w.message}
                  </div>
                  {w.action && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-2)",
                        marginTop: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {w.action}
                    </div>
                  )}

                  {/* Explicit Confirmation Checkbox */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 10,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: isAcked ? "var(--positive)" : "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isAcked}
                      onChange={(e) => onAckChange(w.code, e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
                    />
                    <span>
                      {w.code === "station-already-recorded"
                        ? "I confirm: Replace the existing ledger entry for this day"
                        : w.code === "rejected-not-fully-explained"
                          ? "I confirm: Record remaining rejects without itemized defect reasons and notify GM"
                          : "I have verified this discrepancy — confirm and proceed"}
                    </span>
                  </label>

                  {/* Required written GM explanation if required */}
                  {isAcked && needsReason && (
                    <div style={{ marginTop: 10 }}>
                      <label
                        htmlFor={`ack-reason-${w.code}`}
                        style={{
                          display: "block",
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "var(--accent)",
                          marginBottom: 4,
                        }}
                      >
                        Explanation for General Manager (Required):
                      </label>
                      <input
                        id={`ack-reason-${w.code}`}
                        type="text"
                        value={ackReasons[w.code] || ""}
                        onChange={(e) => onAckReasonChange(w.code, e.target.value)}
                        placeholder="State why this exception occurred on the floor…"
                        style={{
                          width: "100%",
                          height: 36,
                          padding: "0 10px",
                          borderRadius: "var(--radius-sm, 6px)",
                          border: "1.5px solid var(--accent)",
                          background: "var(--surface)",
                          color: "var(--text)",
                          fontSize: 12.5,
                          outline: "none",
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. OPERATIONAL INFORMATION & NOTES */}
      {visibleNotes.length > 0 && (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg, 12px)",
            padding: "12px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
            onClick={() => setShowNotes(!showNotes)}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-3)" }}>
              ℹ Operational Notes ({visibleNotes.length})
            </div>
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                fontSize: 11.5,
                color: "var(--text-3)",
                cursor: "pointer",
              }}
            >
              {showNotes ? "Collapse" : "Expand"}
            </button>
          </div>

          {showNotes && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {visibleNotes.map((n) => (
                <div key={n.code} style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.4 }}>
                  • {n.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
