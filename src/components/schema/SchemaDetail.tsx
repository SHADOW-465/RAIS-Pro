"use client";

// The editor half of Data Schema. Add / Save / Delete live on the card toolbar;
// this panel holds the draft and exposes save() through the ref. Mutations go
// through the page mutate helper and /api/schema — no new endpoints.

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import Select from "@/components/ui/Select";
import { mergeDefectForAdd } from "@/lib/schema/defect-payload";
import { resolveSections } from "@/lib/schema/sections";
import type { SchemaPendingCreate } from "@/lib/schema/toolbar";
import type { SchemaNode, SchemaTreeInput } from "@/lib/schema/tree";

const CAPTURE_OPTS = ["checked", "accepted", "hold", "rejected"] as const;

export type { SchemaPendingCreate };

export type SchemaDetailHandle = {
  save: () => void;
};

export interface SchemaDetailProps {
  node: SchemaNode | null;
  data: SchemaTreeInput;
  busy: boolean;
  /** Unlocked via the page password toggle. Locked = view only. */
  editable: boolean;
  saveError?: string | null;
  pendingCreate?: SchemaPendingCreate | null;
  onPendingCreateConsumed?: () => void;
  onSelectId?: (id: string | null) => void;
  onExpand?: (id: string) => void;
  onCanSaveChange?: (canSave: boolean) => void;
  /** Locked inspector: clicking a capture should open the password gate. */
  onRequestUnlock?: () => void;
  mutate: (body: Record<string, unknown>, okMsg: string) => void | Promise<void>;
}

const SchemaDetail = forwardRef<SchemaDetailHandle, SchemaDetailProps>(function SchemaDetail(
  {
    node,
    data,
    busy,
    editable,
    saveError,
    pendingCreate,
    onPendingCreateConsumed,
    onSelectId,
    onExpand,
    onCanSaveChange,
    onRequestUnlock,
    mutate,
  },
  ref,
) {
  const stage = useMemo(
    () => data.stages.find((s) => s.stageId === node?.ref?.stageId) ?? null,
    [data.stages, node],
  );
  const defect = useMemo(
    () => data.defects.find((d) => d.defectCode === node?.ref?.defectCode) ?? null,
    [data.defects, node],
  );
  const size = useMemo(
    () => data.sizes.find((s) => s.sizeId === node?.ref?.sizeId) ?? null,
    [data.sizes, node],
  );
  const sections = useMemo(() => resolveSections(data), [data]);

  // Local draft, reset whenever the selection changes.
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (node?.kind === "stage" && stage) setDraft({ ...stage });
    else if (node?.kind === "defect" && defect) setDraft({ ...defect });
    else if (node?.kind === "size" && size) setDraft({ ...size });
    else if (node?.kind === "category") setDraft({ label: node.label });
    else if (node?.kind === "captures-folder" && stage) setDraft({ captures: [...(stage.captures ?? [])] });
    else setDraft({});
  }, [node, stage, defect, size]);

  // "Add X" — a folder node (category / defects-folder / all-defects-folder /
  // sizes-folder) offers to create a new child, pre-scoped to where you clicked.
  const [creating, setCreating] = useState<"stage" | "defect" | "size" | "section" | null>(null);
  const [newSectionLabel, setNewSectionLabel] = useState("");
  const [newStage, setNewStage] = useState({
    stageId: "",
    label: "",
    category: "assembly" as string,
    captures: [] as string[],
    upstream: [] as string[],
    isQualityGate: false,
  });
  const [newDefect, setNewDefect] = useState({ defectCode: "", label: "", stages: [] as string[] });
  const [newSize, setNewSize] = useState({ sizeId: "", label: "" });
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    setCreating(null);
    setFormError(null);
  }, [node?.id]);

  useEffect(() => {
    if (!pendingCreate || !editable) return;
    if (pendingCreate === "section") {
      setCreating("section");
      onPendingCreateConsumed?.();
      return;
    }
    if (!node) return;
    if (pendingCreate === "stage") {
      const category =
        node.kind === "category"
          ? node.ref?.categoryId
          : data.stages.find((s) => s.stageId === node.ref?.stageId)?.category;
      setNewStage((d) => ({ ...d, category: category ?? "assembly" }));
      setCreating("stage");
    } else if (pendingCreate === "defect") {
      const pre = node.ref?.stageId ?? node.ref?.scopedUnderStageId;
      setNewDefect({ defectCode: "", label: "", stages: pre ? [pre] : [] });
      setCreating("defect");
    } else if (pendingCreate === "size") {
      setCreating("size");
    }
    onPendingCreateConsumed?.();
  }, [pendingCreate, editable, node, data.stages, onPendingCreateConsumed]);

  const revealDefect = (defectCode: string, stageId?: string) => {
    if (stageId) {
      const cat = data.stages.find((s) => s.stageId === stageId)?.category ?? "assembly";
      const stagePath = `cat:${cat}/stage:${stageId}`;
      onExpand?.(`cat:${cat}`);
      onExpand?.(stagePath);
      onExpand?.(`${stagePath}/defects`);
      onSelectId?.(`${stagePath}/defects/defect:${defectCode}`);
      return;
    }
    onExpand?.("all-defects");
    onSelectId?.(`all-defects/defect:${defectCode}`);
  };

  const saveNewDefect = (fallbackStageId?: string) => {
    const defectCode = newDefect.defectCode.trim().toUpperCase();
    const label = newDefect.label.trim();
    if (!defectCode || !label) {
      setFormError("Code and label are required.");
      return;
    }
    const stages = newDefect.stages.length
      ? newDefect.stages
      : fallbackStageId
        ? [fallbackStageId]
        : [];
    if (stages.length === 0) {
      setFormError("Pick at least one stage this defect belongs to.");
      return;
    }
    const existing = data.defects.find((d) => d.defectCode === defectCode);
    const defect = mergeDefectForAdd(existing, { defectCode, label, stages });
    void mutate(
      { action: "upsert-defect", defect },
      existing
        ? `Scoped ${defectCode} onto the selected stage(s)`
        : `Added defect ${defectCode}`,
    );
    setCreating(null);
    setNewDefect({ defectCode: "", label: "", stages: [] });
    setFormError(null);
    revealDefect(defectCode, stages[0]);
  };

  const saveNewSection = () => {
    const label = newSectionLabel.trim();
    if (!label) {
      setFormError("Section name is required.");
      return;
    }
    void mutate({ action: "upsert-section", section: { label } }, `Added section ${label}`);
    setCreating(null);
    setNewSectionLabel("");
    setFormError(null);
  };

  const saveNewStage = () => {
    const stageId = newStage.stageId.trim().toLowerCase().replace(/\s+/g, "-");
    const label = newStage.label.trim();
    if (!stageId || !label) {
      setFormError("Stage ID and label are required.");
      return;
    }
    void mutate(
      {
        action: "upsert-stage",
        stage: {
          stageId,
          label,
          category: newStage.category,
          captures: newStage.captures,
          upstream: newStage.upstream,
          isQualityGate: newStage.isQualityGate,
          effectiveFrom: null,
          effectiveTo: null,
        },
      },
      `Added stage ${stageId}`,
    );
    setCreating(null);
    setFormError(null);
    setNewStage({
      stageId: "",
      label: "",
      category: newStage.category,
      captures: [],
      upstream: [],
      isQualityGate: false,
    });
    const cat = newStage.category || "assembly";
    onExpand?.(`cat:${cat}`);
    onSelectId?.(`cat:${cat}/stage:${stageId}`);
  };

  const saveNewSize = () => {
    const sizeId = newSize.sizeId.trim();
    const label = newSize.label.trim();
    if (!sizeId) {
      setFormError("Size ID is required.");
      return;
    }
    void mutate(
      { action: "upsert-size", size: { sizeId, label: label || sizeId } },
      `Added size ${sizeId}`,
    );
    setCreating(null);
    setFormError(null);
    setNewSize({ sizeId: "", label: "" });
    onExpand?.("sizes");
    onSelectId?.(`sizes/size:${sizeId}`);
  };

  const persist = () => {
    if (!editable) return;
    if (creating === "section") return saveNewSection();
    if (creating === "stage") return saveNewStage();
    if (creating === "defect") {
      return saveNewDefect(node?.ref?.stageId ?? node?.ref?.scopedUnderStageId);
    }
    if (creating === "size") return saveNewSize();
    if (!node) return;
    if (node.kind === "category" && node.ref?.categoryId) {
      const label = String(draft.label ?? node.label).trim();
      if (!label) {
        setFormError("Section name is required.");
        return;
      }
      void mutate(
        { action: "upsert-section", section: { id: node.ref.categoryId, label } },
        `Renamed section to ${label}`,
      );
      return;
    }
    if (node.kind === "captures-folder" && stage) {
      void mutate(
        { action: "upsert-stage", stage: { ...stage, captures: (draft.captures as string[]) ?? [] } },
        `Saved captures for ${stage.stageId}`,
      );
      return;
    }
    if (node.kind === "stage" && stage) {
      void mutate({ action: "upsert-stage", stage: { ...stage, ...draft } }, `Saved ${stage.stageId}`);
      return;
    }
    if (node.kind === "defect" && defect) {
      const next = { ...defect, aliases: defect.aliases ?? [], ...draft };
      void mutate(
        {
          action: "upsert-defect",
          defect: mergeDefectForAdd(undefined, {
            defectCode: defect.defectCode,
            label: String(next.label ?? defect.label),
            aliases: Array.isArray(next.aliases) ? (next.aliases as string[]) : defect.aliases,
            stages: Array.isArray(next.stages) ? (next.stages as string[]) : (defect.stages ?? []),
          }),
        },
        `Saved ${defect.defectCode}`,
      );
      return;
    }
    if (node.kind === "size" && size) {
      void mutate({ action: "upsert-size", size: { ...size, ...draft } }, `Saved ${size.sizeId}`);
    }
  };

  useImperativeHandle(ref, () => ({ save: persist }), [
    editable,
    creating,
    newSectionLabel,
    newStage,
    newDefect,
    newSize,
    node,
    stage,
    defect,
    size,
    draft,
    mutate,
    onExpand,
    onSelectId,
  ]);

  const canSave =
    editable &&
    (creating === "section"
      ? newSectionLabel.trim().length > 0
      : creating === "stage"
        ? newStage.stageId.trim().length > 0 && newStage.label.trim().length > 0
        : creating === "defect"
          ? newDefect.defectCode.trim().length > 0 && newDefect.label.trim().length > 0
          : creating === "size"
            ? newSize.sizeId.trim().length > 0
            : (node?.kind === "stage" && !!stage) ||
              (node?.kind === "defect" && !!defect) ||
              (node?.kind === "size" && !!size) ||
              (node?.kind === "category" && !!node.ref?.categoryId) ||
              (node?.kind === "captures-folder" && !!stage));

  useEffect(() => {
    onCanSaveChange?.(!!canSave);
  }, [canSave, onCanSaveChange]);

  if (!node) {
    return (
      <div style={emptyWrap}>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0, maxWidth: "42ch", lineHeight: 1.6 }}>
          Select anything on the left to edit it.
        </p>
        <p className="small" style={{ color: "var(--text-3)", margin: 0, maxWidth: "46ch", lineHeight: 1.6 }}>
          Unlock edit to add or rename sections, stages, capture columns and
          defects. Each change reaches Data Entry on the next load.
        </p>
        {editable && creating === "section" ? (
          <NewSectionForm
            label={newSectionLabel}
            onChange={setNewSectionLabel}
            onCancel={() => {
              setCreating(null);
              setNewSectionLabel("");
            }}
            busy={busy}
          />
        ) : null}
      </div>
    );
  }

  // ── Per-kind editors ────────────────────────────────────────────────────
  let body: React.ReactNode = null;

  if (node.kind === "category") {
    const count = node.children.length;
    const categoryId = node.ref?.categoryId;
    const categoryStages = data.stages.filter((s) => (s.category ?? "") === categoryId);
    body = (
      <>
        <Row label="Name">
          <input
            style={input}
            disabled={!editable}
            value={(draft.label as string) ?? node.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </Row>
        <p className="small" style={note}>
          {count === 0
            ? "No stages here yet. Add the first one — it appears in Data Entry once it has capture columns."
            : `${count} ${count === 1 ? "stage" : "stages"} in process order. Open a stage to edit its captures and defects.`}
        </p>
        {editable && creating === "stage" ? (
          <NewStageForm
            draft={newStage}
            sections={sections}
            onChange={setNewStage}
            onCancel={() => setCreating(null)}
            busy={busy}
          />
        ) : editable && creating === "defect" ? (
          <NewDefectForm
            draft={newDefect}
            stages={categoryStages.length ? categoryStages : data.stages}
            onChange={setNewDefect}
            onCancel={() => setCreating(null)}
            busy={busy}
          />
        ) : null}
      </>
    );
  } else if (node.kind === "stage" && stage) {
    const captures = (draft.captures as string[]) ?? [];
    body = (
      <>
        <Row label="Stage ID">
          <code style={mono}>{stage.stageId}</code>
        </Row>
        <Row label="Label">
          <input
            style={input}
            disabled={!editable}
            value={(draft.label as string) ?? ""}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </Row>
        <Row label="Section">
          <Select
            disabled={!editable}
            value={(draft.category as string) ?? ""}
            onChange={(val) => setDraft({ ...draft, category: val })}
            options={sections.map((c) => ({ value: c.id, label: c.label }))}
            variant="quiet"
          />
        </Row>
        <Row label="Captures">
          <CaptureChecks
            value={captures}
            editable={editable}
            busy={busy}
            onRequestUnlock={onRequestUnlock}
            onChange={(next) => {
              setDraft({ ...draft, captures: next });
              if (!editable || !stage) return;
              const turnedHoldOn = next.includes("hold") && !captures.includes("hold");
              void mutate(
                { action: "upsert-stage", stage: { ...stage, ...draft, captures: next } },
                turnedHoldOn
                  ? `Hold is on for ${stage.label} — Data Entry will show a Hold column`
                  : `Saved captures for ${stage.label}`,
              );
            }}
          />
        </Row>
        <Row label="Quality gate">
          <label style={checkLabel}>
            <input
              type="checkbox"
              disabled={!editable}
              checked={!!draft.isQualityGate}
              onChange={(e) => setDraft({ ...draft, isQualityGate: e.target.checked })}
            />
            records a pass/fail disposition
          </label>
        </Row>
        <p className="small" style={note}>
          {editable
            ? "Tick Hold to put a Hold qty on Data Entry for this station. A stage with no captures is hidden from Data Entry."
            : "Unlock edit to change columns — Hold is off until you turn it on and it saves."}
        </p>
        {editable && creating === "defect" ? (
          <NewDefectForm
            draft={newDefect}
            stages={data.stages}
            onChange={setNewDefect}
            onCancel={() => setCreating(null)}
            busy={busy}
          />
        ) : null}
      </>
    );
  } else if (node.kind === "defect" && defect) {
    const scoped = node.ref?.scopedUnderStageId;
    const stages = (draft.stages as string[]) ?? [];
    body = (
      <>
        <Row label="Label">
          <input
            style={input}
            disabled={!editable}
            value={(draft.label as string) ?? ""}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </Row>
        <Row label="Scoped to">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {data.stages.map((s) => (
              <label key={s.stageId} style={checkLabel}>
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={stages.includes(s.stageId)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stages: e.target.checked
                        ? [...stages, s.stageId]
                        : stages.filter((x) => x !== s.stageId),
                    })
                  }
                />
                {s.label}
              </label>
            ))}
          </div>
        </Row>
        {scoped && (
          <p className="small" style={note}>
            You are viewing this defect inside a stage. <strong>Remove</strong> here
            unscopes it from that stage only — the definition and its other stages
            survive. To delete it everywhere, open it under <em>All defects</em>.
          </p>
        )}
      </>
    );
  } else if (node.kind === "size" && size) {
    body = (
      <>
        <Row label="Label">
          <input
            style={input}
            disabled={!editable}
            value={(draft.label as string) ?? ""}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </Row>
      </>
    );
  } else if (node.kind === "alias" || node.kind === "mapping") {
    body = (
      <>
        <Row label="Resolves to"><code style={mono}>{node.sublabel ?? "—"}</code></Row>
        <p className="small" style={note}>
          A spelling learned from a workbook. Removing it only stops the resolver
          using that rule; nothing on the ledger changes.
        </p>
      </>
    );
  } else if (node.kind === "all-defects-folder" || node.kind === "defects-folder") {
    body = (
      <>
        <p className="small" style={{ ...note, marginTop: 0 }}>
          {node.children.length === 0
            ? "No defects here yet."
            : `${node.children.length} defect${node.children.length === 1 ? "" : "s"}. Select one to edit it.`}
        </p>
        {editable && creating === "defect" ? (
          <NewDefectForm
            draft={newDefect}
            stages={data.stages}
            onChange={setNewDefect}
            onCancel={() => setCreating(null)}
            busy={busy}
          />
        ) : null}
      </>
    );
  } else if (node.kind === "sizes-folder") {
    body = (
      <>
        <p className="small" style={{ ...note, marginTop: 0 }}>
          {node.children.length === 0
            ? "No sizes yet."
            : `${node.children.length} size${node.children.length === 1 ? "" : "s"} available across the plant.`}
        </p>
        {editable && creating === "size" ? (
          <NewSizeForm
            draft={newSize}
            onChange={setNewSize}
            onCancel={() => setCreating(null)}
            busy={busy}
          />
        ) : null}
      </>
    );
  } else if (node.kind === "captures-folder" && stage) {
    const captures = (draft.captures as string[]) ?? [];
    body = (
      <>
        <p className="small" style={{ ...note, marginTop: 0 }}>
          Quantity columns this stage records. Tick Hold to show a Hold qty on Data Entry.
        </p>
        <CaptureChecks
          value={captures}
          editable={editable}
          busy={busy}
          onRequestUnlock={onRequestUnlock}
          onChange={(next) => {
            setDraft({ captures: next });
            if (!editable) return;
            void mutate(
              { action: "upsert-stage", stage: { ...stage, captures: next } },
              `Saved captures for ${stage.label}`,
            );
          }}
        />
      </>
    );
  } else if (node.kind === "capture" && stage) {
    body = (
      <>
        <p className="small" style={{ ...note, marginTop: 0 }}>
          “{node.label}” is a quantity column on {stage.label}. Removing it hides that field from Data Entry; ledger facts stay.
        </p>
      </>
    );
  } else {
    body = (
      <>
        <p className="small" style={{ ...note, marginTop: 0 }}>
          {node.children.length} item{node.children.length === 1 ? "" : "s"}. Select one to edit it.
        </p>
      </>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header
        style={{
          padding: "14px 20px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="small"
          style={{
            color: "var(--text-3)",
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 3,
          }}
        >
          {KIND_LABEL[node.kind] ?? node.kind}
        </div>
        <h2
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 650,
            letterSpacing: "-0.01em",
            color: "var(--text)",
            fontFamily: MONO_TITLE.has(node.kind) ? "var(--font-mono)" : undefined,
          }}
        >
          {node.label}
        </h2>
      </header>

      <div style={{ padding: "16px 20px 20px", display: "grid", gap: 14, alignContent: "start", flex: 1 }}>
        {!editable && (
          <p className="small" style={{ ...note, marginTop: 0 }}>
            View only. Unlock edit (password) to add or change sections, stages, captures and defects.
          </p>
        )}
        {editable && creating === "section" && (
          <NewSectionForm
            label={newSectionLabel}
            onChange={setNewSectionLabel}
            onCancel={() => {
              setCreating(null);
              setNewSectionLabel("");
            }}
            busy={busy}
          />
        )}
        {body}
        {(formError || saveError) && (
          <p role="alert" className="small" style={{ color: "var(--critical)", margin: 0 }}>
            {formError ?? saveError}
          </p>
        )}
      </div>
    </div>
  );
});

SchemaDetail.displayName = "SchemaDetail";

export default SchemaDetail;

/** Titles that ARE data — codes and spellings — not prose. */
const MONO_TITLE = new Set(["defect", "alias", "mapping"]);

const KIND_LABEL: Record<string, string> = {
  category: "Section",
  stage: "Stage",
  defect: "Defect",
  size: "Size",
  alias: "Learned spelling",
  mapping: "Learned mapping",
  "captures-folder": "Capture columns",
  "defects-folder": "Defects on this stage",
  "aliases-folder": "Learned spellings",
  "defect-scope-folder": "Stages using this defect",
  "all-defects-folder": "Every defect in the schema",
  "sizes-folder": "Sizes",
  "unmatched-folder": "Patterns resolving to nothing",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, alignItems: "center" }}>
      <span className="small" style={{ color: "var(--text-3)" }}>{label}</span>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}

const emptyWrap: React.CSSProperties = {
  padding: "32px 24px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 10,
  height: "100%",
};

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12.5 };

const input: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
};

const checkLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  fontSize: 12.5,
  color: "var(--text-2)",
};

const note: React.CSSProperties = {
  color: "var(--text-3)",
  fontSize: 12,
  lineHeight: 1.5,
  marginTop: 4,
};

function CaptureChecks({
  value,
  editable,
  busy,
  onChange,
  onRequestUnlock,
}: {
  value: string[];
  editable: boolean;
  busy?: boolean;
  onChange: (next: string[]) => void;
  onRequestUnlock?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {CAPTURE_OPTS.map((c) => {
        const on = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            disabled={busy}
            title={
              editable
                ? on
                  ? `Turn ${c} off`
                  : `Turn ${c} on — Data Entry will show this column`
                : "Unlock edit to change columns"
            }
            onClick={() => {
              if (!editable) {
                onRequestUnlock?.();
                return;
              }
              onChange(on ? value.filter((x) => x !== c) : [...value, c]);
            }}
            style={{
              fontSize: 12,
              fontWeight: 650,
              fontFamily: "var(--font-mono)",
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
              background: on
                ? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
                : "var(--surface-2)",
              color: on ? "var(--accent)" : "var(--text-2)",
              cursor: editable ? "pointer" : "pointer",
              opacity: editable ? 1 : 0.72,
            }}
          >
            {on ? "✓ " : ""}
            {c}
          </button>
        );
      })}
    </div>
  );
}

interface NewStageDraft {
  stageId: string;
  label: string;
  category: string;
  captures: string[];
  upstream: string[];
  isQualityGate: boolean;
}

function NewStageForm({
  draft,
  sections,
  onChange,
  onCancel,
  busy,
}: {
  draft: NewStageDraft;
  sections: { id: string; label: string }[];
  onChange: (next: NewStageDraft) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div style={formBox}>
      <Row label="Stage ID">
        <input
          style={input}
          placeholder="e.g. shrink-wrap"
          value={draft.stageId}
          onChange={(e) => onChange({ ...draft, stageId: e.target.value })}
        />
      </Row>
      <Row label="Label">
        <input
          style={input}
          placeholder="e.g. Shrink Wrap"
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
        />
      </Row>
      <Row label="Section">
        <Select
          value={draft.category}
          onChange={(val) => onChange({ ...draft, category: val })}
          options={sections.map((c) => ({ value: c.id, label: c.label }))}
          variant="quiet"
        />
      </Row>
      <Row label="Captures">
        <CaptureChecks
          value={draft.captures}
          editable
          onChange={(captures) => onChange({ ...draft, captures })}
        />
      </Row>
      <FormButtons busy={busy} onCancel={onCancel} />
    </div>
  );
}

interface NewDefectDraft {
  defectCode: string;
  label: string;
  stages: string[];
}

function NewDefectForm({
  draft,
  stages,
  onChange,
  onCancel,
  busy,
}: {
  draft: NewDefectDraft;
  stages: { stageId: string; label: string }[];
  onChange: (next: NewDefectDraft) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div style={formBox}>
      <Row label="Code">
        <input
          style={input}
          placeholder="e.g. SD"
          value={draft.defectCode}
          onChange={(e) => onChange({ ...draft, defectCode: e.target.value })}
        />
      </Row>
      <Row label="Label">
        <input
          style={input}
          placeholder="e.g. Surface Damage"
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
        />
      </Row>
      <Row label="Scoped to">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {stages.map((s) => (
            <label key={s.stageId} style={checkLabel}>
              <input
                type="checkbox"
                checked={draft.stages.includes(s.stageId)}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    stages: e.target.checked
                      ? [...draft.stages, s.stageId]
                      : draft.stages.filter((x) => x !== s.stageId),
                  })
                }
              />
              {s.label}
            </label>
          ))}
        </div>
      </Row>
      <FormButtons busy={busy} onCancel={onCancel} />
    </div>
  );
}

function NewSectionForm({
  label,
  onChange,
  onCancel,
  busy,
}: {
  label: string;
  onChange: (next: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div style={formBox}>
      <Row label="Name">
        <input
          style={input}
          placeholder="e.g. Warehouse"
          value={label}
          onChange={(e) => onChange(e.target.value)}
        />
      </Row>
      <FormButtons busy={busy} onCancel={onCancel} />
    </div>
  );
}

function NewSizeForm({
  draft,
  onChange,
  onCancel,
  busy,
}: {
  draft: { sizeId: string; label: string };
  onChange: (next: { sizeId: string; label: string }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div style={formBox}>
      <Row label="Size ID">
        <input
          style={input}
          placeholder="e.g. Fr16"
          value={draft.sizeId}
          onChange={(e) => onChange({ ...draft, sizeId: e.target.value })}
        />
      </Row>
      <Row label="Label">
        <input
          style={input}
          placeholder="e.g. 16Fr"
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
        />
      </Row>
      <FormButtons busy={busy} onCancel={onCancel} />
    </div>
  );
}

function FormButtons({
  busy,
  onCancel,
}: {
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" style={ghostBtn} disabled={busy} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

const formBox: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
};

const ghostBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-2)",
  cursor: "pointer",
};
