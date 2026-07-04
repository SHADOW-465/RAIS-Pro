"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/app/AppShell";
import { Card } from "@/components/app/widgets";
import Icon from "@/components/editorial/Icon";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import { useEvents } from "@/components/app/EventsContext";

export default function SettingsPage() {
  const { refreshEvents } = useEvents();
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
  const [resetSaved, setResetSaved] = useState(false);

  // Administrative Reset States
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [showClearSchemaModal, setShowClearSchemaModal] = useState(false);
  const [clearSchemaConfirmText, setClearSchemaConfirmText] = useState("");
  const [showHardModal, setShowHardModal] = useState(false);
  const [hardConfirmText, setHardConfirmText] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const handleClearTransactions = async () => {
    if (clearConfirmText.trim().toUpperCase() !== "CLEAR") return;
    setBusyAction("clear");
    setActionStatus(null);
    try {
      const res = await fetch("/api/clear-data", { method: "POST" });
      if (!res.ok) throw new Error("Purge failed");
      await refreshEvents();
      setActionStatus("Transaction data cleared successfully.");
      setShowClearModal(false);
      setClearConfirmText("");
    } catch (e: any) {
      setActionStatus("Error: " + (e.message ?? "Purge failed"));
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearSchema = async () => {
    if (clearSchemaConfirmText.trim().toUpperCase() !== "RESET") return;
    setBusyAction("clear-schema");
    setActionStatus(null);
    try {
      const res = await fetch("/api/clear-schema", { method: "POST" });
      if (!res.ok) throw new Error("Failed to clear schema registry");
      await refreshEvents();
      setActionStatus("Schema registry reset to defaults successfully.");
      setShowClearSchemaModal(false);
      setClearSchemaConfirmText("");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e: any) {
      setActionStatus("Error: " + (e.message ?? "Failed to clear schema"));
    } finally {
      setBusyAction(null);
    }
  };

  const handleHardReset = async () => {
    if (hardConfirmText !== "RESET") return;
    setBusyAction("hard");
    setActionStatus(null);
    try {
      const res = await fetch("/api/hard-reset", { method: "POST" });
      if (!res.ok) throw new Error("Hard reset failed");
      await refreshEvents();
      setActionStatus("Application has been hard reset to pristine state.");
      setShowHardModal(false);
      setHardConfirmText("");
      setTimeout(() => {
        window.location.href = "/staging";
      }, 1500);
    } catch (e: any) {
      setActionStatus("Error: " + (e.message ?? "Hard reset failed"));
    } finally {
      setBusyAction(null);
    }
  };

  // Editable custom defect mappings (the base registry is read-only; these are
  // user additions persisted locally and merged into the displayed registry).
  interface CustomDefect { code: string; label: string; aliases: string }
  const [customDefects, setCustomDefects] = useState<CustomDefect[]>([]);
  const [draft, setDraft] = useState<CustomDefect>({ code: "", label: "", aliases: "" });

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const tr = localStorage.getItem("rais_settings_target_rejection");
      const wr = localStorage.getItem("rais_settings_watch_rejection");
      const uc = localStorage.getItem("rais_settings_finished_cost");
      if (tr) setTargetRej(tr);
      if (wr) setWatchRej(wr);
      if (uc) setUnitCost(uc);
      try {
        const cd = localStorage.getItem("rais_custom_defects");
        if (cd) setCustomDefects(JSON.parse(cd));
      } catch { /* ignore malformed */ }

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

      localStorage.setItem("rais_custom_defects", JSON.stringify(customDefects));

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const addCustomDefect = () => {
    const code = draft.code.trim().toUpperCase();
    if (!code || !draft.label.trim()) return;
    setCustomDefects((prev) => [
      ...prev.filter((d) => d.code !== code),
      { code, label: draft.label.trim(), aliases: draft.aliases.trim() },
    ]);
    setDraft({ code: "", label: "", aliases: "" });
  };
  const removeCustomDefect = (code: string) =>
    setCustomDefects((prev) => prev.filter((d) => d.code !== code));

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
    setResetSaved(true);
    setTimeout(() => setResetSaved(false), 1500);
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

          {/* Editable Custom Defect Mappings */}
          <Card title="Custom Defect Mappings (Editable)" sub="Add plant-specific defect codes & aliases — merged into parsing on save">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {customDefects.length > 0 && (
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                      <th style={thStyle}>Code</th>
                      <th style={thStyle}>Label</th>
                      <th style={thStyle}>Aliases</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customDefects.map((d) => (
                      <tr key={d.code} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{d.code}</td>
                        <td style={tdStyle}>{d.label}</td>
                        <td style={tdStyle}>{d.aliases || "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <button onClick={() => removeCustomDefect(d.code)} style={{ background: "transparent", border: "none", color: "var(--status-bad)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1.4fr auto", gap: 8, alignItems: "end" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="muted" style={{ fontSize: 10.5, fontWeight: 600 }}>Code</span>
                  <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="e.g. KINK" style={{ ...inpStyle, fontFamily: "var(--font-mono)" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="muted" style={{ fontSize: 10.5, fontWeight: 600 }}>Official Label</span>
                  <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Kinked Shaft" style={inpStyle} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="muted" style={{ fontSize: 10.5, fontWeight: 600 }}>Aliases (comma-separated)</span>
                  <input value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} placeholder="KINK, KNK, BENT" style={inpStyle} />
                </label>
                <button onClick={addCustomDefect} disabled={!draft.code.trim() || !draft.label.trim()} style={{ ...btnPrimary, padding: "8px 16px", opacity: !draft.code.trim() || !draft.label.trim() ? 0.5 : 1 }}>
                  + Add
                </button>
              </div>
              <span className="muted" style={{ fontSize: 10.5 }}>Click <strong>Save Configurations</strong> below to persist. Base registry codes (above) are managed in code and remain read-only.</span>
            </div>
          </Card>

          {/* Administrative Actions */}
          <Card title="Administrative Actions" sub="System resets, ledger purging, and decommissioning operations">
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
              {actionStatus && (
                <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: actionStatus.startsWith("Error") ? "color-mix(in srgb, var(--status-bad) 12%, transparent)" : "var(--positive-weak)", color: actionStatus.startsWith("Error") ? "var(--status-bad)" : "var(--positive)", fontSize: 13, fontWeight: 600 }}>
                  {actionStatus}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Clear transaction data */}
                <div style={{ border: "1.5px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
                  <div>
                    <h4 style={{ margin: "0 0 6px 0", fontSize: 14, fontWeight: 700 }}>Purge Transactional Logs</h4>
                    <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-3)", lineHeight: "1.5" }}>
                      Wipes all production, inspection, rejection records, trend logs, and findings. Registry schema and configurations remain fully intact.
                    </p>
                  </div>
                  <button 
                    onClick={() => { setShowClearModal(true); setActionStatus(null); }}
                    style={{ ...btnGhost, color: "var(--status-bad)", borderColor: "var(--status-bad)", width: "100%", padding: "8px 16px" }}
                  >
                    Clear Transaction Data
                  </button>
                </div>

                {/* Clear schema registry */}
                <div style={{ border: "1.5px solid var(--status-bad)", borderRadius: "var(--radius-md)", padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14, background: "color-mix(in srgb, var(--status-bad) 4%, transparent)" }}>
                  <div>
                    <h4 style={{ margin: "0 0 6px 0", fontSize: 14, fontWeight: 700, color: "var(--status-bad)" }}>Clear Schema Registry</h4>
                    <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-3)", lineHeight: "1.5" }}>
                      Removes all custom-defined fields and custom inspection stages. Resets the schema registry back to the default layout. Keeps base configurations.
                    </p>
                  </div>
                  <button 
                    onClick={() => { setShowClearSchemaModal(true); setActionStatus(null); }}
                    style={{ ...btnPrimary, background: "var(--status-bad)", color: "#fff", width: "100%", padding: "8px 16px" }}
                  >
                    Clear Schema Registry
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Bottom Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
            <button 
              onClick={handleReset} 
              style={{
                ...btnGhost,
                color: resetSaved ? "var(--status-good)" : "var(--text-2)",
                borderColor: resetSaved ? "var(--status-good)" : "var(--border)",
                transition: "all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
              }}
            >
              {resetSaved ? "✓ Values Reset" : "Reset to Defaults"}
            </button>
            <button 
              onClick={handleSave} 
              style={{
                ...btnPrimary,
                background: saved ? "var(--status-good)" : "var(--accent)",
                transition: "all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
              }}
            >
              {saved ? "✓ Configurations Saved" : "Save Configurations"}
            </button>
          </div>
        </div>
      </div>

      {/* Clear transaction confirmation modal */}
      {showClearModal && (
        <div 
          className="modal-backdrop"
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(18,16,14,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowClearModal(false); }}
        >
          <div 
            className="modal-panel"
            style={{ background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: "var(--radius-lg)", boxShadow: "8px 8px 0px var(--ink)", width: "100%", maxWidth: "500px", display: "flex", flexDirection: "column", color: "var(--ink)" }}
          >
            <div style={{ padding: "20px 24px", borderBottom: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0 }}>Purge Transactions Confirmation</h3>
              <button onClick={() => setShowClearModal(false)} style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-2)" }}>&times;</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, margin: 0 }}>
                This will delete all quality inspections, defect logs, findings, and events. Your plant configurations and defect codes will be retained.
              </p>
              <div style={{ background: "color-mix(in srgb, var(--status-warn) 10%, transparent)", border: "1.5px solid var(--status-warn)", borderRadius: "var(--radius-md)", padding: 12, fontSize: 12, color: "var(--text)", fontWeight: 600 }}>
                ⚠ Warning: This operation is irreversible. All historical charts and trend lines will be cleared.
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>Type CLEAR to confirm:</span>
                <input 
                  type="text" 
                  value={clearConfirmText} 
                  onChange={(e) => setClearConfirmText(e.target.value.toUpperCase())} 
                  placeholder="CLEAR" 
                  style={{ ...inpStyle, fontFamily: "var(--font-mono)", textAlign: "center", textTransform: "uppercase" }} 
                />
              </label>
            </div>
            <div style={{ padding: "14px 20px", borderTop: "1.5px solid var(--border)", background: "var(--surface-2)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowClearModal(false)} style={{ ...btnGhost, transition: "all 0.2s ease" }}>Cancel</button>
              <button 
                onClick={handleClearTransactions} 
                disabled={clearConfirmText.trim().toUpperCase() !== "CLEAR" || busyAction === "clear"} 
                style={{ ...btnPrimary, background: "var(--status-bad)", color: "#fff", opacity: clearConfirmText.trim().toUpperCase() === "CLEAR" ? 1 : 0.5, transition: "all 0.2s ease" }}
              >
                {busyAction === "clear" ? "Clearing..." : "Yes, Purge Data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear schema confirmation modal */}
      {showClearSchemaModal && (
        <div 
          className="modal-backdrop"
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(18,16,14,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowClearSchemaModal(false); }}
        >
          <div 
            className="modal-panel"
            style={{ background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: "var(--radius-lg)", boxShadow: "8px 8px 0px var(--ink)", width: "100%", maxWidth: "500px", display: "flex", flexDirection: "column", color: "var(--ink)" }}
          >
            <div style={{ padding: "20px 24px", borderBottom: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0, color: "var(--status-bad)" }}>Clear Schema Registry Confirmation</h3>
              <button onClick={() => setShowClearSchemaModal(false)} style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-2)" }}>&times;</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, margin: 0 }}>
                This removes all custom fields and custom inspection stages. Your master schema registry will be reset back to the default configuration.
              </p>
              <div style={{ background: "color-mix(in srgb, var(--status-bad) 10%, transparent)", border: "1.5px solid var(--status-bad)", borderRadius: "var(--radius-md)", padding: 12, fontSize: 12, color: "var(--status-bad)", fontWeight: 700 }}>
                CRITICAL WARNING: This will reset custom fields in all stages. Direct entry tables will reload to base default fields.
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>Type RESET to confirm:</span>
                <input 
                  type="text" 
                  value={clearSchemaConfirmText} 
                  onChange={(e) => setClearSchemaConfirmText(e.target.value.toUpperCase())} 
                  placeholder="RESET" 
                  style={{ ...inpStyle, fontFamily: "var(--font-mono)", textAlign: "center", textTransform: "uppercase" }} 
                />
              </label>
            </div>
            <div style={{ padding: "14px 20px", borderTop: "1.5px solid var(--border)", background: "var(--surface-2)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowClearSchemaModal(false)} style={{ ...btnGhost, transition: "all 0.2s ease" }}>Cancel</button>
              <button 
                onClick={handleClearSchema} 
                disabled={clearSchemaConfirmText.trim().toUpperCase() !== "RESET" || busyAction === "clear-schema"} 
                style={{ ...btnPrimary, background: "var(--status-bad)", color: "#fff", opacity: clearSchemaConfirmText.trim().toUpperCase() === "RESET" ? 1 : 0.5, transition: "all 0.2s ease" }}
              >
                {busyAction === "clear-schema" ? "Resetting..." : "Yes, Reset Registry"}
              </button>
            </div>
          </div>
        </div>
      )}
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
