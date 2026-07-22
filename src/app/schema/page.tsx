"use client";

/* Hallmark · macrostructure: Workbench · tone: technical · genre: modern-minimal
 * theme: project-locked (Geist + burnt orange #C8421C · AppShell chrome)
 * enrichment: none · nav: N/A (AppShell) · brief: master plant schema ownership
 * Pre-emit critique: P5 H5 E5 S5 R4 V4
 *
 * Master plant schema is company-owned. Workbooks may contribute on verify;
 * only this page edits or deletes stages / defects / sizes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app/AppShell";
import { Card, Empty } from "@/components/app/widgets";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import {
  qualityStatus,
  resolveScope,
  integrityAuditHref,
  integrityFixHref,
  integrityIssueId,
  type IntegrityIssue,
} from "@/lib/analytics";

// ── Types ──────────────────────────────────────────────────────────────────

interface Stage {
  stageId: string;
  label: string;
  upstream?: string[];
  captures?: string[];
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  sizeWise?: boolean;
  isQualityGate?: boolean;
}

interface Defect {
  defectCode: string;
  label: string;
  aliases?: string[];
  stages?: string[];
}

interface Size {
  sizeId: string;
  label: string;
}

interface CatalogMeta {
  stages: Stage[];
  defects: Defect[];
  sizes: Size[];
  fiscalYearStartMonth: number;
  updatedAt: string | null;
  lastMergedFrom: string | null;
}

interface WorkbookRow {
  snapshotId: string;
  fileName: string;
  uploadedAt: string;
  mod: { modId: string; version: number; status: string } | null;
}

interface ModEntity {
  entityId: string;
  kind: string;
  original: { sheet: string; tableId?: string | null; colLetter: string | null; header: string };
  canonical: string | null;
  confidence: number;
  resolvedBy: string;
  reason: string;
  verified: boolean;
}

interface ModDetail {
  modId: string;
  version: number;
  status: string;
  document: {
    workbook: { fileName: string; sheetNames: string[] };
    entities: ModEntity[];
  };
}

type Section = "stages" | "defects" | "sizes";

const CAPTURE_OPTS = ["checked", "accepted", "hold", "rejected"] as const;

// ── Page ───────────────────────────────────────────────────────────────────

export default function SchemaPage() {
  const { events } = useEvents();
  const { refreshRegistry } = useRegistry();
  const { t } = useTweaks();

  const [catalog, setCatalog] = useState<CatalogMeta | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>("stages");

  // Inline edit state
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingDefectCode, setEditingDefectCode] = useState<string | null>(null);
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null);
  const [stageDraft, setStageDraft] = useState<Stage | null>(null);
  const [defectDraft, setDefectDraft] = useState<Defect | null>(null);
  const [sizeDraft, setSizeDraft] = useState<Size | null>(null);

  // Add-new drawers
  const [adding, setAdding] = useState(false);
  const [newStage, setNewStage] = useState<Stage>({
    stageId: "",
    label: "",
    upstream: [],
    captures: ["checked", "rejected"],
    effectiveFrom: null,
    effectiveTo: null,
  });
  const [newDefect, setNewDefect] = useState<Defect>({
    defectCode: "",
    label: "",
    aliases: [],
    stages: [],
  });
  const [newSize, setNewSize] = useState<Size>({ sizeId: "", label: "" });

  // Secondary: file lineage (read-only mappings)
  const [showLineage, setShowLineage] = useState(false);
  const [workbooks, setWorkbooks] = useState<WorkbookRow[]>([]);
  const [selectedMod, setSelectedMod] = useState<string | null>(null);
  const [modDetail, setModDetail] = useState<ModDetail | null>(null);

  const integrity = useMemo(() => {
    if (!events || events.length === 0) {
      return { state: "ok" as const, reason: "", integrityIssues: [] as IntegrityIssue[] };
    }
    const scope = resolveScope(events, {
      grain: t.grain,
      datePreset: t.datePreset,
      dateFrom: t.dateFrom,
      dateTo: t.dateTo,
      stageView: t.stageView,
    });
    return qualityStatus(events, scope);
  }, [events, t.grain, t.datePreset, t.dateFrom, t.dateTo, t.stageView]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/schema");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load schema");
      const cat: CatalogMeta = body.catalog ?? {
        stages: body.registry?.stages ?? [],
        defects: body.registry?.defects ?? [],
        sizes: body.registry?.sizes ?? [],
        fiscalYearStartMonth: body.registry?.fiscalYearStartMonth ?? 4,
        updatedAt: null,
        lastMergedFrom: null,
      };
      setCatalog(cat);
      setConfigured(!!body.configured);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schema");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!showLineage) return;
    fetch("/api/workbooks")
      .then((r) => r.json())
      .then((d) => {
        const list: WorkbookRow[] = (d.workbooks ?? []).filter((w: WorkbookRow) => w.mod);
        setWorkbooks(list);
        const first = list.find((w) => w.mod?.status === "verified") ?? list[0];
        if (first?.mod) setSelectedMod(first.mod.modId);
      })
      .catch(() => {});
  }, [showLineage]);

  useEffect(() => {
    if (!selectedMod) {
      setModDetail(null);
      return;
    }
    fetch(`/api/mods?modId=${encodeURIComponent(selectedMod)}`)
      .then((r) => r.json())
      .then((d) => setModDetail(d.mod ?? null))
      .catch(() => setModDetail(null));
  }, [selectedMod]);

  const mutate = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/schema", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setCatalog(data.catalog);
      setConfigured(!!data.configured);
      setStatus(okMsg);
      setAdding(false);
      setEditingStageId(null);
      setEditingDefectCode(null);
      setEditingSizeId(null);
      setStageDraft(null);
      setDefectDraft(null);
      setSizeDraft(null);
      await refreshRegistry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (kind: "stage" | "defect" | "size", id: string, label: string) => {
    if (!confirm(`Remove ${kind} “${label}” (${id}) from the master plant schema?\n\nThis does not delete ledger events. Workbooks are not affected.`)) {
      return;
    }
    const action =
      kind === "stage" ? "delete-stage" : kind === "defect" ? "delete-defect" : "delete-size";
    void mutate({ action, id }, `Removed ${kind} ${id}`);
  };

  const stages = catalog?.stages ?? [];
  const defects = catalog?.defects ?? [];
  const sizes = catalog?.sizes ?? [];

  const counts = {
    stages: stages.length,
    defects: defects.length,
    sizes: sizes.length,
  };

  return (
    <AppShell active="schema">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        {/* Masthead */}
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            paddingBottom: 4,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-3)",
                marginBottom: 6,
                fontFamily: "var(--font-mono)",
              }}
            >
              Master config
            </div>
            <h1
              className="h1"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 700,
                margin: "0 0 6px",
                color: "var(--text)",
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              Data Schema
            </h1>
            <p className="body" style={{ fontSize: 14, margin: 0, color: "var(--text-2)", maxWidth: 640, lineHeight: 1.55 }}>
              Plant-wide stages, defect codes, and sizes. Owned here — not by uploaded workbooks.
              Deleting a file never clears this catalog.
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Link
              href="/staging"
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-2)",
                textDecoration: "none",
              }}
            >
              Import from Excel
            </Link>
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setEditingStageId(null);
                setEditingDefectCode(null);
                setEditingSizeId(null);
              }}
              style={{
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "var(--text-invert)",
                cursor: "pointer",
              }}
            >
              + Add {section === "stages" ? "stage" : section === "defects" ? "defect" : "size"}
            </button>
          </div>
        </header>

        {/* Ownership callout */}
        <div
          role="note"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px 20px",
            alignItems: "center",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--border))",
            background: "color-mix(in srgb, var(--accent) 6%, var(--surface))",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--accent)",
            }}
          >
            Ownership
          </span>
          <span style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.45 }}>
            Workbooks <strong style={{ color: "var(--text)", fontWeight: 600 }}>contribute</strong> on verify.
            Only this page <strong style={{ color: "var(--text)", fontWeight: 600 }}>edits or deletes</strong> master schema.
          </span>
          {catalog?.updatedAt && (
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-3)",
              }}
            >
              Updated {catalog.updatedAt.slice(0, 19).replace("T", " ")}
            </span>
          )}
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: "10px 14px",
              borderRadius: 9,
              background: "color-mix(in srgb, var(--status-bad) 12%, transparent)",
              color: "var(--status-bad)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {status && (
          <div
            role="status"
            style={{
              padding: "10px 14px",
              borderRadius: 9,
              background: "color-mix(in srgb, var(--positive) 12%, transparent)",
              color: "var(--positive)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {status}
          </div>
        )}

        {integrity.integrityIssues.length > 0 && (
          <IntegrityIssuesPanel
            blocked={integrity.state === "blocked"}
            reason={integrity.reason}
            issues={integrity.integrityIssues}
          />
        )}

        {/* Summary strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          {(
            [
              { key: "stages" as const, label: "Stages", value: counts.stages },
              { key: "defects" as const, label: "Defect codes", value: counts.defects },
              { key: "sizes" as const, label: "Sizes", value: counts.sizes },
            ] as const
          ).map((s) => {
            const active = section === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setSection(s.key);
                  setAdding(false);
                }}
                style={{
                  textAlign: "left",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  background: active
                    ? "color-mix(in srgb, var(--accent) 8%, var(--surface))"
                    : "var(--surface)",
                  boxShadow: "var(--shadow-1)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: 6,
                  }}
                >
                  {s.label}
                </div>
                <div
                  className="kpi"
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--text)",
                    lineHeight: 1,
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {loading ? "—" : s.value}
                </div>
              </button>
            );
          })}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              border: "1.5px solid var(--border)",
              background: "var(--surface)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-3)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 6,
              }}
            >
              Status
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: configured ? "var(--positive)" : "var(--text-3)" }}>
              {loading ? "…" : configured ? "Configured" : "Empty"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
              FY starts month {catalog?.fiscalYearStartMonth ?? 4}
            </div>
          </div>
        </div>

        {loading ? (
          <Card>
            <Empty label="Loading master schema…" />
          </Card>
        ) : !configured && stages.length === 0 && defects.length === 0 ? (
          <Card title="No master schema yet">
            <p className="muted" style={{ fontSize: 14, margin: "0 0 14px", lineHeight: 1.55 }}>
              Verify a workbook on Staging to seed stages and defects, or add them manually here.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link
                href="/staging"
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "var(--accent)",
                  color: "var(--text-invert)",
                  fontWeight: 700,
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                Open Staging →
              </Link>
              <button
                type="button"
                onClick={() => setAdding(true)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                Add first stage
              </button>
            </div>
          </Card>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: 14,
            }}
          >
            {/* Add form */}
            {adding && (
              <Card
                title={
                  section === "stages"
                    ? "Add inspection stage"
                    : section === "defects"
                      ? "Add defect code"
                      : "Add size"
                }
                sub="Saved to master catalog immediately"
              >
                {section === "stages" && (
                  <EntityForm
                    busy={busy}
                    onCancel={() => setAdding(false)}
                    onSave={() => {
                      const id = newStage.stageId.trim().toLowerCase().replace(/\s+/g, "_");
                      const label = newStage.label.trim();
                      if (!id || !label) {
                        setError("Stage id and label are required");
                        return;
                      }
                      void mutate(
                        {
                          action: "upsert-stage",
                          stage: {
                            stageId: id,
                            label,
                            effectiveFrom: newStage.effectiveFrom ?? null,
                            effectiveTo: newStage.effectiveTo ?? null,
                            upstream: newStage.upstream ?? [],
                            captures: newStage.captures ?? [],
                            sizeWise: newStage.sizeWise,
                            isQualityGate: newStage.isQualityGate,
                          },
                        },
                        `Stage ${id} saved`,
                      ).then(() =>
                        setNewStage({
                          stageId: "",
                          label: "",
                          upstream: [],
                          captures: ["checked", "rejected"],
                          effectiveFrom: null,
                          effectiveTo: null,
                        }),
                      );
                    }}
                  >
                    <Field label="Stage id" mono>
                      <input
                        value={newStage.stageId}
                        onChange={(e) => setNewStage((s) => ({ ...s, stageId: e.target.value }))}
                        placeholder="e.g. visual"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Label">
                      <input
                        value={newStage.label}
                        onChange={(e) => setNewStage((s) => ({ ...s, label: e.target.value }))}
                        placeholder="Visual Inspection"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Captures">
                      <CaptureToggles
                        value={newStage.captures ?? []}
                        onChange={(captures) => setNewStage((s) => ({ ...s, captures }))}
                      />
                    </Field>
                    <Field label="Feeds from (upstream ids, comma-separated)">
                      <input
                        value={(newStage.upstream ?? []).join(", ")}
                        onChange={(e) =>
                          setNewStage((s) => ({
                            ...s,
                            upstream: e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          }))
                        }
                        placeholder="assembly, extrusion"
                        style={inputStyle}
                      />
                    </Field>
                  </EntityForm>
                )}
                {section === "defects" && (
                  <EntityForm
                    busy={busy}
                    onCancel={() => setAdding(false)}
                    onSave={() => {
                      const code = newDefect.defectCode.trim().toUpperCase();
                      const label = newDefect.label.trim();
                      if (!code || !label) {
                        setError("Defect code and label are required");
                        return;
                      }
                      void mutate(
                        {
                          action: "upsert-defect",
                          defect: {
                            defectCode: code,
                            label,
                            aliases: (newDefect.aliases?.length ? newDefect.aliases : [label]).filter(Boolean),
                            stages: newDefect.stages ?? [],
                          },
                        },
                        `Defect ${code} saved`,
                      ).then(() =>
                        setNewDefect({ defectCode: "", label: "", aliases: [], stages: [] }),
                      );
                    }}
                  >
                    <Field label="Code" mono>
                      <input
                        value={newDefect.defectCode}
                        onChange={(e) => setNewDefect((d) => ({ ...d, defectCode: e.target.value }))}
                        placeholder="PINH"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Label">
                      <input
                        value={newDefect.label}
                        onChange={(e) => setNewDefect((d) => ({ ...d, label: e.target.value }))}
                        placeholder="Pinhole"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Stages (ids, comma-separated)">
                      <input
                        value={(newDefect.stages ?? []).join(", ")}
                        onChange={(e) =>
                          setNewDefect((d) => ({
                            ...d,
                            stages: e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          }))
                        }
                        placeholder="visual, final"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Aliases (comma-separated)">
                      <input
                        value={(newDefect.aliases ?? []).join(", ")}
                        onChange={(e) =>
                          setNewDefect((d) => ({
                            ...d,
                            aliases: e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          }))
                        }
                        placeholder="pinhole, pin hole"
                        style={inputStyle}
                      />
                    </Field>
                  </EntityForm>
                )}
                {section === "sizes" && (
                  <EntityForm
                    busy={busy}
                    onCancel={() => setAdding(false)}
                    onSave={() => {
                      const sizeId = newSize.sizeId.trim();
                      const label = newSize.label.trim();
                      if (!sizeId || !label) {
                        setError("Size id and label are required");
                        return;
                      }
                      void mutate(
                        { action: "upsert-size", size: { sizeId, label } },
                        `Size ${sizeId} saved`,
                      ).then(() => setNewSize({ sizeId: "", label: "" }));
                    }}
                  >
                    <Field label="Size id" mono>
                      <input
                        value={newSize.sizeId}
                        onChange={(e) => setNewSize((s) => ({ ...s, sizeId: e.target.value }))}
                        placeholder="Fr16"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Label">
                      <input
                        value={newSize.label}
                        onChange={(e) => setNewSize((s) => ({ ...s, label: e.target.value }))}
                        placeholder="16 FR"
                        style={inputStyle}
                      />
                    </Field>
                  </EntityForm>
                )}
              </Card>
            )}

            {/* Stages table */}
            {section === "stages" && (
              <Card
                title="Inspection stages"
                sub="Process flow for Data Entry and analytics scope"
              >
                {stages.length === 0 ? (
                  <Empty label="No stages in master catalog" />
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr style={theadRow}>
                          <th style={th}>Stage id</th>
                          <th style={th}>Label</th>
                          <th style={th}>Captures</th>
                          <th style={th}>Feeds from</th>
                          <th style={{ ...th, width: 120 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stages.map((s) => {
                          const editing = editingStageId === s.stageId;
                          const d = editing && stageDraft ? stageDraft : s;
                          return (
                            <tr key={s.stageId} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                                {s.stageId}
                              </td>
                              <td style={td}>
                                {editing ? (
                                  <input
                                    value={d.label}
                                    onChange={(e) =>
                                      setStageDraft((x) => (x ? { ...x, label: e.target.value } : x))
                                    }
                                    style={inputStyle}
                                  />
                                ) : (
                                  s.label
                                )}
                              </td>
                              <td style={{ ...td, color: "var(--text-2)" }}>
                                {editing ? (
                                  <CaptureToggles
                                    value={d.captures ?? []}
                                    onChange={(captures) =>
                                      setStageDraft((x) => (x ? { ...x, captures } : x))
                                    }
                                  />
                                ) : (
                                  (s.captures ?? []).join(", ") || "—"
                                )}
                              </td>
                              <td style={{ ...td, color: "var(--text-2)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                                {editing ? (
                                  <input
                                    value={(d.upstream ?? []).join(", ")}
                                    onChange={(e) =>
                                      setStageDraft((x) =>
                                        x
                                          ? {
                                              ...x,
                                              upstream: e.target.value
                                                .split(",")
                                                .map((v) => v.trim())
                                                .filter(Boolean),
                                            }
                                          : x,
                                      )
                                    }
                                    style={inputStyle}
                                  />
                                ) : (
                                  (s.upstream ?? []).join(", ") || "—"
                                )}
                              </td>
                              <td style={td}>
                                {editing ? (
                                  <RowActions
                                    busy={busy}
                                    onSave={() => {
                                      if (!stageDraft) return;
                                      void mutate(
                                        {
                                          action: "upsert-stage",
                                          stage: {
                                            stageId: stageDraft.stageId,
                                            label: stageDraft.label.trim(),
                                            effectiveFrom: stageDraft.effectiveFrom ?? null,
                                            effectiveTo: stageDraft.effectiveTo ?? null,
                                            upstream: stageDraft.upstream ?? [],
                                            captures: stageDraft.captures ?? [],
                                            sizeWise: stageDraft.sizeWise,
                                            isQualityGate: stageDraft.isQualityGate,
                                          },
                                        },
                                        `Stage ${stageDraft.stageId} updated`,
                                      );
                                    }}
                                    onCancel={() => {
                                      setEditingStageId(null);
                                      setStageDraft(null);
                                    }}
                                  />
                                ) : (
                                  <RowActions
                                    busy={busy}
                                    onEdit={() => {
                                      setEditingStageId(s.stageId);
                                      setStageDraft({ ...s });
                                      setAdding(false);
                                    }}
                                    onDelete={() => confirmDelete("stage", s.stageId, s.label)}
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Defects table */}
            {section === "defects" && (
              <Card title="Defect catalog" sub="Codes used in rejection analytics and Data Entry">
                {defects.length === 0 ? (
                  <Empty label="No defect codes in master catalog" />
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr style={theadRow}>
                          <th style={th}>Code</th>
                          <th style={th}>Label</th>
                          <th style={th}>Stages</th>
                          <th style={th}>Aliases</th>
                          <th style={{ ...th, width: 120 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defects.map((d) => {
                          const editing = editingDefectCode === d.defectCode;
                          const draft = editing && defectDraft ? defectDraft : d;
                          return (
                            <tr key={d.defectCode} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                                {d.defectCode}
                              </td>
                              <td style={td}>
                                {editing ? (
                                  <input
                                    value={draft.label}
                                    onChange={(e) =>
                                      setDefectDraft((x) => (x ? { ...x, label: e.target.value } : x))
                                    }
                                    style={inputStyle}
                                  />
                                ) : (
                                  d.label
                                )}
                              </td>
                              <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)" }}>
                                {editing ? (
                                  <input
                                    value={(draft.stages ?? []).join(", ")}
                                    onChange={(e) =>
                                      setDefectDraft((x) =>
                                        x
                                          ? {
                                              ...x,
                                              stages: e.target.value
                                                .split(",")
                                                .map((v) => v.trim())
                                                .filter(Boolean),
                                            }
                                          : x,
                                      )
                                    }
                                    style={inputStyle}
                                  />
                                ) : (
                                  (d.stages ?? []).join(", ") || "—"
                                )}
                              </td>
                              <td style={{ ...td, color: "var(--text-2)", fontSize: 12 }}>
                                {editing ? (
                                  <input
                                    value={(draft.aliases ?? []).join(", ")}
                                    onChange={(e) =>
                                      setDefectDraft((x) =>
                                        x
                                          ? {
                                              ...x,
                                              aliases: e.target.value
                                                .split(",")
                                                .map((v) => v.trim())
                                                .filter(Boolean),
                                            }
                                          : x,
                                      )
                                    }
                                    style={inputStyle}
                                  />
                                ) : (
                                  (d.aliases ?? []).join(", ") || "—"
                                )}
                              </td>
                              <td style={td}>
                                {editing ? (
                                  <RowActions
                                    busy={busy}
                                    onSave={() => {
                                      if (!defectDraft) return;
                                      const aliases =
                                        defectDraft.aliases && defectDraft.aliases.length > 0
                                          ? defectDraft.aliases
                                          : [defectDraft.label];
                                      void mutate(
                                        {
                                          action: "upsert-defect",
                                          defect: {
                                            defectCode: defectDraft.defectCode,
                                            label: defectDraft.label.trim(),
                                            aliases,
                                            stages: defectDraft.stages ?? [],
                                          },
                                        },
                                        `Defect ${defectDraft.defectCode} updated`,
                                      );
                                    }}
                                    onCancel={() => {
                                      setEditingDefectCode(null);
                                      setDefectDraft(null);
                                    }}
                                  />
                                ) : (
                                  <RowActions
                                    busy={busy}
                                    onEdit={() => {
                                      setEditingDefectCode(d.defectCode);
                                      setDefectDraft({ ...d });
                                      setAdding(false);
                                    }}
                                    onDelete={() => confirmDelete("defect", d.defectCode, d.label)}
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Sizes table */}
            {section === "sizes" && (
              <Card title="Sizes" sub="French / product sizes for size-wise analysis">
                {sizes.length === 0 ? (
                  <Empty label="No sizes in master catalog" />
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr style={theadRow}>
                          <th style={th}>Size id</th>
                          <th style={th}>Label</th>
                          <th style={{ ...th, width: 120 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sizes.map((s) => {
                          const editing = editingSizeId === s.sizeId;
                          const draft = editing && sizeDraft ? sizeDraft : s;
                          return (
                            <tr key={s.sizeId} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                                {s.sizeId}
                              </td>
                              <td style={td}>
                                {editing ? (
                                  <input
                                    value={draft.label}
                                    onChange={(e) =>
                                      setSizeDraft((x) => (x ? { ...x, label: e.target.value } : x))
                                    }
                                    style={inputStyle}
                                  />
                                ) : (
                                  s.label
                                )}
                              </td>
                              <td style={td}>
                                {editing ? (
                                  <RowActions
                                    busy={busy}
                                    onSave={() => {
                                      if (!sizeDraft) return;
                                      void mutate(
                                        {
                                          action: "upsert-size",
                                          size: {
                                            sizeId: sizeDraft.sizeId,
                                            label: sizeDraft.label.trim(),
                                          },
                                        },
                                        `Size ${sizeDraft.sizeId} updated`,
                                      );
                                    }}
                                    onCancel={() => {
                                      setEditingSizeId(null);
                                      setSizeDraft(null);
                                    }}
                                  />
                                ) : (
                                  <RowActions
                                    busy={busy}
                                    onEdit={() => {
                                      setEditingSizeId(s.sizeId);
                                      setSizeDraft({ ...s });
                                      setAdding(false);
                                    }}
                                    onDelete={() => confirmDelete("size", s.sizeId, s.label)}
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* Secondary: file lineage (read-only) */}
        <section
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 16,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setShowLineage((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--text)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-3)",
                width: 16,
              }}
            >
              {showLineage ? "▾" : "▸"}
            </span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>File column mappings</span>
            <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>
              optional · read-only lineage from uploads
            </span>
          </button>
          {showLineage && (
            <div style={{ marginTop: 12 }}>
              {workbooks.length === 0 ? (
                <Empty label="No uploaded files with a mapping document." />
              ) : (
                <Card title="Per-file interpretation" sub="Does not own master schema — deleting a file keeps stages/defects above">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {workbooks.map((wb) => (
                      <FilterChip
                        key={wb.snapshotId}
                        label={wb.fileName}
                        active={selectedMod === wb.mod!.modId}
                        onClick={() => setSelectedMod(wb.mod!.modId)}
                      />
                    ))}
                  </div>
                  {!modDetail ? (
                    <Empty label="Select a file." />
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr style={theadRow}>
                            <th style={th}>Source</th>
                            <th style={th}>Label</th>
                            <th style={th}>Kind</th>
                            <th style={th}>Canonical</th>
                            <th style={th}>OK</th>
                          </tr>
                        </thead>
                        <tbody>
                          {modDetail.document.entities.map((e) => (
                            <tr key={e.entityId} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                                {e.original.sheet}
                                {e.original.colLetter ? `!${e.original.colLetter}` : ""}
                              </td>
                              <td style={td}>{e.original.header}</td>
                              <td style={{ ...td, color: "var(--text-2)" }}>{e.kind}</td>
                              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>
                                {e.canonical ?? "—"}
                              </td>
                              <td style={td}>
                                {e.verified ? (
                                  <span style={{ color: "var(--positive)", fontWeight: 700 }}>✓</span>
                                ) : (
                                  <span style={{ color: "var(--text-3)" }}>—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

// ── Small UI pieces ────────────────────────────────────────────────────────

function Field({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontFamily: mono ? "var(--font-mono)" : undefined,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function EntityForm({
  children,
  busy,
  onSave,
  onCancel,
}: {
  children: React.ReactNode;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {children}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={busy} onClick={onSave} style={primaryBtn}>
          {busy ? "Saving…" : "Save to master catalog"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} style={ghostBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CaptureToggles({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {CAPTURE_OPTS.map((c) => {
        const on = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            onClick={() =>
              onChange(on ? value.filter((x) => x !== c) : [...value, c])
            }
            style={{
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              padding: "4px 8px",
              borderRadius: 6,
              border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
              background: on ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface-2)",
              color: on ? "var(--accent)" : "var(--text-2)",
              cursor: "pointer",
            }}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

function RowActions({
  busy,
  onEdit,
  onDelete,
  onSave,
  onCancel,
}: {
  busy?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  if (onSave) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" disabled={busy} onClick={onSave} style={linkBtn}>
          Save
        </button>
        <button type="button" disabled={busy} onClick={onCancel} style={mutedLinkBtn}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button type="button" disabled={busy} onClick={onEdit} style={linkBtn}>
        Edit
      </button>
      <button type="button" disabled={busy} onClick={onDelete} style={dangerLinkBtn}>
        Delete
      </button>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface)",
        color: active ? "var(--accent)" : "var(--text-2)",
        maxWidth: 220,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      title={label}
    >
      {label}
    </button>
  );
}

function IntegrityIssuesPanel({
  blocked,
  reason,
  issues,
}: {
  blocked: boolean;
  reason: string;
  issues: IntegrityIssue[];
}) {
  const critical = issues.filter((i) => i.severity === "critical").length;
  const border = blocked ? "var(--critical)" : "var(--warning)";
  const bg = blocked
    ? "color-mix(in srgb, var(--critical-weak) 80%, var(--surface))"
    : "color-mix(in srgb, var(--warning-weak) 80%, var(--surface))";
  const titleColor = blocked ? "var(--critical)" : "var(--warning)";

  return (
    <div
      role="region"
      aria-label="Open data integrity issues"
      style={{
        border: `1px solid color-mix(in srgb, ${border} 40%, var(--border))`,
        background: bg,
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: titleColor }}>
          {blocked ? "Data integrity blocked — ledger is not OK" : "Open integrity warnings"}
        </div>
        {reason ? (
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, marginTop: 4 }}>{reason}</div>
        ) : null}
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
          {issues.length} open issue{issues.length === 1 ? "" : "s"}
          {critical > 0 ? ` · ${critical} critical` : ""}
        </div>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {issues.map((issue) => {
          const auditHref = integrityAuditHref(issue);
          const fixHref = integrityFixHref(issue);
          const locus = [issue.batch, issue.stageId, issue.date, issue.size].filter(Boolean).join(" · ");
          const sevColor = issue.severity === "critical" ? "var(--critical)" : "var(--warning)";
          return (
            <li key={integrityIssueId(issue)}>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <Link href={auditHref} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 700,
                        color: sevColor,
                      }}
                    >
                      {issue.code}
                    </span>
                    {locus ? (
                      <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                        {locus}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 13.5, marginTop: 6, fontWeight: 500 }}>{issue.message}</div>
                </Link>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  <Link href={auditHref} style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
                    See evidence
                  </Link>
                  {fixHref && (
                    <Link href={fixHref} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textDecoration: "none" }}>
                      Fix in Data Entry
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12.5,
};

const theadRow: React.CSSProperties = {
  color: "var(--text-3)",
  textAlign: "left",
  fontSize: 10,
  textTransform: "uppercase",
};

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 10px", color: "var(--text)", verticalAlign: "middle" };

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--text-invert)",
  cursor: "pointer",
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

const linkBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--accent)",
  cursor: "pointer",
};

const mutedLinkBtn: React.CSSProperties = {
  ...linkBtn,
  color: "var(--text-2)",
};

const dangerLinkBtn: React.CSSProperties = {
  ...linkBtn,
  color: "var(--critical)",
  borderColor: "color-mix(in srgb, var(--critical) 30%, var(--border))",
};
