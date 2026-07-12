"use client";

// CAPA page — Phase 6: Recommended Actions come from POST /api/decide
// (versioned decision rules over canonical analytics vars). Manual CAPA
// tracking still lives here as local state; engine hits can be promoted
// into tracked actions with rule lineage preserved.

import { useState, useMemo, useEffect, useCallback } from "react";
import AppShell from "@/components/app/AppShell";
import { Card } from "@/components/app/widgets";
import type { RecommendationT } from "@/shared/models/decision";

interface CapaAction {
  id: string;
  text: string;
  owner: string;
  dueDate: string;
  priority: "High" | "Medium" | "Low";
  status: "Open" | "In Progress" | "Completed";
  stage: string;
  /** Decision-engine lineage when promoted from a recommendation. */
  ruleId?: string | null;
  ruleVersion?: number | null;
}

function severityToPriority(s: RecommendationT["severity"]): CapaAction["priority"] {
  if (s === "critical") return "High";
  if (s === "warning") return "Medium";
  return "Low";
}

function defaultDue(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export default function CapaPage() {
  const [actions, setActions] = useState<CapaAction[]>([]);
  const [engineRecs, setEngineRecs] = useState<RecommendationT[]>([]);
  const [engineLoading, setEngineLoading] = useState(true);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [newText, setNewText] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newPriority, setNewPriority] = useState<"High" | "Medium" | "Low">("Medium");
  const [newStage, setNewStage] = useState("All Stages");
  const [activeTab, setActiveTab] = useState<"all" | "open" | "completed">("all");

  const loadRecommendations = useCallback(async () => {
    setEngineLoading(true);
    setEngineError(null);
    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: { grain: "month", dateFrom: null, dateTo: null, stageIds: null, sizes: null },
          explain: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `decide ${res.status}`);
      setEngineRecs(data.recommendations ?? []);
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : "Failed to load recommendations");
      setEngineRecs([]);
    } finally {
      setEngineLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      if (activeTab === "open" && a.status === "Completed") return false;
      if (activeTab === "completed" && a.status !== "Completed") return false;
      return true;
    });
  }, [actions, activeTab]);

  const counts = useMemo(() => {
    let openCount = 0;
    let progressCount = 0;
    let completedCount = 0;
    actions.forEach((a) => {
      if (a.status === "Open") openCount++;
      else if (a.status === "In Progress") progressCount++;
      else if (a.status === "Completed") completedCount++;
    });
    return {
      open: openCount,
      progress: progressCount,
      completed: completedCount,
      pending: openCount + progressCount,
    };
  }, [actions]);

  const toggleStatus = (id: string) => {
    setActions((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const nextStatus =
          a.status === "Completed" ? "Open" : a.status === "Open" ? "In Progress" : "Completed";
        return { ...a, status: nextStatus };
      }),
    );
  };

  const promoteRecommendation = (r: RecommendationT) => {
    const already = actions.some((a) => a.ruleId === r.ruleId && a.text === r.text);
    if (already) return;
    const action: CapaAction = {
      id: `capa-${r.ruleId}-v${r.ruleVersion}-${Date.now()}`,
      text: r.text,
      owner: r.ownerRole === "gm" ? "GM" : r.ownerRole === "qm" ? "Quality Manager" : "Steward",
      dueDate: defaultDue(r.severity === "critical" ? 7 : 14),
      priority: severityToPriority(r.severity),
      status: "Open",
      stage: "All Stages",
      ruleId: r.ruleId,
      ruleVersion: r.ruleVersion,
    };
    setActions((prev) => [action, ...prev]);
  };

  const handleAddAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !newOwner.trim() || !newDue.trim()) return;
    const newAction: CapaAction = {
      id: `capa-${Date.now()}`,
      text: newText.trim(),
      owner: newOwner.trim(),
      dueDate: newDue.trim(),
      priority: newPriority,
      status: "Open",
      stage: newStage,
      ruleId: null,
      ruleVersion: null,
    };
    setActions((prev) => [newAction, ...prev]);
    setNewText("");
    setNewOwner("");
    setNewDue("");
    setNewPriority("Medium");
    setNewStage("All Stages");
  };

  const getPriorityColor = (p: string) => {
    if (p === "High") return "var(--critical)";
    if (p === "Medium") return "var(--warning)";
    return "var(--text-3)";
  };

  const getStatusStyle = (s: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontSize: "11px",
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: "10px",
      display: "inline-block",
    };
    if (s === "Completed") {
      return { ...base, background: "var(--positive-weak)", color: "var(--positive)" };
    }
    if (s === "In Progress") {
      return { ...base, background: "var(--warning-weak)", color: "var(--warning)" };
    }
    return {
      ...base,
      background: "var(--surface-3)",
      color: "var(--text-2)",
      border: "1px solid var(--border)",
    };
  };

  const sevColor = (s: RecommendationT["severity"]) =>
    s === "critical" ? "var(--critical)" : s === "warning" ? "var(--warning)" : "var(--text-3)";

  return (
    <AppShell active="capa">
      <div style={{ paddingBottom: 48 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>
            CAPA &amp; Action Items
          </h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Decision-engine recommendations (rule lineage) plus tracked corrective actions.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          <Card title="Engine Hits">
            <div style={{ ...numStyle, color: "var(--accent)" }}>{engineRecs.length}</div>
            <span className="muted" style={{ fontSize: 11 }}>Active rule matches</span>
          </Card>
          <Card title="Tracked Open">
            <div style={{ ...numStyle, color: "var(--text-2)" }}>{counts.open}</div>
            <span className="muted" style={{ fontSize: 11 }}>Not started</span>
          </Card>
          <Card title="In Progress">
            <div style={{ ...numStyle, color: "var(--warning)" }}>{counts.progress}</div>
            <span className="muted" style={{ fontSize: 11 }}>Under investigation</span>
          </Card>
          <Card title="Completed">
            <div style={{ ...numStyle, color: "var(--positive)" }}>{counts.completed}</div>
            <span className="muted" style={{ fontSize: 11 }}>Closed loops</span>
          </Card>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card
              title="Recommended by Decision Engine"
              sub="Rules over canonical rejection/FPY/COPQ vars · promote to track"
            >
              {engineLoading ? (
                <div style={{ padding: 24, color: "var(--text-3)", fontSize: 13 }}>Evaluating rules…</div>
              ) : engineError ? (
                <div style={{ padding: 24, color: "var(--critical)", fontSize: 13 }}>
                  {engineError}{" "}
                  <button type="button" onClick={loadRecommendations} style={linkBtn}>
                    Retry
                  </button>
                </div>
              ) : engineRecs.length === 0 ? (
                <div style={{ padding: 24, color: "var(--text-3)", fontSize: 13 }}>
                  No active rules matched this scope.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {engineRecs.map((r) => (
                    <div key={`${r.ruleId}-v${r.ruleVersion}`} style={actionCardStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                color: sevColor(r.severity),
                                background: `color-mix(in srgb, ${sevColor(r.severity)} 14%, transparent)`,
                                padding: "2px 8px",
                                borderRadius: 5,
                              }}
                            >
                              {r.severity}
                            </span>
                            <span
                              className="muted"
                              style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
                            >
                              {r.ruleId} v{r.ruleVersion} · {r.kind}
                            </span>
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{r.text}</div>
                          {Object.keys(r.vars).length > 0 && (
                            <div
                              className="muted"
                              style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 6 }}
                            >
                              {Object.entries(r.vars)
                                .map(([k, v]) => `${k}=${typeof v === "number" ? Number(v.toFixed(4)) : v}`)
                                .join(" · ")}
                            </div>
                          )}
                          {r.eventIds.length > 0 && (
                            <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                              Evidence: {r.eventIds.length} event{r.eventIds.length === 1 ? "" : "s"}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => promoteRecommendation(r)}
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: "var(--accent)",
                            background: "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            padding: "6px 10px",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Track CAPA →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
              <button type="button" onClick={() => setActiveTab("all")} style={activeTab === "all" ? tabActive : tabInactive}>
                Tracked ({actions.length})
              </button>
              <button type="button" onClick={() => setActiveTab("open")} style={activeTab === "open" ? tabActive : tabInactive}>
                Pending ({counts.pending})
              </button>
              <button type="button" onClick={() => setActiveTab("completed")} style={activeTab === "completed" ? tabActive : tabInactive}>
                Completed ({counts.completed})
              </button>
            </div>

            <Card title="Action Registry">
              {filteredActions.length === 0 ? (
                <div style={{ padding: 36, textAlign: "center", color: "var(--text-3)" }}>
                  No tracked CAPA actions yet. Promote an engine recommendation or create one manually.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {filteredActions.map((a) => (
                    <div key={a.id} style={actionCardStyle}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <button
                          type="button"
                          onClick={() => toggleStatus(a.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            marginTop: 2,
                            color: a.status === "Completed" ? "var(--positive)" : "var(--text-3)",
                          }}
                        >
                          {a.status === "Completed" ? "✓" : a.status === "In Progress" ? "◐" : "○"}
                        </button>
                        <div style={{ flex: 1 }}>
                          <span
                            style={{
                              fontSize: "13.5px",
                              fontWeight: 600,
                              textDecoration: a.status === "Completed" ? "line-through" : "none",
                              color: a.status === "Completed" ? "var(--text-3)" : "var(--text)",
                            }}
                          >
                            {a.text}
                          </span>
                          <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11px" }} className="muted">
                              Owner: <strong>{a.owner}</strong>
                            </span>
                            <span style={{ fontSize: "11px" }} className="muted">
                              Due:{" "}
                              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{a.dueDate}</span>
                            </span>
                            {a.ruleId && (
                              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }} className="muted">
                                {a.ruleId} v{a.ruleVersion}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                          <span style={getStatusStyle(a.status)}>{a.status}</span>
                          <span style={{ fontSize: "10px", fontWeight: 700, color: getPriorityColor(a.priority) }}>
                            {a.priority} Priority
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card title="Initiate CAPA Action" sub="Create a shopfloor corrective instruction">
              <form onSubmit={handleAddAction} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
                <label style={fieldLabel}>
                  <span className="muted" style={{ fontSize: "11.5px", fontWeight: 600 }}>
                    Action Description <span style={{ color: "var(--critical)" }}>*</span>
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="Describe the action item..."
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={fieldLabel}>
                  <span className="muted" style={{ fontSize: "11.5px", fontWeight: 600 }}>
                    Owner <span style={{ color: "var(--critical)" }}>*</span>
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="Assignee"
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={fieldLabel}>
                  <span className="muted" style={{ fontSize: "11.5px", fontWeight: 600 }}>
                    Due date <span style={{ color: "var(--critical)" }}>*</span>
                  </span>
                  <input
                    type="date"
                    required
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={fieldLabel}>
                  <span className="muted" style={{ fontSize: "11.5px", fontWeight: 600 }}>Priority</span>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as "High" | "Medium" | "Low")}
                    style={inputStyle}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </label>
                <label style={fieldLabel}>
                  <span className="muted" style={{ fontSize: "11.5px", fontWeight: 600 }}>Stage</span>
                  <input
                    type="text"
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <button
                  type="submit"
                  style={{
                    marginTop: 4,
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "10px 14px",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Create action
                </button>
              </form>
            </Card>

            <Card title="How lineage works" sub="ADD §14">
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
                Every recommendation is produced by a versioned rule matching predicates on
                canonical variables (<code style={{ fontFamily: "var(--font-mono)" }}>rejection_rate</code>,{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>fpy</code>, stage/defect shares). The LLM
                may explain a hit but never invents numbers. Tracking a recommendation copies its{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>ruleId</code> + version onto the CAPA row.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

const numStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  fontFamily: "var(--font-display)",
  lineHeight: 1.1,
  marginBottom: 4,
};

const actionCardStyle: React.CSSProperties = {
  padding: "12px 14px",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
};

const tabActive: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderBottom: "2px solid var(--accent)",
  color: "var(--text)",
  fontWeight: 700,
  fontSize: 12.5,
  padding: "6px 4px",
  cursor: "pointer",
};

const tabInactive: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderBottom: "2px solid transparent",
  color: "var(--text-3)",
  fontWeight: 600,
  fontSize: 12.5,
  padding: "6px 4px",
  cursor: "pointer",
};

const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 13,
};

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--accent)",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0,
};
