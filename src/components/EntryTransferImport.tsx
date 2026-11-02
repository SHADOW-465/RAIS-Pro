"use client";

import { useRef, useState } from "react";
import { useEvents } from "@/components/app/EventsContext";

/**
 * Import a moid-entry-transfer-v1 JSON package into the ledger (Staging).
 * @param embedded — when true, omit outer card chrome (parent provides title).
 */
export default function EntryTransferImport({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const { refreshEvents } = useEvents();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function importFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error("File is not valid JSON.");
      }
      const res = await fetch("/api/entries/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Import failed (${res.status})`);
      }
      await refreshEvents();
      setResult(
        `Imported from ${file.name}: ${data.inserted ?? 0} new, ${data.deduped ?? 0} already present` +
          (data.skippedInvalid
            ? `, ${data.skippedInvalid} skipped (invalid)`
            : "") +
          ".",
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onFiles(list: FileList | File[] | null) {
    const file = list?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("Use a .json transfer package exported from Data Entry.");
      return;
    }
    void importFile(file);
  }

  const body = (
    <>
      {!embedded && (
        <>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            Import transfer package
          </div>
          <p
            className="muted"
            style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.45, maxWidth: "72ch" }}
          >
            Drop a <strong>moid-entries-*.json</strong> file exported from Data Entry on
            another MOID instance. Events are appended; identical event IDs are skipped.
          </p>
        </>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-strong)"}`,
          background: dragOver ? "var(--accent-weak)" : "var(--paper)",
          borderRadius: "var(--radius-md)",
          padding: "28px 20px",
          textAlign: "center",
          cursor: busy ? "wait" : "pointer",
          fontSize: 13,
          color: "var(--text-2)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        {busy ? "Importing into ledger…" : "Drop .json package here, or click to choose"}
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 10, fontSize: 13, color: "var(--status-bad)" }}>
          {error}
        </div>
      )}
      {result && (
        <div
          role="status"
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "var(--positive)",
            background: "var(--positive-weak)",
            border: "1px solid var(--positive)",
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          {result}
        </div>
      )}
    </>
  );

  if (embedded) return body;

  return (
    <section
      style={{
        marginBottom: 20,
        padding: "16px 18px",
        border: "1.5px solid var(--border-strong)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
      }}
    >
      {body}
    </section>
  );
}
