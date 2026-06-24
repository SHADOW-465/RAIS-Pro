// src/app/clear-data/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { Card } from "@/components/app/widgets";
import Icon from "@/components/editorial/Icon";
import { useEvents } from "@/components/app/EventsContext";

export default function ClearDataPage() {
  const router = useRouter();
  const { refreshEvents } = useEvents();
  const [confirmText, setConfirmText] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canClear = confirmText.trim().toUpperCase() === "CLEAR" && agreed && !busy;

  async function handleClear() {
    if (!canClear) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clear-data", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error ?? "Clear data failed.");
      }
      await refreshEvents();
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to clear transactional data.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border-strong)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: "14px",
    fontFamily: "var(--font-mono)",
    outline: "none",
    marginTop: 8,
  };

  const btnStyle = (enabled: boolean): React.CSSProperties => ({
    background: enabled ? "var(--status-bad)" : "var(--surface-3)",
    color: enabled ? "#fff" : "var(--text-3)",
    border: "none",
    borderRadius: 9,
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 700,
    cursor: enabled ? "pointer" : "not-allowed",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    transition: "background 0.2s ease",
  });

  return (
    <AppShell active="settings">
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "12px 0 48px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 6px", color: "var(--text)" }}>
          Clear Transactional Data
        </h1>
        <p className="muted" style={{ fontSize: 14, margin: "0 0 24px" }}>
          Purge transactional records to reset the system for clean daily, weekly, monthly, and yearly testing.
        </p>

        {success ? (
          <div className="fade-up" style={{
            padding: "24px 28px",
            background: "color-mix(in srgb, var(--status-good) 8%, transparent)",
            border: "1px solid var(--status-good)",
            borderRadius: "var(--radius-lg)",
            textAlign: "center"
          }}>
            <div style={{
              width: 50, height: 50, borderRadius: "50%", background: "var(--status-good)",
              color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 16px"
            }}>
              <Icon name="check" size={26} stroke={2.5} />
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, margin: "0 0 10px", color: "var(--text)" }}>
              Data Purged Successfully
            </h3>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55, margin: "0 0 20px" }}>
              All events, comments, findings, and uploads have been removed. The active plant schema definitions, quality targets, and cost configurations remain intact.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => router.push("/staging")} style={{
                background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8,
                padding: "10px 20px", fontSize: 13.5, fontWeight: 600, cursor: "pointer"
              }}>
                Go to Staging
              </button>
              <button onClick={() => router.push("/")} style={{
                background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "10px 20px", fontSize: 13.5, fontWeight: 600, cursor: "pointer"
              }}>
                View Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", color: "var(--status-bad)", fontSize: 13 }}>
                {error}
              </div>
            )}

            <Card title="Purge Warning" sub="DANGEROUS ACTION">
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0" }}>
                <div style={{ color: "var(--status-bad)", flexShrink: 0, marginTop: 2 }}>
                  <Icon name="alert" size={20} stroke={2} />
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                  <p style={{ margin: "0 0 10px", fontWeight: 700, color: "var(--text)" }}>
                    The following transactional datasets will be permanently deleted:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 20, color: "var(--text-2)" }}>
                    <li style={{ marginBottom: 4 }}>Events Ledger (All parsed check, good, and defect records)</li>
                    <li style={{ marginBottom: 4 }}>Data Quality Findings & Supervisor Adjudications</li>
                    <li style={{ marginBottom: 4 }}>Operator & supervisor comments and overrides</li>
                    <li style={{ marginBottom: 4 }}>Ingestion logs, session logs, and raw file uploads</li>
                  </ul>
                  <p style={{ margin: "14px 0 0", color: "var(--status-good)", fontWeight: 600 }}>
                    ✓ Settings, quality limits, and dynamic plant schemas will be PRESERVED.
                  </p>
                </div>
              </div>
            </Card>

            <Card title="Safety Confirmation">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                    Type <strong style={{ color: "var(--status-bad)", fontFamily: "var(--font-mono)" }}>CLEAR</strong> to confirm deletion
                  </span>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type CLEAR here"
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span className="muted" style={{ lineHeight: 1.4 }}>
                    I understand that clearing transactional data is irreversible and all historical trend reports will be reset.
                  </span>
                </label>
              </div>
            </Card>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center" }}>
              <button
                onClick={() => router.push("/settings")}
                style={{
                  background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)",
                  borderRadius: 9, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={!canClear}
                style={btnStyle(canClear)}
              >
                <Icon name="x" size={14} stroke={2.5} />
                {busy ? "Purging..." : "Clear Transactional Data"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
