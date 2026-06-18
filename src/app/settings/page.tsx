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
