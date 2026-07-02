"use client";

// /workbooks — the "AI-native workspace" navigation centerpiece (Plan
// docs/superpowers/plans/2026-07-02-ai-native-workspace.md, Phase B). The
// workbook tree is an INVERSION of datasets[].sources: a Dataset groups rows
// by schema+stage ACROSS files, but this page navigates by FILE -> sheet, the
// way a person thinks about "the April workbook". No migrations, no new API
// routes — this reuses GET /api/datasets and /api/datasets?datasetId= exactly
// as GenericDatasetView does; sheet/file dashboards are pure row filters over
// the same persisted DatasetRow rows.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import Icon from "@/components/editorial/Icon";
import { Empty } from "@/components/app/widgets";
import PageLoader from "@/components/app/PageLoader";
import GenericDashboardBody from "@/components/app/GenericDashboardBody";
import { buildGenericDashboard } from "@/lib/dataset/dashboard";
import { toStageRecords } from "@/lib/dataset/to-stage-records";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import { useEvents } from "@/components/app/EventsContext";
import type { Dataset, DatasetRow } from "@/lib/dataset/types";

interface SheetNode {
  sheetName: string;
  datasetId: string;
  recognizedStageId: string | null;
  displayLabel: string;
}

interface FileNode {
  fileName: string;
  sheets: SheetNode[];
}

type Selection =
  | { level: "file"; fileName: string }
  | { level: "sheet"; fileName: string; sheetName: string; datasetId: string };

function stageLabelFor(stageId: string): string {
  return DISPOSAFE_REGISTRY.stages.find((s) => s.stageId === stageId)?.label ?? stageId;
}

/** Invert datasets[].sources into file -> sheets, per the plan's data-model
 *  note. When multiple sheets in the same file recognize to the SAME stage
 *  (e.g. a monthly workbook with both a raw sheet and a cleaned copy), the
 *  second+ occurrence is suffixed with its raw sheet name so the tree never
 *  shows two identically-labeled nodes. */
function buildTree(datasets: Dataset[]): FileNode[] {
  const byFile = new Map<string, SheetNode[]>();
  for (const ds of datasets) {
    for (const src of ds.sources) {
      const list = byFile.get(src.fileName) ?? [];
      list.push({
        sheetName: src.sheetName,
        datasetId: ds.id,
        recognizedStageId: ds.recognizedStageId,
        displayLabel: ds.recognizedStageId ? stageLabelFor(ds.recognizedStageId) : src.sheetName,
      });
      byFile.set(src.fileName, list);
    }
  }

  const files: FileNode[] = [];
  for (const [fileName, sheets] of byFile.entries()) {
    const seenLabels = new Set<string>();
    const deduped = sheets.map((s) => {
      if (!seenLabels.has(s.displayLabel)) {
        seenLabels.add(s.displayLabel);
        return s;
      }
      return { ...s, displayLabel: `${s.displayLabel} (${s.sheetName})` };
    });
    files.push({ fileName, sheets: deduped });
  }
  files.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return files;
}

export default function WorkbooksPage() {
  const router = useRouter();
  const { refreshEvents } = useEvents();
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [rowsCache, setRowsCache] = useState<Record<string, DatasetRow[]>>({});
  const [loadingDatasetIds, setLoadingDatasetIds] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/datasets")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load datasets (${r.status})`);
        return r.json();
      })
      .then((json) => {
        const list = (json.datasets ?? []) as Dataset[];
        setDatasets(list);
        // First file expanded by default.
        const tree = buildTree(list);
        if (tree.length > 0) setExpandedFiles({ [tree[0].fileName]: true });
      })
      .catch((err) => setError(err?.message ?? "Failed to load datasets"));
  }, []);

  const tree = useMemo(() => (datasets ? buildTree(datasets) : []), [datasets]);

  const filteredTree = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tree;
    return tree
      .map((f) => {
        const fileMatches = f.fileName.toLowerCase().includes(q);
        const sheets = f.sheets.filter(
          (s) => fileMatches || s.sheetName.toLowerCase().includes(q) || s.displayLabel.toLowerCase().includes(q),
        );
        if (!fileMatches && sheets.length === 0) return null;
        return { ...f, sheets: fileMatches ? f.sheets : sheets };
      })
      .filter((f): f is FileNode => f !== null);
  }, [tree, query]);

  function ensureRowsLoaded(datasetId: string) {
    if (rowsCache[datasetId] || loadingDatasetIds[datasetId]) return;
    setLoadingDatasetIds((p) => ({ ...p, [datasetId]: true }));
    fetch(`/api/datasets?datasetId=${encodeURIComponent(datasetId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load rows (${r.status})`);
        return r.json();
      })
      .then((json) => {
        setRowsCache((p) => ({ ...p, [datasetId]: (json.rows ?? []) as DatasetRow[] }));
      })
      .catch(() => {
        // best-effort — the dashboard section will show its own empty state
      })
      .finally(() => {
        setLoadingDatasetIds((p) => ({ ...p, [datasetId]: false }));
      });
  }

  function selectFile(fileName: string) {
    setSelection({ level: "file", fileName });
    const file = tree.find((f) => f.fileName === fileName);
    file?.sheets.forEach((s) => ensureRowsLoaded(s.datasetId));
  }

  function selectSheet(fileName: string, sheetName: string, datasetId: string) {
    setSelection({ level: "sheet", fileName, sheetName, datasetId });
    ensureRowsLoaded(datasetId);
  }

  function toggleFile(fileName: string) {
    setExpandedFiles((p) => ({ ...p, [fileName]: !p[fileName] }));
  }

  async function publishToCumulative(ds: Dataset, dsRows: DatasetRow[]) {
    setPublishing(true);
    setPublishMsg(null);
    try {
      const ingestionId = globalThis.crypto?.randomUUID?.() ?? `ing-${Date.now()}`;
      const records = toStageRecords(ds, dsRows, ingestionId);
      if (records.length === 0) {
        setPublishMsg({ tone: "err", text: "Nothing to publish — no rows with a valid date." });
        return;
      }
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ingestionId, fileName: ds.title, records }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Ingest failed (${res.status})`);
      const issues = (json.issues ?? []).length;
      setPublishMsg({
        tone: "ok",
        text: `Published ${records.length} records — ${json.inserted} new, ${json.deduped} already present${issues ? `, ${issues} clarification${issues === 1 ? "" : "s"} raised` : ""}.`,
      });
      refreshEvents();
    } catch (err: unknown) {
      setPublishMsg({ tone: "err", text: err instanceof Error ? err.message : "Publish failed" });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <AppShell active="workbooks">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>
            Workbooks
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Every uploaded file, browsable sheet by sheet — dashboards here are row filters over the same live ledger, not separate data.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, alignItems: "start" }}>
          {/* Left panel: search + tree */}
          <div style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            position: "sticky",
            top: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px", background: "var(--surface-2)" }}>
              <Icon name="search" size={13} style={{ color: "var(--text-3)" }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files or sheets…"
                style={{
                  flex: 1,
                  fontSize: 12.5,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--text)",
                }}
              />
            </div>

            {error && <Empty label={`Could not load workbooks: ${error}`} />}
            {!error && datasets === null && <PageLoader message="Loading workbooks…" minHeight="20vh" />}
            {!error && datasets !== null && filteredTree.length === 0 && (
              <Empty label={query ? "No files or sheets match your search." : "No workbooks uploaded yet — go to Staging & Review to upload a monthly inspection file (Visual, Valve Integrity, or Rejection Analysis) and it will appear here, sheet by sheet."} />
            )}

            {!error && filteredTree.map((f) => {
              const isExpanded = query.trim() ? true : !!expandedFiles[f.fileName];
              const isFileSelected = selection?.level === "file" && selection.fileName === f.fileName;
              return (
                <div key={f.fileName}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                      onClick={() => toggleFile(f.fileName)}
                      title={isExpanded ? "Collapse" : "Expand"}
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex", color: "var(--text-3)" }}
                    >
                      <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={12} />
                    </button>
                    <button
                      onClick={() => selectFile(f.fileName)}
                      title={f.fileName}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        background: isFileSelected ? "var(--accent-weak)" : "transparent",
                        color: isFileSelected ? "var(--accent)" : "var(--text)",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        padding: "6px 8px",
                        fontSize: 12.5,
                        fontWeight: isFileSelected ? 700 : 600,
                        cursor: "pointer",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Icon name="folder" size={12} style={{ marginRight: 6, verticalAlign: -2 }} />
                      {f.fileName}
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ marginLeft: 24, display: "flex", flexDirection: "column" }}>
                      <button
                        onClick={() => selectFile(f.fileName)}
                        style={{
                          textAlign: "left",
                          background: isFileSelected ? "var(--accent-weak)" : "transparent",
                          color: isFileSelected ? "var(--accent)" : "var(--text-2)",
                          border: "none",
                          borderRadius: "var(--radius-sm)",
                          padding: "5px 8px",
                          fontSize: 12,
                          fontWeight: isFileSelected ? 700 : 500,
                          cursor: "pointer",
                        }}
                      >
                        Overview ({f.sheets.length} sheet{f.sheets.length === 1 ? "" : "s"})
                      </button>
                      {f.sheets.map((s) => {
                        const isSheetSelected = selection?.level === "sheet" && selection.fileName === f.fileName && selection.sheetName === s.sheetName;
                        return (
                          <button
                            key={s.sheetName}
                            onClick={() => selectSheet(f.fileName, s.sheetName, s.datasetId)}
                            title={s.sheetName}
                            style={{
                              textAlign: "left",
                              background: isSheetSelected ? "var(--accent-weak)" : "transparent",
                              color: isSheetSelected ? "var(--accent)" : "var(--text-2)",
                              border: "none",
                              borderRadius: "var(--radius-sm)",
                              padding: "5px 8px",
                              fontSize: 12,
                              fontWeight: isSheetSelected ? 700 : 500,
                              cursor: "pointer",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.displayLabel}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right pane: dashboard */}
          <div style={{ minWidth: 0 }}>
            {!selection && datasets !== null && tree.length === 0 && (
              <div style={{
                border: "1px dashed var(--border-strong)",
                borderRadius: "var(--radius-md)",
                padding: 32,
                textAlign: "center",
                color: "var(--text-2)",
              }}>
                <p style={{ margin: "0 0 12px", fontSize: 14 }}>
                  No workbooks have been uploaded yet. Upload a monthly inspection file — Visual, Valve Integrity, or
                  Rejection Analysis — on Staging &amp; Review, and it will show up here as a browsable file → sheet tree.
                </p>
                <button
                  onClick={() => router.push("/staging")}
                  style={{
                    background: "var(--accent)",
                    color: "var(--text-invert)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Upload via Staging →
                </button>
              </div>
            )}

            {!selection && tree.length > 0 && (
              <Empty label="Pick a workbook on the left — a file for its overview, or a sheet for its dashboard." />
            )}

            {selection?.level === "sheet" && (
              <SheetDashboard
                selection={selection}
                dataset={datasets?.find((d) => d.id === selection.datasetId) ?? null}
                rows={rowsCache[selection.datasetId]}
                loading={!!loadingDatasetIds[selection.datasetId]}
                publishing={publishing}
                publishMsg={publishMsg}
                onPublish={publishToCumulative}
              />
            )}

            {selection?.level === "file" && (
              <FileDashboard
                fileName={selection.fileName}
                fileNode={tree.find((f) => f.fileName === selection.fileName) ?? null}
                datasets={datasets ?? []}
                rowsCache={rowsCache}
                loadingDatasetIds={loadingDatasetIds}
                publishing={publishing}
                publishMsg={publishMsg}
                onPublish={publishToCumulative}
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SheetDashboard({ selection, dataset, rows, loading, publishing, publishMsg, onPublish }: {
  selection: { fileName: string; sheetName: string; datasetId: string };
  dataset: Dataset | null;
  rows: DatasetRow[] | undefined;
  loading: boolean;
  publishing: boolean;
  publishMsg: { tone: "ok" | "err"; text: string } | null;
  onPublish: (ds: Dataset, rows: DatasetRow[]) => void;
}) {
  if (!dataset) return <Empty label="This dataset no longer exists — it may have been cleared." />;
  if (loading || rows === undefined) return <PageLoader message="Loading sheet…" minHeight="30vh" />;

  const sheetRows = rows.filter((r) => r.fileName === selection.fileName && r.sheetName === selection.sheetName);
  const d = buildGenericDashboard(dataset, sheetRows);
  const stageLabel = dataset.recognizedStageId
    ? DISPOSAFE_REGISTRY.stages.find((s) => s.stageId === dataset.recognizedStageId)?.label ?? dataset.recognizedStageId
    : null;

  return (
    <GenericDashboardBody
      d={d}
      caption={`Source: ${selection.fileName} → ${selection.sheetName}`}
      publishBanner={
        stageLabel
          ? { stageLabel, publishing, onPublish: () => onPublish(dataset, sheetRows), message: publishMsg }
          : undefined
      }
    />
  );
}

function FileDashboard({ fileName, fileNode, datasets, rowsCache, loadingDatasetIds, publishing, publishMsg, onPublish }: {
  fileName: string;
  fileNode: FileNode | null;
  datasets: Dataset[];
  rowsCache: Record<string, DatasetRow[]>;
  loadingDatasetIds: Record<string, boolean>;
  publishing: boolean;
  publishMsg: { tone: "ok" | "err"; text: string } | null;
  onPublish: (ds: Dataset, rows: DatasetRow[]) => void;
}) {
  if (!fileNode) return <Empty label="This file is no longer present in the dataset list." />;

  // One section per dataset represented in this file — a file can carry rows
  // from several datasets when sheets have different schemas/stages.
  const datasetIds = [...new Set(fileNode.sheets.map((s) => s.datasetId))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.02em" }}>
        Source: {fileName} · {fileNode.sheets.length} sheet{fileNode.sheets.length === 1 ? "" : "s"}
      </div>
      {datasetIds.map((datasetId) => {
        const dataset = datasets.find((d) => d.id === datasetId);
        const rows = rowsCache[datasetId];
        const loading = !!loadingDatasetIds[datasetId];
        if (!dataset) return null;
        if (loading || rows === undefined) {
          return <PageLoader key={datasetId} message={`Loading ${dataset.title}…`} minHeight="20vh" />;
        }
        const fileRows = rows.filter((r) => r.fileName === fileName);
        const d = buildGenericDashboard(dataset, fileRows);
        const stageLabel = dataset.recognizedStageId
          ? DISPOSAFE_REGISTRY.stages.find((s) => s.stageId === dataset.recognizedStageId)?.label ?? dataset.recognizedStageId
          : null;
        return (
          <div key={datasetId} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text)" }}>
              {dataset.title}
            </h2>
            <GenericDashboardBody
              d={d}
              publishBanner={
                stageLabel
                  ? { stageLabel, publishing, onPublish: () => onPublish(dataset, fileRows), message: publishMsg }
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}
