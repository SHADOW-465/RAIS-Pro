"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  searchJumpTargets,
  type SearchHit,
} from "@/lib/analytics/search-index";
import { listInvestigationRecents, goInvestigation } from "@/lib/analytics/investigation-state";
import { resolveIntent, hrefForNav, CONFIDENT } from "@/lib/analytics/intent";
import { llmSlotExtractor } from "@/lib/analytics/intent-llm";
import { emitNavBanner } from "@/lib/analytics/nav-banner";
import type { Event } from "@/lib/store/types";
import type { PersonaId } from "@/lib/persona";
import { PERSONAS } from "@/lib/persona";

export default function CommandPalette({
  open,
  onClose,
  events,
  persona,
}: {
  open: boolean;
  onClose: () => void;
  events: Event[] | null;
  persona: PersonaId;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const allowedNavKeys = PERSONAS[persona].navAllow;

  const hits: SearchHit[] = useMemo(() => {
    return searchJumpTargets(query, {
      events: events ?? [],
      allowedNavKeys,
      recents: listInvestigationRecents(),
    });
  }, [query, events, allowedNavKeys]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIdx(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const go = useCallback(
    (hit: SearchHit) => {
      onClose();
      router.push(hit.href);
    },
    [onClose, router]
  );

  const submitIntent = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const evs = events ?? [];
    const dates = evs.map((e) => e.occurredOn?.start).filter(Boolean).sort();
    const dataMaxIso = dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10);

    const result = await resolveIntent(
      q,
      { events: evs, currentScope: { grain: "month" }, persona, dataMaxIso },
      llmSlotExtractor,
    );

    if (result.confidence >= CONFIDENT) {
      const fromHref = window.location.pathname + window.location.search;
      const stateWithHighlight = { ...result.state, highlight: result.highlights[0] };
      const label =
        [result.matched.defect, result.matched.stage, result.matched.size, result.matched.metric, result.matched.period]
          .filter(Boolean)
          .join(" · ") || "view";
      emitNavBanner({ label, reason: q, fromHref });
      onClose();
      goInvestigation((href) => router.push(href), hrefForNav(result.navKey), stateWithHighlight);
      return;
    }
    // ambiguous → leave the existing hit list visible (no-op)
  }, [query, events, persona, onClose, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (hits[activeIdx] && hits[activeIdx].kind !== "destination") {
          go(hits[activeIdx]);
        } else {
          void submitIntent();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hits, activeIdx, go, onClose, submitIntent]);

  if (!open) return null;

  const kindLabel = (k: SearchHit["kind"]) => {
    switch (k) {
      case "destination":
        return "Page";
      case "recent":
        return "Recent";
      case "batch":
        return "Batch";
      case "stage":
        return "Gate";
      case "size":
        return "Size";
      case "defect":
        return "Defect";
      default:
        return k;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Jump to"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "color-mix(in srgb, var(--ink, #111) 40%, transparent)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 92vw)",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-3)",
            }}
          >
            Jump
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Batch, gate, size, defect, or page…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14,
              fontFamily: "inherit",
              color: "var(--text)",
            }}
          />
          <kbd
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: "var(--text-3)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "2px 6px",
            }}
          >
            Esc
          </kbd>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
          {hits.length === 0 && (
            <div
              style={{
                padding: "16px 12px",
                fontSize: 13,
                color: "var(--text-3)",
              }}
            >
              No matches for this role.
            </div>
          )}
          {hits.map((h, i) => (
            <button
              key={h.id}
              type="button"
              onClick={() => go(h)}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                width: "100%",
                textAlign: "left",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "8px 10px",
                cursor: "pointer",
                background: i === activeIdx ? "var(--accent-weak)" : "transparent",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  {h.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--text-3)",
                  }}
                >
                  {kindLabel(h.kind)}
                </span>
              </div>
              {h.sub && (
                <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                  {h.sub}
                </span>
              )}
            </button>
          ))}
        </div>
        <div
          style={{
            padding: "8px 12px",
            borderTop: "1px solid var(--border)",
            fontSize: 11,
            color: "var(--text-3)",
          }}
        >
          Role: {PERSONAS[persona].label} · ↑↓ navigate · Enter open
        </div>
      </div>
    </div>
  );
}

/** Global ⌘K / Ctrl+K listener. */
export function useCommandPaletteHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
}
