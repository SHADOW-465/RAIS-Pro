"use client";

import { useEffect, useMemo, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import Icon from "@/components/editorial/Icon";
import { useEvents } from "@/components/app/EventsContext";
import InsightSlide from "@/components/InsightSlide";
import type { DashboardConfig, InsightSlide as InsightSlideType } from "@/types/dashboard";
import type { Event } from "@/lib/store/types";
import {
  rejectionRate,
  totalRejected,
  totalChecked,
  fpy,
  byStage,
  byDefect,
  trend,
  copq,
  savingsOpportunity,
  trustScore,
} from "@/lib/analytics";

interface ChatMessage {
  id: string;
  sender: "user" | "rais";
  text: string;
  slide?: InsightSlideType;
  timestamp: string;
}

const SUGGESTED = [
  "What stands out this cycle?",
  "Which factor explains most of the change?",
  "Forecast the next cycle.",
  "Compare segments side-by-side.",
];

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active slide shown in the right panel preview
  const [activeSlide, setActiveSlide] = useState<InsightSlideType | null>(null);

  // Loaded context configuration & summaries
  const [activeConfig, setActiveConfig] = useState<DashboardConfig | null>(null);
  const [activeSummary, setActiveSummary] = useState("");

  const { events: contextEvents } = useEvents();
  const events = useMemo(() => contextEvents ?? [], [contextEvents]);

  const threadEndRef = useRef<HTMLDivElement>(null);

  // Load Ledger Data
  useEffect(() => {
    if (events.length > 0) {
      const scope = { grain: "month" as const };
      const rate = rejectionRate(events, scope).value;
      const rejected = totalRejected(events, scope).value;
      const checked = totalChecked(events, scope).value;
      const fpyVal = fpy(events, scope).value;
      const stages = byStage(events, scope);
      const defects = byDefect(events, scope);
      const tr = trend(events, scope, "rejectionRate");
      const copqRes = copq(events, scope);
      const savings = savingsOpportunity(events, scope);
      const trust = trustScore(events, scope);

      const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
      const rupee = (n: number) => `₹${(n / 100000).toFixed(2)}L`;
      const num = (n: number) => n.toLocaleString();

      const computedConfig: DashboardConfig = {
        dashboardTitle: "Live Staging Ledger",
        executiveSummary: `Overall rejection rate is ${pct(rate)}. Visual Inspection contributes the highest rejection volume.`,
        kpis: [
          { label: "Rejection Rate", value: pct(rate), unit: "", trend: 0, context: "YTD average" },
          { label: "Total Rejections", value: num(rejected), unit: "", trend: 0, context: "YTD total" },
          { label: "First Pass Yield (FPY)", value: pct(fpyVal), unit: "", trend: 0, context: "YTD FPY" },
          { label: "COPQ (This Month)", value: rupee(copqRes?.value ?? 0), unit: "", trend: 0, context: "Month total" },
          { label: "Savings Opportunity", value: rupee(savings ?? 0), unit: "", trend: 0, context: "Annual Potential" },
        ],
        charts: [
          {
            title: "Rejection Rate Trend",
            type: "line",
            data: {
              labels: tr.map((p) => p.label),
              datasets: [{ label: "Rejection Rate", data: tr.map((p) => p.value) }],
            },
          },
        ],
        insights: [
          `Total production checked is ${num(checked)} units.`,
          `Discrepancy count stands at ${num(rejected)} rejected.`,
        ],
        recommendations: [],
        alerts: [],
        sections: [],
      };

      setActiveConfig(computedConfig);
      setActiveSummary(JSON.stringify(computedConfig.insights));
    }
  }, [events]);

  // Scroll to bottom
  const scrollToBottom = () => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Submit Query
  const submitQuery = async (queryText?: string) => {
    const question = (queryText ?? inputText).trim();
    if (!question || loading || !activeConfig) return;

    setError(null);
    setLoading(true);
    setInputText("");

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          dataSummary: activeSummary,
          currentConfig: activeConfig,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Chat request failed");
      }

      const result = await res.json();

      let raisMsg: ChatMessage;

      if (result.type === "slide" && result.slide) {
        const s = result.slide;
        if (!s.headline && (!s.bullets || s.bullets.length === 0)) {
          throw new Error("Model returned empty slide structure.");
        }

        const slide: InsightSlideType = { ...s, sessionId: "" };

        raisMsg = {
          id: `rais-${Date.now()}`,
          sender: "rais",
          text: s.headline,
          slide,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        // Automatically focus/preview this slide
        setActiveSlide(slide);

      } else {
        raisMsg = {
          id: `rais-${Date.now()}`,
          sender: "rais",
          text: result.text || "I was unable to construct a slide response.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
      }

      setMessages((prev) => [...prev, raisMsg]);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "rais",
          text: `Error: ${err.message ?? "The intelligence agent encountered a calculation timeout."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Pre-load from query parameter
  const hasTriggeredInitial = useRef(false);
  useEffect(() => {
    if (initialQuery && activeConfig && !hasTriggeredInitial.current) {
      hasTriggeredInitial.current = true;
      submitQuery(initialQuery);
      // Clean up URL query parameters
      router.replace("/chat");
    }
  }, [initialQuery, activeConfig]);

  return (
    <AppShell active="ask">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 24, height: "calc(100vh - 140px)", overflow: "hidden" }}>
        
        {/* LEFT RAIL: Chat Conversation Console */}
        <div style={{ display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          
          {/* Header context selector */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span className="eyebrow accent" style={{ fontWeight: 700 }}>Ask MOID</span>
              <span className="muted" style={{ fontSize: 10.5 }}>Ask quality questions about production sheets</span>
            </div>
            <span className="eyebrow muted" style={{ fontSize: 10.5 }}>Staging Ledger (All Data)</span>
          </div>

          {/* Messages list */}
          <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {messages.length === 0 && (
              <div style={{ margin: "auto", maxWidth: 360, textAlign: "center", padding: "30px 10px" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--accent-weak)", display: "grid", placeItems: "center", color: "var(--accent)", margin: "0 auto 12px" }}>
                  <Icon name="comment" size={20} />
                </div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, margin: "0 0 6px" }}>Rejection Diagnostic QA</h3>
                <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
                  Enter a custom question or select one of the suggested prompts below to analyze quality anomalies.
                </p>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4
                }}
              >
                <div
                  style={{
                    background: m.sender === "user" ? "var(--accent-weak)" : "var(--surface-2)",
                    border: "1px solid",
                    borderColor: m.sender === "user" ? "var(--accent)" : "var(--border)",
                    borderRadius: "14px",
                    borderTopRightRadius: m.sender === "user" ? "2px" : "14px",
                    borderTopLeftRadius: m.sender === "user" ? "14px" : "2px",
                    padding: "10px 14px",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: "var(--text)"
                  }}
                >
                  {m.sender === "rais" ? <ChatMarkdown text={m.text} /> : m.text}

                  {m.slide && (
                    <div style={{ marginTop: 10, borderTop: "1px dashed var(--border)", paddingTop: 8, display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={() => setActiveSlide(m.slide!)}
                        style={{
                          background: activeSlide === m.slide ? "var(--accent)" : "var(--surface-3)",
                          color: activeSlide === m.slide ? "#fff" : "var(--text-2)",
                          border: "none",
                          borderRadius: 6,
                          padding: "4px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4
                        }}
                      >
                        <Icon name="spark" size={10} />
                        {activeSlide === m.slide ? "Showing Preview" : "View Slide"}
                      </button>
                    </div>
                  )}
                </div>
                <span className="muted" style={{ fontSize: 9.5, alignSelf: m.sender === "user" ? "flex-end" : "flex-start", padding: "0 4px" }}>
                  {m.timestamp}
                </span>
              </div>
            ))}

            {loading && (
              <div style={{ alignSelf: "flex-start", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "14px", borderTopLeftRadius: "2px", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <span className="blink" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
                <span className="blink" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animationDelay: "0.15s" }} />
                <span className="blink" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animationDelay: "0.3s" }} />
                <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>Consulting ledger metrics...</span>
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          {/* Quick recommendations / prompt chips */}
          <div style={{ padding: "8px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUGGESTED.map((chip) => (
              <button
                key={chip}
                onClick={() => submitQuery(chip)}
                disabled={loading}
                style={chipStyle}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Chat input box */}
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitQuery();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1.5px solid var(--border-strong)",
                background: "var(--bg)",
                padding: "3px 3px 3px 14px",
                borderRadius: "var(--radius-pill)"
              }}
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask RAIS to diagnose quality anomalies..."
                disabled={loading}
                style={inpStyle}
              />
              <button
                type="submit"
                disabled={loading || !inputText.trim()}
                style={{
                  ...btnStyle,
                  opacity: loading || !inputText.trim() ? 0.6 : 1,
                  cursor: loading || !inputText.trim() ? "not-allowed" : "pointer"
                }}
              >
                <Icon name="send" size={12} /> {loading ? "Asking" : "Ask"}
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT RAIL: Generated Insight Slide Workspace */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
          {activeSlide ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="between" style={{ alignItems: "center" }}>
                <span className="eyebrow muted">Insight Slide Workbench</span>
                <button
                  onClick={() => setActiveSlide(null)}
                  style={{
                    background: "transparent",
                    color: "var(--accent)",
                    border: "none",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Clear Workspace
                </button>
              </div>
              <InsightSlide slide={activeSlide} />
            </div>
          ) : (
            <div style={{ margin: "auto", maxWidth: 380, textAlign: "center", padding: "60px 20px", border: "2px dashed var(--border)", borderRadius: "var(--radius-lg)" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--surface-2)", display: "grid", placeItems: "center", color: "var(--text-3)", margin: "0 auto 16px" }}>
                <Icon name="spark" size={22} />
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, margin: "0 0 6px" }}>Insight Workspace</h3>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                When you ask a question, the AI advisor synthesizes figures into an interactive, visual slide card here. Every slide can be exported as a high-res presentation graphic.
              </p>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}

// Lightweight Markdown renderer for chat answers — handles **bold**, `- ` bullets,
// `> ` blockquotes, and paragraph/line breaks. Dependency-free (no react-markdown).
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  // Split on **bold** spans.
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) return <strong key={`${keyBase}-${i}`} style={{ fontWeight: 700, color: "var(--text)" }}>{m[1]}</strong>;
    return <span key={`${keyBase}-${i}`}>{part}</span>;
  });
}

function ChatMarkdown({ text }: { text: string }) {
  const lines = (text ?? "").replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    blocks.push(
      <ul key={`ul-${blocks.length}`} style={{ margin: "6px 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((b, i) => <li key={i} style={{ lineHeight: 1.5 }}>{renderInline(b, `li-${blocks.length}-${i}`)}</li>)}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-•]\s+/.test(line)) { bullets.push(line.replace(/^\s*[-•]\s+/, "")); continue; }
    flushBullets();
    if (line.trim() === "") continue;
    if (/^\s*>\s+/.test(line)) {
      blocks.push(
        <div key={`bq-${blocks.length}`} style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 10, margin: "6px 0", color: "var(--text-2)", fontStyle: "italic" }}>
          {renderInline(line.replace(/^\s*>\s+/, ""), `bq-${blocks.length}`)}
        </div>,
      );
      continue;
    }
    blocks.push(<p key={`p-${blocks.length}`} style={{ margin: "4px 0", lineHeight: 1.5 }}>{renderInline(line, `p-${blocks.length}`)}</p>);
  }
  flushBullets();
  return <div>{blocks}</div>;
}

const chipStyle: React.CSSProperties = {
  padding: "4px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-pill)",
  background: "var(--bg)",
  color: "var(--text-2)",
  fontSize: "10.5px",
  fontFamily: "var(--font-mono)",
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.15s ease"
};

const inpStyle: React.CSSProperties = {
  flex: 1,
  border: "none",
  outline: "none",
  background: "transparent",
  padding: "8px 0",
  fontSize: "13.5px",
  color: "var(--text)"
};

const btnStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert)",
  border: "none",
  borderRadius: "var(--radius-pill)",
  padding: "8px 16px",
  fontSize: "12.5px",
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  gap: 4
};

export default function ChatPage() {
  return (
    <Suspense fallback={
      <AppShell active="ask">
        <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
          Initializing Ask RAIS workspace...
        </div>
      </AppShell>
    }>
      <ChatContent />
    </Suspense>
  );
}
