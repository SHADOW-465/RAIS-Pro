"use client";

import { useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import { Card } from "@/components/app/widgets";
import Icon from "@/components/editorial/Icon";

interface CapaAction {
  id: string;
  text: string;
  owner: string;
  dueDate: string;
  priority: "High" | "Medium" | "Low";
  status: "Open" | "In Progress" | "Completed";
  stage: string;
}

const INITIAL_ACTIONS: CapaAction[] = [
  {
    id: "capa-1",
    text: "Investigate Thin Spot defects in Valve Integrity.",
    owner: "Rajesh Kumar",
    dueDate: "2026-06-25",
    priority: "High",
    status: "In Progress",
    stage: "Valve Integrity"
  },
  {
    id: "capa-2",
    text: "Review cleaning SOP for Machine M3 (Visual).",
    owner: "Ramesh Chen",
    dueDate: "2026-06-28",
    priority: "High",
    status: "Open",
    stage: "Visual Inspection"
  },
  {
    id: "capa-3",
    text: "Audit Material Batch QC for Fr16 & Fr18 sizes.",
    owner: "S. Srinivasan",
    dueDate: "2026-07-05",
    priority: "Medium",
    status: "Open",
    stage: "All Stages"
  },
  {
    id: "capa-4",
    text: "Schedule training for Night Shift operators.",
    owner: "Amit Patel",
    dueDate: "2026-06-20",
    priority: "Medium",
    status: "Completed",
    stage: "All Stages"
  },
  {
    id: "capa-5",
    text: "Inspect heating element calibration on Balloon forming machine.",
    owner: "K. Raghavan",
    dueDate: "2026-06-30",
    priority: "High",
    status: "Open",
    stage: "Balloon Sealing"
  }
];

export default function CapaPage() {
  const [actions, setActions] = useState<CapaAction[]>(INITIAL_ACTIONS);
  const [newText, setNewText] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newPriority, setNewPriority] = useState<"High" | "Medium" | "Low">("Medium");
  const [newStage, setNewStage] = useState("All Stages");

  const [activeTab, setActiveTab] = useState<"all" | "open" | "completed">("all");

  // Filtered action list
  const filteredActions = useMemo(() => {
    return actions.filter(a => {
      if (activeTab === "open" && a.status === "Completed") return false;
      if (activeTab === "completed" && a.status !== "Completed") return false;
      return true;
    });
  }, [actions, activeTab]);

  // Status Counts
  const counts = useMemo(() => {
    let openCount = 0;
    let progressCount = 0;
    let completedCount = 0;
    actions.forEach(a => {
      if (a.status === "Open") openCount++;
      else if (a.status === "In Progress") progressCount++;
      else if (a.status === "Completed") completedCount++;
    });
    return {
      open: openCount,
      progress: progressCount,
      completed: completedCount,
      pending: openCount + progressCount
    };
  }, [actions]);

  // Toggle Action Status
  const toggleStatus = (id: string) => {
    setActions(prev => prev.map(a => {
      if (a.id === id) {
        const nextStatus = a.status === "Completed" ? "Open" : a.status === "Open" ? "In Progress" : "Completed";
        return { ...a, status: nextStatus };
      }
      return a;
    }));
  };

  // Add Action
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
      stage: newStage
    };

    setActions(prev => [newAction, ...prev]);
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
      display: "inline-block"
    };

    if (s === "Completed") {
      return { ...base, background: "var(--positive-weak)", color: "var(--positive)" };
    }
    if (s === "In Progress") {
      return { ...base, background: "var(--warning-weak)", color: "var(--warning)" };
    }
    return { ...base, background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border)" };
  };

  return (
    <AppShell active="capa">
      <div style={{ paddingBottom: 48 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>
            CAPA &amp; Action Items
          </h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Track corrective actions, assign quality engineers, and review closed loop audit compliance status.
          </p>
        </div>

        {/* Status Counters */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          <Card title="Pending Actions">
            <div style={{ ...numStyle, color: "var(--accent)" }}>{counts.pending}</div>
            <span className="muted" style={{ fontSize: 11 }}>Requires attention</span>
          </Card>
          <Card title="Open Tasks">
            <div style={{ ...numStyle, color: "var(--text-2)" }}>{counts.open}</div>
            <span className="muted" style={{ fontSize: 11 }}>Unassigned / Not started</span>
          </Card>
          <Card title="In Progress">
            <div style={{ ...numStyle, color: "var(--warning)" }}>{counts.progress}</div>
            <span className="muted" style={{ fontSize: 11 }}>Under investigation</span>
          </Card>
          <Card title="Completed">
            <div style={{ ...numStyle, color: "var(--positive)" }}>{counts.completed}</div>
            <span className="muted" style={{ fontSize: 11 }}>Closed loops validated</span>
          </Card>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
          
          {/* LEFT RAIL: Actions List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            
            {/* Filter Tabs */}
            <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
              <button onClick={() => setActiveTab("all")} style={activeTab === "all" ? tabActive : tabInactive}>
                All Actions ({actions.length})
              </button>
              <button onClick={() => setActiveTab("open")} style={activeTab === "open" ? tabActive : tabInactive}>
                Pending ({counts.pending})
              </button>
              <button onClick={() => setActiveTab("completed")} style={activeTab === "completed" ? tabActive : tabInactive}>
                Completed ({counts.completed})
              </button>
            </div>

            {/* List */}
            <Card title="Action Registry">
              {filteredActions.length === 0 ? (
                <div style={{ padding: 36, textAlign: "center", color: "var(--text-3)" }}>
                  No CAPA actions in this view.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {filteredActions.map((a) => (
                    <div key={a.id} style={actionCardStyle}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <button
                          onClick={() => toggleStatus(a.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            marginTop: 2,
                            color: a.status === "Completed" ? "var(--positive)" : "var(--text-3)",
                            display: "flex",
                            alignItems: "center"
                          }}
                        >
                          {a.status === "Completed" ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                          ) : a.status === "In Progress" ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" style={{ flexShrink: 0 }}>
                              <circle cx="12" cy="12" r="10" />
                            </svg>
                          )}
                        </button>
                        <div style={{ flex: 1 }}>
                          <span style={{
                            fontSize: "13.5px",
                            fontWeight: 600,
                            textDecoration: a.status === "Completed" ? "line-through" : "none",
                            color: a.status === "Completed" ? "var(--text-3)" : "var(--text)"
                          }}>
                            {a.text}
                          </span>
                          <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11px" }} className="muted">
                              Owner: <strong>{a.owner}</strong>
                            </span>
                            <span style={{ fontSize: "11px" }} className="muted">
                              Due: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{a.dueDate}</span>
                            </span>
                            <span style={{ fontSize: "11px" }} className="muted">
                              Stage: <strong>{a.stage}</strong>
                            </span>
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

          {/* RIGHT RAIL: Add Action Form & Enterprise Roadmap */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            
            {/* Form */}
            <Card title="Initiate CAPA Action" sub="Create a new shopfloor corrective instruction">
              <form onSubmit={handleAddAction} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
                <label style={fieldLabel}>
                  <span className="muted" style={{ fontSize: "11.5px", fontWeight: 600 }}>Action Description <span style={{ color: "var(--critical)" }}>*</span></span>
                  <input
                    type="text"
                    required
                    placeholder="Describe the action item..."
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    style={inpStyle}
                  />
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={fieldLabel}>
                    <span className="muted" style={{ fontSize: "11.5px", fontWeight: 600 }}>Owner / Assignee <span style={{ color: "var(--critical)" }}>*</span></span>
                    <input
                      type="text"
                      required
                      placeholder="Name / Team"
                      value={newOwner}
                      onChange={(e) => setNewOwner(e.target.value)}
                      style={inpStyle}
                    />
                  </label>
                  <label style={fieldLabel}>
                    <span className="muted" style={{ fontSize: "11.5px", fontWeight: 600 }}>Target Due Date <span style={{ color: "var(--critical)" }}>*</span></span>
                    <input
                      type="date"
                      required
                      value={newDue}
                      onChange={(e) => setNewDue(e.target.value)}
                      style={{ ...inpStyle, fontFamily: "var(--font-mono)" }}
                    />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={fieldLabel}>
                    <span className="muted" style={{ fontSize: "11.5px", fontWeight: 600 }}>Severity Priority</span>
                    <select
                      value={newPriority}
                      onChange={(e: any) => setNewPriority(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="High">High Priority</option>
                      <option value="Medium">Medium Priority</option>
                      <option value="Low">Low Priority</option>
                    </select>
                  </label>
                  <label style={fieldLabel}>
                    <span className="muted" style={{ fontSize: "11.5px", fontWeight: 600 }}>Scope Stage</span>
                    <select
                      value={newStage}
                      onChange={(e) => setNewStage(e.target.value)}
                      style={selectStyle}
                    >
                      <option>All Stages</option>
                      <option>Visual Inspection</option>
                      <option>Eye Punching</option>
                      <option>Balloon Sealing</option>
                      <option>Valve Integrity</option>
                      <option>Final Assembly</option>
                    </select>
                  </label>
                </div>

                <button type="submit" style={btnStyle}>
                  <Icon name="plus" size={12} /> Add Corrective Action
                </button>
              </form>
            </Card>

            {/* Enterprise V2 Lock Panel */}
            <div style={{ position: "relative", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)", overflow: "hidden", padding: 18 }}>
              
              {/* Blur Overlay */}
              <div style={overlayStyle}>
                <div style={{ background: "var(--surface)", border: "1.5px solid var(--accent)", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, boxShadow: "var(--shadow-2)", maxWidth: 280 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, textAlign: "center" }}>
                    Advanced CAPA Diagnostics
                  </span>
                  <span className="muted" style={{ fontSize: 11, textAlign: "center", lineHeight: 1.4 }}>
                    Unlocked in RAIS Pro Enterprise. Includes 5-Why root cause loops, Ishikawa fishbones, and effectiveness checks.
                  </span>
                </div>
              </div>

              {/* Mock content behind blur */}
              <div style={{ opacity: 0.25, userSelect: "none", pointerEvents: "none" }}>
                <span className="eyebrow">Ishikawa Cause &amp; Effect</span>
                <h4 style={{ fontFamily: "var(--font-display)", fontSize: 15, margin: "2px 0 10px" }}>Root Cause Tree</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  <div>[Machine] --- Calibration Drift (0.65 weight)</div>
                  <div>[Method]  --- SOP Inconsistency (0.42 weight)</div>
                  <div>[Material] --- Thin Spot deviations (0.81 weight)</div>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </AppShell>
  );
}

const numStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "26px",
  fontWeight: 800,
  lineHeight: 1.1,
  marginBottom: 2
};

const tabActive: React.CSSProperties = {
  background: "var(--accent-weak)",
  color: "var(--text)",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "6px 14px",
  fontSize: "12.5px",
  fontWeight: 700,
  cursor: "pointer"
};

const tabInactive: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-3)",
  border: "none",
  padding: "6px 14px",
  fontSize: "12.5px",
  fontWeight: 500,
  cursor: "pointer"
};

const actionCardStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "12px 14px"
};

const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4
};

const inpStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "12.5px",
  outline: "none"
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "12.5px",
  fontWeight: 600,
  outline: "none",
  cursor: "pointer"
};

const btnStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert)",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "10px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  marginTop: 6
};

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(255,255,255,0.45)",
  backdropFilter: "blur(4px)",
  display: "grid",
  placeItems: "center",
  zIndex: 10
};
