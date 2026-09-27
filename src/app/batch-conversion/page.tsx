"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import AppShell from "@/components/app/AppShell";
import BatchMatrixEntry from "@/components/BatchMatrixEntry";
import EntryHistory from "@/components/EntryHistory";
import { useEvents } from "@/components/app/EventsContext";
import { usePersona } from "@/components/app/PersonaContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import Tabs from "@/components/ui/Tabs";
import { FRENCH_SIZES } from "@/lib/entry/disposafe-matrix";
import {
  batchOf,
  buildEntryRows,
  groupByBatchThenStage,
  type AuditEventLike,
  type AuditEntryRow,
} from "@/lib/analytics/audit-sessions";
import { hydrateFromAuditRow, type EntryHydrate } from "@/lib/entry/hydrate-entry";
import { type ConversionFlowInfo } from "@/components/entry/BatchIdentityZone";
import {
  proposedConvertedBatchId,
  sizeOfLot,
  conversionFlowLabel,
  historyNameForLot,
  type BatchConversion,
  type LineageNode,
} from "@/lib/lineage";
import { canonicalBatchId, formatBatchIdInput, isValidBatchId } from "@/lib/entry/batch-id";

type EntryMode = "matrix" | "history";

const inputStyle: CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  width: "100%",
};

function reuseLot(batchId: string, date: string, size: string | null): EntryHydrate {
  return {
    mode: "reuse-lot",
    batchId,
    date,
    stageId: "",
    size,
    productType: null,
    shift: null,
    checked: 0,
    accepted: 0,
    hold: 0,
    rejected: 0,
    defects: {},
    editingId: "",
  };
}

export default function BatchConversionPage() {
  const { canWrite } = usePersona();
  const { events } = useEvents();
  const { t } = useTweaks();
  const [conversions, setConversions] = useState<BatchConversion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fromBatch, setFromBatch] = useState("");
  const [toSize, setToSize] = useState("");
  const [convertedOn, setConvertedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);
  const [focusBatch, setFocusBatch] = useState<string | null>(null);
  const [chain, setChain] = useState<LineageNode[] | null>(null);
  const [activeTab, setActiveTab] = useState<EntryMode>("matrix");
  const [hydrate, setHydrate] = useState<EntryHydrate | null>(null);
  const [entryReady, setEntryReady] = useState(false);
  const pushedLot = useRef<string | null>(null);
  // Captures values passed via URL so they can be replayed once fromBatch resolves.
  const urlParamsRef = useRef<{ stageId?: string; checked?: number; accepted?: number; hold?: number; reject?: number } | null>(null);

  const knownLots = useMemo(() => {
    const set = new Set<string>();
    for (const e of (events ?? []) as AuditEventLike[]) {
      const b = batchOf(e);
      if (b && isValidBatchId(b)) set.add(b);
    }
    for (const c of conversions) {
      set.add(c.fromBatch);
      set.add(c.toBatch);
    }
    return [...set].sort();
  }, [events, conversions]);

  const entryRows = useMemo(
    () => buildEntryRows((events ?? []) as AuditEventLike[]),
    [events],
  );

  const batchGroups = useMemo(
    () => groupByBatchThenStage(entryRows),
    [entryRows],
  );

  const fromBatchGroup = useMemo(() => {
    if (!fromBatch) return null;
    const target = formatBatchIdInput(fromBatch).trim().toUpperCase();
    return (
      batchGroups.find(
        (g) =>
          g.batch.trim().toUpperCase() === target ||
          canonicalBatchId(g.batch) === canonicalBatchId(target),
      ) ?? null
    );
  }, [batchGroups, fromBatch]);

  const fromSize = useMemo(() => {
    const raw = fromBatchGroup?.stages[0]?.rows[0]?.size;
    if (raw) return raw.endsWith("Fr") ? raw : `${raw}Fr`;
    return sizeOfLot(fromBatch);
  }, [fromBatchGroup, fromBatch]);

  const historyAvailableQty = useMemo(() => {
    if (!fromBatchGroup) return 0;
    return fromBatchGroup.acceptedQty > 0
      ? fromBatchGroup.acceptedQty
      : fromBatchGroup.checkedQty;
  }, [fromBatchGroup]);

  const previewId = toSize ? proposedConvertedBatchId(fromBatch, toSize) : null;
  const convertedName = previewId && previewId !== (fromBatch && formatBatchIdInput(fromBatch))
    ? previewId
    : null;
  const conversionReady = Boolean(convertedName && fromSize && toSize && fromSize !== toSize);
  const flowLabel =
    fromBatch && convertedName ? conversionFlowLabel(formatBatchIdInput(fromBatch), convertedName) : null;

  const conversionFlow: ConversionFlowInfo | null = useMemo(() => {
    if (!fromBatch) return null;
    const proposed = convertedName || (toSize ? proposedConvertedBatchId(fromBatch, toSize) : null);
    const urlParams = urlParamsRef.current;
    const resolvedChecked =
      urlParams?.checked ?? (fromBatchGroup?.checkedQty ?? null);
    const resolvedAccepted =
      urlParams?.accepted ?? (fromBatchGroup?.acceptedQty ?? null);
    const resolvedRejected =
      urlParams?.reject ?? (fromBatchGroup?.rejectedQty ?? null);
    const resolvedStageId =
      urlParams?.stageId ?? fromBatchGroup?.stages?.[fromBatchGroup.stages.length - 1]?.stageId ?? null;
    return {
      fromBatch: formatBatchIdInput(fromBatch),
      toBatch: proposed,
      fromSize: fromSize ? (fromSize.endsWith("Fr") ? fromSize : `${fromSize}Fr`) : null,
      toSize: toSize ? (toSize.endsWith("Fr") ? toSize : `${toSize}Fr`) : null,
      convertedOn,
      reason,
      originalChecked: resolvedChecked,
      originalAccepted: resolvedAccepted,
      originalRejected: resolvedRejected,
      stageId: resolvedStageId,
    };
  }, [fromBatch, convertedName, toSize, fromSize, convertedOn, reason, fromBatchGroup]);

  const convertedLotIds = useMemo(() => new Set(conversions.map((c) => c.toBatch)), [conversions]);
  const historyEvents = useMemo(() => {
    if (convertedLotIds.size === 0) return [];
    return ((events ?? []) as AuditEventLike[]).filter((e) => {
      const b = batchOf(e);
      return !!b && convertedLotIds.has(b);
    });
  }, [events, convertedLotIds]);

  const sizeOptions = useMemo(
    () =>
      FRENCH_SIZES.map((s) => ({
        value: s,
        label: s,
        disabled: fromSize ? s === fromSize : false,
      })),
    [fromSize],
  );

  const openEntryFor = useCallback(
    (opts: {
      batchId: string;
      date: string;
      size: string | null;
      checked?: number;
      accepted?: number;
      hold?: number;
      rejected?: number;
      productType?: string | null;
      stageId?: string;
    }) => {
      pushedLot.current = opts.batchId;
      setHydrate({
        mode: "reuse-lot",
        batchId: opts.batchId,
        date: opts.date,
        stageId: opts.stageId ?? "",
        size: opts.size,
        productType: opts.productType ?? null,
        shift: null,
        checked: opts.checked ?? 0,
        accepted: opts.accepted ?? 0,
        hold: opts.hold ?? 0,
        rejected: opts.rejected ?? 0,
        defects: {},
        editingId: "",
      });
      setEntryReady(true);
      setActiveTab("matrix");
      setFocusBatch(opts.batchId);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/batch-conversions", { credentials: "same-origin" });
    if (!res.ok) {
      setLoadError(res.status === 401 ? "Sign in required." : "Could not load conversions.");
      return;
    }
    const data = (await res.json()) as { conversions?: BatchConversion[] };
    setConversions(data.conversions ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Read URL search params (e.g. from Data Entry "Convert batch" button)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const from = params.get("fromBatch") || params.get("batch");
    const sz = params.get("toSize");
    const d = params.get("date") || params.get("convertedOn");
    const r = params.get("reason");
    const sid = params.get("stageId") ?? undefined;
    const chk = params.get("checked") ? Number(params.get("checked")) : undefined;
    const acc = params.get("accepted") ? Number(params.get("accepted")) : undefined;
    const hld = params.get("hold") ? Number(params.get("hold")) : undefined;
    const rej = params.get("reject") ? Number(params.get("reject")) : undefined;

    // Stash these so the auto-hydrate effect can merge them in once fromBatch resolves.
    if (sid || chk || acc || hld || rej) {
      urlParamsRef.current = { stageId: sid, checked: chk, accepted: acc, hold: hld, reject: rej };
    }

    if (from) setFromBatch(formatBatchIdInput(from));
    // Never prefill new size with the original size — that yields the same ID.
    if (sz && sizeOfLot(from || "") !== sz) setToSize(sz);
    if (d) setConvertedOn(d);
    if (r) setReason(r);
  }, []);

  useEffect(() => {
    const target = convertedName || (fromBatch ? formatBatchIdInput(fromBatch) : null);
    if (!target) return;
    const historyProductType =
      fromBatchGroup?.stages[0]?.rows[0]?.productType ?? null;

    // URL params carry stageId + explicit quantities when navigating from Data Entry.
    // History quantities are used as fallback when URL params are absent.
    const urlParams = urlParamsRef.current;
    const resolvedChecked =
      urlParams?.checked ?? (historyAvailableQty > 0 ? historyAvailableQty : undefined);
    const resolvedAccepted =
      urlParams?.accepted ?? resolvedChecked;
    const resolvedHold = urlParams?.hold ?? 0;
    const resolvedRejected = urlParams?.reject ?? 0;
    const resolvedStageId = urlParams?.stageId;

    openEntryFor({
      batchId: target,
      date: convertedOn,
      size: toSize ? (toSize.endsWith("Fr") ? toSize : `${toSize}Fr`) : (fromSize || null),
      checked: resolvedChecked,
      accepted: resolvedAccepted,
      hold: resolvedHold,
      rejected: resolvedRejected,
      productType: historyProductType,
      stageId: resolvedStageId,
    });
  }, [convertedName, fromBatch, convertedOn, toSize, fromSize, historyAvailableQty, fromBatchGroup, openEntryFor]);

  useEffect(() => {
    if (!focusBatch) {
      setChain(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/batch-conversions?batch=${encodeURIComponent(focusBatch)}`, {
        credentials: "same-origin",
      });
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { chain?: LineageNode[] };
      if (!cancelled) setChain(data.chain ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [focusBatch]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormOk(null);
    if (!canWrite) {
      setFormError("Your role cannot record conversions.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/batch-conversions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromBatch,
          toSize,
          convertedOn,
          reason,
        }),
      });
      const data = (await res.json()) as { conversion?: BatchConversion; error?: string };
      if (!res.ok) {
        setFormError(data.error || "Could not record conversion.");
        return;
      }
      const row = data.conversion!;
      setFormOk(`${conversionFlowLabel(row.fromBatch, row.toBatch)}. Stored as ${historyNameForLot(row.toBatch, [row])}.`);
      setFocusBatch(row.toBatch);
      const urlParams = urlParamsRef.current;
      openEntryFor({
        batchId: row.toBatch,
        date: row.convertedOn,
        size: row.toSize,
        checked: urlParams?.checked ?? historyAvailableQty,
        accepted: urlParams?.accepted ?? historyAvailableQty,
        hold: urlParams?.hold ?? 0,
        rejected: urlParams?.reject ?? 0,
        stageId: urlParams?.stageId,
      });
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not record conversion.");
    } finally {
      setSaving(false);
    }
  }

  const handleEdit = (row: AuditEntryRow) => {
    setHydrate(hydrateFromAuditRow(row, "edit"));
    setActiveTab("matrix");
    setEntryReady(true);
  };

  const handleReuse = (row: AuditEntryRow) => {
    setHydrate(hydrateFromAuditRow(row, "reuse-lot"));
    setActiveTab("matrix");
    setEntryReady(true);
  };

  return (
    <AppShell active="batch-conversion">
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
          Batch Conversion
        </h1>
        <p
          className="muted"
          style={{ fontSize: "var(--text-md)", margin: 0, maxWidth: "68ch", lineHeight: "var(--leading-body)" }}
        >
          Record the size change, then log quantities on the converted lot the same way as Data Entry.
        </p>
      </header>

      {loadError && (
        <p style={{ color: "var(--warning)", fontSize: 13, margin: "0 0 12px" }}>{loadError}</p>
      )}

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "14px 16px 16px",
          boxShadow: "var(--shadow-1)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <h2 className="h3" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              Conversion details
            </h2>
            <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
              Original ID stays. Converted ID keeps the start-date stem.
            </p>
          </div>
          {flowLabel && (
            <div
              aria-live="polite"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: "0.02em",
                color: "var(--text)",
              }}
            >
              <span>{formatBatchIdInput(fromBatch)}</span>
              <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em" }}>
                CONVERTED TO
              </span>
              <span>{convertedName}</span>
            </div>
          )}
        </div>

        <form
          onSubmit={onSubmit}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(140px, 1.2fr) 88px minmax(110px, 0.8fr) minmax(140px, 1.1fr) minmax(140px, 0.9fr) minmax(180px, 1.6fr) auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label style={labelStyle}>
            Original batch
            <input
              value={fromBatch}
              onChange={(e) => {
                setFromBatch(formatBatchIdInput(e.target.value));
                setFormOk(null);
                setFormError(null);
              }}
              placeholder="26I21-14"
              list="known-lots"
              aria-label="Original batch ID"
              style={inputStyle}
              autoComplete="off"
              required
            />
            <datalist id="known-lots">
              {knownLots.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>

          <div>
            <div style={labelStyle}>From</div>
            <div style={{ ...inputStyle, display: "flex", alignItems: "center", color: "var(--text-2)" }}>
              {fromSize ?? "—"}
            </div>
          </div>

          <label style={labelStyle}>
            New size
            <Select
              value={toSize}
              onChange={(v) => {
                setToSize(v);
                setFormOk(null);
              }}
              options={sizeOptions}
              placeholder="Pick size"
              ariaLabel="New French size"
              variant="pill"
              size="sm"
            />
          </label>

          <div>
            <div style={labelStyle}>Converted batch ID</div>
            <div
              style={{
                ...inputStyle,
                display: "flex",
                alignItems: "center",
                fontWeight: 700,
                letterSpacing: "0.03em",
              }}
            >
              {convertedName ?? "—"}
            </div>
          </div>

          <label style={labelStyle}>
            Converted on
            <DatePicker
              value={convertedOn}
              onChange={setConvertedOn}
              ariaLabel="Conversion date"
              size="sm"
            />
          </label>

          <label style={labelStyle}>
            Reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer / process"
              aria-label="Reason for conversion"
              style={{ ...inputStyle, fontFamily: "inherit" }}
              required
            />
          </label>

          <button
            type="submit"
            disabled={saving || !canWrite || !conversionReady}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: saving || !canWrite ? "not-allowed" : "pointer",
              opacity: saving || !canWrite ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {saving ? "Recording…" : "Record conversion"}
          </button>
        </form>

        {fromBatchGroup && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: "var(--radius-sm, 6px)",
              background: "color-mix(in srgb, var(--accent) 8%, var(--surface-2))",
              border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--accent)",
                  background: "color-mix(in srgb, var(--accent) 15%, var(--surface))",
                  padding: "2px 7px",
                  borderRadius: 4,
                }}
              >
                Data Entry History Matched
              </span>
              <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
                Original lot <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fromBatchGroup.batch}</span>
              </span>
              {fromBatchGroup.stages.length > 0 && (
                <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                  ({fromBatchGroup.stages.map((s) => s.stageId).join(" ➔ ")})
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "var(--font-mono)", fontSize: 13 }}>
              <div>
                <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700, marginRight: 5 }}>Checked</span>
                <span style={{ fontWeight: 800, color: "var(--text)" }}>{fromBatchGroup.checkedQty.toLocaleString()}</span>
              </div>
              <div>
                <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700, marginRight: 5 }}>Accepted (Available to Convert)</span>
                <span style={{ fontWeight: 800, color: "var(--accent)" }}>{fromBatchGroup.acceptedQty.toLocaleString()}</span>
              </div>
              {fromBatchGroup.rejectedQty > 0 && (
                <div>
                  <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700, marginRight: 5 }}>Rejected</span>
                  <span style={{ fontWeight: 700, color: "var(--danger, #e5484d)" }}>{fromBatchGroup.rejectedQty.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {(formError || formOk) && (
          <p
            style={{
              color: formError ? "var(--warning)" : "var(--positive)",
              fontSize: 13,
              margin: "10px 0 0",
            }}
          >
            {formError || formOk}
          </p>
        )}

        {conversions.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={thLeft}>Original</th>
                  <th style={thLeft}>Converted</th>
                  <th style={th}>On</th>
                  <th style={thLeft}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setFromBatch(c.fromBatch);
                      setToSize(c.toSize);
                      setConvertedOn(c.convertedOn);
                      setReason(c.reason);
                      const targetGroup = batchGroups.find(
                        (g) =>
                          g.batch.trim().toUpperCase() === c.fromBatch.trim().toUpperCase() ||
                          canonicalBatchId(g.batch) === canonicalBatchId(c.fromBatch),
                      );
                      const historyQty = targetGroup
                        ? targetGroup.acceptedQty > 0
                          ? targetGroup.acceptedQty
                          : targetGroup.checkedQty
                        : 0;
                      openEntryFor({
                        batchId: c.toBatch,
                        date: c.convertedOn,
                        size: c.toSize,
                        checked: historyQty,
                        accepted: historyQty,
                        productType: targetGroup?.stages[0]?.rows[0]?.productType,
                      });
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={tdMono}>
                      {c.fromBatch}
                      <span style={sizeBit}>{c.fromSize}</span>
                    </td>
                    <td style={tdMono}>
                      {historyNameForLot(c.toBatch, [c])}
                      <span style={sizeBit}>{c.toSize}</span>
                    </td>
                    <td style={tdMuted}>{c.convertedOn}</td>
                    <td style={tdMuted}>{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {entryReady || conversionReady ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <Tabs
              ariaLabel="Converted lot entry mode"
              active={activeTab}
              onSelect={(id) => setActiveTab(id as EntryMode)}
              items={[
                { id: "matrix", label: "Log a batch" },
                { id: "history", label: "History" },
              ]}
            />
          </div>
          {activeTab === "matrix" ? (
            <BatchMatrixEntry
              hydrate={hydrate}
              onHydrateConsumed={() => setHydrate(null)}
              hideConvertBatch
              conversionFlow={conversionFlow}
            />
          ) : (
            <EntryHistory
              events={historyEvents}
              onEdit={handleEdit}
              onReuse={handleReuse}
              grain={t.grain}
              batchLabel={(batch) => historyNameForLot(batch, conversions)}
            />
          )}
        </>
      ) : (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Enter the original lot and the new size, then record the conversion. The Data Entry form
          for the converted lot opens underneath — line status, stations, identity, and quantities.
        </p>
      )}
    </AppShell>
  );
}

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-2)",
};

const th: CSSProperties = {
  textAlign: "right",
  padding: "8px 10px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};
const thLeft: CSSProperties = { ...th, textAlign: "left" };
const tdMono: CSSProperties = {
  padding: "8px 10px",
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  letterSpacing: "0.03em",
  borderBottom: "1px solid var(--border)",
};
const tdMuted: CSSProperties = {
  padding: "8px 10px",
  color: "var(--text-3)",
  borderBottom: "1px solid var(--border)",
};
const sizeBit: CSSProperties = {
  marginLeft: 8,
  color: "var(--text-3)",
  fontWeight: 500,
};
