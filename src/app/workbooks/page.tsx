"use client";

// Uploaded files explorer: numbers from the event ledger (filtered by source
// file) + schema learned from the workbook (for Data Entry) + optional mappings.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app/AppShell";
import { Card, Empty, Kpi, BarsH, LineChart } from "@/components/app/widgets";
import PageLoader from "@/components/app/PageLoader";
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

type DetailTab = "numbers" | "schema" | "mappings";

const statusTone = (status: string) =>
  status === "verified" ? "var(--positive)" : status === "draft" ? "var(--warning)" : "var(--text-3)";

function fileOf(e: Event): string {
  const p = e.provenance as any;
  return p?.file || p?.provenance_file || "";
}

export default function WorkbooksPage() {
  const { events, isLoading: eventsLoading } = useEvents();
  const [workbooks, setWorkbooks] = useState<WorkbookRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sheetFilter, setSheetFilter] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("numbers");

  useEffect(() => {
    fetch("/api/workbooks")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const list: WorkbookRow[] = data.workbooks ?? [];
        setWorkbooks(list);
        // Prefer first verified real workbook
        const first = list.find((w) => w.mod?.status === "verified") ?? list.find((w) => w.mod) ?? list[0];
        if (first?.mod) {
          setSelected(first.mod.modId);
          setSelectedFile(first.fileName);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load workbooks"));
  }, []);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setSheetFilter(null);
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

  const entities = useMemo(() => {
    if (!detail) return [];
    const all = detail.document.entities;
    return sheetFilter ? all.filter((e) => e.original.sheet === sheetFilter) : all;
  }, [detail, sheetFilter]);

  const schemaPreview = useMemo(() => {
    if (!detail) return [];
    return (detail.document.stages ?? []).map((s) => {
      const defs = (detail.document.defects ?? []).filter(
        (d) => !d.stages?.length || d.stages.includes(s.stageId),
      );
      // Prefer entity-mapped defects for this stage
      const fromEnt = detail.document.entities
        .filter((e) => e.kind === "defect" && e.verified && e.canonical?.startsWith("DEFECT:"))
        .filter((e) => {
          const code = e.canonical!.slice("DEFECT:".length);
          const cat = detail.document.defects?.find((d) => d.defectCode === code);
          return cat?.stages?.includes(s.stageId) || defs.some((d) => d.defectCode === code);
        });
      const defectLabels =
        fromEnt.length > 0
          ? [...new Set(fromEnt.map((e) => e.canonical!.slice("DEFECT:".length)))]
          : defs.map((d) => d.defectCode);
      return {
        stageId: s.stageId,
        label: s.label,
        captures: s.captures ?? [],
        defects: defectLabels,
      };
    });
  }, [detail]);

  return (
    <AppShell active="workbooks">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, margin: "0 0 2px" }}>
        Uploaded files
      </h1>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 18px", maxWidth: 720, lineHeight: 1.55 }}>
        Each Excel you imported: <strong>numbers already on the ledger</strong> (same as Dashboard),
        the <strong>schema for Data Entry</strong>, and column mappings. Import more on{" "}
        <Link href="/staging" style={{ color: "var(--accent)", fontWeight: 600 }}>Import from Excel</Link>.
      </p>

      {error && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", color: "var(--status-bad)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {workbooks === null || eventsLoading ? (
        <PageLoader message="Loading uploaded files…" minHeight="40vh" />
      ) : workbooks.length === 0 ? (
        <Empty label="No workbooks yet — use Import from Excel to load a plant file once." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 18 }}>
          <Card title="Files" sub={`${workbooks.length} upload${workbooks.length !== 1 ? "s" : ""}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {workbooks.map((wb) => {
                const isSel = selected === wb.mod?.modId || (!wb.mod && selectedFile === wb.fileName);
                const nForFile = (events ?? []).filter((e) => {
                  const f = fileOf(e).toLowerCase();
                  const t = wb.fileName.toLowerCase();
                  return f === t || f.includes(t.replace(/\.[^.]+$/, ""));
                }).length;
                return (
                  <button
                    key={wb.snapshotId}
                    disabled={!wb.mod}
                    onClick={() => {
                      if (!wb.mod) return;
                      setSelected(wb.mod.modId);
                      setSelectedFile(wb.fileName);
                      setTab("numbers");
                    }}
                    style={{
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
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                    {(
                      [
                        ["numbers", "Numbers & charts"],
                        ["schema", "Data Entry schema"],
                        ["mappings", "Column mappings"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${tab === id ? "var(--accent)" : "var(--border)"}`,
                          background: tab === id ? "var(--accent)" : "var(--surface-2)",
                          color: tab === id ? "var(--text-invert)" : "var(--text-2)",
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Card>

                {tab === "numbers" && (
                  <>
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
                          <Kpi label="Events" value={String(fileStats.n)} sub="from this file" />
                          <Kpi label="Checked" value={fileStats.chk.toLocaleString()} sub="sum" />
                          <Kpi label="Rejected" value={fileStats.rej.toLocaleString()} sub="sum" tone="bad" />
                          <Kpi
                            label="Rej. rate"
                            value={`${fileStats.rate.toFixed(2)}%`}
                            sub="from ledger"
                            tone={fileStats.rate > 5 ? "bad" : "good"}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          <Card title="By stage" sub="Rejection rate from this file’s events">
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
                          <Card title="Top defects" sub="Counts from this file">
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
                        <Card title="Rejection rate trend" sub="From events attributed to this workbook">
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

                {tab === "schema" && (
                  <Card
                    title="What Data Entry will use"
                    sub="Stages and defect columns learned from this workbook (and other verified files)"
                  >
                    {schemaPreview.length === 0 ? (
                      <Empty label="No stages on this schema yet — confirm mappings on Import." />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {schemaPreview.map((s) => (
                          <div
                            key={s.stageId}
                            style={{
                              padding: 12,
                              borderRadius: 10,
                              border: "1px solid var(--border)",
                              background: "var(--surface-2)",
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                              {s.label}{" "}
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}>
                                {s.stageId}
                              </span>
                            </div>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                              Captures: {s.captures.length ? s.captures.join(", ") : "—"}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {s.defects.length === 0 ? (
                                <span className="muted" style={{ fontSize: 12 }}>No defect columns mapped</span>
                              ) : (
                                s.defects.map((d) => (
                                  <span
                                    key={d}
                                    style={{
                                      fontFamily: "var(--font-mono)",
                                      fontSize: 11,
                                      fontWeight: 600,
                                      padding: "3px 8px",
                                      borderRadius: 6,
                                      background: "var(--surface)",
                                      border: "1px solid var(--border)",
                                    }}
                                  >
                                    {d}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                        <Link
                          href="/data-entry"
                          style={{
                            alignSelf: "flex-start",
                            padding: "8px 14px",
                            borderRadius: 8,
                            background: "var(--accent)",
                            color: "var(--text-invert)",
                            fontWeight: 700,
                            fontSize: 13,
                            textDecoration: "none",
                          }}
                        >
                          Open Data Entry →
                        </Link>
                      </div>
                    )}
                  </Card>
                )}

                {tab === "mappings" && (
                  <Card title="Column mappings" sub="How each Excel header was interpreted">
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
                            <th style={th}>OK</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entities.map((e) => (
                            <tr key={e.entityId} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ ...td, fontFamily: "var(--font-mono)", whiteSpace: "nowrap", color: "var(--text-3)" }}>
                                {e.original.sheet}
                                {e.original.tableId && e.original.tableId !== "t1" ? `#${e.original.tableId}` : ""}
                                {e.original.colLetter ? `!${e.original.colLetter}` : ""}
                              </td>
                              <td style={{ ...td, color: "var(--text)" }}>{e.original.header}</td>
                              <td style={{ ...td, color: "var(--text-2)" }}>{e.kind}</td>
                              <td style={{ ...td, fontFamily: "var(--font-mono)", color: e.canonical ? "var(--text)" : "var(--text-3)" }}>
                                {e.canonical ?? "—"}
                              </td>
                              <td
                                style={{
                                  ...td,
                                  fontFamily: "var(--font-mono)",
                                  color:
                                    e.confidence >= 0.9
                                      ? "var(--positive)"
                                      : e.confidence >= 0.6
                                        ? "var(--warning)"
                                        : "var(--critical)",
                                }}
                              >
                                {Math.round(e.confidence * 100)}%
                              </td>
                              <td style={{ ...td, color: "var(--text-2)" }} title={e.reason}>
                                {e.resolvedBy}
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
                  </Card>
                )}
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
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 999,
        cursor: "pointer",
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
