"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/app/AppShell";
import { Card } from "@/components/app/widgets";
import Icon from "@/components/editorial/Icon";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

export default function SettingsPage() {
  const [targetRej, setTargetRej] = useState("10.00");
  const [watchRej, setWatchRej] = useState("5.00");
  const [unitCost, setUnitCost] = useState("20.00");
  const [stageWeights, setStageWeights] = useState<Record<string, string>>({
    "visual": "0.60",
    "eye-punching": "0.70",
    "balloon": "0.80",
    "valve-integrity": "0.90",
    "final": "1.00",
  });

  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<null | "data" | "schema">(null);
  const [dangerMsg, setDangerMsg] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const tr = localStorage.getItem("rais_settings_target_rejection");
      const wr = localStorage.getItem("rais_settings_watch_rejection");
      const uc = localStorage.getItem("rais_settings_finished_cost");
      if (tr) setTargetRej(tr);
      if (wr) setWatchRej(wr);
      if (uc) setUnitCost(uc);

      const weights: Record<string, string> = {};
      DISPOSAFE_REGISTRY.stages.forEach(s => {
        const stored = localStorage.getItem(`rais_settings_weight_${s.stageId}`);
        weights[s.stageId] = stored || (s.stageId === "visual" ? "0.60" : s.stageId === "eye-punching" ? "0.70" : s.stageId === "balloon" ? "0.80" : s.stageId === "valve-integrity" ? "0.90" : "1.00");
      });
      setStageWeights(weights);
    }
  }, []);

  const handleWeightChange = (stageId: string, val: string) => {
    setStageWeights(prev => ({
      ...prev,
      [stageId]: val
    }));
  };

  const handleSave = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("rais_settings_target_rejection", targetRej);
      localStorage.setItem("rais_settings_watch_rejection", watchRej);
      localStorage.setItem("rais_settings_finished_cost", unitCost);

      Object.entries(stageWeights).forEach(([id, val]) => {
        localStorage.setItem(`rais_settings_weight_${id}`, val);
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleReset = () => {
    setTargetRej("10.00");
    setWatchRej("5.00");
    setUnitCost("20.00");
    setStageWeights({
      "visual": "0.60",
      "eye-punching": "0.70",
      "balloon": "0.80",
      "valve-integrity": "0.90",
      "final": "1.00",
    });
  };

  // Danger zone — wipe the canonical ledger (server) or the local schema/draft state.
  const clearData = async () => {
    if (!window.confirm("Permanently delete ALL ingested data from the ledger? This cannot be undone. You can re-upload your Excel files afterwards.")) return;
    setBusy("data"); setDangerMsg(null);
    try {
      const res = await fetch("/api/clear-data", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Clear failed");
      setDangerMsg(`Cleared ${body.deleted ?? 0} events from the ledger. Re-upload via Staging or Data Entry to repopulate.`);
    } catch (e) {
      setDangerMsg(`Clear failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const clearSchema = () => {
    if (!window.confirm("Reset the entry schema, drafts, and local settings on this device? Ledger data is NOT affected.")) return;
    setBusy("schema"); setDangerMsg(null);
    try {
      if (typeof window !== "undefined") {
        const kill = Object.keys(localStorage).filter((k) =>
          k.startsWith("rais_settings_") || k.startsWith("moid_draft_") || k.startsWith("moid_schema") || k.startsWith("rais_schema"),
        );
        kill.forEach((k) => localStorage.removeItem(k));
        handleReset();
        setDangerMsg(`Cleared ${kill.length} local schema/draft/setting keys.`);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell active="settings">
      <div style={{ width: "100%", paddingBottom: 48 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            System Settings
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Configure default plant targets, financial cost structures, quality status limits, and inspect active registries.
          </p>
        </div>

        {saved && (
          <div style={{
            marginBottom: 20,
            padding: "12px 18px",
            background: "var(--positive-weak)",
            border: "1px solid var(--positive)",
            borderRadius: "var(--radius-md)",
            color: "var(--positive)",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
            animation: "fade-up 0.2s ease"
          }}>
            <Icon name="check" size={16} stroke={2.5} />
            Settings saved successfully. Dashboard calculations updated.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Rejection Thresholds */}
            <Card title="Quality Thresholds" sub="Configures warnings and status badges">
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>Target Rejection Limit (%)</span>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input 
                      type="number" 
                      value={targetRej} 
                      onChange={(e) => setTargetRej(e.target.value)} 
                      style={inpStyle} 
                      step="0.01" 
                    />
                    <span style={suffixStyle}>%</span>
                  </div>
                  <span className="muted" style={{ fontSize: 10 }}>Overall shopfloor rejection rates above this trigger an &quot;At Risk&quot; warning.</span>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>Watch Warning Limit (%)</span>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input 
                      type="number" 
                      value={watchRej} 
                      onChange={(e) => setWatchRej(e.target.value)} 
                      style={inpStyle} 
                      step="0.01" 
                    />
                    <span style={suffixStyle}>%</span>
                  </div>
                  <span className="muted" style={{ fontSize: 10 }}>Overall rates between this and the target trigger a &quot;Watch&quot; status.</span>
                </label>
              </div>
            </Card>

            {/* Cost Configurations */}
            <Card title="Financial Valuation Defaults" sub="Drives COPQ and Savings Opportunity analytics">
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>Finished Catheter Valuation (₹)</span>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <span style={prefixStyle}>₹</span>
                    <input 
                      type="number" 
                      value={unitCost} 
                      onChange={(e) => setUnitCost(e.target.value)} 
                      style={{ ...inpStyle, paddingLeft: 28 }} 
                      step="0.01" 
                    />
                    <span style={suffixStyle}>INR</span>
                  </div>
                  <span className="muted" style={{ fontSize: 10 }}>Default base value-add per catheter at the Final stage.</span>
                </label>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 2 }}>Stage-wise Added Value Cost Weights</span>
                  {DISPOSAFE_REGISTRY.stages.map(s => (
                    <div key={s.stageId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                      <span className="muted" style={{ fontWeight: 500 }}>{s.label}</span>
                      <div style={{ position: "relative", display: "flex", alignItems: "center", width: 100 }}>
                        <input 
                          type="number" 
                          value={stageWeights[s.stageId] ?? ""} 
                          onChange={(e) => handleWeightChange(s.stageId, e.target.value)} 
                          style={{ ...inpStyle, width: 100, textAlign: "right", paddingRight: 24 }} 
                          step="0.01" 
                          min="0" 
                          max="2" 
                        />
                        <span style={{ ...suffixStyle, right: 8 }}>x</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Active Registry View */}
          <Card title="Quality Registry (Read-Only)" sub="Active client definitions for parsing validation">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
                  Defect Class Mapping Registry
                </span>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                      <th style={thStyle}>Code</th>
                      <th style={thStyle}>Official Label</th>
                      <th style={thStyle}>Observed Aliases</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DISPOSAFE_REGISTRY.defects.map(d => (
                      <tr key={d.defectCode} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{d.defectCode}</td>
                        <td style={tdStyle}>{d.label}</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {d.aliases.map(a => (
                              <span key={a} style={{ fontSize: 10, background: "var(--surface-3)", padding: "1px 6px", borderRadius: 4, border: "1px solid var(--border)" }}>
                                {a}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          {/* Danger Zone — destructive resets */}
          <Card title="Data Management (Danger Zone)" sub="Destructive — use with care">
            {dangerMsg && (
              <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-strong)", fontSize: 12.5, color: "var(--text-2)" }}>
                {dangerMsg}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Clear All Data</span>
                <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                  Permanently wipes the entire canonical-event ledger (all uploaded &amp; entered data). Use this to start fresh or to re-ingest after a bad import. Re-upload via Staging or Data Entry afterwards.
                </span>
                <button onClick={clearData} disabled={busy !== null} style={{ ...btnDanger, opacity: busy ? 0.6 : 1 }}>
                  {busy === "data" ? "Clearing…" : "Clear All Data"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Clear Schema &amp; Local Settings</span>
                <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                  Resets the data-entry schema, saved drafts, and this device&apos;s settings (targets, weights) to defaults. Ledger data is <strong>not</strong> affected.
                </span>
                <button onClick={clearSchema} disabled={busy !== null} style={{ ...btnDangerGhost, opacity: busy ? 0.6 : 1 }}>
                  {busy === "schema" ? "Clearing…" : "Clear Schema & Settings"}
                </button>
              </div>
            </div>
          </Card>

          {/* Bottom Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
            <button onClick={handleReset} style={btnGhost}>
              Reset to Defaults
            </button>
            <button onClick={handleSave} style={btnPrimary}>
              Save Configurations
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

const inpStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "13.5px",
  fontFamily: "var(--font-mono)",
  outline: "none"
};

const prefixStyle: React.CSSProperties = {
  position: "absolute",
  left: 10,
  fontSize: "13.5px",
  color: "var(--text-3)",
  fontWeight: 600
};

const suffixStyle: React.CSSProperties = {
  position: "absolute",
  right: 12,
  fontSize: "11px",
  color: "var(--text-3)",
  fontWeight: 700
};

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert)",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "10px 24px",
  fontSize: "13.5px",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "var(--shadow-1)"
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "10px 24px",
  fontSize: "13.5px",
  fontWeight: 600,
  cursor: "pointer"
};

const thStyle: React.CSSProperties = { padding: "8px 10px", fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "8px 10px", color: "var(--text-2)" };

const btnDanger: React.CSSProperties = {
  background: "var(--critical)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "9px 16px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  alignSelf: "flex-start",
};

const btnDangerGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--critical)",
  border: "1px solid var(--critical)",
  borderRadius: "var(--radius-md)",
  padding: "9px 16px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  alignSelf: "flex-start",
};
