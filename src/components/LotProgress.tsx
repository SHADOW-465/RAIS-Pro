"use client";

// Lot completion strip — the four Assembly gates a batch must clear.
// Purely a view over `buildBatchProgress`; it stores nothing.
//
// Colour rule: "in progress" is the normal state of a live lot, so it must not
// borrow the accent. Next to a red rejected count, an orange bar read as a
// second alarm on every row that was simply mid-flight. Green means finished,
// amber means it has stopped moving, and everything else is quiet ink.

import Icon from "@/components/editorial/Icon";
import React from "react";
import type { BatchProgress } from "@/lib/analytics/batch-progress";

const SHORT: Record<string, string> = {
  visual: "Visual",
  balloon: "Balloon",
  "valve-integrity": "Valve",
  final: "Final",
};

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
}

export function lotStatusTone(p: BatchProgress): { label: string; color: string } {
  if (p.status === "complete") return { label: "Complete", color: "var(--positive)" };
  if (p.stalled) return { label: "Stalled", color: "var(--warning)" };
  if (p.status === "not-started") return { label: "Not started", color: "var(--text-3)" };
  return { label: "In progress", color: "var(--text-2)" };
}

export default function LotProgress({
  progress: p,
  activeStageId,
  showLabels = true,
}: {
  progress: BatchProgress;
  /** Gate the operator is currently entering — outlined in the bar. */
  activeStageId?: string | null;
  showLabels?: boolean;
}) {
  const tone = lotStatusTone(p);
  const done = p.status === "complete";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div
          style={{ display: "flex", gap: 2, width: 68, flexShrink: 0 }}
          role="img"
          aria-label={`${p.doneCount} of ${p.totalCount} assembly gates recorded`}
          title={p.steps
            .map((s) => `${SHORT[s.stageId] ?? s.stageId}: ${s.done ? shortDate(s.date) : "pending"}`)
            .join(" · ")}
        >
          {p.steps.map((s) => (
            <span
              key={s.stageId}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 1,
                // A gap mid-bar is real information: that gate was skipped
                // while later ones ran. Empty reads as "not yet", not broken.
                background: s.done
                  ? done
                    ? "var(--positive)"
                    : "var(--text-2)"
                  : "var(--border-strong)",
                outline: activeStageId === s.stageId ? `1.5px solid var(--accent)` : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
        <span
          className="small"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-2xs)",
            fontWeight: 600,
            color: tone.color,
            whiteSpace: "nowrap",
          }}
        >
          {p.doneCount}/{p.totalCount}
          <span style={{ fontFamily: "var(--font-sans)", fontWeight: 500 }}> {tone.label}</span>
        </span>
      </div>

      {showLabels && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", fontSize: "var(--text-2xs)" }}>
          {p.steps.map((s) => (
            <span
              key={s.stageId}
              style={{
                color: s.done ? "var(--text-2)" : "var(--text-3)",
                fontWeight: activeStageId === s.stageId ? 600 : 400,
              }}
            >
              <Icon name={s.done ? "check" : "minus"} size={10} aria-hidden /> {SHORT[s.stageId] ?? s.stageId}
              {s.done && s.date ? ` ${shortDate(s.date)}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
