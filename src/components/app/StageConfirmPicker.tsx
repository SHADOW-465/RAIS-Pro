"use client";

import { useState } from "react";

const NEW_STAGE_SENTINEL = "__new__";

/** The "needs review" badge's Confirm control: choose one of the active
 *  registry's known stages, or type a brand-new one. Calls onConfirm with
 *  either an existing stageId or the raw typed label — the caller (Task 8's
 *  confirmStageAlias) decides which case it is and acts accordingly. */
export default function StageConfirmPicker({
  datasetId,
  defaultStageId,
  knownStages,
  onConfirm,
}: {
  datasetId: string;
  defaultStageId: string;
  knownStages: { stageId: string; label: string }[];
  onConfirm: (datasetId: string, stageId: string) => void;
}) {
  const [selected, setSelected] = useState(
    knownStages.some((s) => s.stageId === defaultStageId) ? defaultStageId : NEW_STAGE_SENTINEL,
  );
  const [newLabel, setNewLabel] = useState("");

  const isNew = selected === NEW_STAGE_SENTINEL;

  function submit() {
    const value = isNew ? newLabel.trim() : selected;
    if (!value) return;
    onConfirm(datasetId, value);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{
          fontFamily: "var(--font-sans)", fontSize: 12, padding: "4px 8px",
          borderRadius: "var(--radius-sm)", border: "1px solid var(--border-strong)",
          background: "var(--paper)", color: "var(--text)",
        }}
      >
        {knownStages.map((s) => (
          <option key={s.stageId} value={s.stageId}>{s.label}</option>
        ))}
        <option value={NEW_STAGE_SENTINEL}>+ New stage…</option>
      </select>
      {isNew && (
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New stage name"
          style={{
            fontFamily: "var(--font-sans)", fontSize: 12, padding: "4px 8px",
            borderRadius: "var(--radius-sm)", border: "1px solid var(--border-strong)",
            background: "var(--paper)", color: "var(--text)",
          }}
        />
      )}
      <button
        type="button"
        onClick={submit}
        disabled={isNew && !newLabel.trim()}
        style={{
          fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12,
          cursor: isNew && !newLabel.trim() ? "not-allowed" : "pointer",
          color: "var(--paper)", background: "var(--accent)",
          border: "none", padding: "6px 14px", borderRadius: "var(--radius-sm)",
          opacity: isNew && !newLabel.trim() ? 0.5 : 1,
        }}
      >
        Confirm
      </button>
    </div>
  );
}
