"use client";

// CapaComposerModal — the floating window a GM opens from a "Create CAPA →"
// recommendation. Left: diagnostic brief + editable CAPA draft. Right: an AI
// advisor he can chat with to decide root cause / action. "Create CAPA" writes
// to the shared capa-store — no tab switch. Reused on the dashboard and /capa.

import React, { useState, useRef, useEffect, useCallback } from "react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import { useConfirm } from "@/components/ui/ConfirmContext";
import Icon from "@/components/editorial/Icon";
import { BRAND_NAME } from "@/lib/brand";
import {
  addCapa,
  type CapaRecord,
  type CapaPriority,
  type CapaStatus,
} from "@/lib/capa-store";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Editable draft to open with (seeded from a recommendation, or blank). */
  draft: CapaRecord | null;
  /** Recommendation text — grounds the advisor and shows in the brief. */
  recommendationText?: string;
  /** Verified figures passed to the advisor (never invented by the model). */
  context?: string;
  /** Rule-id + vars line for the brief lineage row. */
  evidence?: string | null;
  onCreated?: (record: CapaRecord) => void;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--critical)",
  warning: "var(--warning)",
  info: "var(--positive)",
};

const SUGGESTED = [
  { icon: "search", label: "Likely root cause?", q: "What is the most likely root cause behind this?" },
  { icon: "trend-up", label: "Cost impact?", q: "What is the cost impact if we don't act on this?" },
  { icon: "check", label: "Action plan?", q: "Give me a concrete 3-step action plan I can assign." },
] as const;

export default function CapaComposerModal({
  isOpen,
  onClose,
  draft,
  recommendationText,
  context,
  evidence,
  onCreated,
}: Props) {
  const [form, setForm] = useState<CapaRecord | null>(draft);
  const [created, setCreated] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialSnapshot = useRef<string>("");

  // Reset when a new draft is opened.
  useEffect(() => {
    if (isOpen) {
      setForm(draft);
      setCreated(false);
      setInput("");
      initialSnapshot.current = draft ? JSON.stringify(draft) : "";
      setMessages(
        recommendationText
          ? [
              {
                role: "assistant",
                content: `I flagged this: **${recommendationText}** — ask me about the driver, the cost at stake, or a concrete action plan, then shape the CAPA on the left.`,
              },
            ]
          : [
              {
                role: "assistant",
                content: "Describe the issue on the left, or ask me how to frame a corrective action for it.",
              },
            ],
      );
      // Focus first field after open (a11y).
      requestAnimationFrame(() => {
        const root = panelRef.current;
        const el = root?.querySelector<HTMLElement>("input, textarea, button");
        el?.focus();
      });
    }
  }, [isOpen, draft, recommendationText]);

  const { confirm: confirmModal } = useConfirm();

  const isDirty = Boolean(
    form && !created && initialSnapshot.current && JSON.stringify(form) !== initialSnapshot.current,
  );

  const requestClose = useCallback(async () => {
    if (isDirty) {
      const ok = await confirmModal({
        title: "Discard unsaved draft?",
        description: "You have unsaved changes in this CAPA draft. Are you sure you want to discard them?",
        confirmText: "Discard Draft",
        variant: "warning",
      });
      if (!ok) return;
    }
    onClose();
  }, [isDirty, onClose, confirmModal]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, requestClose]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const set = <K extends keyof CapaRecord>(key: K, value: CapaRecord[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || thinking) return;
      const next: ChatMsg[] = [...messages, { role: "user", content: q }];
      setMessages(next);
      setInput("");
      setThinking(true);
      try {
        const res = await fetch("/api/capa-advisor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recommendation: recommendationText ?? form?.problem, context, messages: next }),
        });
        const data = await res.json();
        setMessages([...next, { role: "assistant", content: data.reply ?? data.error ?? "No response." }]);
      } catch {
        setMessages([...next, { role: "assistant", content: "Network error — try again." }]);
      } finally {
        setThinking(false);
      }
    },
    [messages, thinking, recommendationText, form, context],
  );

  const applyAsAction = (text: string) => {
    const clean = text.replace(/\*\*/g, "").replace(/^[->\s]+/gm, "").trim();
    set("action", form?.action ? `${form.action}\n${clean}` : clean);
  };

  const create = () => {
    if (!form || !canCreate) return;
    const record: CapaRecord = { ...form, title: form.title.trim() || form.problem.slice(0, 60) };
    addCapa(record);
    setCreated(true);
    onCreated?.(record);
  };

  if (!isOpen || !form) return null;

  const canCreate = form.problem.trim().length > 0 && form.action.trim().length > 0 && form.owner.trim().length > 0;
  const sevColor = form.severity ? SEVERITY_COLOR[form.severity] : "var(--text-3)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="capa-composer-title"
      style={backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div ref={panelRef} style={panel}>
        {/* Title bar */}
        <div style={titleBar}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={brandChip}>{BRAND_NAME}</span>
            <span id="capa-composer-title" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>
              {form.source === "engine" ? "Create CAPA from recommendation" : "New CAPA"}
            </span>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close" style={closeBtn}>
            <Icon name="plus" size={14} style={{ transform: "rotate(45deg)" }} aria-hidden />
          </button>
        </div>

        <div style={body}>
          {/* ── Left: brief + editable draft ─────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", paddingRight: 4 }}>
            {recommendationText && (
              <div
                style={{
                  ...briefCard,
                  background: `color-mix(in srgb, ${sevColor} 8%, var(--surface-2))`,
                  borderColor: `color-mix(in srgb, ${sevColor} 35%, var(--border))`,
                }}
              >
                {form.severity && (
                  <span style={{ ...sevPill, color: sevColor, background: `color-mix(in srgb, ${sevColor} 14%, transparent)` }}>
                    {form.severity}
                  </span>
                )}
                <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, marginTop: 6 }}>{recommendationText}</div>
                {evidence && (
                  <div className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 8 }}>{evidence}</div>
                )}
              </div>
            )}

            {created ? (
              <div style={successCard}>
                <Icon name="check" size={18} style={{ color: "var(--positive)" }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>CAPA created</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    Tracked in CAPA &amp; Action Items. Close this window or open the register to edit it.
                  </div>
                </div>
                <a href="/actions/capa" style={openRegisterBtn}>Open register →</a>
              </div>
            ) : (
              <>
                <Field label="Title">
                  <input style={inp} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Short label" />
                </Field>
                <Field label="Problem statement" required>
                  <textarea style={{ ...inp, minHeight: 56, resize: "vertical" }} value={form.problem} onChange={(e) => set("problem", e.target.value)} placeholder="What's wrong?" />
                </Field>
                <Field label="Root cause" hint="Ask the advisor if unsure">
                  <textarea style={{ ...inp, minHeight: 48, resize: "vertical" }} value={form.rootCause} onChange={(e) => set("rootCause", e.target.value)} placeholder="Suspected cause" />
                </Field>
                <Field label="Corrective / preventive action" required>
                  <textarea style={{ ...inp, minHeight: 64, resize: "vertical" }} value={form.action} onChange={(e) => set("action", e.target.value)} placeholder="What will be done — use the advisor's plan" />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Owner" required>
                    <input style={inp} value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="Assignee" />
                  </Field>
                  <Field label="Due date">
                    <DatePicker value={form.dueDate} onChange={(d) => set("dueDate", d)} ariaLabel="Due date" />
                  </Field>
                  <Field label="Priority">
                    <Select
                      value={form.priority}
                      onChange={(v) => set("priority", v as CapaPriority)}
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
                      value={form.status}
                      onChange={(v) => set("status", v as CapaStatus)}
                      options={[
                        { value: "Open", label: "Open" },
                        { value: "In Progress", label: "In Progress" },
                        { value: "Completed", label: "Completed" },
                      ]}
                      ariaLabel="Status"
                    />
                  </Field>
                </div>
                <Field label="Stage">
                  <input style={inp} value={form.stage} onChange={(e) => set("stage", e.target.value)} />
                </Field>
                <button type="button" onClick={create} disabled={!canCreate} style={{ ...createBtn, opacity: canCreate ? 1 : 0.5, cursor: canCreate ? "pointer" : "not-allowed" }}>
                  Create CAPA
                </button>
                {!canCreate && (
                  <span className="muted" style={{ fontSize: 11, textAlign: "center" }}>
                    Problem, action, and owner are required.
                  </span>
                )}
              </>
            )}
          </div>

          {/* ── Right: AI advisor ────────────────────────────────────── */}
          <div style={advisorPane}>
            <div style={advisorHead}>
              <Icon name="spark" size={14} style={{ color: "var(--accent)" }} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{BRAND_NAME} Advisor</span>
              <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>grounded in verified figures</span>
            </div>

            <div style={chatScroll}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 4 }}>
                  <div style={m.role === "user" ? userBubble : botBubble}>
                    <MarkdownLite text={m.content} />
                  </div>
                  {m.role === "assistant" && i > 0 && (
                    <button type="button" onClick={() => applyAsAction(m.content)} style={useActionBtn}>
                      + Use as action
                    </button>
                  )}
                </div>
              ))}
              {thinking && <div style={botBubble}><span className="muted" style={{ fontSize: 12 }}>Thinking…</span></div>}
              <div ref={chatEndRef} />
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 0" }}>
              {SUGGESTED.map((s) => (
                <button key={s.label} type="button" onClick={() => send(s.q)} disabled={thinking} style={chip}>
                  <Icon name={s.icon} size={11} /> {s.label}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              style={{ display: "flex", gap: 8 }}
            >
              <input style={{ ...inp, flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the advisor…" />
              <button type="submit" disabled={!input.trim() || thinking} style={askBtn}>Ask</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Minimal markdown: **bold** + line breaks. Advisor replies are short. */
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} style={{ marginTop: i === 0 ? 0 : 2 }}>
            {parts.map((p, j) =>
              p.startsWith("**") && p.endsWith("**") ? (
                <strong key={j}>{p.slice(2, -2)}</strong>
              ) : (
                <span key={j}>{p}</span>
              ),
            )}
          </div>
        );
      })}
    </>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>
        {label} {required && <span style={{ color: "var(--critical)" }}>*</span>}
        {hint && <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────
const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(10, 9, 8, 0.72)",
  zIndex: 1000,
  display: "grid",
  placeItems: "center",
  padding: 24,
};
const panel: React.CSSProperties = {
  width: "95vw",
  maxWidth: 1180,
  height: "90vh",
  background: "var(--bg)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "0 16px 40px -12px rgba(0,0,0,0.45)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
const titleBar: React.CSSProperties = {
  padding: "16px 24px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid var(--border)",
  flexShrink: 0,
};
const brandChip: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  background: "var(--surface-2)",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  padding: "2px 8px",
  borderRadius: 6,
  letterSpacing: "0.02em",
};
const closeBtn: React.CSSProperties = {
  background: "var(--surface)",
  border: "1.5px solid var(--border-strong)",
  color: "var(--text-2)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  padding: 8,
  borderRadius: "50%",
};
const body: React.CSSProperties = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "1.1fr 1fr",
  gap: 20,
  padding: 24,
  overflow: "hidden",
  minHeight: 0,
};
const briefCard: React.CSSProperties = {
  padding: "12px 14px",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
};
const sevPill: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  padding: "2px 8px",
  borderRadius: 5,
};
const inp: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};
const createBtn: React.CSSProperties = {
  marginTop: 4,
  background: "var(--accent)",
  color: "var(--on-accent)",
  border: "none",
  borderRadius: 6,
  padding: "11px 14px",
  fontWeight: 600,
  fontSize: 13.5,
};
const successCard: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "16px 18px",
  border: "1px solid var(--positive)",
  background: "var(--positive-weak)",
  borderRadius: "var(--radius-md)",
  flexWrap: "wrap",
};
const openRegisterBtn: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--accent)",
  textDecoration: "none",
  whiteSpace: "nowrap",
};
const advisorPane: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface)",
  padding: 14,
};
const advisorHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingBottom: 10,
  borderBottom: "1px solid var(--border)",
};
const chatScroll: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "12px 2px",
  minHeight: 0,
};
const botBubble: React.CSSProperties = {
  maxWidth: "92%",
  padding: "10px 12px",
  borderRadius: "10px 10px 10px 2px",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--text)",
};
const userBubble: React.CSSProperties = {
  maxWidth: "92%",
  padding: "10px 12px",
  borderRadius: "10px 10px 2px 10px",
  background: "var(--accent-weak)",
  border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))",
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--text)",
};
const useActionBtn: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--accent)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "0 4px",
};
const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11.5,
  fontWeight: 600,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-2)",
  cursor: "pointer",
};
const askBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--on-accent)",
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
