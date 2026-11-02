"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import AppShell from "@/components/app/AppShell";
import { usePersona } from "@/components/app/PersonaContext";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import DefectRemedyShowcase from "@/components/DefectRemedyShowcase";
import {
  catalogDefects,
  isRemedyComplete,
  lookupRemedy,
  publishUnpublishedLocal,
  refreshRemedies,
  resolveRemedyKey,
  saveDefectRemedy,
  saveTrendNote,
  removeTrendNote,
  useRemedySync,
  type TrendNote,
} from "@/lib/remedy-store";
import { byDefect, resolveScope } from "@/lib/analytics";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";

export default function RemediesPage() {
  const { canConfigure } = usePersona();
  const canEdit = canConfigure;
  const { book, source, error, unpublishedLocal } = useRemedySync();
  const { events } = useEvents();
  const { registry, policy } = useRegistry();
  const { t } = useTweaks();
  const [tab, setTab] = useState<"defects" | "trends">("defects");
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [desc, setDesc] = useState("");
  const [remedy, setRemedy] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingTrend, setSavingTrend] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [trendKind, setTrendKind] = useState<"spike" | "dip">("spike");
  const [trendGraph, setTrendGraph] = useState("Rejection trend");
  const [trendPeriod, setTrendPeriod] = useState("");
  const [trendDesc, setTrendDesc] = useState("");
  const [trendRemedy, setTrendRemedy] = useState("");
  const openedFromQuery = useRef(false);

  const catalog = useMemo(() => {
    const authored = catalogDefects();
    const extra = (registry?.defects ?? []).filter(
      (d: { defectCode: string }) => !authored.some((a) => a.code === d.defectCode),
    );
    return [
      ...authored,
      ...extra.map((d: { defectCode: string; label: string; stages: string[] }) => ({
        code: d.defectCode,
        label: d.label,
        stages: d.stages,
      })),
    ];
  }, [registry]);

  const ranked = useMemo(() => {
    if (!events?.length) return catalog.slice(0, 3).map((d) => ({ code: d.code, label: d.label }));
    const scope = resolveScope(events as never[], t, policy);
    const rows = byDefect(events as never[], scope, registry || EMPTY_REGISTRY);
    return rows.slice(0, 3).map((d) => ({
      code: d.defectCode || d.label,
      label: d.label,
    }));
  }, [events, t, policy, registry, catalog]);

  const filtered = catalog.filter((d) => {
    const rec = lookupRemedy(book, d.code);
    if (onlyMissing && isRemedyComplete(rec)) return false;
    const hay = `${d.code} ${d.label}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  const filled = catalog.filter((d) => isRemedyComplete(lookupRemedy(book, d.code))).length;

  function openDefect(code: string) {
    const rec = lookupRemedy(book, code);
    setActive(code);
    setDesc(rec?.description ?? "");
    setRemedy(rec?.remedy ?? "");
    setSavedNote(null);
    setSaveError(null);
  }

  useEffect(() => {
    if (openedFromQuery.current) return;
    if (source === "loading") return;
    const raw = new URLSearchParams(window.location.search).get("code");
    if (!raw) return;
    const key = resolveRemedyKey(raw);
    if (!catalog.some((d) => d.code === key)) return;
    openedFromQuery.current = true;
    openDefect(key);
    // catalog/book settle after the plant book loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, book, source]);

  async function saveActive() {
    if (!active || !canEdit || saving) return;
    setSaving(true);
    setSavedNote(null);
    setSaveError(null);
    try {
      await saveDefectRemedy(active, { description: desc, remedy });
      setSavedNote("Saved to the plant book.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "The plant book rejected this save.");
    } finally {
      setSaving(false);
    }
  }

  async function addTrend() {
    if (!canEdit || savingTrend) return;
    if (!trendDesc.trim() || !trendRemedy.trim()) return;
    setSavingTrend(true);
    setSaveError(null);
    try {
      await saveTrendNote({
        kind: trendKind,
        graph: trendGraph,
        period: trendPeriod,
        description: trendDesc,
        remedy: trendRemedy,
      });
      setTrendDesc("");
      setTrendRemedy("");
      setTrendPeriod("");
      setSavedNote("Saved to the plant book.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "The plant book rejected this save.");
    } finally {
      setSavingTrend(false);
    }
  }

  async function publishLocal() {
    if (!canEdit || publishing || !unpublishedLocal) return;
    setPublishing(true);
    setSaveError(null);
    try {
      await publishUnpublishedLocal();
      setSavedNote("Unpublished drafts were written to the plant book.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not publish local drafts.");
    } finally {
      setPublishing(false);
    }
  }

  const activeMeta = catalog.find((d) => d.code === active);

  return (
    <AppShell active="remedies">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100 }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 600,
              margin: "0 0 4px",
              color: "var(--text)",
            }}
          >
            Defect remedies
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0, maxWidth: "72ch" }}>
            Feed an explanation and a remedy for every defect. Saved feeds live in the
            plant book, so every authorized user sees the same record on every computer.
            The dashboard Top Defects showcase then names Primary, Secondary, and Tertiary
            from live ranking.
          </p>
        </div>

        {!canEdit && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>
            View only. A role with configure access writes descriptions and remedies.
          </p>
        )}

        {source === "loading" && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Loading plant remedies…
          </p>
        )}
        {(source === "error" || source === "unavailable") && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--warning)",
              background: "var(--warning-weak)",
              color: "var(--text)",
              fontSize: 13,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <span>{error || "Plant remedies could not be loaded from the central book."}</span>
            <button type="button" onClick={() => refreshRemedies()} style={{ ...saveBtn, padding: "6px 10px" }}>
              Retry
            </button>
          </div>
        )}
        {unpublishedLocal && canEdit && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              fontSize: 13,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <span>
              This browser has unpublished drafts that are not in the plant book.
              Publish them to share with other users.
            </span>
            <button type="button" onClick={() => void publishLocal()} disabled={publishing} style={saveBtn}>
              {publishing ? "Publishing…" : "Publish local drafts"}
            </button>
          </div>
        )}

        <DefectRemedyShowcase ranked={ranked} />

        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {filled} of {catalog.length} defects have both a description and a remedy.
        </p>

        <div style={{ display: "flex", gap: 6 }}>
          {(["defects", "trends"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: tab === id ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                background: tab === id ? "var(--accent-weak)" : "var(--surface-2)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                color: "var(--text)",
              }}
            >
              {id === "defects" ? "Every defect" : "Graph spikes & dips"}
            </button>
          ))}
        </div>

        {tab === "defects" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(240px, 320px) minmax(0, 1fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: 12,
                boxShadow: "var(--shadow-1)",
              }}
            >
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find defect…"
                aria-label="Find defect"
                style={inputStyle}
              />
              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 12.5,
                  margin: "10px 0 8px",
                  color: "var(--text-2)",
                }}
              >
                <input
                  type="checkbox"
                  checked={onlyMissing}
                  onChange={(e) => setOnlyMissing(e.target.checked)}
                />
                Missing feed only
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 520, overflowY: "auto" }}>
                {filtered.map((d) => {
                  const ready = isRemedyComplete(lookupRemedy(book, d.code));
                  const on = active === d.code;
                  return (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => openDefect(d.code)}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: on ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                        background: on ? "var(--accent-weak)" : "var(--surface-2)",
                        cursor: "pointer",
                        color: "var(--text)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{d.code}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: ready ? "var(--positive)" : "var(--warning)" }}>
                          {ready ? "Fed" : "Needs feed"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-2)" }}>{d.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: 18,
                boxShadow: "var(--shadow-1)",
                minHeight: 360,
              }}
            >
              {!active ? (
                <p className="muted" style={{ fontSize: 13 }}>
                  Select a defect. Write what it is, then the remedy the line should follow.
                </p>
              ) : (
                <>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600 }}>{active}</div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14 }}>{activeMeta?.label}</div>
                  <label style={labelStyle}>Explanatory description</label>
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    disabled={!canEdit}
                    rows={5}
                    placeholder="What this defect is on the line, in plant language…"
                    style={areaStyle}
                  />
                  <label style={{ ...labelStyle, marginTop: 12 }}>Remedy</label>
                  <textarea
                    value={remedy}
                    onChange={(e) => setRemedy(e.target.value)}
                    disabled={!canEdit}
                    rows={6}
                    placeholder="What the operator / process should do when this defect is the issue…"
                    style={areaStyle}
                  />
                  {canEdit && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => void saveActive()} disabled={saving} style={saveBtn}>
                        {saving ? "Saving…" : "Save feed"}
                      </button>
                      {savedNote && !saveError && (
                        <span style={{ fontSize: 13, color: "var(--positive)" }}>{savedNote}</span>
                      )}
                      {saveError && (
                        <>
                          <span style={{ fontSize: 13, color: "var(--critical)" }}>{saveError}</span>
                          <button
                            type="button"
                            onClick={() => active && openDefect(active)}
                            style={{ ...saveBtn, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                          >
                            Load latest
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === "trends" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)", gap: 16 }}>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: 18,
                boxShadow: "var(--shadow-1)",
              }}
            >
              <h2 className="h3" style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>
                Record a spike or dip
              </h2>
              <label style={labelStyle}>Kind</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {(["spike", "dip"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setTrendKind(k)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: trendKind === k ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                      background: trendKind === k ? "var(--accent-weak)" : "var(--surface-2)",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: canEdit ? "pointer" : "default",
                      color: "var(--text)",
                      textTransform: "capitalize",
                    }}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <label style={labelStyle}>Graph</label>
              <input
                value={trendGraph}
                onChange={(e) => setTrendGraph(e.target.value)}
                disabled={!canEdit}
                placeholder="Rejection trend, HOLD, COPQ…"
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              <label style={labelStyle}>Period</label>
              <input
                value={trendPeriod}
                onChange={(e) => setTrendPeriod(e.target.value)}
                disabled={!canEdit}
                placeholder="e.g. 4 Aug 2026"
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              <label style={labelStyle}>What happened</label>
              <textarea
                value={trendDesc}
                onChange={(e) => setTrendDesc(e.target.value)}
                disabled={!canEdit}
                rows={4}
                placeholder="Describe the spike or dip in plant language…"
                style={areaStyle}
              />
              <label style={{ ...labelStyle, marginTop: 10 }}>Remedy</label>
              <textarea
                value={trendRemedy}
                onChange={(e) => setTrendRemedy(e.target.value)}
                disabled={!canEdit}
                rows={4}
                placeholder="What to do about it…"
                style={areaStyle}
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void addTrend()}
                  disabled={savingTrend}
                  style={{ ...saveBtn, marginTop: 12 }}
                >
                  {savingTrend ? "Saving…" : "Save note"}
                </button>
              )}
              {tab === "trends" && saveError && (
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--critical)" }}>{saveError}</p>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {book.trends.length === 0 && (
                <p className="muted" style={{ fontSize: 13 }}>
                  No spike or dip notes yet.
                </p>
              )}
              {book.trends.map((n: TrendNote) => (
                <article
                  key={n.id}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: 14,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: n.kind === "spike" ? "var(--critical)" : "var(--positive)",
                      }}
                    >
                      {n.kind} · {n.graph}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => void removeTrendNote(n.id)}
                        style={{
                          border: "none",
                          background: "none",
                          color: "var(--text-3)",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {n.period && (
                    <div style={{ fontSize: 12, color: "var(--text-3)", margin: "4px 0" }}>{n.period}</div>
                  )}
                  <p style={{ margin: "6px 0", fontSize: 13, lineHeight: 1.5 }}>{n.description}</p>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--text-2)" }}>
                    <strong style={{ color: "var(--text)" }}>Remedy. </strong>
                    {n.remedy}
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontSize: 13,
  boxSizing: "border-box",
};
const areaStyle: CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  lineHeight: 1.5,
  resize: "vertical",
  boxSizing: "border-box",
};
const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-2)",
  marginBottom: 4,
};
const saveBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--on-accent)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
