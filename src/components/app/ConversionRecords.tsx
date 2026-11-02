"use client";

import { useState } from "react";
import type { BatchConversion } from "@/lib/lineage/types";
import { conversionReasonText, undoConversion } from "@/lib/client/conversion-actions";

/**
 * Recorded size changes with a GM-only Undo. Undo never deletes: the server
 * marks the row reversed and keeps it. Rows reversed here stay listed as
 * "Reversed" so the record is visible; active reads drop them after reload.
 */
export default function ConversionRecords({
  conversions,
  canUndo,
  onChanged,
}: {
  conversions: BatchConversion[];
  canUndo: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [reversed, setReversed] = useState<Record<string, BatchConversion>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "ok"; text: string } | null>(null);

  const rows = [
    ...conversions.filter((c) => !reversed[c.id]),
    ...Object.values(reversed),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (rows.length === 0) return null;

  async function confirmUndo(id: string) {
    if (!why.trim()) {
      setMsg({ tone: "bad", text: "Say why this conversion is being undone." });
      return;
    }
    if (!window.confirm("Undo this conversion? The record is kept and marked reversed.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await undoConversion(id, why);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      setReversed((prev) => ({ ...prev, [id]: r.conversion }));
      setOpenId(null);
      setWhy("");
      setMsg({ tone: "ok", text: r.warning || "Conversion reversed. The original record is kept." });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Recorded size changes</div>
      {msg && (
        <div role="status" style={{ fontSize: 12, marginBottom: 8, color: msg.tone === "bad" ? "var(--bad, #b91c1c)" : "var(--good, #15803d)" }}>
          {msg.text}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((c) => {
          const isReversed = !!c.reversedAt;
          return (
            <div
              key={c.id}
              data-testid="conversion-record"
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12, opacity: isReversed ? 0.7 : 1 }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono, monospace)", textDecoration: isReversed ? "line-through" : undefined }}>
                  {c.fromBatch} → {c.toBatch} · {c.changedQty} pcs · {c.convertedOn}
                </span>
                <span className="muted">{conversionReasonText(c)}</span>
                {isReversed ? (
                  <span style={{ fontWeight: 600 }}>
                    Reversed{c.reversedBy ? ` by ${c.reversedBy}` : ""}{c.reversalReason ? ` — ${c.reversalReason}` : ""}
                  </span>
                ) : canUndo && openId !== c.id ? (
                  <button type="button" onClick={() => { setOpenId(c.id); setWhy(""); setMsg(null); }} style={{ marginLeft: "auto", fontSize: 12, cursor: "pointer" }}>
                    Undo
                  </button>
                ) : null}
              </div>
              {openId === c.id && !isReversed && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <input
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                    placeholder="Why is this being undone?"
                    aria-label="Reason for undo"
                    style={{ flex: "1 1 240px", fontSize: 12, padding: "4px 8px" }}
                  />
                  <button type="button" disabled={busy || !why.trim()} onClick={() => confirmUndo(c.id)} style={{ fontSize: 12 }}>
                    {busy ? "Undoing…" : "Confirm undo"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setOpenId(null)} style={{ fontSize: 12 }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
