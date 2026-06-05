// src/components/ChatPanel.tsx
"use client";

import { useState } from "react";
import Icon from "@/components/editorial/Icon";
import type { DashboardConfig } from "@/types/dashboard";
import type { InsightSlide as InsightSlideType } from "@/types/dashboard";
import { getDeviceId } from "@/lib/device-id";

interface ChatPanelProps {
  dataSummary: string;
  currentConfig: DashboardConfig;
  sessionId?: string;
  onSlideAdded?: (slide: InsightSlideType) => void;
}

const SUGGESTED = [
  "What stands out this cycle?",
  "Which factor explains most of the change?",
  "Forecast the next cycle.",
  "Compare segments side-by-side.",
];

export default function ChatPanel({
  dataSummary,
  currentConfig,
  sessionId,
  onSlideAdded,
}: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (q?: string) => {
    const question = (q ?? text).trim();
    if (!question || loading) return;
    setError(null);
    setLoading(true);
    setText("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, dataSummary, currentConfig, sessionId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Chat request failed");
      }
      const result = await res.json();

      if (result.type === "slide" && result.slide) {
        const slide: InsightSlideType = {
          ...result.slide,
          sessionId: sessionId ?? "",
        };
        if (sessionId) {
          const deviceId = getDeviceId();
          fetch(`/api/sessions/${sessionId}/slides`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId, slide }),
          }).catch(console.warn);
        }
        onSlideAdded?.(slide);
      } else if (result.text) {
        // Surface plain-text replies as an insight slide so the editorial flow stays consistent
        onSlideAdded?.({
          sessionId: sessionId ?? "",
          question,
          headline: result.text,
          charts: [],
          bullets: [],
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-no-print
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: open ? "var(--surface)" : "transparent",
        borderTop: open ? "1px solid var(--border)" : "none",
        boxShadow: open ? "0 -8px 24px -12px rgba(15,23,42,0.18)" : "none",
        padding: open ? "18px 36px 18px" : 0,
        zIndex: 40,
        transition: "padding 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
    >
      {open ? (
        <div className="shell-wide">
          <div className="between mb-3" style={{ alignItems: "center" }}>
            <div className="flex gap-3" style={{ alignItems: "baseline" }}>
              <div className="eyebrow accent" style={{ fontWeight: 700 }}>Ask RAIS</div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>
                Every answer becomes a saveable insight slide.
              </div>
            </div>
            <button className="btn ghost sm" onClick={() => setOpen(false)}>
              <Icon name="chevron-down" size={12} /> Hide
            </button>
          </div>

          <div className="flex gap-2 mb-3" style={{ flexWrap: "wrap" }}>
            {SUGGESTED.map((q) => (
              <button
                key={q}
                onClick={() => submit(q)}
                disabled={loading}
                className="num card-hover"
                style={{
                  padding: "6px 12px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  fontSize: 11,
                  borderRadius: "var(--radius-pill)",
                  letterSpacing: "0.02em",
                  cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.55 : 1,
                  transition: "all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
                }}
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              border: "1.5px solid var(--border-strong)",
              background: "var(--surface-2)",
              padding: "4px 4px 4px 18px",
              borderRadius: "var(--radius-pill)",
            }}
          >
            <Icon name="search" size={16} style={{ color: "var(--text-3)" }} />
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask anything about your data…"
              disabled={loading}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                padding: "12px 0",
                fontSize: 15,
                color: "var(--text)",
                fontFamily: "var(--font-sans)",
              }}
            />
            <button
              type="submit"
              className="btn accent"
              disabled={loading || !text.trim()}
              style={{
                borderRadius: "var(--radius-pill)",
                padding: "10px 18px",
                opacity: loading || !text.trim() ? 0.6 : 1,
              }}
            >
              <Icon name="send" size={13} /> {loading ? "Asking…" : "Ask"}
            </button>
          </form>
          {error && (
            <div
              className="num"
              style={{
                marginTop: 8,
                color: "var(--critical)",
                fontSize: 11,
                letterSpacing: "0.04em",
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            right: 36,
            bottom: 24,
            padding: "14px 22px",
            background: "var(--accent)",
            color: "var(--text-invert)",
            fontFamily: "var(--font-sans)",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            borderRadius: "var(--radius-pill)",
            boxShadow: "var(--shadow-2)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="spark" size={14} /> Ask RAIS
        </button>
      )}
    </div>
  );
}
