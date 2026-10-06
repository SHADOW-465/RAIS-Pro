"use client";
// Staging verification panel (MOD pipeline, rung 6 — ADD §11).
// When plant schema is configured: match existing catalog; novel stages/defects/
// sizes require explicit operator accept before they enter company_catalog.
// Paginated proposals + sticky confirm.

import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { MappingProposalT } from "@/shared/models/entities";
import type { CatalogDiff } from "@/core/ontology/catalog-diff";
import { useRegistry } from "@/components/app/RegistryContext";

export interface UploadedMod {
  modId: string;
  version: number;
  fileName: string;
  proposals: MappingProposalT[];
  catalogDiff?: CatalogDiff;
}

const PAGE_SIZE = 20;

/** sheet::tableId — the unit that carries exactly one stage. */
const regionOf = (p: MappingProposalT) => `${p.original.sheet}::${p.original.tableId ?? "t1"}`;

/** Human name for a region: the stage the steward resolved for it, else the
 *  block's own header text, else just the sheet. */
function regionLabelFor(mod: { proposals: MappingProposalT[] }, p: MappingProposalT): string {
  const stage = mod.proposals.find(
    (x) => regionOf(x) === regionOf(p) && x.kind === "stage",
  );
  const canonical = stage?.canonical?.startsWith("STAGE:") ? stage.canonical.slice("STAGE:".length) : null;
  if (canonical) return canonical.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return stage?.original.header?.trim() || p.original.sheet;
}

/** The stage proposal carries the region's arithmetic evidence. */
function regionEvidence(mod: { proposals: MappingProposalT[] }, p: MappingProposalT) {
  const stage = mod.proposals.find((x) => regionOf(x) === regionOf(p) && x.kind === "stage");
  return stage?.evidence ?? null;
}

function confidenceTone(score: number): { label: string; color: string } {
  if (score >= 0.9) return { label: `${Math.round(score * 100)}%`, color: "var(--positive)" };
  if (score >= 0.6) return { label: `${Math.round(score * 100)}%`, color: "var(--warning)" };
  return { label: score > 0 ? `${Math.round(score * 100)}%` : "—", color: "var(--critical)" };
}

const pgBtn = (disabled: boolean): CSSProperties => ({
  padding: "4px 10px",
  fontSize: 11.5,
  fontWeight: 700,
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  background: "var(--surface)",
  color: "var(--text-2)",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.4 : 1,
});

function toggleId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export default function MappingVerificationPanel({
  mods,
  onPublished,
}: {
  mods: UploadedMod[];
  onPublished?: (modId: string, version: number) => void;
}) {
  const { refreshRegistry } = useRegistry();
  // entityId -> edited canonical (an edit = override; untouched = accept).
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, { learned: number; novelAdded: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [activeModId, setActiveModId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<"all" | "low" | "unresolved">("all");
  // Novel catalog entities the operator opts to add to Plant Schema.
  const [acceptStages, setAcceptStages] = useState<Set<string>>(new Set());
  const [acceptDefects, setAcceptDefects] = useState<Set<string>>(new Set());
  const [acceptSizes, setAcceptSizes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (mods.length === 0) {
      setActiveModId(null);
      return;
    }
    setActiveModId((cur) => (cur && mods.some((m) => m.modId === cur) ? cur : mods[0].modId));
    setPage(0);
    // Reset novel accepts when the upload set changes.
    setAcceptStages(new Set());
    setAcceptDefects(new Set());
    setAcceptSizes(new Set());
  }, [mods]);

  const activeMod = useMemo(
    () => mods.find((m) => m.modId === activeModId) ?? mods[0] ?? null,
    [mods, activeModId],
  );

  const filtered = useMemo(() => {
    if (!activeMod) return [];
    return activeMod.proposals.filter((p) => {
      if (filter === "low") return p.confidence < 0.9;
      if (filter === "unresolved") return !p.canonical && !(edits[p.entityId]?.trim());
      return true;
    });
  }, [activeMod, filter, edits]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageSlice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const lowCount = activeMod?.proposals.filter((p) => p.confidence < 0.9).length ?? 0;
  const unresolvedCount =
    activeMod?.proposals.filter((p) => !p.canonical && !(edits[p.entityId]?.trim())).length ?? 0;

  const diff = activeMod?.catalogDiff;
  const novel = diff?.novel;
  const novelTotal =
    (novel?.stages.length ?? 0) +
    (novel?.defects.length ?? 0) +
    (novel?.sizes.length ?? 0);
  const plantConfigured = diff?.plantConfigured ?? false;

  async function publish(mod: UploadedMod) {
    setBusy(mod.modId);
    setError(null);
    try {
      const decisions = mod.proposals.map((p) => {
        const edited = edits[p.entityId];
        const isEdited = edited !== undefined && edited !== (p.canonical ?? "");
        return isEdited
          ? {
              entityId: p.entityId,
              action: "override" as const,
              canonical: edited.trim() || null,
              kind: null,
              comment: null,
            }
          : {
              entityId: p.entityId,
              action: "accept" as const,
              canonical: null,
              kind: null,
              comment: null,
            };
      });
      const vRes = await fetch("/api/mods/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modId: mod.modId, version: mod.version, decisions }),
      });
      if (!vRes.ok) throw new Error((await vRes.json()).error ?? "verify failed");

      const acceptNovel = plantConfigured
        ? {
            stageIds: [...acceptStages],
            defectCodes: [...acceptDefects],
            sizeIds: [...acceptSizes],
          }
        : null;

      const pRes = await fetch("/api/mods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modId: mod.modId,
          version: mod.version,
          acceptNovel,
        }),
      });
      const pData = await pRes.json();
      if (!pRes.ok) {
        throw new Error(
          pData.details ? `${pData.error}: ${pData.details.join("; ")}` : pData.error ?? "publish failed",
        );
      }

      const novelAdded =
        (acceptNovel?.stageIds.length ?? 0) +
        (acceptNovel?.defectCodes.length ?? 0) +
        (acceptNovel?.sizeIds.length ?? 0);

      setDone((d) => ({
        ...d,
        [mod.modId]: { learned: pData.learnedMappings ?? 0, novelAdded },
      }));
      // Plant Schema / Data Entry template read the catalog — refresh now.
      await refreshRegistry({ force: true }).catch(() => {});
      onPublished?.(mod.modId, mod.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(null);
    }
  }

  if (mods.length === 0) return null;

  const published = activeMod ? done[activeMod.modId] : undefined;
  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min((safePage + 1) * PAGE_SIZE, filtered.length);

  return (
    <section
      id="mapping-verify"
      className="import-verify"
      style={{
        border: "1.5px solid color-mix(in srgb, var(--accent) 35%, var(--border))",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-2)",
        display: "flex",
        flexDirection: "column",
        maxHeight: "min(78vh, 720px)",
        minHeight: 280,
        overflow: "hidden",
        marginBottom: 18,
      }}
    >
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--accent) 5%, var(--surface))",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "var(--accent)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Match columns
            </div>
            <h3 className="h3" style={{ color: "var(--text)", margin: 0 }}>
              Confirm Excel → plant meanings
            </h3>
            <p className="small" style={{ color: "var(--text-3)", margin: "4px 0 0", lineHeight: 1.45, maxWidth: "62ch" }}>
              {plantConfigured
                ? "Your Plant Schema is already loaded. Headers are matched to existing stages and defects — not re-extracted as a new schema. New codes below need your OK before they appear on Plant Schema."
                : "Accept or fix each Excel header, then load numbers into the ledger."}
            </p>
          </div>
          {activeMod && !published && (
            <button
              type="button"
              onClick={() => publish(activeMod)}
              disabled={busy !== null}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "var(--text-invert)",
                cursor: busy ? "wait" : "pointer",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: "0 2px 8px color-mix(in srgb, var(--accent) 30%, transparent)",
              }}
            >
              {busy === activeMod.modId ? "Loading numbers…" : "Confirm & load numbers"}
            </button>
          )}
          {published && (
            <span className="small" style={{ color: "var(--positive)", fontWeight: 700, alignSelf: "center" }}>
              Mappings saved ({published.learned} learned
              {published.novelAdded ? `, ${published.novelAdded} new schema` : ""}) · loading numbers…
            </span>
          )}
        </div>

        {error && (
          <p className="small" role="alert" style={{ color: "var(--critical)", margin: "10px 0 0" }}>
            {error}
          </p>
        )}

        {/* Novel schema — only when plant is configured and workbook has new codes */}
        {plantConfigured && novelTotal > 0 && !published && novel && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1.5px solid var(--warning)",
              background: "var(--warning-weak)",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", marginBottom: 4 }}>
              New fields not in Plant Schema
            </div>
            <p className="small" style={{ margin: "0 0 10px", color: "var(--text-2)", lineHeight: 1.45 }}>
              These were found in the Excel but are not on your master catalog yet.
              Tick to <strong>add them to Plant Schema</strong> (they show on{" "}
              <a href="/schema" style={{ color: "var(--accent)", fontWeight: 700 }}>
                Plant Schema
              </a>{" "}
              immediately after confirm). Leave unticked to load numbers without changing the master schema.
            </p>
            {novel.stages.length > 0 && (
              <NovelGroup
                title="Stages"
                items={novel.stages.map((s) => ({
                  id: s.stageId,
                  label: s.label || s.stageId,
                  sub: s.stageId,
                }))}
                selected={acceptStages}
                onToggle={(id) => setAcceptStages((s) => toggleId(s, id))}
              />
            )}
            {novel.defects.length > 0 && (
              <NovelGroup
                title="Defects"
                items={novel.defects.map((d) => ({
                  id: d.defectCode,
                  label: d.label || d.defectCode,
                  sub: d.defectCode,
                }))}
                selected={acceptDefects}
                onToggle={(id) => setAcceptDefects((s) => toggleId(s, id))}
              />
            )}
            {novel.sizes.length > 0 && (
              <NovelGroup
                title="Sizes"
                items={novel.sizes.map((s) => ({
                  id: s.sizeId,
                  label: s.label || s.sizeId,
                  sub: s.sizeId,
                }))}
                selected={acceptSizes}
                onToggle={(id) => setAcceptSizes((s) => toggleId(s, id))}
              />
            )}
          </div>
        )}

        {plantConfigured && novelTotal === 0 && diff && (
          <p className="small" style={{ margin: "10px 0 0", color: "var(--positive)", fontWeight: 600 }}>
            All resolved stages/defects/sizes already match Plant Schema
            {diff.summary.matchedStageCount || diff.summary.matchedDefectCount
              ? ` (${diff.summary.matchedStageCount} stages · ${diff.summary.matchedDefectCount} defects)`
              : ""}
            .
          </p>
        )}
      </div>

      {/* File tabs when multi-upload */}
      {mods.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          {mods.map((m) => (
            <button
              key={m.modId}
              type="button"
              onClick={() => {
                setActiveModId(m.modId);
                setPage(0);
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid var(--border-strong)",
                background: m.modId === activeModId ? "var(--accent-weak)" : "var(--surface)",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {m.fileName}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(
          [
            { id: "all" as const, lab: "All" },
            { id: "low" as const, lab: `Low confidence (${lowCount})` },
            { id: "unresolved" as const, lab: `Unresolved (${unresolvedCount})` },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setFilter(f.id);
              setPage(0);
            }}
            style={{
              ...pgBtn(false),
              background: filter === f.id ? "var(--accent-weak)" : "var(--surface)",
              borderColor: filter === f.id ? "var(--accent)" : "var(--border-strong)",
            }}
          >
            {f.lab}
          </button>
        ))}
        <span className="small" style={{ marginLeft: "auto", color: "var(--text-3)" }}>
          {from}–{to} of {filtered.length}
        </span>
      </div>

      {/* Proposal table */}
      <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)", position: "sticky", top: 0, zIndex: 1 }}>
              {["Sheet / region", "Excel header", "Maps to", "Confidence", "Why"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--border)",
                    fontWeight: 700,
                    color: "var(--text-2)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageSlice.map((p) => {
              const tone = confidenceTone(p.confidence);
              const value = edits[p.entityId] !== undefined ? edits[p.entityId] : (p.canonical ?? "");
              return (
                <tr key={p.entityId} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", color: "var(--text-3)", maxWidth: 140 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-2)" }}>
                      {regionLabelFor(activeMod!, p)}
                    </div>
                    <div style={{ fontSize: 11 }}>{p.original.sheet}</div>
                  </td>
                  <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                    {p.original.header || "—"}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <input
                      value={value}
                      onChange={(e) =>
                        setEdits((prev) => ({ ...prev, [p.entityId]: e.target.value }))
                      }
                      placeholder="canonical id"
                      style={{
                        width: "100%",
                        minWidth: 120,
                        border: "1px solid var(--border-strong)",
                        borderRadius: 6,
                        padding: "6px 8px",
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    />
                  </td>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: tone.color }}>
                    {tone.label}
                  </td>
                  <td style={{ padding: "8px 10px", color: "var(--text-3)", maxWidth: 220 }}>
                    {p.reason || "—"}
                    {regionEvidence(activeMod!, p) ? (
                      <div style={{ fontSize: 10.5, marginTop: 2 }}>
                        {String((regionEvidence(activeMod!, p) as { note?: string } | null)?.note ?? "")}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {pageSlice.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text-3)" }}>
                  No mappings in this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--surface-2)",
        }}
      >
        <button
          type="button"
          disabled={safePage <= 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          style={pgBtn(safePage <= 0)}
        >
          Prev
        </button>
        <span className="small" style={{ color: "var(--text-3)" }}>
          Page {safePage + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages - 1}
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          style={pgBtn(safePage >= totalPages - 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

function NovelGroup({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { id: string; label: string; sub: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((it) => (
          <label
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: selected.has(it.id) ? "var(--surface)" : "transparent",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(it.id)}
              onChange={() => onToggle(it.id)}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 13, display: "block" }}>{it.label}</span>
              <span
                className="small"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
              >
                {it.sub}
              </span>
            </span>
            <span
              className="small"
              style={{
                marginLeft: "auto",
                fontWeight: 700,
                color: selected.has(it.id) ? "var(--positive)" : "var(--text-3)",
              }}
            >
              {selected.has(it.id) ? "Add to schema" : "Skip"}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
