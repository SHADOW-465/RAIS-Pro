"use client";

// Data Schema — how the ledger connects: inspection stages + defect catalog from
// the verified MOD catalog, plus per-file Data Entry schema and column mappings
// (moved here from Uploaded files). Also surfaces open ledger integrity issues.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app/AppShell";
import { Card, Empty } from "@/components/app/widgets";
import { useEvents } from "@/components/app/EventsContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import {
  qualityStatus,
  resolveScope,
  integrityAuditHref,
  integrityFixHref,
  integrityIssueId,
  type IntegrityIssue,
} from "@/lib/analytics";

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
  const { events } = useEvents();
  const { t } = useTweaks();
  const [reg, setReg] = useState<{ stages: Stage[]; defects: Defect[] }>({ stages: [], defects: [] });
  const [configured, setConfigured] = useState(false);
  const [workbooks, setWorkbooks] = useState<WorkbookRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModDetail | null>(null);
  const [sheetFilter, setSheetFilter] = useState<string | null>(null);
  const [tab, setTab] = useState<"entry" | "mappings">("entry");

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

        {integrity.integrityIssues.length > 0 && (
          <IntegrityIssuesPanel
            blocked={integrity.state === "blocked"}
            reason={integrity.reason}
            issues={integrity.integrityIssues}
          />
        )}

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

/**
 * Open integrity issues as jumpable work objects.
 * Click → Audit trail focused on batch·stage·day. Secondary: Data Entry to fix.
 */
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
        <div style={{ fontWeight: 700, fontSize: 14, color: titleColor, letterSpacing: "-0.01em" }}>
          {blocked ? "Data integrity blocked — ledger is not OK" : "Open integrity warnings"}
        </div>
        {reason ? (
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, marginTop: 4 }}>{reason}</div>
        ) : null}
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6, lineHeight: 1.45 }}>
          {issues.length} open issue{issues.length === 1 ? "" : "s"}
          {critical > 0 ? ` · ${critical} critical` : ""}
          {" · "}
          Click an issue to jump to the exact batch and stage in the audit trail.
        </div>
      </div>

      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {issues.map((issue) => {
          const auditHref = integrityAuditHref(issue);
          const fixHref = integrityFixHref(issue);
          const locus = [issue.batch, issue.stageId, issue.date, issue.size].filter(Boolean).join(" · ");
          const sevColor = issue.severity === "critical" ? "var(--critical)" : "var(--warning)";
          const sevBg = issue.severity === "critical" ? "var(--critical-weak)" : "var(--warning-weak)";

          return (
            <li key={integrityIssueId(issue)}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-1)",
                }}
              >
                <Link
                  href={auditHref}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: sevBg,
                        color: sevColor,
                        border: `1px solid color-mix(in srgb, ${sevColor} 30%, var(--border))`,
                      }}
                    >
                      {issue.code}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: sevColor,
                      }}
                    >
                      {issue.severity}
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
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--accent)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Open in audit →
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.45, fontWeight: 500 }}>
                    {issue.message}
                  </div>
                  {(issue.stated != null || issue.computed != null) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
                      {issue.stated != null && (
                        <span
                          style={{
                            fontSize: 12,
                            fontFamily: "var(--font-mono)",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 8,
                            background: "var(--surface-2)",
                            color: "var(--text-2)",
                          }}
                        >
                          Stated {issue.stated.toLocaleString()}
                        </span>
                      )}
                      {issue.computed != null && (
                        <span
                          style={{
                            fontSize: 12,
                            fontFamily: "var(--font-mono)",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 8,
                            background: "var(--critical-weak)",
                            color: "var(--critical)",
                          }}
                        >
                          Computed {issue.computed.toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignItems: "center",
                    paddingTop: 2,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <Link
                    href={auditHref}
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
                  >
                    See evidence in audit trail
                  </Link>
                  {fixHref && (
                    <Link
                      href={fixHref}
                      style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textDecoration: "none" }}
                    >
                      Fix in Data Entry
                    </Link>
                  )}
                  <Link
                    href="/staging"
                    style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)", textDecoration: "none" }}
                  >
                    Staging
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
