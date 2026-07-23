"use client";

/* Hallmark · macrostructure: Workbench · tone: technical · genre: modern-minimal
 * theme: project-locked (Geist + burnt orange #C8421C · AppShell chrome)
 * enrichment: none · nav: N/A (AppShell) · brief: master plant schema ownership
 * Pre-emit critique: P5 H5 E5 S5 R4 V4
 *
 * Master Schema is the system brain: stages, defects, sizes, and every
 * learned Excel→canonical mapping. Workbooks contribute; only this page
 * edits or deletes the durable knowledge plane.
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
import { clusterWorkbooks, fileBasename } from "@/lib/workbook-clusters";

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

type MappingKind = "stage-alias" | "defect-alias" | "column-mapping" | "header-pattern";

interface SchemaMapping {
  companyId?: string;
  kind: MappingKind;
  key: string;
  canonicalId: string;
  confidence: number;
  learnedFrom: string | null;
  learnedAt: string;
  useCount: number;
  source?: "knowledge" | "mod";
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

type Section = "stages" | "defects" | "sizes" | "mappings";

const CAPTURE_OPTS = ["checked", "accepted", "hold", "rejected"] as const;

const MAPPING_KIND_LABEL: Record<MappingKind, string> = {
  "stage-alias": "Stage alias",
  "defect-alias": "Defect alias",
  "column-mapping": "Column mapping",
  "header-pattern": "Header pattern",
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function SchemaPage() {
  const { events } = useEvents();
  const { refreshRegistry } = useRegistry();
  const { t } = useTweaks();

  const [catalog, setCatalog] = useState<CatalogMeta | null>(null);
  const [mappings, setMappings] = useState<SchemaMapping[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>("stages");
  const [mappingFilter, setMappingFilter] = useState<"all" | MappingKind>("all");
  const [mappingSearch, setMappingSearch] = useState("");

  // Inline edit state
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingDefectCode, setEditingDefectCode] = useState<string | null>(null);
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null);
  const [editingMappingKey, setEditingMappingKey] = useState<string | null>(null);
  const [stageDraft, setStageDraft] = useState<Stage | null>(null);
  const [defectDraft, setDefectDraft] = useState<Defect | null>(null);
  const [sizeDraft, setSizeDraft] = useState<Size | null>(null);
  const [mappingDraft, setMappingDraft] = useState<SchemaMapping | null>(null);

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
  const [newMapping, setNewMapping] = useState<{ kind: MappingKind; key: string; canonicalId: string }>({
    kind: "column-mapping",
    key: "",
    canonicalId: "",
  });

  // Uploaded workbooks — series dropdown + file dropdown (per-file interpretation)
  const [workbooks, setWorkbooks] = useState<WorkbookRow[]>([]);
  const [wbLoading, setWbLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [selectedMod, setSelectedMod] = useState<string | null>(null);
  const [modDetail, setModDetail] = useState<ModDetail | null>(null);
  const [showMappings, setShowMappings] = useState(false);
  const [resetSchemaOpen, setResetSchemaOpen] = useState(false);
  const [resetSchemaText, setResetSchemaText] = useState("");

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
      setMappings(body.mappings ?? []);
      setConfigured(!!body.configured);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schema");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorkbooks = useCallback(async () => {
    setWbLoading(true);
    try {
      const r = await fetch("/api/workbooks");
      const d = await r.json();
      const list: WorkbookRow[] = d.workbooks ?? [];
      setWorkbooks(list);
      const clusters = clusterWorkbooks(list);
      setSelectedClusterKey((cur) => {
        if (cur && clusters.some((c) => c.key === cur)) return cur;
        return clusters[0]?.key ?? null;
      });
      setSelectedSnapshot((cur) => {
        if (cur && list.some((w) => w.snapshotId === cur)) return cur;
        return clusters[0]?.files[0]?.snapshotId ?? null;
      });
    } catch {
      /* keep previous */
    } finally {
      setWbLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadWorkbooks();
  }, [load, loadWorkbooks]);

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

  const workbookClusters = useMemo(() => clusterWorkbooks(workbooks), [workbooks]);

  const activeCluster = useMemo(
    () => workbookClusters.find((c) => c.key === selectedClusterKey) ?? workbookClusters[0] ?? null,
    [workbookClusters, selectedClusterKey],
  );

  const activeWorkbook = useMemo(() => {
    if (!activeCluster) return null;
    return (
      activeCluster.files.find((f) => f.snapshotId === selectedSnapshot) ??
      activeCluster.files[0] ??
      null
    );
  }, [activeCluster, selectedSnapshot]);

  // Keep mod detail in sync with selected file
  useEffect(() => {
    if (!activeWorkbook) {
      setSelectedMod(null);
      setModDetail(null);
      return;
    }
    setSelectedMod(activeWorkbook.mod?.modId ?? null);
    if (!activeWorkbook.mod) {
      setModDetail(null);
      setShowMappings(false);
    }
  }, [activeWorkbook]);

  const deleteWorkbook = async (wb: WorkbookRow) => {
    const name = fileBasename(wb.fileName);
    if (
      !confirm(
        `Delete file “${name}” only?\n\n` +
          "Removes this upload and its column-mapping document.\n" +
          "Master schema (stages / defects / sizes) is NOT deleted.\n" +
          "Ledger facts already published stay on the dashboard.",
      )
    ) {
      return;
    }
    setDeletingId(wb.snapshotId);
    setError(null);
    try {
      const res = await fetch(
        `/api/workbooks?snapshotId=${encodeURIComponent(wb.snapshotId)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setShowMappings(false);
      setStatus(`Removed file “${name}”. Master schema unchanged.`);
      await loadWorkbooks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteCluster = async (label: string, files: WorkbookRow[]) => {
    if (
      !confirm(
        `Delete all ${files.length} file(s) in series “${label}”?\n\n` +
          "Only these uploads and their mapping docs are removed.\n" +
          "Master schema is NOT deleted.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const wb of files) {
        const res = await fetch(
          `/api/workbooks?snapshotId=${encodeURIComponent(wb.snapshotId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Failed on ${fileBasename(wb.fileName)}`);
        }
      }
      setShowMappings(false);
      setStatus(`Removed ${files.length} file(s) from “${label}”. Master schema kept.`);
      await loadWorkbooks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Series delete failed");
    } finally {
      setBusy(false);
    }
  };

  const resetMasterSchema = async () => {
    if (resetSchemaText.trim().toUpperCase() !== "RESET") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clear-schema", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to reset master schema");
      setResetSchemaOpen(false);
      setResetSchemaText("");
      setStatus(
        "Master schema brain cleared (stages, defects, sizes, mappings). Uploaded files and ledger events were not deleted.",
      );
      setMappings([]);
      await load();
      await refreshRegistry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset master schema");
    } finally {
      setBusy(false);
    }
  };

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
      if (data.mappings) setMappings(data.mappings);
      setConfigured(!!data.configured);
      setStatus(okMsg);
      setAdding(false);
      setEditingStageId(null);
      setEditingDefectCode(null);
      setEditingSizeId(null);
      setEditingMappingKey(null);
      setStageDraft(null);
      setDefectDraft(null);
      setSizeDraft(null);
      setMappingDraft(null);
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

  const mappingRowId = (m: Pick<SchemaMapping, "kind" | "key">) => `${m.kind}|${m.key}`;

  const confirmDeleteMapping = (m: SchemaMapping) => {
    if (m.source === "mod") {
      setError(
        "This mapping is still sourced from a verified workbook. Edit + Save to promote it into the editable brain first, then delete — or fix it on Staging for that file.",
      );
      return;
    }
    if (
      !confirm(
        `Remove mapping “${m.key}” → ${m.canonicalId} (${MAPPING_KIND_LABEL[m.kind]}) from the system brain?\n\nThe resolver will no longer use this Excel→canonical rule. Ledger facts are not deleted.`,
      )
    ) {
      return;
    }
    void mutate(
      { action: "delete-mapping", kind: m.kind, key: m.key },
      `Removed mapping ${m.key}`,
    );
  };

  /** Save mapping (and optionally retire the old key when kind/label changes). */
  const saveMappingEdit = async (original: SchemaMapping, draft: SchemaMapping) => {
    const key = draft.key.trim();
    const canonicalId = draft.canonicalId.trim();
    if (!key || !canonicalId) {
      setError("Label and canonical id are required");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const identityChanged =
        original.source !== "mod" &&
        (draft.kind !== original.kind || key.toLowerCase() !== original.key.toLowerCase());

      if (identityChanged) {
        const del = await fetch("/api/schema", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "delete-mapping",
            kind: original.kind,
            key: original.key,
          }),
        });
        if (!del.ok) {
          const data = await del.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to replace old mapping");
        }
      }

      const res = await fetch("/api/schema", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "upsert-mapping",
          mapping: {
            kind: draft.kind,
            key,
            canonicalId,
            confidence: draft.confidence ?? 1,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setCatalog(data.catalog);
      if (data.mappings) setMappings(data.mappings);
      setConfigured(!!data.configured);
      setStatus(
        original.source === "mod"
          ? `Mapping “${key}” promoted into brain`
          : `Mapping “${key}” updated`,
      );
      setEditingMappingKey(null);
      setMappingDraft(null);
      setAdding(false);
      await refreshRegistry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const stages = catalog?.stages ?? [];
  const defects = catalog?.defects ?? [];
  const sizes = catalog?.sizes ?? [];

  const filteredMappings = useMemo(() => {
    const q = mappingSearch.trim().toLowerCase();
    return mappings.filter((m) => {
      if (mappingFilter !== "all" && m.kind !== mappingFilter) return false;
      if (!q) return true;
      return (
        m.key.toLowerCase().includes(q) ||
        m.canonicalId.toLowerCase().includes(q) ||
        m.kind.toLowerCase().includes(q) ||
        (m.learnedFrom ?? "").toLowerCase().includes(q)
      );
    });
  }, [mappings, mappingFilter, mappingSearch]);

  const counts = {
    stages: stages.length,
    defects: defects.length,
    sizes: sizes.length,
    mappings: mappings.length,
  };

  const brainEmpty =
    stages.length === 0 && defects.length === 0 && sizes.length === 0 && mappings.length === 0;

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
              System brain
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
              Master Schema
            </h1>
            <p className="body" style={{ fontSize: 14, margin: 0, color: "var(--text-2)", maxWidth: 680, lineHeight: 1.55 }}>
              The durable knowledge of the whole plant: process stages, defect codes, sizes, and every
              Excel label→canonical mapping the resolver uses. Edit or delete any row here.
              Deleting an uploaded file never wipes this brain.
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
                setEditingMappingKey(null);
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
              + Add{" "}
              {section === "stages"
                ? "stage"
                : section === "defects"
                  ? "defect"
                  : section === "sizes"
                    ? "size"
                    : "mapping"}
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
            Workbooks <strong style={{ color: "var(--text)", fontWeight: 600 }}>teach</strong> on verify.
            This page is the <strong style={{ color: "var(--text)", fontWeight: 600 }}>source of truth</strong> —
            every mapping the system understands, fully editable.
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

        {/* Summary strip — full brain surface */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 10,
          }}
        >
          {(
            [
              { key: "stages" as const, label: "Stages", value: counts.stages, hint: "Process flow" },
              { key: "defects" as const, label: "Defect codes", value: counts.defects, hint: "Rejection catalog" },
              { key: "sizes" as const, label: "Sizes", value: counts.sizes, hint: "French / product" },
              { key: "mappings" as const, label: "All mappings", value: counts.mappings, hint: "Excel → canonical" },
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
                  setEditingStageId(null);
                  setEditingDefectCode(null);
                  setEditingSizeId(null);
                  setEditingMappingKey(null);
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
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>{s.hint}</div>
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
        ) : brainEmpty ? (
          <Card title="No master schema yet">
            <p className="muted" style={{ fontSize: 14, margin: "0 0 14px", lineHeight: 1.55 }}>
              The system brain is empty. Verify a workbook on Staging to seed stages, defects, and
              Excel→canonical mappings, or add them manually here.
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
                onClick={() => {
                  setSection("stages");
                  setAdding(true);
                }}
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
              <button
                type="button"
                onClick={() => {
                  setSection("mappings");
                  setAdding(true);
                }}
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
                Add first mapping
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
                      : section === "sizes"
                        ? "Add size"
                        : "Add Excel → canonical mapping"
                }
                sub={
                  section === "mappings"
                    ? "Saved to company knowledge — used by the resolver on every import"
                    : "Saved to master catalog immediately"
                }
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
                {section === "mappings" && (
                  <EntityForm
                    busy={busy}
                    onCancel={() => setAdding(false)}
                    onSave={() => {
                      const key = newMapping.key.trim();
                      const canonicalId = newMapping.canonicalId.trim();
                      if (!key || !canonicalId) {
                        setError("Excel label and canonical id are required");
                        return;
                      }
                      void mutate(
                        {
                          action: "upsert-mapping",
                          mapping: {
                            kind: newMapping.kind,
                            key,
                            canonicalId,
                            confidence: 1,
                          },
                        },
                        `Mapping “${key}” → ${canonicalId} saved`,
                      ).then(() =>
                        setNewMapping({ kind: "column-mapping", key: "", canonicalId: "" }),
                      );
                    }}
                  >
                    <Field label="Kind">
                      <select
                        value={newMapping.kind}
                        onChange={(e) =>
                          setNewMapping((m) => ({
                            ...m,
                            kind: e.target.value as MappingKind,
                          }))
                        }
                        style={inputStyle}
                      >
                        {(Object.keys(MAPPING_KIND_LABEL) as MappingKind[]).map((k) => (
                          <option key={k} value={k}>
                            {MAPPING_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Excel / raw label" mono>
                      <input
                        value={newMapping.key}
                        onChange={(e) => setNewMapping((m) => ({ ...m, key: e.target.value }))}
                        placeholder="e.g. Visual Insp. / PIN HOLE"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Canonical id" mono>
                      <input
                        value={newMapping.canonicalId}
                        onChange={(e) =>
                          setNewMapping((m) => ({ ...m, canonicalId: e.target.value }))
                        }
                        placeholder="e.g. visual / PINH / checked"
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

            {/* Mappings — full system brain of Excel → canonical rules */}
            {section === "mappings" && (
              <Card
                title="All Excel → canonical mappings"
                sub="Every label the resolver understands across the plant. Edit or delete any knowledge row. MOD-sourced rows promote into the brain on save."
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    marginBottom: 14,
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(
                      [
                        ["all", "All"],
                        ["stage-alias", "Stage"],
                        ["defect-alias", "Defect"],
                        ["column-mapping", "Column"],
                        ["header-pattern", "Header"],
                      ] as const
                    ).map(([k, label]) => {
                      const active = mappingFilter === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setMappingFilter(k)}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: "5px 10px",
                            borderRadius: 7,
                            border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                            background: active
                              ? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
                              : "var(--surface-2)",
                            color: active ? "var(--accent)" : "var(--text-2)",
                            cursor: "pointer",
                          }}
                        >
                          {label}
                          {k === "all"
                            ? ` · ${mappings.length}`
                            : ` · ${mappings.filter((m) => m.kind === k).length}`}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={mappingSearch}
                    onChange={(e) => setMappingSearch(e.target.value)}
                    placeholder="Search label, canonical, source…"
                    style={{
                      ...inputStyle,
                      flex: "1 1 200px",
                      minWidth: 180,
                      maxWidth: 360,
                    }}
                  />
                </div>

                {filteredMappings.length === 0 ? (
                  <Empty
                    label={
                      mappings.length === 0
                        ? "No mappings yet — verify a workbook or add one above"
                        : "No mappings match this filter"
                    }
                  />
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr style={theadRow}>
                          <th style={th}>Kind</th>
                          <th style={th}>Excel / raw label</th>
                          <th style={th}>Canonical</th>
                          <th style={th}>Source</th>
                          <th style={th}>Conf.</th>
                          <th style={{ ...th, width: 130 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMappings.map((m) => {
                          const rowId = mappingRowId(m);
                          const editing = editingMappingKey === rowId;
                          const draft = editing && mappingDraft ? mappingDraft : m;
                          const isKnowledge = m.source !== "mod";
                          return (
                            <tr key={rowId} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ ...td, fontSize: 12, color: "var(--text-2)" }}>
                                {editing ? (
                                  <select
                                    value={draft.kind}
                                    onChange={(e) =>
                                      setMappingDraft((x) =>
                                        x ? { ...x, kind: e.target.value as MappingKind } : x,
                                      )
                                    }
                                    style={{ ...inputStyle, minWidth: 120 }}
                                  >
                                    {(Object.keys(MAPPING_KIND_LABEL) as MappingKind[]).map((k) => (
                                      <option key={k} value={k}>
                                        {MAPPING_KIND_LABEL[k]}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  MAPPING_KIND_LABEL[m.kind]
                                )}
                              </td>
                              <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                                {editing && isKnowledge ? (
                                  <input
                                    value={draft.key}
                                    onChange={(e) =>
                                      setMappingDraft((x) => (x ? { ...x, key: e.target.value } : x))
                                    }
                                    style={inputStyle}
                                  />
                                ) : (
                                  m.key
                                )}
                              </td>
                              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>
                                {editing ? (
                                  <input
                                    value={draft.canonicalId}
                                    onChange={(e) =>
                                      setMappingDraft((x) =>
                                        x ? { ...x, canonicalId: e.target.value } : x,
                                      )
                                    }
                                    style={inputStyle}
                                  />
                                ) : (
                                  m.canonicalId
                                )}
                              </td>
                              <td style={{ ...td, fontSize: 12, color: "var(--text-2)" }}>
                                <span
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    background: isKnowledge
                                      ? "color-mix(in srgb, var(--positive) 12%, transparent)"
                                      : "color-mix(in srgb, var(--accent) 10%, transparent)",
                                    color: isKnowledge ? "var(--positive)" : "var(--accent)",
                                  }}
                                >
                                  {isKnowledge ? "brain" : "mod"}
                                </span>
                                {m.learnedFrom && (
                                  <span
                                    style={{
                                      display: "block",
                                      marginTop: 4,
                                      fontFamily: "var(--font-mono)",
                                      fontSize: 10,
                                      color: "var(--text-3)",
                                      maxWidth: 140,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                    title={m.learnedFrom}
                                  >
                                    {m.learnedFrom}
                                  </span>
                                )}
                              </td>
                              <td
                                style={{
                                  ...td,
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 12,
                                  color: "var(--text-3)",
                                }}
                              >
                                {Math.round((m.confidence ?? 0) * 100)}%
                              </td>
                              <td style={td}>
                                {editing ? (
                                  <RowActions
                                    busy={busy}
                                    onSave={() => {
                                      if (!mappingDraft) return;
                                      void saveMappingEdit(m, mappingDraft);
                                    }}
                                    onCancel={() => {
                                      setEditingMappingKey(null);
                                      setMappingDraft(null);
                                    }}
                                  />
                                ) : (
                                  <RowActions
                                    busy={busy}
                                    onEdit={() => {
                                      setEditingMappingKey(rowId);
                                      setMappingDraft({ ...m });
                                      setAdding(false);
                                      setEditingStageId(null);
                                      setEditingDefectCode(null);
                                      setEditingSizeId(null);
                                    }}
                                    onDelete={() => confirmDeleteMapping(m)}
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
                <p
                  className="small"
                  style={{ margin: "12px 0 0", color: "var(--text-3)", lineHeight: 1.45 }}
                >
                  Showing {filteredMappings.length} of {mappings.length} mapping
                  {mappings.length === 1 ? "" : "s"}. “brain” rows live in company knowledge and
                  are fully deletable. “mod” rows come from verified files — Save promotes them
                  into the editable brain.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* Per-file interpretation — series + file dropdowns (continuous card) */}
        <section
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 16,
            marginTop: 4,
          }}
        >
          <Card
            title="Per-file interpretation"
            sub="Pick a series, then a file. Delete removes only that upload (or series) — never the master schema above."
          >
            {wbLoading && workbooks.length === 0 ? (
              <Empty label="Loading uploads…" />
            ) : workbooks.length === 0 ? (
              <>
                <Empty label="No Excel uploads yet — import from Staging & Review." />
                <div style={{ marginTop: 8 }}>
                  <Link
                    href="/staging"
                    style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}
                  >
                    Open Staging →
                  </Link>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Series
                    </span>
                    <select
                      value={activeCluster?.key ?? ""}
                      onChange={(e) => {
                        const key = e.target.value;
                        setSelectedClusterKey(key);
                        const c = workbookClusters.find((x) => x.key === key);
                        const first = c?.files[0];
                        setSelectedSnapshot(first?.snapshotId ?? null);
                        setShowMappings(false);
                      }}
                      style={selectStyle}
                    >
                      {workbookClusters.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label} ({c.files.length})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      File
                    </span>
                    <select
                      value={activeWorkbook?.snapshotId ?? ""}
                      onChange={(e) => {
                        setSelectedSnapshot(e.target.value);
                        setShowMappings(false);
                      }}
                      style={selectStyle}
                      disabled={!activeCluster}
                    >
                      {(activeCluster?.files ?? []).map((f) => (
                        <option key={f.snapshotId} value={f.snapshotId}>
                          {fileBasename(f.fileName)}
                          {f.mod ? ` · ${f.mod.status}` : " · no mapping"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {activeWorkbook && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                    }}
                  >
                    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={activeWorkbook.fileName}
                      >
                        {fileBasename(activeWorkbook.fileName)}
                      </div>
                      <div
                        className="small"
                        style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}
                      >
                        {activeWorkbook.uploadedAt?.slice(0, 10) ?? "—"}
                        {activeWorkbook.mod
                          ? ` · ${activeWorkbook.mod.status} · v${activeWorkbook.mod.version}`
                          : " · mapping not verified"}
                        {activeCluster ? ` · series: ${activeCluster.label}` : ""}
                      </div>
                    </div>
                    {activeWorkbook.mod && (
                      <button
                        type="button"
                        onClick={() => setShowMappings((v) => !v)}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${showMappings ? "var(--accent)" : "var(--border)"}`,
                          background: showMappings
                            ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                            : "var(--surface)",
                          color: showMappings ? "var(--accent)" : "var(--text-2)",
                          cursor: "pointer",
                        }}
                      >
                        {showMappings ? "Hide mappings" : "Show mappings"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={deletingId === activeWorkbook.snapshotId || busy}
                      onClick={() => void deleteWorkbook(activeWorkbook)}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid color-mix(in srgb, var(--critical) 30%, var(--border))",
                        background: "var(--surface)",
                        color: "var(--critical)",
                        cursor: deletingId ? "wait" : "pointer",
                      }}
                    >
                      {deletingId === activeWorkbook.snapshotId ? "Deleting…" : "Delete file"}
                    </button>
                    {activeCluster && activeCluster.files.length > 1 && (
                      <button
                        type="button"
                        disabled={busy || deletingId !== null}
                        onClick={() => void deleteCluster(activeCluster.label, activeCluster.files)}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: "1px solid color-mix(in srgb, var(--critical) 30%, var(--border))",
                          background: "var(--surface)",
                          color: "var(--critical)",
                          cursor: busy ? "wait" : "pointer",
                        }}
                      >
                        Delete series ({activeCluster.files.length})
                      </button>
                    )}
                  </div>
                )}

                {showMappings && selectedMod && (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px 12px",
                        background: "var(--surface-2)",
                        borderBottom: "1px solid var(--border)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-2)",
                      }}
                    >
                      Column mappings for this file only
                    </div>
                    {!modDetail ? (
                      <Empty label="Loading mappings…" />
                    ) : (
                      <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
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
                                <td
                                  style={{
                                    ...td,
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--text-3)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
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
                  </div>
                )}

                <p className="small" style={{ margin: 0, color: "var(--text-3)", lineHeight: 1.45 }}>
                  {workbooks.length} upload{workbooks.length === 1 ? "" : "s"} · {workbookClusters.length}{" "}
                  series. File delete ≠ schema delete.
                </p>
              </div>
            )}
          </Card>
        </section>

        {/* Data integrity status — placed below Per-file interpretation */}
        {integrity.integrityIssues.length > 0 && (
          <IntegrityIssuesPanel
            blocked={integrity.state === "blocked"}
            reason={integrity.reason}
            issues={integrity.integrityIssues}
          />
        )}

        {/* Danger zone — full brain wipe (not the primary action) */}
        <details
          style={{
            marginTop: 8,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-1)",
          }}
          open={resetSchemaOpen}
          onToggle={(e) => setResetSchemaOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary
            style={{
              cursor: "pointer",
              padding: "12px 14px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-3)",
              listStyle: "none",
            }}
          >
            Advanced · reset entire master schema
          </summary>
          <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
              Wipes all stages, defects, sizes, and knowledge mappings for this company. Does{" "}
              <strong style={{ color: "var(--text)" }}>not</strong> delete uploaded files or ledger
              events. Prefer editing or deleting individual rows above.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input
                value={resetSchemaText}
                onChange={(e) => setResetSchemaText(e.target.value)}
                placeholder='Type RESET to confirm'
                style={{ ...inputStyle, maxWidth: 220 }}
                aria-label="Type RESET to confirm full schema wipe"
              />
              <button
                type="button"
                disabled={busy || resetSchemaText.trim().toUpperCase() !== "RESET"}
                onClick={() => void resetMasterSchema()}
                style={{
                  ...dangerLinkBtn,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid color-mix(in srgb, var(--status-bad) 50%, var(--border))",
                  background: "color-mix(in srgb, var(--status-bad) 10%, var(--surface))",
                  opacity: busy || resetSchemaText.trim().toUpperCase() !== "RESET" ? 0.5 : 1,
                  cursor:
                    busy || resetSchemaText.trim().toUpperCase() !== "RESET"
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {busy ? "Resetting…" : "Wipe master schema"}
              </button>
            </div>
          </div>
        </details>
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

function IntegrityIssuesPanel({
  blocked,
  reason,
  issues,
}: {
  blocked: boolean;
  reason: string;
  issues: IntegrityIssue[];
}) {
  const [open, setOpen] = useState(false);
  const critical = issues.filter((i) => i.severity === "critical").length;
  const border = blocked ? "var(--critical)" : "var(--warning)";
  const bg = blocked
    ? "color-mix(in srgb, var(--critical-weak) 70%, var(--surface))"
    : "color-mix(in srgb, var(--warning-weak) 70%, var(--surface))";
  const titleColor = blocked ? "var(--critical)" : "var(--warning)";
  const title = blocked
    ? "Data integrity blocked — ledger is not OK"
    : "Open integrity warnings";

  return (
    <div
      role="region"
      aria-label="Data integrity issues"
      style={{
        border: `1px solid color-mix(in srgb, ${border} 40%, var(--border))`,
        background: bg,
        borderRadius: 12,
        boxShadow: "var(--shadow-1)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px 12px",
          padding: "12px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: titleColor,
            width: 14,
            flexShrink: 0,
          }}
        >
          {open ? "▾" : "▸"}
        </span>
        <span style={{ flex: "1 1 200px", minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, color: titleColor }}>
            {title}
          </span>
          <span style={{ display: "block", fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
            {issues.length} open issue{issues.length === 1 ? "" : "s"}
            {critical > 0 ? ` · ${critical} critical` : ""}
            {!open ? " · click to expand" : ""}
          </span>
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            padding: "3px 8px",
            borderRadius: 999,
            background: "var(--surface)",
            border: `1px solid color-mix(in srgb, ${border} 30%, var(--border))`,
            color: titleColor,
            flexShrink: 0,
          }}
        >
          {blocked ? "BLOCKED" : "WARN"}
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: "0 14px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            borderTop: "1px solid color-mix(in srgb, " + border + " 20%, var(--border))",
          }}
        >
          {reason ? (
            <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, marginTop: 10 }}>
              {reason}
            </div>
          ) : (
            <div style={{ height: 8 }} />
          )}
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            {issues.map((issue) => {
              const auditHref = integrityAuditHref(issue);
              const fixHref = integrityFixHref(issue);
              const locus = [issue.batch, issue.stageId, issue.date, issue.size]
                .filter(Boolean)
                .join(" · ");
              const sevColor =
                issue.severity === "critical" ? "var(--critical)" : "var(--warning)";
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
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
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
                          <span
                            style={{
                              fontSize: 12,
                              color: "var(--text-3)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {locus}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 13.5, marginTop: 6, fontWeight: 500 }}>
                        {issue.message}
                      </div>
                    </Link>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 10,
                        borderTop: "1px solid var(--border)",
                        paddingTop: 8,
                      }}
                    >
                      <Link
                        href={auditHref}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--accent)",
                          textDecoration: "none",
                        }}
                      >
                        See evidence
                      </Link>
                      {fixHref && (
                        <Link
                          href={fixHref}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-2)",
                            textDecoration: "none",
                          }}
                        >
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
      )}
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

const selectStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "8px 30px 8px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  outline: "none",
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
