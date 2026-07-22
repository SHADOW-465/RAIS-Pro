"use client";

// Uploaded files explorer: numbers from the event ledger (filtered by source
// file) + schema learned from the workbook (for Data Entry) + optional mappings.
// Files are drag-reorderable (order persisted locally) and deletable, and the
// numbers cards expand into the same "View Source" provenance modal as Dashboard.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app/AppShell";
import { Card, Empty, Kpi, BarsH, LineChart } from "@/components/app/widgets";
import PageLoader from "@/components/app/PageLoader";
import FloatingDetailModal, { type SourceRow } from "@/components/FloatingDetailModal";
import Icon from "@/components/editorial/Icon";
import { useEvents } from "@/components/app/EventsContext";
import {
  byStage,
  byDefect,
  rejectionRate,
  totalChecked,
  totalRejected,
  trend,
  DERIVED_REGISTRY,
} from "@/lib/analytics";
import type { Event } from "@/lib/store/types";

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
    stages: { stageId: string; label: string; captures?: string[] }[];
    defects: { defectCode: string; label: string; stages?: string[] }[];
    sizes: { sizeId: string; label: string }[];
  };
}

const ORDER_KEY = "moid_workbooks_order";

function loadOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function fileOf(e: Event): string {
  const p = e.provenance as any;
  return p?.file || p?.provenance_file || "";
}

/** Map canonical events → provenance rows for the "View Source" panel. */
function toSourceRows(events: Event[]): SourceRow[] {
  const out: SourceRow[] = [];
  for (const e of events as any[]) {
    const prov = e.provenance ?? {};
    out.push({
      date: e.occurredOn?.start ?? "—",
      stage: e.stageId ?? "—",
      size: e.size ?? null,
      type: e.eventType + (e.disposition ? `·${e.disposition}` : "") + (e.defectCodeRaw ? ` ${e.defectCodeRaw}` : ""),
      qty: e.quantity ?? e.statedValue ?? "—",
      file: prov.file ?? "Manual Entry",
      fileHash: prov.fileHash ?? null,
      sheet: prov.sheet,
      cell: prov.cells?.[0] ?? "ENTRY",
      isDirect: prov.is_direct_entry === true,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export default function WorkbooksPage() {
  const { events, isLoading: eventsLoading } = useEvents();
  const [workbooks, setWorkbooks] = useState<WorkbookRow[] | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Modal (same "View Source" pattern as Dashboard cards)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [modalOriginRect, setModalOriginRect] = useState<DOMRect | null>(null);
  const lastClickRect = useRef<DOMRect | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest(".card-hover");
      if (el) lastClickRect.current = el.getBoundingClientRect();
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: { rows: SourceRow[]; value: string },
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
    setModalOriginRect(lastClickRect.current);
    setModalOpen(true);
  };

  const loadWorkbooks = () => {
    fetch("/api/workbooks")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const list: WorkbookRow[] = data.workbooks ?? [];
        setWorkbooks(list);
        setOrder((prev) => (prev.length ? prev : loadOrder()));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load workbooks"));
  };

  useEffect(() => {
    setOrder(loadOrder());
    loadWorkbooks();
  }, []);

  // Default selection once the list arrives (kept separate from reload-after-delete).
  useEffect(() => {
    if (!workbooks || selected) return;
    const first = workbooks.find((w) => w.mod?.status === "verified") ?? workbooks.find((w) => w.mod) ?? workbooks[0];
    if (first?.mod) {
      setSelected(first.mod.modId);
      setSelectedFile(first.fileName);
    }
  }, [workbooks, selected]);

  const orderedWorkbooks = useMemo(() => {
    if (!workbooks) return [];
    if (order.length === 0) return workbooks;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...workbooks].sort((a, b) => {
      const ra = rank.has(a.snapshotId) ? rank.get(a.snapshotId)! : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.snapshotId) ? rank.get(b.snapshotId)! : Number.MAX_SAFE_INTEGER;
      return ra !== rb ? ra - rb : a.uploadedAt.localeCompare(b.uploadedAt);
    });
  }, [workbooks, order]);

  const persistOrder = (next: string[]) => {
    setOrder(next);
    localStorage.setItem(ORDER_KEY, JSON.stringify(next));
  };

  const reorder = (dragged: string, target: string) => {
    if (dragged === target) return;
    const ids = orderedWorkbooks.map((w) => w.snapshotId);
    const from = ids.indexOf(dragged);
    const to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragged);
    persistOrder(next);
  };

  const deleteWorkbook = async (wb: WorkbookRow) => {
    if (!confirm(
      `Delete "${wb.fileName}" from Workbooks?\n\n` +
        "• Ledger numbers already saved from this file are kept.\n" +
        "• Master plant schema (stages / defects / sizes) is kept — manage it on Data Schema.\n" +
        "• Only this file’s upload and column-mapping document are removed.",
    )) return;
    setDeleting(wb.snapshotId);
    try {
      const res = await fetch(`/api/workbooks?snapshotId=${encodeURIComponent(wb.snapshotId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed");
      if (selected === wb.mod?.modId) {
        setSelected(null);
        setSelectedFile(null);
        setDetail(null);
      }
      persistOrder(order.filter((id) => id !== wb.snapshotId));
      loadWorkbooks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete workbook");
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/mods?modId=${encodeURIComponent(selected)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDetail(data.mod);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load workbook schema"))
      .finally(() => setLoadingDetail(false));
  }, [selected]);

  const fileEvents = useMemo(() => {
    if (!events || !selectedFile) return [];
    const target = selectedFile.toLowerCase();
    return events.filter((e) => {
      const f = fileOf(e).toLowerCase();
      return f === target || f.includes(target.replace(/\.[^.]+$/, "")) || target.includes(f.replace(/\.[^.]+$/, ""));
    });
  }, [events, selectedFile]);

  const fileStats = useMemo(() => {
    if (fileEvents.length === 0) return null;
    const scope = { grain: "month" as const };
    const reg = DERIVED_REGISTRY;
    const chk = totalChecked(fileEvents, scope, reg).value;
    const rej = totalRejected(fileEvents, scope).value;
    const rate = rejectionRate(fileEvents, scope, reg).value;
    const stages = byStage(fileEvents, scope, reg);
    const defects = byDefect(fileEvents, scope, reg).slice(0, 10);
    const tr = trend(fileEvents, scope, "rejectionRate", reg);
    return { chk, rej, rate, stages, defects, tr, n: fileEvents.length };
  }, [fileEvents]);

  const fileSourceRows = useMemo(() => toSourceRows(fileEvents), [fileEvents]);

  return (
    <AppShell active="workbooks">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, margin: "0 0 2px" }}>
        Workbooks
      </h1>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 18px", maxWidth: 720, lineHeight: 1.55 }}>
        Each Excel you imported and the <strong>numbers already on the ledger</strong> (same as Dashboard).
        Drag files to reorder them. Import more on{" "}
        <Link href="/staging" style={{ color: "var(--accent)", fontWeight: 600 }}>Staging &amp; Review</Link>.
      </p>

      {error && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", color: "var(--status-bad)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {workbooks === null || eventsLoading ? (
        <PageLoader message="Loading workbooks…" minHeight="40vh" />
      ) : workbooks.length === 0 ? (
        <Empty label="No workbooks yet — use Staging & Review to load a plant file once." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 18 }}>
          <Card title="Files" sub={`${workbooks.length} upload${workbooks.length !== 1 ? "s" : ""}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {orderedWorkbooks.map((wb) => {
                const isSel = selected === wb.mod?.modId || (!wb.mod && selectedFile === wb.fileName);
                const nForFile = (events ?? []).filter((e) => {
                  const f = fileOf(e).toLowerCase();
                  const t = wb.fileName.toLowerCase();
                  return f === t || f.includes(t.replace(/\.[^.]+$/, ""));
                }).length;
                const isDragOver = dragOverId === wb.snapshotId;
                return (
                  <div
                    key={wb.snapshotId}
                    draggable
                    onDragStart={() => { dragId.current = wb.snapshotId; }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverId(wb.snapshotId); }}
                    onDragLeave={() => setDragOverId((id) => (id === wb.snapshotId ? null : id))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverId(null);
                      if (dragId.current) reorder(dragId.current, wb.snapshotId);
                      dragId.current = null;
                    }}
                    onDragEnd={() => { dragId.current = null; setDragOverId(null); }}
                    style={{
                      display: "flex",
                      alignItems: "stretch",
                      gap: 4,
                      borderRadius: "var(--radius-md)",
                      border: `1.5px dashed ${isDragOver ? "var(--accent)" : "transparent"}`,
                      opacity: deleting === wb.snapshotId ? 0.5 : 1,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", padding: "0 2px", cursor: "grab", color: "var(--text-3)" }}
                      title="Drag to reorder"
                    >
                      ⠿
                    </div>
                    <button
                      disabled={!wb.mod}
                      onClick={() => {
                        if (!wb.mod) return;
                        setSelected(wb.mod.modId);
                        setSelectedFile(wb.fileName);
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        padding: "10px 12px",
                        borderRadius: "var(--radius-md)",
                        border: `1px solid ${isSel ? "var(--accent)" : "var(--border)"}`,
                        background: isSel ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
                        cursor: wb.mod ? "pointer" : "default",
                        opacity: wb.mod ? 1 : 0.6,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", wordBreak: "break-word" }}>
                        {wb.fileName}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, gap: 8 }}>
                        <span className="small" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>
                          {wb.uploadedAt?.slice(0, 10)}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: nForFile ? "var(--positive)" : "var(--text-3)" }}>
                          {nForFile ? `${nForFile} events` : wb.mod ? wb.mod.status : "no schema"}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteWorkbook(wb); }}
                      disabled={deleting === wb.snapshotId}
                      title="Delete this workbook"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        background: "var(--surface)",
                        color: "var(--text-3)",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {loadingDetail ? (
              <PageLoader message="Loading file…" minHeight="30vh" />
            ) : !detail ? (
              <Empty label="Select a file with a saved schema to see numbers and Data Entry columns." />
            ) : (
              <>
                <Card
                  title={detail.document.workbook.fileName}
                  sub={`${detail.status} · v${detail.version} · ${detail.document.stages.length} stages · ${detail.document.defects.length} defect codes`}
                >
                  <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                    Data Entry schema and column mappings for this file live on{" "}
                    <Link href="/schema" style={{ color: "var(--accent)", fontWeight: 600 }}>Data Schema</Link>.
                  </p>
                </Card>

                {!fileStats ? (
                  <Card title="No ledger numbers from this file yet">
                    <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                      Schema may be saved, but no facts were loaded (or file name does not match event provenance).
                      Re-run <Link href="/staging" style={{ color: "var(--accent)" }}>Import from Excel</Link> and
                      confirm column meanings so rows load to the ledger — or enter new days on{" "}
                      <Link href="/data-entry" style={{ color: "var(--accent)" }}>Data Entry</Link>.
                    </p>
                  </Card>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                      <Kpi
                        label="Events"
                        value={String(fileStats.n)}
                        sub="from this file"
                        onClick={() => openModal(
                          "Events from this file",
                          "Every ledger event attributed to this workbook, by provenance.",
                          <Empty label="See View Source below for the row-level trace." />,
                          { rows: fileSourceRows, value: String(fileStats.n) },
                        )}
                      />
                      <Kpi
                        label="Checked"
                        value={fileStats.chk.toLocaleString()}
                        sub="sum"
                        onClick={() => openModal(
                          "Checked — sum",
                          "Total checked quantity summed across this file's events.",
                          <Empty label="See View Source below for the row-level trace." />,
                          { rows: fileSourceRows, value: fileStats.chk.toLocaleString() },
                        )}
                      />
                      <Kpi
                        label="Rejected"
                        value={fileStats.rej.toLocaleString()}
                        sub="sum"
                        tone="bad"
                        onClick={() => openModal(
                          "Rejected — sum",
                          "Total rejected quantity summed across this file's events.",
                          <Empty label="See View Source below for the row-level trace." />,
                          { rows: fileSourceRows, value: fileStats.rej.toLocaleString() },
                        )}
                      />
                      <Kpi
                        label="Rej. rate"
                        value={`${fileStats.rate.toFixed(2)}%`}
                        sub="from ledger"
                        tone={fileStats.rate > 5 ? "bad" : "good"}
                        onClick={() => openModal(
                          "Rejection rate",
                          "Rejected ÷ Checked across this file's events.",
                          <Empty label="See View Source below for the row-level trace." />,
                          { rows: fileSourceRows, value: `${fileStats.rate.toFixed(2)}%` },
                        )}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <Card
                        title="By stage"
                        sub="Rejection rate from this file’s events"
                        onClick={() => openModal(
                          "By stage",
                          "Rejection rate per stage, computed from this file's own checked and rejected counts.",
                          <div style={{ minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <BarsH
                              rows={fileStats.stages.map((s) => ({ label: s.label || s.stageId, value: s.rejRate * 100, sub: `${s.rejected.toLocaleString()} rej` }))}
                              fmt={(n) => `${n.toFixed(1)}%`}
                            />
                          </div>,
                          { rows: fileSourceRows, value: `${fileStats.stages.length} stages` },
                        )}
                      >
                        {fileStats.stages.length === 0 ? (
                          <Empty label="No stage breakdown" />
                        ) : (
                          <BarsH
                            rows={fileStats.stages.map((s) => ({
                              label: s.label || s.stageId,
                              value: s.rejRate * 100,
                              sub: `${s.rejected.toLocaleString()} rej`,
                            }))}
                            fmt={(n) => `${n.toFixed(1)}%`}
                          />
                        )}
                      </Card>
                      <Card
                        title="Top defects"
                        sub="Counts from this file"
                        onClick={() => openModal(
                          "Top defects",
                          "Defect counts from this file's rejection events.",
                          <div style={{ minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <BarsH
                              rows={fileStats.defects.map((d) => ({ label: d.label || d.defectCode || "?", value: d.rejected }))}
                              fmt={(n) => n.toLocaleString()}
                            />
                          </div>,
                          { rows: fileSourceRows.filter((r) => r.type.includes("rejection")), value: `${fileStats.defects.length} codes` },
                        )}
                      >
                        {fileStats.defects.length === 0 ? (
                          <Empty label="No defect events" />
                        ) : (
                          <BarsH
                            rows={fileStats.defects.map((d) => ({
                              label: d.label || d.defectCode || "?",
                              value: d.rejected,
                            }))}
                            fmt={(n) => n.toLocaleString()}
                          />
                        )}
                      </Card>
                    </div>
                    <Card
                      title="Rejection rate trend"
                      sub="From events attributed to this workbook"
                      onClick={() => openModal(
                        "Rejection rate trend",
                        "Monthly rejection rate trend recomputed from this file's raw counts.",
                        <div style={{ minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                          <LineChart points={fileStats.tr} fmt={(n) => `${n.toFixed(1)}%`} height={260} />
                        </div>,
                        { rows: fileSourceRows, value: `${fileStats.rate.toFixed(2)}%` },
                      )}
                    >
                      {fileStats.tr.length < 2 ? (
                        <Empty label="Not enough periods for a trend" />
                      ) : (
                        <LineChart
                          points={fileStats.tr}
                          fmt={(n) => `${n.toFixed(1)}%`}
                          height={220}
                        />
                      )}
                    </Card>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <FloatingDetailModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          lastClickRect.current = null;
        }}
        title={modalTitle}
        insight={modalInsight}
        primaryValue={modalPrimaryValue}
        sourceRows={modalSourceRows}
        originRect={modalOriginRect}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}
