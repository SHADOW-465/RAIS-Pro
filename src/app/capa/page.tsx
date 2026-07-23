"use client";

// CAPA page — the corrective/preventive action register. CAPAs live in the
// shared capa-store (localStorage), so anything created from the dashboard
// composer shows up here too. Rows are inline-editable; new CAPAs (blank or
// promoted from a decision-engine hit) are created through CapaComposerModal.

import { useState, useMemo, useEffect, useCallback } from "react";
import AppShell from "@/components/app/AppShell";
import { Card } from "@/components/app/widgets";
import Icon from "@/components/editorial/Icon";
import CapaComposerModal from "@/components/CapaComposerModal";
import type { RecommendationT } from "@/shared/models/decision";
import {
  useCapas,
  updateCapa,
  removeCapa,
  draftFromRecommendation,
  blankDraft,
  isOverdue,
  hasCapaForRule,
  type CapaRecord,
  type CapaPriority,
  type CapaStatus,
} from "@/lib/capa-store";

type Tab = "all" | "pending" | "completed" | "overdue";

function varsContext(r: RecommendationT): string {
  const bits = Object.entries(r.vars).map(([k, v]) => {
    const asPct = typeof v === "number" && v <= 1 && (k.includes("rate") || k === "fpy" || k.includes("share"));
    return `${k}: ${asPct ? `${(v * 100).toFixed(1)}%` : v}`;
  });
  return bits.length ? `Verified figures for this rule:\n${bits.join("\n")}` : "";
}

export default function CapaPage() {
  const capas = useCapas();
  const [engineRecs, setEngineRecs] = useState<RecommendationT[]>([]);
  const [engineLoading, setEngineLoading] = useState(true);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");

  // Composer state (shared with dashboard).
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<CapaRecord | null>(null);
  const [recText, setRecText] = useState<string | undefined>();
  const [recContext, setRecContext] = useState<string | undefined>();
  const [recEvidence, setRecEvidence] = useState<string | null>(null);

  // Inline row editing.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<CapaRecord | null>(null);

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

  const counts = useMemo(() => {
    let open = 0, progress = 0, completed = 0, overdue = 0;
    capas.forEach((c) => {
      if (c.status === "Open") open++;
      else if (c.status === "In Progress") progress++;
      else if (c.status === "Completed") completed++;
      if (isOverdue(c)) overdue++;
    });
    return { open, progress, completed, overdue, pending: open + progress };
  }, [capas]);

  const filtered = useMemo(() => {
    return capas.filter((c) => {
      if (tab === "pending") return c.status !== "Completed";
      if (tab === "completed") return c.status === "Completed";
      if (tab === "overdue") return isOverdue(c);
      return true;
    });
  }, [capas, tab]);

  const openBlank = () => {
    setDraft(blankDraft());
    setRecText(undefined);
    setRecContext(undefined);
    setRecEvidence(null);
    setComposerOpen(true);
  };

  const openFromRec = (r: RecommendationT) => {
    setDraft(draftFromRecommendation(r));
    setRecText(r.text);
    setRecContext(varsContext(r));
    setRecEvidence(`${r.ruleId} v${r.ruleVersion} · ${r.kind}`);
    setComposerOpen(true);
  };

  const startEdit = (c: CapaRecord) => {
    setEditingId(c.id);
    setBuffer({ ...c });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setBuffer(null);
  };
  const saveEdit = () => {
    if (buffer) updateCapa(buffer.id, buffer);
    cancelEdit();
  };
  const setBuf = <K extends keyof CapaRecord>(k: K, v: CapaRecord[K]) =>
    setBuffer((b) => (b ? { ...b, [k]: v } : b));

  const cycleStatus = (c: CapaRecord) => {
    const next: CapaStatus = c.status === "Completed" ? "Open" : c.status === "Open" ? "In Progress" : "Completed";
    updateCapa(c.id, { status: next });
  };

  const sevColor = (s: RecommendationT["severity"]) =>
    s === "critical" ? "var(--critical)" : s === "warning" ? "var(--warning)" : "var(--text-3)";

  return (
    <AppShell active="capa">
      <div style={{ paddingBottom: 48 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>
              CAPA &amp; Action Items
            </h1>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Corrective &amp; preventive actions with decision-engine lineage. Create from a flagged recommendation or start blank.
            </p>
          </div>
          <button type="button" onClick={openBlank} style={newBtn}>
            <Icon name="plus" size={14} /> New CAPA
          </button>
        </div>

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
          <Stat label="Engine hits" value={engineRecs.length} color="var(--accent)" hint="Active rule matches" />
          <Stat label="Open" value={counts.open} color="var(--text-2)" hint="Not started" />
          <Stat label="In progress" value={counts.progress} color="var(--warning)" hint="Under investigation" />
          <Stat label="Overdue" value={counts.overdue} color="var(--critical)" hint="Past due date" />
          <Stat label="Completed" value={counts.completed} color="var(--positive)" hint="Closed loops" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20, alignItems: "start" }}>
          {/* Left: registry */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
              <TabBtn active={tab === "all"} onClick={() => setTab("all")}>All ({capas.length})</TabBtn>
              <TabBtn active={tab === "pending"} onClick={() => setTab("pending")}>Pending ({counts.pending})</TabBtn>
              <TabBtn active={tab === "overdue"} onClick={() => setTab("overdue")}>Overdue ({counts.overdue})</TabBtn>
              <TabBtn active={tab === "completed"} onClick={() => setTab("completed")}>Completed ({counts.completed})</TabBtn>
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: 44, textAlign: "center", color: "var(--text-3)", border: "1px dashed var(--border)", borderRadius: "var(--radius-md)" }}>
                No CAPA actions here yet. Create one from a recommendation or the <strong>New CAPA</strong> button.
              </div>
            ) : (
              filtered.map((c) =>
                editingId === c.id && buffer ? (
                  <div key={c.id} style={{ ...rowCard, borderColor: "var(--accent)" }}>
                    <Field label="Title"><input style={inp} value={buffer.title} onChange={(e) => setBuf("title", e.target.value)} /></Field>
                    <Field label="Problem"><textarea style={{ ...inp, minHeight: 44 }} value={buffer.problem} onChange={(e) => setBuf("problem", e.target.value)} /></Field>
                    <Field label="Root cause"><textarea style={{ ...inp, minHeight: 40 }} value={buffer.rootCause} onChange={(e) => setBuf("rootCause", e.target.value)} /></Field>
                    <Field label="Corrective action"><textarea style={{ ...inp, minHeight: 52 }} value={buffer.action} onChange={(e) => setBuf("action", e.target.value)} /></Field>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <Field label="Owner"><input style={inp} value={buffer.owner} onChange={(e) => setBuf("owner", e.target.value)} /></Field>
                      <Field label="Due"><input type="date" style={inp} value={buffer.dueDate} onChange={(e) => setBuf("dueDate", e.target.value)} /></Field>
                      <Field label="Priority">
                        <select style={inp} value={buffer.priority} onChange={(e) => setBuf("priority", e.target.value as CapaPriority)}>
                          <option>High</option><option>Medium</option><option>Low</option>
                        </select>
                      </Field>
                      <Field label="Status">
                        <select style={inp} value={buffer.status} onChange={(e) => setBuf("status", e.target.value as CapaStatus)}>
                          <option>Open</option><option>In Progress</option><option>Completed</option>
                        </select>
                      </Field>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button type="button" onClick={saveEdit} style={saveBtn}>Save</button>
                      <button type="button" onClick={cancelEdit} style={ghostBtn}>Cancel</button>
                      <button type="button" onClick={() => { removeCapa(c.id); cancelEdit(); }} style={{ ...ghostBtn, color: "var(--critical)", marginLeft: "auto" }}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <div key={c.id} style={rowCard}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <button type="button" onClick={() => cycleStatus(c)} title="Cycle status" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", marginTop: 2, fontSize: 15, color: c.status === "Completed" ? "var(--positive)" : c.status === "In Progress" ? "var(--warning)" : "var(--text-3)" }}>
                        {c.status === "Completed" ? "✓" : c.status === "In Progress" ? "◐" : "○"}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, textDecoration: c.status === "Completed" ? "line-through" : "none", color: c.status === "Completed" ? "var(--text-3)" : "var(--text)" }}>
                          {c.title || c.problem}
                        </div>
                        {c.action && <div className="muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{c.action}</div>}
                        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span className="muted" style={{ fontSize: 11 }}>Owner: <strong>{c.owner || "—"}</strong></span>
                          <span className="muted" style={{ fontSize: 11 }}>Due: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: isOverdue(c) ? "var(--critical)" : "var(--text-2)" }}>{c.dueDate}</span></span>
                          {c.ruleId && <span className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{c.ruleId} v{c.ruleVersion}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <span style={statusStyle(c.status)}>{c.status}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: priColor(c.priority) }}>{c.priority} Priority</span>
                        <button type="button" onClick={() => startEdit(c)} style={editLink}>Edit</button>
                      </div>
                    </div>
                  </div>
                ),
              )
            )}
          </div>

          {/* Right: decision-engine recommendations */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card title="Recommended by Decision Engine" sub="Rules over canonical rejection / FPY / COPQ vars">
              {engineLoading ? (
                <div style={{ padding: 24, color: "var(--text-3)", fontSize: 13 }}>Evaluating rules…</div>
              ) : engineError ? (
                <div style={{ padding: 24, color: "var(--critical)", fontSize: 13 }}>
                  {engineError} <button type="button" onClick={loadRecommendations} style={linkBtn}>Retry</button>
                </div>
              ) : engineRecs.length === 0 ? (
                <div style={{ padding: 24, color: "var(--text-3)", fontSize: 13 }}>No active rules matched this scope.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {engineRecs.map((r) => {
                    const tracked = hasCapaForRule(r.ruleId, r.text);
                    return (
                      <div key={`${r.ruleId}-v${r.ruleVersion}`} style={rowCard}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: sevColor(r.severity), background: `color-mix(in srgb, ${sevColor(r.severity)} 14%, transparent)`, padding: "2px 8px", borderRadius: 5 }}>{r.severity}</span>
                          <span className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{r.ruleId} v{r.ruleVersion}</span>
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.text}</div>
                        <button type="button" onClick={() => openFromRec(r)} style={{ ...createRecBtn, marginTop: 10 }}>
                          {tracked ? "Create another →" : "Create CAPA →"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card title="How lineage works" sub="ADD §14">
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
                Every recommendation comes from a versioned rule matching predicates on canonical variables
                (<code style={{ fontFamily: "var(--font-mono)" }}>rejection_rate</code>, <code style={{ fontFamily: "var(--font-mono)" }}>fpy</code>,
                stage/defect shares). The advisor may explain a hit but never invents numbers. Creating a CAPA
                copies its <code style={{ fontFamily: "var(--font-mono)" }}>ruleId</code> + version onto the row.
              </p>
            </Card>
          </div>
        </div>
      </div>

      <CapaComposerModal
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        draft={draft}
        recommendationText={recText}
        context={recContext}
        evidence={recEvidence}
      />
    </AppShell>
  );
}

// ── small components ─────────────────────────────────────────────────────────
function Stat({ label, value, color, hint }: { label: string; value: number; color: string; hint: string }) {
  return (
    <Card title={label}>
      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1.1, color, marginBottom: 4 }}>{value}</div>
      <span className="muted" style={{ fontSize: 11 }}>{hint}</span>
    </Card>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={active ? tabActive : tabInactive}>{children}</button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
      <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function priColor(p: string) {
  return p === "High" ? "var(--critical)" : p === "Medium" ? "var(--warning)" : "var(--text-3)";
}

function statusStyle(s: string): React.CSSProperties {
  const base: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, display: "inline-block" };
  if (s === "Completed") return { ...base, background: "var(--positive-weak)", color: "var(--positive)" };
  if (s === "In Progress") return { ...base, background: "var(--warning-weak)", color: "var(--warning)" };
  return { ...base, background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border)" };
}

// ── styles ───────────────────────────────────────────────────────────────────
const rowCard: React.CSSProperties = { padding: "14px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" };
const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box", resize: "vertical" };
const newBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const createRecBtn: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--accent)", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 12px", cursor: "pointer" };
const saveBtn: React.CSSProperties = { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { background: "transparent", border: "1px solid var(--border)", color: "var(--text-2)", borderRadius: 6, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const editLink: React.CSSProperties = { background: "none", border: "none", color: "var(--accent)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 };
const tabActive: React.CSSProperties = { background: "transparent", border: "none", borderBottom: "2px solid var(--accent)", color: "var(--text)", fontWeight: 700, fontSize: 12.5, padding: "6px 4px", cursor: "pointer" };
const tabInactive: React.CSSProperties = { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "var(--text-3)", fontWeight: 600, fontSize: 12.5, padding: "6px 4px", cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0 };
