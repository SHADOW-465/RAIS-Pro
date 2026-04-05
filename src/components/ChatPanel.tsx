// src/components/ChatPanel.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageCircle, RefreshCw } from "lucide-react";
import type { DashboardConfig, ChatMessage } from "@/types/dashboard";

interface ChatPanelProps {
  dataSummary: string;
  currentConfig: DashboardConfig;
  onRefresh: (config: DashboardConfig) => void;
}

export default function ChatPanel({ dataSummary, currentConfig, onRefresh }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || loading) return;

    const history = messages
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, dataSummary, currentConfig }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Chat request failed");
      }

      const result = await res.json();

      if (result.type === "refresh" && result.config) {
        onRefresh(result.config);
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: "Dashboard updated based on your request.", isRefresh: true },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: result.text ?? "I couldn't generate a response." },
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong. Try again.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-8 space-y-6">
      <div className="flex items-center gap-2 text-accent font-bold uppercase tracking-widest text-xs">
        <MessageCircle size={14} /> Ask a Follow-Up
      </div>

      {messages.length === 0 && (
        <p className="text-text-muted text-sm">
          Ask anything about your data — factual questions get a direct answer. Ask to
          &quot;refocus on cost&quot; or &quot;show me Q1 only&quot; to refresh the dashboard.
        </p>
      )}

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-accent/10 border border-accent/20 text-text-primary"
                  : msg.error
                  ? "bg-danger/10 border border-danger/20 text-danger"
                  : "bg-surface-raised text-text-secondary"
              }`}>
                {msg.isRefresh && (
                  <RefreshCw size={12} className="inline mr-1 text-accent" />
                )}
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="bg-surface-raised rounded-lg px-4 py-2 text-sm text-text-muted">
              Analyzing…
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
          placeholder="Ask anything about your data…"
          disabled={loading}
          className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-50 transition-colors"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="btn-primary px-4 py-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
