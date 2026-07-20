"use client";

// Data Schema — how the ledger connects: inspection stages + defect catalog from
// the verified MOD catalog, plus per-file Data Entry schema and column mappings
// (moved here from Uploaded files).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app/AppShell";
import { Card, Empty } from "@/components/app/widgets";

interface Stage { stageId: string; label: string; upstream?: string[]; captures?: string[] }
interface Defect { defectCode: string; label: string; stages?: string[] }

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
    stages: Stage[];
    defects: Defect[];
    sizes: { sizeId: string; label: string }[];
  };
}

export default function SchemaPage() {
  const [reg, setReg] = useState<{ stages: Stage[]; defects: Defect[] }>({ stages: [], defects: [] });
  const [configured, setConfigured] = useState(false);
  const [workbooks, setWorkbooks] = useState<WorkbookRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModDetail | null>(null);
  const [sheetFilter, setSheetFilter] = useState<string | null>(null);
  const [tab, setTab] = useState<"entry" | "mappings">("entry");

  useEffect(() => {
    fetch("/api/schema")
      .then((r) => r.json())
      .then((b) => {
        if (b.registry) setReg({ stages: b.registry.stages ?? [], defects: b.registry.defects ?? [] });
        setConfigured(!!b.configured);
      })
      .catch(() => {});
    fetch("/api/workbooks")
      .then((r) => r.json())
      .then((d) => {
        const list: WorkbookRow[] = d.workbooks ?? [];
        setWorkbooks(list.filter((w) => w.mod));
        const first = list.find((w) => w.mod?.status === "verified") ?? list.find((w) => w.mod);
        if (first?.mod) setSelected(first.mod.modId);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return setDetail(null);
    setSheetFilter(null);
    fetch(`/api/mods?modId=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((d) => setDetail(d.mod ?? null))
      .catch(() => setDetail(null));
  }, [selected]);

  const entities = useMemo(() => {
    if (!detail) return [];
    const all = detail.document.entities;
    return sheetFilter ? all.filter((e) => e.original.sheet === sheetFilter) : all;
  }, [detail, sheetFilter]);

  const entryPreview = useMemo(() => {
    if (!detail) return [];
    return (detail.document.stages ?? []).map((s) => {
      const defs = (detail.document.defects ?? []).filter(
        (d) => !d.stages?.length || d.stages.includes(s.stageId),
      );
      const fromEnt = detail.document.entities
        .filter((e) => e.kind === "defect" && e.verified && e.canonical?.startsWith("DEFECT:"))
        .filter((e) => {
          const code = e.canonical!.slice("DEFECT:".length);
          const cat = detail.document.defects?.find((d) => d.defectCode === code);
          return cat?.stages?.includes(s.stageId) || defs.some((d) => d.defectCode === code);
        });
      return {
        stageId: s.stageId,
        label: s.label,
        captures: s.captures ?? [],
        defects:
          fromEnt.length > 0
            ? [...new Set(fromEnt.map((e) => e.canonical!.slice("DEFECT:".length)))]
            : defs.map((d) => d.defectCode),
      };
    });
  }, [detail]);

  return (
    <AppShell active="schema">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>Data Schema</h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            How the ledger connects — inspection stages, the defect catalog, and how each uploaded file’s columns were interpreted.{" "}
            {configured ? "Showing your verified schema." : (
              <>Nothing verified yet — <Link href="/staging" style={{ color: "var(--accent)" }}>Import from Excel</Link> to build it.</>
            )}
          </p>
        </div>

        <Card title="Inspection Stages (process flow)">
          {reg.stages.length === 0 ? <Empty label="No stages yet" /> : (
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                  <th style={th}>Stage Id</th><th style={th}>Label</th><th style={th}>Captures</th><th style={th}>Feeds From</th>
                </tr>
              </thead>
              <tbody>
                {reg.stages.map((s) => (
                  <tr key={s.stageId} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{s.stageId}</td>
                    <td style={td}>{s.label}</td>
                    <td style={{ ...td, color: "var(--text-2)" }}>{(s.captures ?? []).join(", ") || "—"}</td>
                    <td style={{ ...td, color: "var(--text-2)" }}>{(s.upstream ?? []).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Defect Catalog">
          {reg.defects.length === 0 ? <Empty label="No defect codes yet" /> : (
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                  <th style={th}>Code</th><th style={th}>Label</th><th style={th}>Reported At Stages</th>
                </tr>
              </thead>
              <tbody>
                {reg.defects.map((d) => (
                  <tr key={d.defectCode} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{d.defectCode}</td>
                    <td style={td}>{d.label}</td>
                    <td style={{ ...td, color: "var(--text-2)" }}>{(d.stages ?? []).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title="Per-file schema"
          sub="Data Entry columns and Excel column mappings learned from each uploaded workbook"
        >
          {workbooks.length === 0 ? (
            <Empty label="No uploaded files with a saved schema yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {workbooks.map((wb) => (
                  <FilterChip
                    key={wb.snapshotId}
                    label={wb.fileName}
                    active={selected === wb.mod!.modId}
                    onClick={() => setSelected(wb.mod!.modId)}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([["entry", "Data Entry schema"], ["mappings", "Column mappings"]] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
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

              {!detail ? (
                <Empty label="Select a file." />
              ) : tab === "entry" ? (
                entryPreview.length === 0 ? (
                  <Empty label="No stages on this schema yet — confirm mappings on Import." />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {entryPreview.map((s) => (
                      <div key={s.stageId} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                          {s.label}{" "}
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}>{s.stageId}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                          Captures: {s.captures.length ? s.captures.join(", ") : "—"}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {s.defects.length === 0 ? (
                            <span className="muted" style={{ fontSize: 12 }}>No defect columns mapped</span>
                          ) : (
                            s.defects.map((d) => (
                              <span key={d} style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--border)" }}>
                                {d}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                    <Link
                      href="/data-entry"
                      style={{ alignSelf: "flex-start", padding: "8px 14px", borderRadius: 8, background: "var(--accent)", color: "var(--text-invert)", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
                    >
                      Open Data Entry →
                    </Link>
                  </div>
                )
              ) : (
                <>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <FilterChip label="All sheets" active={sheetFilter === null} onClick={() => setSheetFilter(null)} />
                    {detail.document.workbook.sheetNames.map((sn) => (
                      <FilterChip key={sn} label={sn} active={sheetFilter === sn} onClick={() => setSheetFilter(sn)} />
                    ))}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                          <th style={th}>Source</th><th style={th}>Label</th><th style={th}>Kind</th>
                          <th style={th}>Canonical</th><th style={th}>Conf.</th><th style={th}>Basis</th><th style={th}>OK</th>
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
                            <td style={{ ...td, fontFamily: "var(--font-mono)", color: e.confidence >= 0.9 ? "var(--positive)" : e.confidence >= 0.6 ? "var(--warning)" : "var(--critical)" }}>
                              {Math.round(e.confidence * 100)}%
                            </td>
                            <td style={{ ...td, color: "var(--text-2)" }} title={e.reason}>{e.resolvedBy}</td>
                            <td style={td}>
                              {e.verified ? <span style={{ color: "var(--positive)", fontWeight: 700 }}>✓</span> : <span style={{ color: "var(--text-3)" }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>
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

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 10px", color: "var(--text)" };
