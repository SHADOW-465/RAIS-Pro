"use client";

import { useEffect, useMemo, useState } from "react";
import { toStageRecords } from "@/lib/dataset/to-stage-records";
import { useEvents } from "@/components/app/EventsContext";
import type { Dataset, DatasetRow } from "@/lib/dataset/types";

const today = () => new Date().toISOString().slice(0, 10);

const MANUAL_ENTRY_FILE = "Manual Entry";

/** Humanize a normalized column name for a form label, e.g. "quantity checked"
 *  -> "Quantity Checked". Purely cosmetic — column.name (unlabeled) stays the
 *  key used when reading/writing values. */
function humanize(name: string): string {
  return name.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Schema-driven data-entry form for ANY persisted Dataset (Plan 8 / component
 *  [G]). Lets a user key in one new row for a Dataset without editing Excel —
 *  reuses the existing /api/datasets POST (Plan 3/4) for persistence and
 *  toStageRecords + /api/ingest (Plan 7) for the optional publish step. */
export default function DatasetEntryForm() {
  const { refreshEvents } = useEvents();
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");

  const [existingRows, setExistingRows] = useState<DatasetRow[] | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);

  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savedRow, setSavedRow] = useState<DatasetRow | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/datasets")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load datasets (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setDatasets((json.datasets ?? []) as Dataset[]);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message ?? "Failed to load datasets");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dataset = useMemo(
    () => datasets?.find((d) => d.id === selectedId) ?? null,
    [datasets, selectedId],
  );

  // Reset per-dataset state whenever the selection changes.
  useEffect(() => {
    setValues({});
    setExistingRows(null);
    setError(null);
    setSuccess(null);
    setSavedRow(null);
    setPublishMsg(null);
    if (!dataset) return;

    const dateCol = dataset.columns.find((c) => c.role === "dimension-date");
    setValues(dateCol ? { [dateCol.name]: today() } : {});

    setRowsLoading(true);
    fetch(`/api/datasets?datasetId=${encodeURIComponent(dataset.id)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load rows (${r.status})`);
        return r.json();
      })
      .then((json) => setExistingRows((json.rows ?? []) as DatasetRow[]))
      .catch((err) => setError(err?.message ?? "Failed to load existing rows"))
      .finally(() => setRowsLoading(false));
  }, [dataset]);

  // Existing distinct values per dimension column, for the dropdown nicety
  // (only offered when the dataset already has a small, known set of values).
  const dimensionOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    if (!dataset || !existingRows) return out;
    for (const col of dataset.columns) {
      if (col.role !== "dimension") continue;
      const seen = new Set<string>();
      for (const row of existingRows) {
        const v = row.values[col.name];
        if (v != null && v !== "") seen.add(String(v));
        if (seen.size > 8) break;
      }
      if (seen.size > 0 && seen.size <= 8) out[col.name] = Array.from(seen).sort();
    }
    return out;
  }, [dataset, existingRows]);

  const setField = (name: string, val: string) => {
    setValues((prev) => ({ ...prev, [name]: val }));
  };

  async function handleSave() {
    if (!dataset) return;
    setError(null);
    setSuccess(null);
    setSavedRow(null);
    setPublishMsg(null);

    const dateCol = dataset.columns.find((c) => c.role === "dimension-date");
    if (dateCol && !values[dateCol.name]) {
      setError("Date is required.");
      return;
    }

    setSaving(true);
    try {
      const manualRows = (existingRows ?? []).filter((r) => r.fileName === MANUAL_ENTRY_FILE);
      const nextRowIndex = manualRows.length > 0 ? Math.max(...manualRows.map((r) => r.rowIndex)) + 1 : 0;

      const rowValues: Record<string, string | number | null> = {};
      for (const col of dataset.columns) {
        if (col.role === "derived" || col.role === "meta") continue;
        const raw = values[col.name];
        if (raw === undefined || raw === "") {
          rowValues[col.name] = null;
          continue;
        }
        rowValues[col.name] = col.role === "dimension-date" || col.role === "dimension" ? raw : Number(raw);
      }

      const newRow: DatasetRow = {
        datasetId: dataset.id,
        fileName: MANUAL_ENTRY_FILE,
        sheetName: dataset.title,
        rowIndex: nextRowIndex,
        values: rowValues,
      };

      const res = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasets: [dataset], rows: [newRow] }),
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error ?? `Save failed (${res.status})`);
      }

      setSuccess(`New row saved to "${dataset.title}".`);
      setSavedRow(newRow);
      setExistingRows((prev) => [...(prev ?? []), newRow]);

      const dateColReset = dataset.columns.find((c) => c.role === "dimension-date");
      setValues(dateColReset ? { [dateColReset.name]: today() } : {});
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!dataset || !savedRow) return;
    setPublishing(true);
    setPublishMsg(null);
    try {
      const ingestionId = globalThis.crypto?.randomUUID?.() ?? `ing-${Date.now()}`;
      const records = toStageRecords(dataset, [savedRow], ingestionId);
      if (records.length === 0) {
        setPublishMsg({ tone: "err", text: "Nothing to publish — row has no valid date." });
        return;
      }
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ingestionId, fileName: dataset.title, records }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Ingest failed (${res.status})`);
      const issues = (json.issues ?? []).length;
      setPublishMsg({
        tone: "ok",
        text: `Published — ${json.inserted} new, ${json.deduped} already present${issues ? `, ${issues} clarification${issues === 1 ? "" : "s"} raised` : ""}.`,
      });
      refreshEvents().catch(console.error);
    } catch (e: any) {
      setPublishMsg({ tone: "err", text: e?.message ?? "Publish failed" });
    } finally {
      setPublishing(false);
    }
  }

  if (loadError) {
    return (
      <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", border: "1px solid var(--status-bad)", color: "var(--status-bad)", fontSize: 13 }}>
        {loadError}
      </div>
    );
  }

  if (!datasets) {
    return <p className="muted" style={{ fontSize: 13 }}>Loading datasets…</p>;
  }

  if (datasets.length === 0) {
    return <p className="muted" style={{ fontSize: 13 }}>No persisted Datasets yet — upload a workbook via Staging first.</p>;
  }

  const enterableCols = dataset
    ? dataset.columns.filter((c) => c.role !== "derived" && c.role !== "meta")
    : [];

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, maxWidth: 640 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Custom Datasets — Manual Row Entry</div>

      <label style={{ display: "block", marginBottom: 16 }}>
        <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Dataset</div>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
        >
          <option value="">Select a dataset…</option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
      </label>

      {success && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 9, background: "var(--positive-weak)", border: "1px solid var(--positive)", color: "var(--positive)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "var(--positive)", fontWeight: 700 }}>&times;</button>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", border: "1px solid var(--status-bad)", color: "var(--status-bad)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "var(--status-bad)", fontWeight: 700 }}>&times;</button>
        </div>
      )}

      {dataset && (
        <>
          {rowsLoading && <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Loading existing rows…</p>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
            {enterableCols.map((col) => {
              const options = dimensionOptions[col.name];
              return (
                <label key={col.name} style={{ display: "block" }}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{humanize(col.name)}</div>
                  {col.role === "dimension-date" ? (
                    <input
                      type="date"
                      value={values[col.name] ?? ""}
                      onChange={(e) => setField(col.name, e.target.value)}
                      style={inp}
                    />
                  ) : col.role === "dimension" && options ? (
                    <select
                      value={values[col.name] ?? ""}
                      onChange={(e) => setField(col.name, e.target.value)}
                      style={inp}
                    >
                      <option value="">Select…</option>
                      {options.map((o) => <option key={o} value={o}>{o}</option>)}
                      <option value="__other__">Other…</option>
                    </select>
                  ) : col.role === "dimension" ? (
                    <input
                      type="text"
                      value={values[col.name] ?? ""}
                      onChange={(e) => setField(col.name, e.target.value)}
                      style={inp}
                    />
                  ) : (
                    <input
                      type="number"
                      value={values[col.name] ?? ""}
                      onChange={(e) => setField(col.name, e.target.value)}
                      placeholder="0"
                      style={{ ...inp, fontFamily: "var(--font-mono)" }}
                    />
                  )}
                  {col.role === "dimension" && options && values[col.name] === "__other__" && (
                    <input
                      type="text"
                      placeholder="Enter value"
                      onChange={(e) => setField(col.name, e.target.value)}
                      style={{ ...inp, marginTop: 6 }}
                    />
                  )}
                </label>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ ...primary, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Saving…" : "Save Row"}
            </button>
          </div>

          {savedRow && dataset.recognizedStageId && (
            <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>Recognized dataset — publish this row to the Cumulative Dashboard?</span>
              <button
                onClick={handlePublish}
                disabled={publishing}
                style={{
                  fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12,
                  cursor: publishing ? "wait" : "pointer", color: "var(--paper)",
                  background: "var(--accent)", border: "none", padding: "6px 14px",
                  borderRadius: "var(--radius-sm)", opacity: publishing ? 0.6 : 1,
                }}
              >
                {publishing ? "Publishing…" : "Publish to Cumulative Dashboard →"}
              </button>
              {publishMsg && (
                <span style={{ fontSize: 12, fontWeight: 600, color: publishMsg.tone === "ok" ? "var(--positive)" : "var(--critical)" }}>
                  {publishMsg.text}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const primary: React.CSSProperties = {
  background: "var(--status-good)",
  color: "#fff",
  border: "none",
  borderRadius: 9,
  padding: "10px 22px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
