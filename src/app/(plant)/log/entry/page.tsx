"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
import { useLineage } from "@/components/app/LineageContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import BatchMatrixEntry from "@/components/BatchMatrixEntry";
import EntryHistory from "@/components/EntryHistory";
import LogHeader from "@/components/app/LogHeader";
import Icon from "@/components/editorial/Icon";
import { StatusBadge } from "@/components/ui/primitives";
import type { AuditEntryRow, AuditEventLike } from "@/lib/analytics/audit-sessions";
import { hydrateFromAuditRow, type EntryHydrate } from "@/lib/entry/hydrate-entry";
import { historyNameForLot } from "@/lib/lineage";

type EntryMode = "matrix" | "history";

const TAB_HINT: Record<EntryMode, string> = {
  matrix: "One inspection, one batch, now.",
  history: "Read back what you saved, and see which lots are still open.",
};

export default function DataEntryPage() {
  const { events, isLoading } = useEvents();
  const { conversions } = useLineage();
  // The topbar Day / Week / Month / FY control had no effect on this screen.
  // It now files History under period headers — the grouping the operator
  // wanted, without touching what the ledger stores.
  const { t } = useTweaks();
  const [activeTab, setActiveTab] = useState<EntryMode>("matrix");
  const [success, setSuccess] = useState<string | null>(null);
  /** History → Edit / Reuse lot payload for the entry form. */
  const [hydrate, setHydrate] = useState<EntryHydrate | null>(null);

  /** Status History should open on, from ?status= (the dashboard WIP strip). */
  const [initialStatus, setInitialStatus] = useState<"all" | "open" | "complete">("all");
  /** Batch ID from ?batch= URL param — pre-fills search and auto-expands in History. */
  const [initialBatch, setInitialBatch] = useState<string | undefined>(undefined);

  const batchLabel = React.useCallback(
    (b: string) => (b && b !== "(no batch)" ? historyNameForLot(b, conversions) : b),
    [conversions],
  );

  // Deep links: ?batch=… opens History on that lot, ?status=open opens it on
  // the lots still moving through the line.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const batch = params.get("batch");
    const status = params.get("status");
    if (params.get("tab") === "history") setActiveTab("history");
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
      `Loaded ${row.stageId} on ${row.batch} for edit — the recorded quantities are on the form. Save replaces this entry.`,
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
    <AppShell active="data-entry" ownTabs>
      <LogHeader
        route="entry"
        active={activeTab === "matrix" ? "entry" : "history"}
        onLocal={(tab) => setActiveTab(tab === "history" ? "history" : "matrix")}
        intro={TAB_HINT[activeTab]}
      />

      {success && (
        <div
          role="status"
          className="fade-up"
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 70,
            maxWidth: "min(480px, calc(100vw - 48px))",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-3)",
            color: "var(--text)",
            fontSize: "var(--text-sm)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <StatusBadge status="ok" label="Ready" />
          <span style={{ flex: 1, lineHeight: 1.5 }}>{success}</span>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            aria-label="Dismiss message"
            style={{ all: "unset", cursor: "pointer", display: "inline-flex", padding: 4, color: "var(--text-3)" }}
          >
            <Icon name="x" size={16} aria-hidden />
          </button>
        </div>
      )}

      {/* Loading skeleton shown while ledger events are fetching (deep-link scenario) */}
      {isLoading && activeTab === "history" && (
        <div
          role="status"
          aria-label="Loading batch history…"
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
              {initialBatch ? `Looking up batch ${initialBatch}…` : "Loading your history…"}
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

