"use client";
// Staging verification panel (MOD pipeline, rung 6 — ADD §11).
// Excel header → canonical → confidence → reason → accept/override.
// Contained viewport: paginated proposals (same discipline as Staging Area
// approve-records grid) + sticky confirm action so operators never scroll a
// thousand-row meaning list to reach "Confirm & load numbers".

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { MappingProposalT } from "@/shared/models/entities";

export interface UploadedMod {
  modId: string;
  version: number;
  fileName: string;
  proposals: MappingProposalT[];
}

const PAGE_SIZE = 20;

function confidenceTone(score: number): { label: string; color: string } {
  if (score >= 0.9) return { label: `${Math.round(score * 100)}%`, color: "var(--positive)" };
  if (score >= 0.6) return { label: `${Math.round(score * 100)}%`, color: "var(--warning)" };
  return { label: score > 0 ? `${Math.round(score * 100)}%` : "—", color: "var(--critical)" };
}

const pgBtn = (disabled: boolean): CSSProperties => ({
  padding: "4px 10px",
  fontSize: 11.5,
  fontWeight: 700,
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  background: "var(--surface)",
  color: "var(--text-2)",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.4 : 1,
});

export default function MappingVerificationPanel({
  mods,
  onPublished,
}: {
  mods: UploadedMod[];
  onPublished?: (modId: string, version: number) => void;
}) {
  // entityId -> edited canonical (an edit = override; untouched = accept).
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, { learned: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [activeModId, setActiveModId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<"all" | "low" | "unresolved">("all");

  useEffect(() => {
    if (mods.length === 0) {
      setActiveModId(null);
      return;
    }
    setActiveModId((cur) => (cur && mods.some((m) => m.modId === cur) ? cur : mods[0].modId));
    setPage(0);
  }, [mods]);

  const activeMod = useMemo(
    () => mods.find((m) => m.modId === activeModId) ?? mods[0] ?? null,
    [mods, activeModId],
  );

  const filtered = useMemo(() => {
    if (!activeMod) return [];
    return activeMod.proposals.filter((p) => {
      if (filter === "low") return p.confidence < 0.9;
      if (filter === "unresolved") return !p.canonical && !(edits[p.entityId]?.trim());
      return true;
    });
  }, [activeMod, filter, edits]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageSlice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const lowCount = activeMod?.proposals.filter((p) => p.confidence < 0.9).length ?? 0;
  const unresolvedCount =
    activeMod?.proposals.filter((p) => !p.canonical && !(edits[p.entityId]?.trim())).length ?? 0;

  async function publish(mod: UploadedMod) {
    setBusy(mod.modId);
    setError(null);
    try {
      const decisions = mod.proposals.map((p) => {
        const edited = edits[p.entityId];
        const isEdited = edited !== undefined && edited !== (p.canonical ?? "");
        return isEdited
          ? {
              entityId: p.entityId,
              action: "override" as const,
              canonical: edited.trim() || null,
              kind: null,
              comment: null,
            }
          : {
              entityId: p.entityId,
              action: "accept" as const,
              canonical: null,
              kind: null,
              comment: null,
            };
      });
      const vRes = await fetch("/api/mods/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modId: mod.modId, version: mod.version, decisions }),
      });
      if (!vRes.ok) throw new Error((await vRes.json()).error ?? "verify failed");

      const pRes = await fetch("/api/mods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modId: mod.modId, version: mod.version }),
      });
      const pData = await pRes.json();
      if (!pRes.ok) {
        throw new Error(
          pData.details ? `${pData.error}: ${pData.details.join("; ")}` : pData.error ?? "publish failed",
        );
      }

      setDone((d) => ({ ...d, [mod.modId]: { learned: pData.learnedMappings ?? 0 } }));
      onPublished?.(mod.modId, mod.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(null);
    }
  }

  if (mods.length === 0) return null;

  const published = activeMod ? done[activeMod.modId] : undefined;
  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min((safePage + 1) * PAGE_SIZE, filtered.length);

  return (
    <section
      id="mapping-verify"
      style={{
        border: "1.5px solid color-mix(in srgb, var(--accent) 35%, var(--border))",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-2)",
        display: "flex",
        flexDirection: "column",
        maxHeight: "min(72vh, 640px)",
        minHeight: 280,
        overflow: "hidden",
        marginBottom: 18,
      }}
    >
      {/* Header — stays put */}
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--accent) 5%, var(--surface))",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "var(--accent)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Step 2 of 3
            </div>
            <h3 className="h3" style={{ color: "var(--text)", margin: 0 }}>
              Confirm column meanings
            </h3>
            <p className="small" style={{ color: "var(--text-3)", margin: "4px 0 0", lineHeight: 1.45 }}>
              Accept or fix each Excel header, then load numbers. Only this page of mappings is shown —
              use Next / Prev like the staging grid below.
            </p>
          </div>
          {activeMod && !published && (
            <button
              type="button"
              onClick={() => publish(activeMod)}
              disabled={busy !== null}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "var(--text-invert)",
                cursor: busy ? "wait" : "pointer",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: "0 2px 8px color-mix(in srgb, var(--accent) 30%, transparent)",
              }}
            >
              {busy === activeMod.modId ? "Saving schema…" : "Confirm & load numbers"}
            </button>
          )}
          {published && (
            <span className="small" style={{ color: "var(--positive)", fontWeight: 700, alignSelf: "center" }}>
              Schema saved ({published.learned} learned) · loading numbers…
            </span>
          )}
        </div>

        {error && (
          <p className="small" role="alert" style={{ color: "var(--critical)", margin: "10px 0 0" }}>
            {error}
          </p>
        )}

        {/* File tabs when multi-upload */}
        {mods.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {mods.map((m) => {
              const active = m.modId === activeMod?.modId;
              const isDone = !!done[m.modId];
              return (
                <button
                  key={m.modId}
                  type="button"
                  onClick={() => {
                    setActiveModId(m.modId);
                    setPage(0);
                  }}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "5px 10px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active
                      ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                      : "var(--surface-2)",
                    color: active ? "var(--accent)" : "var(--text-2)",
                    cursor: "pointer",
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={m.fileName}
                >
                  {isDone ? "✓ " : ""}
                  {m.fileName}
                </button>
              );
            })}
          </div>
        )}

        {activeMod && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              marginTop: 12,
            }}
          >
            <span
              className="small"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}
            >
              {activeMod.fileName} · v{activeMod.version} · {activeMod.proposals.length} entities
            </span>
            <span style={{ flex: 1 }} />
            {(
              [
                { id: "all" as const, label: `All (${activeMod.proposals.length})` },
                { id: "low" as const, label: `Needs review (${lowCount})` },
                { id: "unresolved" as const, label: `Unresolved (${unresolvedCount})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFilter(f.id);
                  setPage(0);
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: `1px solid ${filter === f.id ? "var(--accent)" : "var(--border)"}`,
                  background: filter === f.id ? "var(--accent)" : "var(--surface-2)",
                  color: filter === f.id ? "var(--text-invert)" : "var(--text-2)",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scroll body — only this region grows; outer card is capped */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {!activeMod || filtered.length === 0 ? (
          <div className="muted" style={{ padding: 28, textAlign: "center", fontSize: 13 }}>
            {filter === "all" ? "No mappings on this file." : "No rows match this filter."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "var(--surface-2)",
              }}
            >
              <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                <th style={th}>Source</th>
                <th style={th}>Excel label</th>
                <th style={th}>Canonical</th>
                <th style={th}>Conf.</th>
                <th style={th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {pageSlice.map((p) => {
                const tone = confidenceTone(p.confidence);
                const value = edits[p.entityId] ?? p.canonical ?? "";
                return (
                  <tr key={p.entityId} style={{ borderTop: "1px solid var(--border)" }}>
                    <td
                      style={{
                        ...td,
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-3)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.original.sheet}
                      {p.original.colLetter ? `!${p.original.colLetter}` : ""}
                    </td>
                    <td style={{ ...td, color: "var(--text)" }}>{p.original.header}</td>
                    <td style={td}>
                      <input
                        value={value}
                        disabled={!!published}
                        placeholder="unresolved — name it"
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [p.entityId]: e.target.value }))
                        }
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          padding: "5px 8px",
                          minWidth: 160,
                          width: "100%",
                          maxWidth: 280,
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--surface-2)",
                          color: value ? "var(--text)" : "var(--text-3)",
                        }}
                      />
                    </td>
                    <td style={{ ...td, fontFamily: "var(--font-mono)", color: tone.color }}>
                      {tone.label}
                    </td>
                    <td style={{ ...td, color: "var(--text-2)", maxWidth: 280 }}>
                      <span style={{ display: "block", lineHeight: 1.4 }}>{p.reason}</span>
                      <span style={{ color: "var(--text-3)", fontSize: 11 }}> · {p.resolvedBy}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer — pagination + secondary confirm (always reachable) */}
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid var(--border)",
          padding: "10px 14px",
          background: "var(--surface-2)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span className="small" style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
          {filtered.length === 0
            ? "0 rows"
            : `Showing ${from}–${to} of ${filtered.length.toLocaleString()}`}
          {filter !== "all" && activeMod
            ? ` · filtered from ${activeMod.proposals.length}`
            : ""}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {filtered.length > PAGE_SIZE && (
            <>
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={pgBtn(safePage === 0)}
              >
                ‹ Prev
              </button>
              <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                style={pgBtn(safePage >= totalPages - 1)}
              >
                Next ›
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
                style={pgBtn(safePage >= totalPages - 1)}
              >
                Last
              </button>
            </>
          )}
          {activeMod && !published && (
            <button
              type="button"
              onClick={() => publish(activeMod)}
              disabled={busy !== null}
              style={{
                marginLeft: 4,
                padding: "7px 14px",
                borderRadius: 8,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "var(--text-invert)",
                cursor: busy ? "wait" : "pointer",
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {busy === activeMod.modId ? "Saving…" : "Confirm & load"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

const th: CSSProperties = {
  padding: "8px 10px",
  fontWeight: 600,
  borderBottom: "1px solid var(--border)",
};
const td: CSSProperties = {
  padding: "8px 10px",
  verticalAlign: "middle",
};
