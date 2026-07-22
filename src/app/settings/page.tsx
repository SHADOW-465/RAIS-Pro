"use client";

import "./settings.css";

/* Hallmark · macrostructure: Index-First · genre: modern-minimal · tone: utilitarian
 * theme: project-locked (Geist · burnt orange #C8421C · paper surfaces)
 * enrichment: none · designed-as-app · redesign of /settings
 * pre-emit critique: P5 H5 E4 S4 R5 V4
 */

import { useEffect, useState } from "react";
import AppShell from "@/components/app/AppShell";
import Icon from "@/components/editorial/Icon";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";

type SectionId = "quality" | "valuation" | "registry" | "custom" | "admin";

const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: "quality", label: "Quality thresholds", hint: "Rejection limits & status badges" },
  { id: "valuation", label: "Financial valuation", hint: "Unit cost & stage weights" },
  { id: "registry", label: "Defect registry", hint: "Read-only plant catalog" },
  { id: "custom", label: "Custom codes", hint: "Plant-specific aliases" },
  { id: "admin", label: "Administrative", hint: "Purge & schema reset" },
];

export default function SettingsPage() {
  const { refreshEvents } = useEvents();
  const { registry } = useRegistry();
  const activeRegistry = registry || EMPTY_REGISTRY;
  const [section, setSection] = useState<SectionId>("quality");
  const [targetRej, setTargetRej] = useState("10.00");
  const [watchRej, setWatchRej] = useState("5.00");
  const [unitCost, setUnitCost] = useState("20.00");
  const [stageWeights, setStageWeights] = useState<Record<string, string>>({
    visual: "0.60",
    "eye-punching": "0.70",
    balloon: "0.80",
    "valve-integrity": "0.90",
    final: "1.00",
  });

  const [saved, setSaved] = useState(false);
  const [resetSaved, setResetSaved] = useState(false);

  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [showClearSchemaModal, setShowClearSchemaModal] = useState(false);
  const [clearSchemaConfirmText, setClearSchemaConfirmText] = useState("");
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

  interface CustomDefect {
    code: string;
    label: string;
    aliases: string;
  }
  const [customDefects, setCustomDefects] = useState<CustomDefect[]>([]);
  const [draft, setDraft] = useState<CustomDefect>({ code: "", label: "", aliases: "" });

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
      } catch {
        /* ignore malformed */
      }

      const weights: Record<string, string> = {};
      activeRegistry.stages.forEach((s: any) => {
        const stored = localStorage.getItem(`rais_settings_weight_${s.stageId}`);
        weights[s.stageId] =
          stored ||
          (s.stageId === "visual"
            ? "0.60"
            : s.stageId === "eye-punching"
              ? "0.70"
              : s.stageId === "balloon"
                ? "0.80"
                : s.stageId === "valve-integrity"
                  ? "0.90"
                  : "1.00");
      });
      setStageWeights(weights);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRegistry.stages.length]);

  const handleWeightChange = (stageId: string, val: string) => {
    setStageWeights((prev) => ({
      ...prev,
      [stageId]: val,
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
      visual: "0.60",
      "eye-punching": "0.70",
      balloon: "0.80",
      "valve-integrity": "0.90",
      final: "1.00",
    });
    setResetSaved(true);
    setTimeout(() => setResetSaved(false), 1500);
  };

  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const stageCount = activeRegistry.stages?.length ?? 0;
  const defectCount = activeRegistry.defects?.length ?? 0;

  return (
    <AppShell active="settings">
      <div className="settings-page">
        {/* Masthead — compact index header, not a marketing hero */}
        <header className="settings-mast">
          <div className="settings-mast-copy">
            <p className="settings-kicker">Plant configuration</p>
            <h1 className="settings-title">Settings</h1>
            <p className="settings-lede">
              Thresholds, cost weights, defect codes, and administrative reset.
              Changes apply to dashboard status and COPQ after save.
            </p>
          </div>
          <div className="settings-mast-meta" aria-label="Registry snapshot">
            <div className="settings-stat">
              <span className="settings-stat-val">{stageCount}</span>
              <span className="settings-stat-lab">Stages</span>
            </div>
            <div className="settings-stat-rule" />
            <div className="settings-stat">
              <span className="settings-stat-val">{defectCount}</span>
              <span className="settings-stat-lab">Defect codes</span>
            </div>
            <div className="settings-stat-rule" />
            <div className="settings-stat">
              <span className="settings-stat-val">{customDefects.length}</span>
              <span className="settings-stat-lab">Custom</span>
            </div>
          </div>
        </header>

        {saved && (
          <div className="settings-toast settings-toast--ok" role="status">
            <Icon name="check" size={15} stroke={2.5} />
            Saved. Dashboard calculations use the new values.
          </div>
        )}

        {actionStatus && (
          <div
            className={`settings-toast ${actionStatus.startsWith("Error") ? "settings-toast--bad" : "settings-toast--ok"}`}
            role="status"
          >
            {actionStatus}
          </div>
        )}

        {/* Index-first workbench: rail + focused panel */}
        <div className="settings-workbench">
          <nav className="settings-rail" aria-label="Settings sections">
            <ul className="settings-rail-list">
              {SECTIONS.map((s, i) => {
                const isActive = section === s.id;
                const danger = s.id === "admin";
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`settings-rail-item ${isActive ? "is-active" : ""} ${danger ? "is-danger" : ""}`}
                      onClick={() => setSection(s.id)}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className="settings-rail-idx" aria-hidden>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="settings-rail-text">
                        <span className="settings-rail-label">{s.label}</span>
                        <span className="settings-rail-hint">{s.hint}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section className="settings-panel" aria-labelledby="settings-panel-title">
            <div className="settings-panel-head">
              <h2 id="settings-panel-title" className="settings-panel-title">
                {active.label}
              </h2>
              <p className="settings-panel-sub">{active.hint}</p>
            </div>

            <div className="settings-panel-body">
              {section === "quality" && (
                <div className="settings-field-grid">
                  <label className="settings-field">
                    <span className="settings-field-label">Target rejection limit</span>
                    <div className="settings-input-wrap">
                      <input
                        type="number"
                        value={targetRej}
                        onChange={(e) => setTargetRej(e.target.value)}
                        style={inpStyle}
                        step="0.01"
                        className="settings-input"
                      />
                      <span className="settings-affix settings-affix--r">%</span>
                    </div>
                    <span className="settings-field-help">
                      Shopfloor rates above this mark an &quot;At Risk&quot; badge.
                    </span>
                  </label>

                  <label className="settings-field">
                    <span className="settings-field-label">Watch warning limit</span>
                    <div className="settings-input-wrap">
                      <input
                        type="number"
                        value={watchRej}
                        onChange={(e) => setWatchRej(e.target.value)}
                        style={inpStyle}
                        step="0.01"
                        className="settings-input"
                      />
                      <span className="settings-affix settings-affix--r">%</span>
                    </div>
                    <span className="settings-field-help">
                      Rates between watch and target show a &quot;Watch&quot; status.
                    </span>
                  </label>

                  <div className="settings-callout">
                    <span className="settings-callout-lab">Status ladder</span>
                    <div className="settings-ladder">
                      <span>
                        <i className="dot dot--good" /> Good · below watch
                      </span>
                      <span>
                        <i className="dot dot--warn" /> Watch · {watchRej}%–{targetRej}%
                      </span>
                      <span>
                        <i className="dot dot--bad" /> At risk · above {targetRej}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {section === "valuation" && (
                <div className="settings-field-stack">
                  <label className="settings-field settings-field--wide">
                    <span className="settings-field-label">Finished catheter valuation</span>
                    <div className="settings-input-wrap">
                      <span className="settings-affix settings-affix--l">₹</span>
                      <input
                        type="number"
                        value={unitCost}
                        onChange={(e) => setUnitCost(e.target.value)}
                        style={{ ...inpStyle, paddingLeft: 28 }}
                        step="0.01"
                        className="settings-input"
                      />
                      <span className="settings-affix settings-affix--r">INR</span>
                    </div>
                    <span className="settings-field-help">
                      Base value-add per unit at Final stage. Drives COPQ and savings.
                    </span>
                  </label>

                  <div className="settings-weights">
                    <div className="settings-weights-head">
                      <span className="settings-field-label">Stage-wise cost weights</span>
                      <span className="settings-field-help" style={{ margin: 0 }}>
                        Multiplier × finished valuation
                      </span>
                    </div>
                    <ul className="settings-weight-list">
                      {activeRegistry.stages.map((s: any) => (
                        <li key={s.stageId} className="settings-weight-row">
                          <span className="settings-weight-name">{s.label}</span>
                          <span className="settings-weight-id">{s.stageId}</span>
                          <div className="settings-input-wrap settings-input-wrap--sm">
                            <input
                              type="number"
                              value={stageWeights[s.stageId] ?? ""}
                              onChange={(e) => handleWeightChange(s.stageId, e.target.value)}
                              style={{ ...inpStyle, width: "100%", textAlign: "right", paddingRight: 28 }}
                              step="0.01"
                              min="0"
                              max="2"
                              className="settings-input"
                            />
                            <span className="settings-affix settings-affix--r">×</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {section === "registry" && (
                <div className="settings-table-wrap">
                  <p className="settings-field-help" style={{ marginBottom: 12 }}>
                    Active client definitions used for parsing validation. Managed from verified MOD catalog — not editable here.
                  </p>
                  <table className="settings-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Official label</th>
                        <th>Observed aliases</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRegistry.defects.map((d: any) => (
                        <tr key={d.defectCode}>
                          <td className="settings-mono">{d.defectCode}</td>
                          <td>{d.label}</td>
                          <td>
                            <div className="settings-chips">
                              {(d.aliases ?? []).map((a: string) => (
                                <span key={a} className="settings-chip">
                                  {a}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {activeRegistry.defects.length === 0 && (
                        <tr>
                          <td colSpan={3} className="settings-empty-cell">
                            No defect codes in registry. Ingest a master workbook on Staging.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {section === "custom" && (
                <div className="settings-field-stack">
                  <p className="settings-field-help" style={{ marginBottom: 4 }}>
                    Plant-specific codes and aliases merge into parsing on save. Base registry stays read-only.
                  </p>

                  {customDefects.length > 0 && (
                    <table className="settings-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Label</th>
                          <th>Aliases</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {customDefects.map((d) => (
                          <tr key={d.code}>
                            <td className="settings-mono">{d.code}</td>
                            <td>{d.label}</td>
                            <td>{d.aliases || "—"}</td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                type="button"
                                onClick={() => removeCustomDefect(d.code)}
                                className="settings-link-danger"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div className="settings-draft-row">
                    <label className="settings-field">
                      <span className="settings-field-label">Code</span>
                      <input
                        value={draft.code}
                        onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                        placeholder="e.g. KINK"
                        style={{ ...inpStyle, fontFamily: "var(--font-mono)" }}
                        className="settings-input"
                      />
                    </label>
                    <label className="settings-field">
                      <span className="settings-field-label">Official label</span>
                      <input
                        value={draft.label}
                        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                        placeholder="e.g. Kinked Shaft"
                        style={inpStyle}
                        className="settings-input"
                      />
                    </label>
                    <label className="settings-field settings-field--grow">
                      <span className="settings-field-label">Aliases</span>
                      <input
                        value={draft.aliases}
                        onChange={(e) => setDraft({ ...draft, aliases: e.target.value })}
                        placeholder="KINK, KNK, BENT"
                        style={inpStyle}
                        className="settings-input"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={addCustomDefect}
                      disabled={!draft.code.trim() || !draft.label.trim()}
                      className="settings-btn settings-btn--primary settings-btn--add"
                      style={{
                        opacity: !draft.code.trim() || !draft.label.trim() ? 0.45 : 1,
                      }}
                    >
                      Add code
                    </button>
                  </div>
                </div>
              )}

              {section === "admin" && (
                <div className="settings-admin">
                  <p className="settings-admin-warn">
                    Destructive operations. Type the confirmation word in the dialog before any purge runs.
                  </p>
                  <div className="settings-admin-grid">
                    <article className="settings-admin-card">
                      <h3 className="settings-admin-title">Purge transactional logs</h3>
                      <p className="settings-admin-body">
                        Deletes production, inspection, rejection records, trends, and findings. Registry schema and
                        configurations stay intact.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowClearModal(true);
                          setActionStatus(null);
                        }}
                        className="settings-btn settings-btn--outline-danger"
                      >
                        Clear transaction data
                      </button>
                    </article>

                    <article className="settings-admin-card settings-admin-card--critical">
                      <h3 className="settings-admin-title settings-admin-title--critical">
                        Clear schema registry
                      </h3>
                      <p className="settings-admin-body">
                        Removes custom fields and custom inspection stages. Resets schema to default layout. Keeps base
                        configurations.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowClearSchemaModal(true);
                          setActionStatus(null);
                        }}
                        className="settings-btn settings-btn--danger"
                      >
                        Clear schema registry
                      </button>
                    </article>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Sticky save bar */}
        <footer className="settings-foot">
          <p className="settings-foot-note">
            Local to this browser until saved. Reset restores quality defaults only — not custom codes.
          </p>
          <div className="settings-foot-actions">
            <button
              type="button"
              onClick={handleReset}
              className={`settings-btn settings-btn--ghost ${resetSaved ? "is-success" : ""}`}
            >
              {resetSaved ? "Values reset" : "Reset defaults"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className={`settings-btn settings-btn--primary ${saved ? "is-success" : ""}`}
            >
              {saved ? "Saved" : "Save configurations"}
            </button>
          </div>
        </footer>
      </div>

      {showClearModal && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowClearModal(false);
          }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-tx-title"
            style={{
              background: "var(--surface)",
              border: "1.5px solid var(--border-strong)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-3)",
              width: "100%",
              maxWidth: 480,
              display: "flex",
              flexDirection: "column",
              color: "var(--text)",
            }}
          >
            <div
              style={{
                padding: "18px 22px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 id="clear-tx-title" style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, margin: 0 }}>
                Purge transactions
              </h3>
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 22,
                  cursor: "pointer",
                  color: "var(--text-2)",
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, margin: 0 }}>
                Deletes quality inspections, defect logs, findings, and events. Plant configurations and defect codes
                are retained.
              </p>
              <div
                style={{
                  background: "var(--warning-weak)",
                  border: "1px solid var(--warning)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  fontSize: 12,
                  color: "var(--text)",
                  fontWeight: 600,
                }}
              >
                Irreversible. Historical charts and trend lines will clear.
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>
                  Type CLEAR to confirm
                </span>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value.toUpperCase())}
                  placeholder="CLEAR"
                  style={{
                    ...inpStyle,
                    fontFamily: "var(--font-mono)",
                    textAlign: "center",
                    textTransform: "uppercase",
                  }}
                />
              </label>
            </div>
            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid var(--border)",
                background: "var(--surface-2)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button type="button" onClick={() => setShowClearModal(false)} className="settings-btn settings-btn--ghost">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearTransactions}
                disabled={clearConfirmText.trim().toUpperCase() !== "CLEAR" || busyAction === "clear"}
                className="settings-btn settings-btn--danger"
                style={{
                  opacity: clearConfirmText.trim().toUpperCase() === "CLEAR" ? 1 : 0.45,
                }}
              >
                {busyAction === "clear" ? "Clearing…" : "Yes, purge data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearSchemaModal && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowClearSchemaModal(false);
          }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-schema-title"
            style={{
              background: "var(--surface)",
              border: "1.5px solid var(--border-strong)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-3)",
              width: "100%",
              maxWidth: 480,
              display: "flex",
              flexDirection: "column",
              color: "var(--text)",
            }}
          >
            <div
              style={{
                padding: "18px 22px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3
                id="clear-schema-title"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 16,
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--status-bad)",
                }}
              >
                Clear schema registry
              </h3>
              <button
                type="button"
                onClick={() => setShowClearSchemaModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 22,
                  cursor: "pointer",
                  color: "var(--text-2)",
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, margin: 0 }}>
                Removes custom fields and custom inspection stages. Master schema returns to default configuration.
              </p>
              <div
                style={{
                  background: "var(--critical-weak)",
                  border: "1px solid var(--status-bad)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  fontSize: 12,
                  color: "var(--status-bad)",
                  fontWeight: 700,
                }}
              >
                Critical: custom fields in all stages reset. Direct entry tables reload to base defaults.
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>
                  Type RESET to confirm
                </span>
                <input
                  type="text"
                  value={clearSchemaConfirmText}
                  onChange={(e) => setClearSchemaConfirmText(e.target.value.toUpperCase())}
                  placeholder="RESET"
                  style={{
                    ...inpStyle,
                    fontFamily: "var(--font-mono)",
                    textAlign: "center",
                    textTransform: "uppercase",
                  }}
                />
              </label>
            </div>
            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid var(--border)",
                background: "var(--surface-2)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setShowClearSchemaModal(false)}
                className="settings-btn settings-btn--ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearSchema}
                disabled={clearSchemaConfirmText.trim().toUpperCase() !== "RESET" || busyAction === "clear-schema"}
                className="settings-btn settings-btn--danger"
                style={{
                  opacity: clearSchemaConfirmText.trim().toUpperCase() === "RESET" ? 1 : 0.45,
                }}
              >
                {busyAction === "clear-schema" ? "Resetting…" : "Yes, reset registry"}
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
  outline: "none",
};
