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
    <div className="space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
        <MessageCircle size={12} className="text-accent" /> Ask a Follow-Up
      </p>

      {/* Empty state */}
      {messages.length === 0 && (
        <p className="text-sm text-text-muted">
          Ask anything about your data — get a focused insight slide back.
        </p>
      )}

      {/* Message list */}
      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-accent/10 border border-accent/20 text-text-primary"
                  : msg.error
                  ? "bg-danger/10 border border-danger/20 text-danger"
                  : "bg-white/60 border border-white/80 text-text-secondary"
              }`}>
                {msg.isRefresh && <RefreshCw size={11} className="inline mr-1 text-accent" />}
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="bg-white/60 border border-white/80 rounded-2xl px-4 py-2.5 text-sm text-text-muted">
              Generating insight slide…
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Frosted pill input */}
      <div className="flex items-center gap-2 bg-white/55 backdrop-blur-md border border-white/80 rounded-full px-4 py-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
          placeholder="Ask anything about your data…"
          disabled={loading}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
          style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)" }}
        >
          <Send size={13} className="text-white" />
        </button>
      </div>
    </div>
  );
}
