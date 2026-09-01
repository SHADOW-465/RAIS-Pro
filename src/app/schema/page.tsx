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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Select from "@/components/ui/Select";
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
import SchemaTree from "@/components/schema/SchemaTree";
import SchemaDetail, { type SchemaDetailHandle } from "@/components/schema/SchemaDetail";
import SchemaEditUnlock from "@/components/schema/SchemaEditUnlock";
import { applySchemaDelete, canDeleteNode, deleteLabelFor } from "@/lib/schema/apply-delete";
import { previewCatalogAction } from "@/lib/schema/catalog-preview";
import { SCHEMA_EDIT_STORAGE_KEY } from "@/lib/schema/edit-lock";
import { addActionFor } from "@/lib/schema/toolbar";
import type { SchemaPendingCreate } from "@/lib/schema/toolbar";
import { buildSchemaTree, filterTree, type SchemaNode } from "@/lib/schema/tree";
import { useConfirm } from "@/components/ui/ConfirmContext";

// ── Types ──────────────────────────────────────────────────────────────────

interface Stage {
  stageId: string;
  label: string;
  category?: string;
  upstream?: string[];
  captures?: string[];
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  sizeWise?: boolean;
  isQualityGate?: boolean;
}

interface CatalogSection {
  id: string;
  label: string;
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
  sections?: CatalogSection[];
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

/** Which tree folders are open, remembered across reloads. */
const TREE_OPEN_KEY = "moid_schema_tree_open";

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
  const { refreshRegistry, policy } = useRegistry();
  const { t } = useTweaks();

  const [catalog, setCatalog] = useState<CatalogMeta | null>(null);
  const [mappings, setMappings] = useState<SchemaMapping[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>("stages");
  const { confirm: confirmModal, notify } = useConfirm();

  // ── Schema tree ─────────────────────────────────────────────────────────
  const [treeQuery, setTreeQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  /** Expansion survives a reload — the tree is deep and the plant is big. */
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(TREE_OPEN_KEY);
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : ["cat:assembly"]);
    } catch {
      return new Set(["cat:assembly"]);
    }
  });
  const toggleNode = useCallback((id: string) => {
    setExpandedNodes((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(TREE_OPEN_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode — expansion just won't persist */
      }
      return next;
    });
  }, []);
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
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<SchemaPendingCreate | null>(null);
  const [toolbarCanSave, setToolbarCanSave] = useState(false);
  const editorRef = useRef<SchemaDetailHandle>(null);

  const integrity = useMemo(() => {
    if (!events || events.length === 0) {
      return { state: "ok" as const, reason: "", integrityIssues: [] as IntegrityIssue[] };
    }
    const scope = resolveScope(events, t, policy);
    return qualityStatus(events, scope);
  }, [events, t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/schema", { cache: "no-store", credentials: "same-origin" });
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
    try {
      setEditUnlocked(sessionStorage.getItem(SCHEMA_EDIT_STORAGE_KEY) === "1");
    } catch {
      /* private mode — stay locked */
    }
  }, []);

  const lockEdit = () => {
    setEditUnlocked(false);
    setToolbarCanSave(false);
    setPendingCreate(null);
    try {
      sessionStorage.removeItem(SCHEMA_EDIT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const unlockEdit = () => {
    setEditUnlocked(true);
    setUnlockOpen(false);
    try {
      sessionStorage.setItem(SCHEMA_EDIT_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const ensureExpanded = useCallback((id: string) => {
    setExpandedNodes((cur) => {
      if (cur.has(id)) return cur;
      const next = new Set(cur);
      next.add(id);
      try {
        localStorage.setItem(TREE_OPEN_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  const consumePendingCreate = useCallback(() => setPendingCreate(null), []);

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

  /** The flat catalog, in the shape the tree derivation takes. */
  const treeInput = useMemo(
    () => ({
      stages: catalog?.stages ?? [],
      defects: catalog?.defects ?? [],
      sizes: catalog?.sizes ?? [],
      sections: catalog?.sections,
      mappings: mappings.map((m) => ({
        kind: m.kind,
        key: m.key,
        canonicalId: m.canonicalId,
      })),
    }),
    [catalog, mappings],
  );

  const fullTree = useMemo(() => buildSchemaTree(treeInput), [treeInput]);

  const { nodes: visibleTree, expand: searchExpand } = useMemo(
    () => filterTree(fullTree, treeQuery),
    [fullTree, treeQuery],
  );

  // A search reveals its own hits without disturbing what the user opened.
  const effectiveExpanded = useMemo(
    () => (treeQuery.trim() ? new Set([...expandedNodes, ...searchExpand]) : expandedNodes),
    [treeQuery, expandedNodes, searchExpand],
  );

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const find = (nodes: SchemaNode[]): SchemaNode | null => {
      for (const n of nodes) {
        if (n.id === selectedNodeId) return n;
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    // Search off the FULL tree: a filtered-out selection is still being edited.
    return find(fullTree);
  }, [fullTree, selectedNodeId]);

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
    const ok = await confirmModal({
      title: `Delete upload “${name}”?`,
      description:
        "Removes this upload and its column-mapping document.\n\n" +
        "Master schema (stages / defects / sizes) is NOT deleted.\n" +
        "Ledger facts already published stay on the dashboard.",
      confirmText: "Delete Upload",
      variant: "danger",
    });
    if (!ok) return;
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
    const ok = await confirmModal({
      title: `Delete series “${label}”?`,
      description:
        `Delete all ${files.length} file(s) in series “${label}”?\n\n` +
        "Only these uploads and their mapping docs are removed.\n" +
        "Master schema is NOT deleted.",
      confirmText: "Delete Series",
      variant: "danger",
    });
    if (!ok) return;
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

  const mutate = async (body: Record<string, unknown>, okMsg: string) => {
    if (!editUnlocked) {
      setError("Unlock edit with the password to change the schema.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    const previous = catalog;
    const preview = catalog ? previewCatalogAction(catalog, body) : null;
    if (preview) setCatalog(preview);
    try {
      const res = await fetch("/api/schema", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
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
      await refreshRegistry({ force: true });
    } catch (e) {
      if (previous) setCatalog(previous);
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (kind: "stage" | "defect" | "size", id: string, label: string) => {
    const ok = await confirmModal({
      title: `Remove ${kind} “${label}”?`,
      description: `Remove ${kind} “${label}” (${id}) from the master plant schema?\n\nThis does not delete ledger events. Workbooks are not affected.`,
      confirmText: `Remove ${kind}`,
      variant: "danger",
    });
    if (!ok) return;
    const action =
      kind === "stage" ? "delete-stage" : kind === "defect" ? "delete-defect" : "delete-size";
    void mutate({ action, id }, `Removed ${kind} ${id}`);
  };

  const mappingRowId = (m: Pick<SchemaMapping, "kind" | "key">) => `${m.kind}|${m.key}`;

  const confirmDeleteMapping = async (m: SchemaMapping) => {
    if (m.source === "mod") {
      setError(
        "This mapping is still sourced from a verified workbook. Edit + Save to promote it into the editable brain first, then delete — or fix it on Staging for that file.",
      );
      return;
    }
    const ok = await confirmModal({
      title: "Remove mapping rule?",
      description: `Remove mapping “${m.key}” → ${m.canonicalId} (${MAPPING_KIND_LABEL[m.kind]}) from what MOID learned?\n\nThe resolver will no longer use this Excel→canonical rule. Ledger facts are not deleted.`,
      confirmText: "Remove Mapping",
      variant: "warning",
    });
    if (!ok) return;
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
      await refreshRegistry({ force: true });
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
              What MOID learned
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
              Excel label→canonical mapping the resolver uses. Unlock edit to
              add, rename or remove sections, stages, capture columns and defects.
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
            {editUnlocked && (
              <button
                type="button"
                disabled={busy}
                onClick={() => mutate({ action: "load-plant-catalog" }, "Plant catalog loaded — your edits were kept.")}
                title="Add any missing stages, defect codes and sizes from the documented plant process. Never removes or renames what you have."
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Load plant catalog
              </button>
            )}
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
              Nothing learned yet. Import an Excel file and confirm its columns to fill in stages, defects, and
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
              {editUnlocked && (
                <button
                  type="button"
                  onClick={() => mutate({ action: "load-plant-catalog" }, "Plant catalog loaded — your edits were kept.")}
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
                  Load plant catalog
                </button>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <span
                className="h3"
                style={{
                  fontSize: "var(--text-md)",
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  color: "var(--text)",
                }}
              >
                Plant schema
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => (editUnlocked ? lockEdit() : setUnlockOpen(true))}
                  style={editUnlocked ? schemaPill : schemaPillAccent}
                >
                  {editUnlocked ? "Lock schema" : "Unlock edit"}
                </button>
                {editUnlocked && (
                  <button
                    type="button"
                    onClick={() => {
                      const add = addActionFor(selectedNode, treeInput);
                      if (add.selectId) {
                        setSelectedNodeId(add.selectId);
                        const slash = add.selectId.indexOf("/");
                        if (slash > 0) ensureExpanded(add.selectId.slice(0, slash));
                        ensureExpanded(add.selectId);
                      }
                      setPendingCreate(add.kind);
                    }}
                    style={schemaPill}
                  >
                    + {addActionFor(selectedNode, treeInput).label}
                  </button>
                )}
                {editUnlocked && (
                  <button
                    type="button"
                    disabled={busy || !toolbarCanSave}
                    title={toolbarCanSave ? "Save the current form" : "Nothing to save on this row."}
                    onClick={() => editorRef.current?.save()}
                    style={{
                      ...schemaPillAccent,
                      opacity: busy || !toolbarCanSave ? 0.45 : 1,
                      cursor: busy || !toolbarCanSave ? "default" : "pointer",
                    }}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                )}
                {editUnlocked && (
                  <button
                    type="button"
                    disabled={busy || !canDeleteNode(selectedNode, treeInput)}
                    title={
                      !selectedNode
                        ? "Select a section, stage, defect or capture first."
                        : canDeleteNode(selectedNode, treeInput)
                          ? deleteLabelFor(selectedNode, treeInput)
                          : "This row cannot be deleted."
                    }
                    onClick={async () => {
                      if (!selectedNode) return;
                      const err = await applySchemaDelete(
                        selectedNode,
                        treeInput,
                        mutate,
                        () => setSelectedNodeId(null),
                        confirmModal,
                      );
                      if (err) setError(err);
                    }}
                    style={{
                      ...schemaPillDanger,
                      opacity: busy || !canDeleteNode(selectedNode, treeInput) ? 0.45 : 1,
                      cursor:
                        busy || !canDeleteNode(selectedNode, treeInput) ? "default" : "pointer",
                    }}
                  >
                    {deleteLabelFor(selectedNode, treeInput)}
                  </button>
                )}
              </div>
            </div>
            {/* One card, one hairline. The panes share a baseline and scroll
                internally — that shared height is what makes this read as a
                directory rather than two loose lists. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 320px) minmax(0, 1fr)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
                overflow: "hidden",
                height: "min(72vh, 640px)",
                minHeight: 420,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                  minHeight: 0,
                  height: "100%",
                  borderRight: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  overflow: "hidden",
                }}
              >
                {/* Search belongs to the tree — it filters the tree. */}
                <div style={{ padding: 8, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                  <input
                    value={treeQuery}
                    onChange={(e) => setTreeQuery(e.target.value)}
                    placeholder="Search schema…"
                    aria-label="Search the plant schema"
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid transparent",
                      background: "var(--surface)",
                      color: "var(--text)",
                      fontSize: 12.5,
                      fontFamily: "inherit",
                      outlineOffset: 1,
                    }}
                  />
                </div>
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    minHeight: 0,
                    scrollbarWidth: "thin",
                    scrollbarColor: "var(--border) transparent",
                  }}
                >
                  <SchemaTree
                    nodes={visibleTree}
                    expanded={effectiveExpanded}
                    onToggle={toggleNode}
                    selectedId={selectedNodeId}
                    onSelect={(n) => setSelectedNodeId(n.id)}
                  />
                </div>
              </div>
              <div
                style={{
                  overflowY: "auto",
                  overflowX: "hidden",
                  minWidth: 0,
                  minHeight: 0,
                  height: "100%",
                  scrollbarWidth: "thin",
                  scrollbarColor: "var(--border) transparent",
                }}
              >
                <SchemaDetail
                  ref={editorRef}
                  node={selectedNode}
                  data={treeInput}
                  busy={busy}
                  editable={editUnlocked}
                  saveError={error}
                  onCanSaveChange={setToolbarCanSave}
                  pendingCreate={pendingCreate}
                  onPendingCreateConsumed={consumePendingCreate}
                  onSelectId={setSelectedNodeId}
                  onExpand={ensureExpanded}
                  onRequestUnlock={() => setUnlockOpen(true)}
                  mutate={mutate}
                />
              </div>
            </div>
          </Card>
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
                <Empty label="No Excel files imported yet — start on Import from Excel." />
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
                    <Select
                      value={activeCluster?.key ?? ""}
                      onChange={(key) => {
                        setSelectedClusterKey(key);
                        const c = workbookClusters.find((x) => x.key === key);
                        setSelectedSnapshot(c?.files[0]?.snapshotId ?? null);
                        setShowMappings(false);
                      }}
                      options={workbookClusters.map((c) => ({
                        value: c.key,
                        label: c.label,
                        hint: c.files.length + (c.files.length === 1 ? " file" : " files"),
                      }))}
                      placeholder="Choose a workbook series"
                      ariaLabel="Workbook series"
                    />
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
                    <Select
                      value={activeWorkbook?.snapshotId ?? ""}
                      onChange={(v) => {
                        setSelectedSnapshot(v);
                        setShowMappings(false);
                      }}
                      options={(activeCluster?.files ?? []).map((f) => ({
                        value: f.snapshotId,
                        label: fileBasename(f.fileName),
                        hint: f.mod ? f.mod.status : "no mapping",
                      }))}
                      disabled={!activeCluster}
                      placeholder="Choose a file"
                      ariaLabel="Workbook file"
                    />
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

        {/*
          Destructive resets live in ONE place: Settings -> Admin. Having the
          same wipe on two screens meant two confirmation flows to keep in
          sync, and an object page is the wrong home for "destroy this object".
        */}
        <SchemaEditUnlock
          open={unlockOpen}
          onUnlock={unlockEdit}
          onCancel={() => setUnlockOpen(false)}
        />

        <p
          className="small"
          style={{
            margin: "8px 0 0",
            padding: "12px 14px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            lineHeight: "var(--leading-body)",
          }}
        >
          Need to start the registry over? Wiping every stage, defect, size and
          mapping lives with the other destructive actions in{" "}
          <a href="/settings#admin" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Settings &rarr; Admin
          </a>
          . Editing or deleting individual rows above is almost always the better move.
        </p>
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

const schemaPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 28,
  padding: "0 12px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  lineHeight: 1,
};

const schemaPillAccent: React.CSSProperties = {
  ...schemaPill,
  border: "1px solid var(--accent)",
  background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
  color: "var(--accent)",
};

const schemaPillDanger: React.CSSProperties = {
  ...schemaPill,
  border: "1px solid color-mix(in srgb, var(--critical) 35%, var(--border))",
  color: "var(--critical)",
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
