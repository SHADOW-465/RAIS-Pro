"use client";

// Workbooks explorer (Phase 5): browse uploaded snapshots and the ontology
// that interprets them. Every column shows its verified meaning, confidence,
// and resolver basis — strictly more provenance than the old dataset views.
// Data source: GET /api/workbooks (snapshots ⋈ MOD lineages) + GET /api/mods.

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app/AppShell";
import { Card, Empty } from "@/components/app/widgets";
import PageLoader from "@/components/app/PageLoader";

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
    stages: { stageId: string; label: string }[];
    defects: { defectCode: string; label: string }[];
    sizes: { sizeId: string; label: string }[];
  };
}

const statusTone = (status: string) =>
  status === "verified" ? "var(--positive)" : status === "draft" ? "var(--warning)" : "var(--text-3)";

export default function WorkbooksPage() {
  const [workbooks, setWorkbooks] = useState<WorkbookRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null); // modId
  const [detail, setDetail] = useState<ModDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sheetFilter, setSheetFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workbooks")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setWorkbooks(data.workbooks ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load workbooks"));
  }, []);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    setLoadingDetail(true);
    setSheetFilter(null);
    fetch(`/api/mods?modId=${encodeURIComponent(selected)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDetail(data.mod);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load MOD"))
      .finally(() => setLoadingDetail(false));
  }, [selected]);

  const entities = useMemo(() => {
    if (!detail) return [];
    const all = detail.document.entities;
    return sheetFilter ? all.filter((e) => e.original.sheet === sheetFilter) : all;
  }, [detail, sheetFilter]);

  return (
    <AppShell active="workbooks">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, margin: "0 0 2px" }}>Workbooks</h1>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 18px" }}>
        Every uploaded workbook, its lossless snapshot, and the verified ontology that interprets it.
      </p>

      {error && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", color: "var(--status-bad)", fontSize: 13 }}>{error}</div>}

      {workbooks === null ? (
        <PageLoader message="Loading workbooks…" minHeight="40vh" />
      ) : workbooks.length === 0 ? (
        <Empty label="No workbooks uploaded yet — upload one on the Staging page." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 18 }}>
          <Card title="Uploaded workbooks" sub={`${workbooks.length} snapshot${workbooks.length !== 1 ? "s" : ""}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {workbooks.map((wb) => {
                const isSel = selected === wb.mod?.modId;
                return (
                  <button
                    key={wb.snapshotId}
                    disabled={!wb.mod}
                    onClick={() => wb.mod && setSelected(wb.mod.modId)}
                    style={{
                      textAlign: "left", padding: "10px 12px", borderRadius: "var(--radius-md)",
                      border: `1px solid ${isSel ? "var(--accent)" : "var(--border)"}`,
                      background: isSel ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
                      cursor: wb.mod ? "pointer" : "default", opacity: wb.mod ? 1 : 0.6,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", wordBreak: "break-word" }}>{wb.fileName}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span className="small" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>
                        {wb.uploadedAt?.slice(0, 10)} · {wb.snapshotId.slice(0, 8)}
                      </span>
                      {wb.mod ? (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: statusTone(wb.mod.status) }}>
                          v{wb.mod.version} · {wb.mod.status}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>no MOD</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {loadingDetail ? (
              <PageLoader message="Loading ontology…" minHeight="30vh" />
            ) : !detail ? (
              <Empty label="Select a workbook to inspect its ontology — mappings, catalogs, and verification state." />
            ) : (
              <>
                <Card
                  title={detail.document.workbook.fileName}
                  sub={`MOD ${detail.modId.slice(0, 12)}… · v${detail.version} · ${detail.status}`}
                >
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
                    <span><strong>{detail.document.stages.length}</strong> <span className="muted">stages</span>{detail.document.stages.length > 0 && <span className="muted"> — {detail.document.stages.map((s) => s.label).join(", ")}</span>}</span>
                    <span><strong>{detail.document.defects.length}</strong> <span className="muted">defect codes</span></span>
                    <span><strong>{detail.document.sizes.length}</strong> <span className="muted">sizes</span></span>
                    <span><strong>{detail.document.entities.filter((e) => e.verified).length}/{detail.document.entities.length}</strong> <span className="muted">entities verified</span></span>
                  </div>
                </Card>

                <Card title="Entity mappings" sub="What every sheet and column MEANS — with confidence and resolver basis">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    <FilterChip label="All sheets" active={sheetFilter === null} onClick={() => setSheetFilter(null)} />
                    {detail.document.workbook.sheetNames.map((sn) => (
                      <FilterChip key={sn} label={sn} active={sheetFilter === sn} onClick={() => setSheetFilter(sn)} />
                    ))}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                          <th style={th}>Source</th>
                          <th style={th}>Label</th>
                          <th style={th}>Kind</th>
                          <th style={th}>Canonical</th>
                          <th style={th}>Conf.</th>
                          <th style={th}>Basis</th>
                          <th style={th}>Verified</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entities.map((e) => (
                          <tr key={e.entityId} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ ...td, fontFamily: "var(--font-mono)", whiteSpace: "nowrap", color: "var(--text-3)" }}>
                              {e.original.sheet}{e.original.tableId && e.original.tableId !== "t1" ? `#${e.original.tableId}` : ""}{e.original.colLetter ? `!${e.original.colLetter}` : ""}
                            </td>
                            <td style={{ ...td, color: "var(--text)" }}>{e.original.header}</td>
                            <td style={{ ...td, color: "var(--text-2)" }}>{e.kind}</td>
                            <td style={{ ...td, fontFamily: "var(--font-mono)", color: e.canonical ? "var(--text)" : "var(--text-3)" }}>
                              {e.canonical ?? "—"}
                            </td>
                            <td style={{ ...td, fontFamily: "var(--font-mono)", color: e.confidence >= 0.9 ? "var(--positive)" : e.confidence >= 0.6 ? "var(--warning)" : "var(--critical)" }}>
                              {Math.round(e.confidence * 100)}%
                            </td>
                            <td style={{ ...td, color: "var(--text-2)" }} title={e.reason}>{e.resolvedBy}</td>
                            <td style={td}>{e.verified ? <span style={{ color: "var(--positive)", fontWeight: 700 }}>✓</span> : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface)",
        color: active ? "var(--accent)" : "var(--text-2)",
      }}
    >
      {label}
    </button>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "6px 8px" };
