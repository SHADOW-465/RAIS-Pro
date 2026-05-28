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
  onRefresh: (config: DashboardConfig) => void;
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
  onRefresh,
  sessionId,
  onSlideAdded,
}: ChatPanelProps) {
  const [open, setOpen] = useState(true);
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
      } else if (result.type === "refresh" && result.config) {
        onRefresh(result.config);
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
        background:
          "linear-gradient(to top, var(--paper) 60%, color-mix(in oklab, var(--paper) 70%, transparent) 100%)",
        borderTop: open ? "1px solid var(--ink)" : "none",
        padding: open ? "18px 36px 18px" : 0,
        zIndex: 40,
        transition: "padding 0.3s ease",
      }}
    >
      {open ? (
        <div className="shell-wide">
          <div className="between mb-3" style={{ alignItems: "center" }}>
            <div className="flex gap-3" style={{ alignItems: "baseline" }}>
              <div className="eyebrow accent">Ask RAIS</div>
              <div className="muted" style={{ fontSize: 12 }}>
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
                className="mono"
                style={{
                  padding: "6px 12px",
                  border: "1px solid var(--hairline-strong)",
                  background: "var(--paper-soft)",
                  fontSize: 11,
                  borderRadius: 999,
                  letterSpacing: "0.02em",
                  cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.55 : 1,
                  transition: "all 0.15s",
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
              border: "2px solid var(--ink)",
              background: "var(--paper-soft)",
              padding: "4px 4px 4px 18px",
              borderRadius: 999,
            }}
          >
            <Icon name="search" size={16} />
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
                fontFamily: "var(--sans)",
              }}
            />
            <button
              type="submit"
              className="btn accent"
              disabled={loading || !text.trim()}
              style={{
                borderRadius: 999,
                padding: "10px 18px",
                opacity: loading || !text.trim() ? 0.6 : 1,
              }}
            >
              <Icon name="send" size={13} /> {loading ? "Asking…" : "Ask"}
            </button>
          </form>
          {error && (
            <div
              className="mono"
              style={{
                marginTop: 8,
                color: "var(--accent)",
                fontSize: 11,
                letterSpacing: "0.04em",
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
            background: "var(--ink)",
            color: "var(--paper)",
            fontFamily: "var(--sans)",
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            borderRadius: 999,
            boxShadow: "0 6px 20px -8px rgba(20,18,12,0.4)",
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
