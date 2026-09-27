// src/app/data-entry/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import BatchMatrixEntry from "@/components/BatchMatrixEntry";
import EntryHistory from "@/components/EntryHistory";
import Tabs from "@/components/ui/Tabs";
import type { AuditEntryRow, AuditEventLike } from "@/lib/analytics/audit-sessions";
import { hydrateFromAuditRow, type EntryHydrate } from "@/lib/entry/hydrate-entry";
import { historyNameForLot, type BatchConversion } from "@/lib/lineage";

type EntryMode = "matrix" | "history";

const TAB_HINT: Record<EntryMode, string> = {
  matrix: "One inspection, one batch, now.",
  history: "Read back what you saved, and see which lots are still open.",
};

export default function DataEntryPage() {
  const { events, isLoading } = useEvents();
  // The topbar Day / Week / Month / FY control had no effect on this screen.
  // It now files History under period headers â€” the grouping the operator
  // wanted, without touching what the ledger stores.
  const { t } = useTweaks();
  const [activeTab, setActiveTab] = useState<EntryMode>("matrix");
  const [success, setSuccess] = useState<string | null>(null);
  /** History â†’ Edit / Reuse lot payload for the entry form. */
  const [hydrate, setHydrate] = useState<EntryHydrate | null>(null);

  /** Status History should open on, from ?status= (the dashboard WIP strip). */
  const [initialStatus, setInitialStatus] = useState<"all" | "open" | "complete">("all");
  /** Batch ID from ?batch= URL param â€” pre-fills search and auto-expands in History. */
  const [initialBatch, setInitialBatch] = useState<string | undefined>(undefined);
  const [conversions, setConversions] = useState<BatchConversion[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/batch-conversions", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const list = Array.isArray(data.conversions)
          ? data.conversions
          : Array.isArray(data)
            ? data
            : [];
        setConversions(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const batchLabel = React.useCallback(
    (b: string) => (b && b !== "(no batch)" ? historyNameForLot(b, conversions) : b),
    [conversions],
  );

  // Deep links: ?batch=â€¦ opens History on that lot, ?status=open opens it on
  // the lots still moving through the line.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const batch = params.get("batch");
    const status = params.get("status");
    if (batch?.trim()) {
      setInitialBatch(batch.trim().toUpperCase());
      setActiveTab("history");
    }
    if (status === "open" || status === "complete") {
      setInitialStatus(status);
      setActiveTab("history");
    }
  }, []);

  // Success feedback is brief on this surface.
  useEffect(() => {
    if (!success) return;
    const id = window.setTimeout(() => setSuccess(null), 5000);
    return () => window.clearTimeout(id);
  }, [success]);

  const handleEdit = (row: AuditEntryRow) => {
    setHydrate(hydrateFromAuditRow(row, "edit"));
    setActiveTab("matrix");
    setSuccess(
      `Loaded ${row.stageId} on ${row.batch} for edit â€” the recorded quantities are on the form. Save replaces this entry.`,
    );
  };

  const handleReuse = (row: AuditEntryRow) => {
    setHydrate(hydrateFromAuditRow(row, "reuse-lot"));
    setActiveTab("matrix");
    setSuccess(
      `Lot ${row.batch} is on the form. Pick this station (or the next) and enter today's quantities.`,
    );
  };

  return (
    <AppShell active="data-entry">
      <header style={{ marginBottom: 16 }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-3xl, 28px)",
            fontWeight: 700,
            margin: "0 0 4px",
            letterSpacing: "var(--tracking-tight, -0.02em)",
            lineHeight: "var(--leading-tight, 1.15)",
          }}
        >
          Data Entry
        </h1>
        <p
          className="muted"
          style={{ fontSize: "var(--text-md)", margin: 0, maxWidth: "68ch", lineHeight: "var(--leading-body)" }}
        >
          {TAB_HINT[activeTab]}
        </p>
      </header>

      <div style={{ marginBottom: 16 }}>
        <Tabs
          ariaLabel="Data entry mode"
          active={activeTab}
          onSelect={(id) => setActiveTab(id as EntryMode)}
          items={[
            { id: "matrix", label: "Log a batch" },
            { id: "history", label: "History" },
          ]}
        />
      </div>

      {success && (
        <div
          role="status"
          className="fade-up"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--positive-weak)",
            border: "1px solid var(--positive)",
            color: "var(--positive)",
            fontSize: "var(--text-sm)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>{success}</span>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            aria-label="Dismiss message"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              color: "var(--positive)",
              fontWeight: 700,
              lineHeight: 1,
              padding: "0 4px",
              minHeight: 24,
            }}
          >
            Ã—
          </button>
        </div>
      )}

      {/* Loading skeleton shown while ledger events are fetching (deep-link scenario) */}
      {isLoading && activeTab === "history" && (
        <div
          role="status"
          aria-label="Loading batch historyâ€¦"
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            background: "var(--surface)",
          }}
        >
          {/* Header strip skeleton */}
          <div
            style={{
              padding: "16px var(--pad-card)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, height: 13, borderRadius: 6, background: "var(--surface-3)", animation: "pulse-ring 1.4s ease infinite" }} />
            <div style={{ width: 200, height: 34, borderRadius: "var(--radius-sm)", background: "var(--surface-3)", animation: "pulse-ring 1.4s ease infinite 0.1s" }} />
          </div>
          {/* Row skeletons */}
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 100px 1fr 70px 70px 70px",
                gap: 12,
                padding: "12px var(--pad-card)",
                borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                alignItems: "center",
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--surface-3)", animation: `pulse-ring 1.4s ease infinite ${i * 0.08}s` }} />
              <div style={{ height: 14, borderRadius: 5, background: "var(--surface-3)", maxWidth: 110, animation: `pulse-ring 1.4s ease infinite ${i * 0.08}s` }} />
              <div style={{ height: 12, borderRadius: 5, background: "var(--surface-3)", animation: `pulse-ring 1.4s ease infinite ${i * 0.08 + 0.05}s` }} />
              <div style={{ height: 12, borderRadius: 5, background: "var(--surface-3)", animation: `pulse-ring 1.4s ease infinite ${i * 0.08 + 0.1}s` }} />
              <div style={{ height: 12, borderRadius: 5, background: "var(--surface-3)", justifySelf: "end", width: 50, animation: `pulse-ring 1.4s ease infinite ${i * 0.08 + 0.15}s` }} />
              <div style={{ height: 12, borderRadius: 5, background: "var(--surface-3)", justifySelf: "end", width: 50, animation: `pulse-ring 1.4s ease infinite ${i * 0.08 + 0.2}s` }} />
              <div style={{ height: 12, borderRadius: 5, background: "var(--surface-3)", justifySelf: "end", width: 50, animation: `pulse-ring 1.4s ease infinite ${i * 0.08 + 0.25}s` }} />
            </div>
          ))}
          <div style={{ padding: "14px var(--pad-card)", borderTop: "1px solid var(--border)" }}>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--accent)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
              {initialBatch ? `Looking up batch ${initialBatch}â€¦` : "Loading your historyâ€¦"}
            </p>
          </div>
        </div>
      )}

      {activeTab === "matrix" ? (
        <BatchMatrixEntry
          hydrate={hydrate}
          onHydrateConsumed={() => setHydrate(null)}
        />
      ) : !isLoading ? (
        <EntryHistory
          events={(events ?? []) as AuditEventLike[]}
          onEdit={handleEdit}
          onReuse={handleReuse}
          initialStatus={initialStatus}
          initialSearch={initialBatch ?? ""}
          initialBatch={initialBatch}
          grain={t.grain}
          batchLabel={batchLabel}
        />
      ) : null}
    </AppShell>
  );
}

