"use client";
// Staging verification panel (MOD pipeline, rung 6 — ADD §11).
// Excel header → canonical → confidence → reason → accept/override.
// Renders the draft-MOD proposals returned by POST /api/workbooks; "Verify &
// publish" applies decisions (/api/mods/verify) then publishes (/api/mods),
// which is when the company learns the mappings.

import { useState } from "react";
import type { MappingProposalT } from "@/shared/models/entities";

export interface UploadedMod {
  modId: string;
  version: number;
  fileName: string;
  proposals: MappingProposalT[];
}

function confidenceTone(score: number): { label: string; color: string } {
  if (score >= 0.9) return { label: `${Math.round(score * 100)}%`, color: "var(--positive)" };
  if (score >= 0.6) return { label: `${Math.round(score * 100)}%`, color: "var(--warning)" };
  return { label: score > 0 ? `${Math.round(score * 100)}%` : "—", color: "var(--critical)" };
}

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

  async function publish(mod: UploadedMod) {
    setBusy(mod.modId);
    setError(null);
    try {
      const decisions = mod.proposals.map((p) => {
        const edited = edits[p.entityId];
        const isEdited = edited !== undefined && edited !== (p.canonical ?? "");
        return isEdited
          ? { entityId: p.entityId, action: "override" as const, canonical: edited.trim() || null, kind: null, comment: null }
          : { entityId: p.entityId, action: "accept" as const, canonical: null, kind: null, comment: null };
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
      if (!pRes.ok) throw new Error(pData.details ? `${pData.error}: ${pData.details.join("; ")}` : pData.error ?? "publish failed");

      setDone((d) => ({ ...d, [mod.modId]: { learned: pData.learnedMappings ?? 0 } }));
      onPublished?.(mod.modId, mod.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(null);
    }
  }

  if (mods.length === 0) return null;

  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)", padding: 20, marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4, gap: 12, flexWrap: "wrap" }}>
        <h3 className="h3" style={{ color: "var(--text)" }}>Confirm column meanings</h3>
        <span className="small" style={{ color: "var(--text-3)" }}>
          Step 2 · Accept or fix each Excel header, then load numbers to the ledger
        </span>
      </div>
      {error && (
        <p className="small" style={{ color: "var(--critical)", marginBottom: 8 }}>{error}</p>
      )}
      {mods.map((mod) => {
        const published = done[mod.modId];
        return (
          <div key={mod.modId} style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="small" style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
                {mod.fileName} · v{mod.version} · {mod.proposals.length} entities
              </span>
              {published ? (
                <span className="small" style={{ color: "var(--positive)" }}>
                  Schema saved ({published.learned} learned) · loading numbers…
                </span>
              ) : (
                <button
                  onClick={() => publish(mod)}
                  disabled={busy !== null}
                  style={{
                    padding: "6px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--accent)",
                    background: "var(--accent)", color: "#fff", cursor: busy ? "wait" : "pointer", fontSize: 13,
                  }}
                >
                  {busy === mod.modId ? "Saving schema…" : "Confirm & load numbers"}
                </button>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "var(--text-3)", textAlign: "left" }}>
                    <th style={{ padding: "4px 8px", fontWeight: 500 }}>Source</th>
                    <th style={{ padding: "4px 8px", fontWeight: 500 }}>Excel label</th>
                    <th style={{ padding: "4px 8px", fontWeight: 500 }}>Canonical</th>
                    <th style={{ padding: "4px 8px", fontWeight: 500 }}>Conf.</th>
                    <th style={{ padding: "4px 8px", fontWeight: 500 }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {mod.proposals.map((p) => {
                    const tone = confidenceTone(p.confidence);
                    const value = edits[p.entityId] ?? p.canonical ?? "";
                    return (
                      <tr key={p.entityId} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                          {p.original.sheet}{p.original.colLetter ? `!${p.original.colLetter}` : ""}
                        </td>
                        <td style={{ padding: "4px 8px", color: "var(--text)" }}>{p.original.header}</td>
                        <td style={{ padding: "4px 8px" }}>
                          <input
                            value={value}
                            disabled={!!published}
                            placeholder="unresolved — name it"
                            onChange={(e) => setEdits((prev) => ({ ...prev, [p.entityId]: e.target.value }))}
                            style={{
                              fontFamily: "var(--font-mono)", fontSize: 12, padding: "3px 6px", minWidth: 180,
                              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                              background: "var(--surface-2)",
                              color: value ? "var(--text)" : "var(--text-3)",
                            }}
                          />
                        </td>
                        <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)", color: tone.color }}>{tone.label}</td>
                        <td style={{ padding: "4px 8px", color: "var(--text-2)" }}>
                          {p.reason}
                          <span style={{ color: "var(--text-3)" }}> · {p.resolvedBy}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}
