"use client";

// CAPA register — corrective/preventive actions in capa-store (plant server,
// with this browser's localStorage as the fallback until the table exists).
// Create blank or from decision-engine recommendations (CapaComposerModal).

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import { useConfirm } from "@/components/ui/ConfirmContext";
import AppShell from "@/components/app/AppShell";
import Icon from "@/components/editorial/Icon";
import CapaComposerModal from "@/components/CapaComposerModal";
import { useTweaks } from "@/components/editorial/TweaksContext";
import type { RecommendationT } from "@/shared/models/decision";
import {
  useCapas,
  useCapaSource,
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

const STATUS_NEXT: Record<CapaStatus, CapaStatus> = {
  Open: "In Progress",
  "In Progress": "Completed",
  Completed: "Open",
};

function varsContext(r: RecommendationT): string {
  const bits = Object.entries(r.vars).map(([k, v]) => {
    const asPct = typeof v === "number" && v <= 1 && (k.includes("rate") || k === "fpy" || k.includes("share"));
    return `${k}: ${asPct ? `${(v * 100).toFixed(1)}%` : v}`;
  });
  return bits.length ? `Verified figures for this rule:\n${bits.join("\n")}` : "";
}

export default function CapaPage() {
  const capas = useCapas();
  const capaSource = useCapaSource();
  const { t } = useTweaks();
  const [engineRecs, setEngineRecs] = useState<RecommendationT[]>([]);
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineLoaded, setEngineLoaded] = useState(false);
  const [showEngine, setShowEngine] = useState(false);
  const [tab, setTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");

  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<CapaRecord | null>(null);
  const [recText, setRecText] = useState<string | undefined>();
  const [recContext, setRecContext] = useState<string | undefined>();
  const [recEvidence, setRecEvidence] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<CapaRecord | null>(null);

  const engineAbort = useRef<AbortController | null>(null);
  const lastDecideKey = useRef<string>("");

  const decideScope = useMemo(
    () => ({
      grain: "month" as const,
      dateFrom: t.dateFrom || null,
      dateTo: t.dateTo || null,
      stageIds: null as string[] | null,
      sizes: null as string[] | null,
    }),
    [t.dateFrom, t.dateTo],
  );
  const decideKey = `${decideScope.dateFrom ?? ""}|${decideScope.dateTo ?? ""}`;

  const loadRecommendations = useCallback(async () => {
    engineAbort.current?.abort();
    const ac = new AbortController();
    engineAbort.current = ac;
    setEngineLoading(true);
    setEngineError(null);
    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: decideScope,
          explain: false,
        }),
        signal: ac.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `decide ${res.status}`);
      if (ac.signal.aborted) return;
      setEngineRecs(data.recommendations ?? []);
      setEngineLoaded(true);
      lastDecideKey.current = decideKey;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setEngineError(err instanceof Error ? err.message : "Failed to load recommendations");
      setEngineRecs([]);
    } finally {
      if (!ac.signal.aborted) setEngineLoading(false);
    }
  }, [decideScope, decideKey]);

  // Defer /api/decide until the operator opens Decision engine (optimize).
  // Re-fetch when shell date range changes after a successful load.
  useEffect(() => {
    if (!showEngine || engineLoading) return;
    if (engineLoaded && lastDecideKey.current === decideKey) return;
    void loadRecommendations();
  }, [showEngine, engineLoaded, engineLoading, decideKey, loadRecommendations]);

  useEffect(() => () => engineAbort.current?.abort(), []);

  const counts = useMemo(() => {
    let open = 0,
      progress = 0,
      completed = 0,
      overdue = 0;
    for (const c of capas) {
      if (c.status === "Open") open++;
      else if (c.status === "In Progress") progress++;
      else if (c.status === "Completed") completed++;
      if (isOverdue(c)) overdue++;
    }
    return { open, progress, completed, overdue, pending: open + progress };
  }, [capas]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return capas
      .filter((c) => {
        if (tab === "pending") return c.status !== "Completed";
        if (tab === "completed") return c.status === "Completed";
        if (tab === "overdue") return isOverdue(c);
        return true;
      })
      .filter((c) => {
        if (!q) return true;
        return (
          c.title.toLowerCase().includes(q) ||
          c.problem.toLowerCase().includes(q) ||
          c.action.toLowerCase().includes(q) ||
          c.owner.toLowerCase().includes(q) ||
          (c.ruleId ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Overdue first, then High priority, then soonest due.
        const ao = isOverdue(a) ? 0 : 1;
        const bo = isOverdue(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        const pri = { High: 0, Medium: 1, Low: 2 } as const;
        const ap = pri[a.priority] ?? 3;
        const bp = pri[b.priority] ?? 3;
        if (ap !== bp) return ap - bp;
        return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
      });
  }, [capas, tab, query]);

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

  const { confirm: confirmModal } = useConfirm();

  const cycleStatus = async (c: CapaRecord) => {
    const next = STATUS_NEXT[c.status];
    // Guard completion — accidental close-out is costly in CAPA workflows.
    if (next === "Completed") {
      const ok = await confirmModal({
        title: "Mark CAPA as Completed?",
        description: `Mark “${c.title || c.problem || "this CAPA"}” as Completed?`,
        confirmText: "Complete CAPA",
        variant: "default",
      });
      if (!ok) return;
    }
    updateCapa(c.id, { status: next });
  };

  const confirmDelete = async (id: string, label: string) => {
    const ok = await confirmModal({
      title: `Delete CAPA “${label}”?`,
      description: `Delete “${label}”? This cannot be undone.`,
      confirmText: "Delete CAPA",
      variant: "danger",
    });
    if (!ok) return;
    removeCapa(id);
    cancelEdit();
  };

  const openEngine = () => {
    setShowEngine(true);
  };

  const sevColor = (s: RecommendationT["severity"]) =>
    s === "critical" ? "var(--critical)" : s === "warning" ? "var(--warning)" : "var(--text-3)";

  return (
    <AppShell active="capa">
      <div style={{ paddingBottom: 40 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-3xl, 28px)",
                fontWeight: 700,
                margin: "0 0 4px",
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              CAPA &amp; Actions
            </h1>
            <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.45, maxWidth: 520 }}>
              Track corrective work. Promote a decision-engine hit or start blank.
              <span style={{ display: "block", marginTop: 4, fontSize: 12 }}>
                {capaSource === "db"
                  ? "Stored on the plant server — every signed-in user sees this register."
                  : capaSource === "local"
                    ? "Stored on this browser only — the plant CAPA table is not set up yet."
                    : "Loading the plant register…"}
              </span>
            </p>
          </div>
          <button type="button" onClick={openBlank} style={newBtn}>
            <Icon name="plus" size={14} aria-hidden /> New CAPA
          </button>
        </div>

        {/* Filters = former KPI strip (distill: one control, not five cards) */}
        <div
          role="toolbar"
          aria-label="Filter CAPAs"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <FilterChip active={tab === "pending"} onClick={() => setTab("pending")} tone="default">
            Active {counts.pending}
          </FilterChip>
          <FilterChip active={tab === "overdue"} onClick={() => setTab("overdue")} tone="bad">
            Overdue {counts.overdue}
          </FilterChip>
          <FilterChip active={tab === "completed"} onClick={() => setTab("completed")} tone="good">
            Done {counts.completed}
          </FilterChip>
          <FilterChip active={tab === "all"} onClick={() => setTab("all")} tone="default">
            All {capas.length}
          </FilterChip>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, owner, rule…"
            aria-label="Search CAPAs"
            style={searchInp}
          />
        </div>

        <div className="capa-layout">
          {/* Register */}
          <section style={{ minWidth: 0 }} aria-label="CAPA register">
            {filtered.length === 0 ? (
              <div style={emptyBox}>
                {capas.length === 0 ? (
                  <>
                    No CAPAs yet.{" "}
                    <button type="button" onClick={openBlank} style={linkBtn}>
                      Create one
                    </button>
                    {" "}or{" "}
                    <button type="button" onClick={openEngine} style={linkBtn}>
                      open recommendations
                    </button>
                    .
                  </>
                ) : (
                  <>
                    Nothing in this filter{query ? ` matching “${query}”` : ""}.{" "}
                    <button type="button" onClick={() => { setTab("all"); setQuery(""); }} style={linkBtn}>
                      Clear filters
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filtered.map((c) =>
                  editingId === c.id && buffer ? (
                    <div key={c.id} style={{ ...rowCard, borderColor: "var(--accent)" }}>
                      <Field label="Title">
                        <input style={inp} value={buffer.title} onChange={(e) => setBuf("title", e.target.value)} />
                      </Field>
                      <Field label="Problem">
                        <textarea
                          style={{ ...inp, minHeight: 44 }}
                          value={buffer.problem}
                          onChange={(e) => setBuf("problem", e.target.value)}
                        />
                      </Field>
                      <Field label="Root cause">
                        <textarea
                          style={{ ...inp, minHeight: 40 }}
                          value={buffer.rootCause}
                          onChange={(e) => setBuf("rootCause", e.target.value)}
                        />
                      </Field>
                      <Field label="Corrective action">
                        <textarea
                          style={{ ...inp, minHeight: 52 }}
                          value={buffer.action}
                          onChange={(e) => setBuf("action", e.target.value)}
                        />
                      </Field>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <Field label="Owner">
                          <input style={inp} value={buffer.owner} onChange={(e) => setBuf("owner", e.target.value)} />
                        </Field>
                        <Field label="Due">
                          <DatePicker
                            value={buffer.dueDate}
                            onChange={(d) => setBuf("dueDate", d)}
                            ariaLabel="Due date"
                            size="sm"
                          />
                        </Field>
                        <Field label="Priority">
                          <Select
                            value={buffer.priority}
                            onChange={(v) => setBuf("priority", v as CapaPriority)}
                            options={[
                              { value: "High", label: "High" },
                              { value: "Medium", label: "Medium" },
                              { value: "Low", label: "Low" },
                            ]}
                            ariaLabel="Priority"
                          />
                        </Field>
                        <Field label="Status">
                          <Select
                            value={buffer.status}
                            onChange={(v) => setBuf("status", v as CapaStatus)}
                            options={[
                              { value: "Open", label: "Open" },
                              { value: "In Progress", label: "In Progress" },
                              { value: "Completed", label: "Completed" },
                            ]}
                            ariaLabel="Status"
                          />
                        </Field>
                        <Field label="Stage">
                          <input style={inp} value={buffer.stage} onChange={(e) => setBuf("stage", e.target.value)} />
                        </Field>
                      </div>
                      {buffer.ruleId ? (
                        <div className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginBottom: 8 }}>
                          Lineage {buffer.ruleId} v{buffer.ruleVersion}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                        <button type="button" onClick={saveEdit} style={saveBtn}>
                          Save
                        </button>
                        <button type="button" onClick={cancelEdit} style={ghostBtn}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDelete(c.id, buffer.title || buffer.problem || "CAPA")}
                          style={{ ...ghostBtn, color: "var(--critical)", marginLeft: "auto" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <article key={c.id} style={rowCard}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <button
                          type="button"
                          onClick={() => cycleStatus(c)}
                          title={`${c.status} → ${STATUS_NEXT[c.status]}`}
                          aria-label={`Status ${c.status}. Advance to ${STATUS_NEXT[c.status]}.`}
                          style={{
                            background: "var(--surface-2, var(--bg))",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            minWidth: 36,
                            minHeight: 36,
                            padding: 0,
                            cursor: "pointer",
                            marginTop: 0,
                            fontSize: 15,
                            lineHeight: 1,
                            flexShrink: 0,
                            color:
                              c.status === "Completed"
                                ? "var(--positive)"
                                : c.status === "In Progress"
                                  ? "var(--warning)"
                                  : "var(--text-3)",
                          }}
                        >
                          {c.status === "Completed" ? "✓" : c.status === "In Progress" ? "◐" : "○"}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              textDecoration: c.status === "Completed" ? "line-through" : "none",
                              color: c.status === "Completed" ? "var(--text-3)" : "var(--text)",
                            }}
                          >
                            {c.title || c.problem || "Untitled CAPA"}
                          </div>
                          {c.action ? (
                            <div
                              className="muted"
                              style={{
                                fontSize: 13,
                                marginTop: 4,
                                lineHeight: 1.45,
                                whiteSpace: "pre-wrap",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {c.action}
                            </div>
                          ) : null}
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              marginTop: 8,
                              flexWrap: "wrap",
                              alignItems: "center",
                              fontSize: 12,
                              color: "var(--text-3)",
                            }}
                          >
                            <span>
                              <strong style={{ color: "var(--text-2)" }}>{c.owner || "Unassigned"}</strong>
                            </span>
                            <span>
                              Due{" "}
                              <span
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontWeight: 700,
                                  color: isOverdue(c) ? "var(--critical)" : "var(--text-2)",
                                }}
                              >
                                {c.dueDate || "—"}
                              </span>
                              {isOverdue(c) ? " · overdue" : ""}
                            </span>
                            <span style={{ fontWeight: 700, color: priColor(c.priority), fontSize: 12 }}>
                              {c.priority}
                            </span>
                            {c.ruleId ? (
                              <span style={{ fontFamily: "var(--font-mono)" }}>
                                {c.ruleId} v{c.ruleVersion}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                          <span style={statusStyle(c.status)}>{c.status}</span>
                          <button type="button" onClick={() => startEdit(c)} style={editLink}>
                            Edit
                          </button>
                        </div>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </section>

          {/* Recommendations — collapsed by default (optimize + distill) */}
          <aside style={{ minWidth: 0 }} aria-label="Decision engine">
            <div style={asideCard}>
              <button
                type="button"
                id="capa-engine-toggle"
                onClick={() => setShowEngine((v) => !v)}
                aria-expanded={showEngine}
                aria-controls="capa-engine-panel"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                    Decision engine
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {engineLoaded
                      ? `${engineRecs.length} active hit${engineRecs.length === 1 ? "" : "s"}`
                      : "Rules over rejection / FPY / COPQ · uses top-bar date range"}
                  </div>
                </div>
                <span aria-hidden style={{ color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>
                  {showEngine ? "▾" : "▸"}
                </span>
              </button>

              {showEngine && (
                <div id="capa-engine-panel" style={{ marginTop: 14 }}>
                  {engineLoading ? (
                    <div style={{ padding: "12px 0", color: "var(--text-3)", fontSize: 13 }} role="status">
                      Evaluating rules…
                    </div>
                  ) : engineError ? (
                    <div style={{ padding: "8px 0", color: "var(--critical)", fontSize: 13 }} role="alert">
                      {engineError}{" "}
                      <button type="button" onClick={() => void loadRecommendations()} style={linkBtn}>
                        Retry
                      </button>
                    </div>
                  ) : engineRecs.length === 0 ? (
                    <div style={{ padding: "8px 0", color: "var(--text-3)", fontSize: 13 }}>
                      No rules matched for this range.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {engineRecs.map((r) => {
                        const tracked = hasCapaForRule(r.ruleId, r.text);
                        return (
                          <div key={`${r.ruleId}-v${r.ruleVersion}`} style={recRow}>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                marginBottom: 6,
                                flexWrap: "wrap",
                                alignItems: "center",
                              }}
                            >
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
                              <span className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
                                {r.ruleId}
                              </span>
                              {tracked && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--positive)" }}>
                                  CAPA exists
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{r.text}</div>
                            <button
                              type="button"
                              onClick={() => openFromRec(r)}
                              style={{ ...createRecBtn, marginTop: 10 }}
                            >
                              {tracked ? "Create another" : "Create CAPA"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {engineLoaded && !engineLoading ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEngineLoaded(false);
                        lastDecideKey.current = "";
                        void loadRecommendations();
                      }}
                      style={{ ...linkBtn, marginTop: 12, fontSize: 12 }}
                    >
                      Refresh hits
                    </button>
                  ) : null}
                  <details style={{ marginTop: 14 }}>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-3)",
                        userSelect: "none",
                      }}
                    >
                      How lineage works
                    </summary>
                    <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: "8px 0 0" }}>
                      Hits use the top-bar date range on verified ledger metrics. Creating a CAPA copies{" "}
                      <code style={{ fontFamily: "var(--font-mono)" }}>ruleId</code> + version onto the row.
                      The model never invents KPI numbers.
                    </p>
                  </details>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      <style>{`
        .capa-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.9fr);
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .capa-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

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

function FilterChip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone: "default" | "bad" | "good";
}) {
  const activeBg =
    tone === "bad"
      ? "color-mix(in srgb, var(--critical) 12%, var(--surface))"
      : tone === "good"
        ? "var(--positive-weak)"
        : "var(--accent-weak)";
  const activeFg =
    tone === "bad" ? "var(--critical)" : tone === "good" ? "var(--positive)" : "var(--accent-text)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "7px 12px",
        minHeight: 32,
        borderRadius: 999,
        border: active
          ? `1px solid ${tone === "bad" ? "var(--critical)" : tone === "good" ? "var(--positive)" : "var(--accent)"}`
          : "1px solid var(--border-strong)",
        background: active ? activeBg : "var(--surface)",
        color: active ? activeFg : "var(--text-2)",
        fontSize: 12.5,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
      <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function priColor(p: string) {
  return p === "High" ? "var(--critical)" : p === "Medium" ? "var(--warning)" : "var(--text-3)";
}

function statusStyle(s: string): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 10,
    display: "inline-block",
  };
  if (s === "Completed") return { ...base, background: "var(--positive-weak)", color: "var(--positive)" };
  if (s === "In Progress") return { ...base, background: "var(--warning-weak)", color: "var(--warning)" };
  return {
    ...base,
    background: "var(--surface-3)",
    color: "var(--text-2)",
    border: "1px solid var(--border)",
  };
}

const rowCard: React.CSSProperties = {
  padding: "14px 16px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};
const recRow: React.CSSProperties = {
  padding: "12px 12px",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};
const asideCard: React.CSSProperties = {
  padding: 16,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  position: "sticky",
  top: 12,
};
const emptyBox: React.CSSProperties = {
  padding: 40,
  textAlign: "center",
  color: "var(--text-3)",
  border: "1px dashed var(--border-strong)",
  borderRadius: 12,
  fontSize: 13,
  lineHeight: 1.5,
};
const inp: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
};
const searchInp: React.CSSProperties = {
  marginLeft: "auto",
  minWidth: 180,
  flex: "1 1 160px",
  maxWidth: 280,
  padding: "7px 12px",
  borderRadius: 999,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
};
const newBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "var(--accent)",
  color: "var(--text-invert, #fff)",
  border: "none",
  borderRadius: 9,
  padding: "9px 16px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};
const createRecBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--accent-text)",
  background: "var(--accent-weak)",
  border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))",
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
  fontFamily: "inherit",
};
const saveBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert, #fff)",
  border: "none",
  borderRadius: 8,
  padding: "8px 16px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};
const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-2)",
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};
const editLink: React.CSSProperties = {
  background: "none",
  border: "1px solid transparent",
  color: "var(--accent)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  padding: "6px 8px",
  minHeight: 32,
  borderRadius: 6,
  fontFamily: "inherit",
};
const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--accent)",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0,
  fontFamily: "inherit",
  fontSize: "inherit",
};
