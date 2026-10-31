"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import AppShell from "@/components/app/AppShell";
import BatchMatrixEntry from "@/components/BatchMatrixEntry";
import EntryHistory from "@/components/EntryHistory";
import { useEvents } from "@/components/app/EventsContext";
import { useLineage } from "@/components/app/LineageContext";
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
import { hydrateFromAuditRow, hydrateFromBatchGroup, type EntryHydrate } from "@/lib/entry/hydrate-entry";
import { type ConversionFlowInfo } from "@/components/entry/BatchIdentityZone";
import ConversionEntryPanel from "@/components/entry/ConversionEntryPanel";
import {
  proposedConvertedBatchId,
  sizeOfLot,
  conversionFlowLabel,
  historyNameForLot,
  findLotGroup,
  stationQtyFromGroup,
  transferQtyError,
  conversionDateError,
  localToday,
  defaultChangeStageId,
  CONVERSION_REASON_CATEGORIES,
  type BatchConversion,
  type LineageNode,
} from "@/lib/lineage";
import { canonicalBatchId, formatBatchIdInput, isValidBatchId } from "@/lib/entry/batch-id";
import {
  resolveEntrySchema,
  schemaCategories,
  stationsIn,
  type ResolvedEntrySchema,
} from "@/lib/entry/entry-schema";
import { STAGE_LABELS, resolveStageId } from "@/core/ontology/plant-catalog";

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
  const { canWrite, persona } = usePersona();
  const { events, isLoading: eventsLoading, error: eventsError } = useEvents();
  const { conversions, error: loadError, refreshConversions, noteConversion } = useLineage();
  const { t } = useTweaks();
  const [fromBatch, setFromBatch] = useState("");
  const [toSize, setToSize] = useState("");
  const [changeStageId, setChangeStageId] = useState("");
  const [changedQtyInput, setChangedQtyInput] = useState("");
  const [schema, setSchema] = useState<ResolvedEntrySchema | null>(null);
  const [convertedOn, setConvertedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reasonCategory, setReasonCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [undoId, setUndoId] = useState<string | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [undoing, setUndoing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);
  const [focusBatch, setFocusBatch] = useState<string | null>(null);
  const [focusPanel, setFocusPanel] = useState<"source" | "converted" | null>(null);
  const [chain, setChain] = useState<LineageNode[] | null>(null);
  const [activeTab, setActiveTab] = useState<EntryMode>("matrix");
  const [hydrate, setHydrate] = useState<EntryHydrate | null>(null);
  const [sourceHydrate, setSourceHydrate] = useState<EntryHydrate | null>(null);
  const [entryReady, setEntryReady] = useState(false);
  const pushedLot = useRef<string | null>(null);
  const hydrateKey = useRef<string | null>(null);
  const sourceHydrateKey = useRef<string | null>(null);

  const entryRows = useMemo(
    () => buildEntryRows((events ?? []) as AuditEventLike[]),
    [events],
  );

  const batchGroups = useMemo(
    () => groupByBatchThenStage(entryRows),
    [entryRows],
  );

  const fromBatchGroup = useMemo(
    () => (fromBatch ? findLotGroup(batchGroups, formatBatchIdInput(fromBatch)) : null),
    [batchGroups, fromBatch],
  );

  // Lots that exist in the ledger and have not been converted yet: the only
  // valid "Original batch" values, and what the picker offers.
  const convertibleLots = useMemo(() => {
    const converted = new Set(conversions.map((c) => c.fromBatch));
    return batchGroups
      .map((g) => g.batch)
      .filter((b) => isValidBatchId(b) && !converted.has(canonicalBatchId(b) ?? b))
      .sort();
  }, [batchGroups, conversions]);
  // Do not call a lot unknown while the ledger is still loading or failed to load.
  const ledgerReady = events != null && !eventsLoading && !eventsError;
  const lotError =
    fromBatch && ledgerReady && !fromBatchGroup && isValidBatchId(formatBatchIdInput(fromBatch))
      ? `Lot ${formatBatchIdInput(fromBatch)} has no entries in the ledger. Pick an existing lot from the list.`
      : null;

  const fromSize = useMemo(() => {
    const raw = fromBatchGroup?.stages[0]?.rows[0]?.size;
    if (raw) return raw.endsWith("Fr") ? raw : `${raw}Fr`;
    return sizeOfLot(fromBatch);
  }, [fromBatchGroup, fromBatch]);

  const changedQty = /^\d+$/.test(changedQtyInput) ? Number(changedQtyInput) : 0;

  const stageOptions = useMemo(() => {
    const resolved = schema ?? resolveEntrySchema(null);
    const options: { value: string; label: string; group?: string }[] = [];
    for (const cat of schemaCategories(resolved)) {
      const group = cat.label.replace(/\s*\(.*\)$/, "");
      for (const station of stationsIn(resolved, cat.id)) {
        options.push({
          value: station.stageId,
          label: station.label.replace(/\s*\(.*\)$/, ""),
          group,
        });
      }
    }
    return options;
  }, [schema]);

  // One figure per station, shared by the banner, the original-lot panel and
  // the server-side cap (lib/lineage/eligible.ts).
  const stationFigures = useMemo(
    () => (fromBatchGroup && changeStageId ? stationQtyFromGroup(fromBatchGroup, changeStageId) : null),
    [fromBatchGroup, changeStageId],
  );

  const stageAvailable = stationFigures
    ? stationFigures.available
    : fromBatchGroup && changeStageId
      ? 0
      : null;

  const stageLabel =
    stageOptions.find((o) => o.value === changeStageId)?.label ||
    (changeStageId ? STAGE_LABELS[resolveStageId(changeStageId) ?? ""] ?? changeStageId : "");

  const qtyError = transferQtyError(changedQty, stageAvailable, stageLabel);

  const today = localToday();
  const dateError = conversionDateError(convertedOn, today);

  // Assembly (Visual first) is where a size change usually happens. The
  // picker still lists every station; this only fills an empty choice.
  useEffect(() => {
    if (changeStageId) return;
    const id = defaultChangeStageId(schema);
    if (id) setChangeStageId(id);
  }, [schema, changeStageId]);

  const previewId = toSize ? proposedConvertedBatchId(fromBatch, toSize) : null;
  const convertedName = previewId && previewId !== (fromBatch && formatBatchIdInput(fromBatch))
    ? previewId
    : null;
  const convertBatchGroup = useMemo(
    () => (convertedName ? findLotGroup(batchGroups, convertedName) : null),
    [batchGroups, convertedName],
  );
  const targetAlreadyRecorded = Boolean(
    convertedName &&
      conversions.some(
        (c) => (canonicalBatchId(c.toBatch) ?? c.toBatch) === (canonicalBatchId(convertedName) ?? convertedName),
      ),
  );
  const targetLedgerError =
    ledgerReady &&
    convertedName &&
    convertBatchGroup &&
    (convertBatchGroup.rowCount > 0 || convertBatchGroup.eventCount > 0) &&
    !targetAlreadyRecorded
      ? `${convertedName} already has ledger entries. Converting into it would merge unrelated lots. Pick a new lot code that has no entries.`
      : null;

  const conversionReady = Boolean(
    convertedName &&
      fromSize &&
      toSize &&
      fromSize !== toSize &&
      changeStageId &&
      changedQty > 0 &&
      !qtyError &&
      !dateError &&
      !targetLedgerError &&
      fromBatchGroup &&
      reasonCategory &&
      notes.trim(),
  );
  const flowLabel =
    fromBatch && convertedName ? conversionFlowLabel(formatBatchIdInput(fromBatch), convertedName) : null;

  const conversionFlow: ConversionFlowInfo | null = useMemo(() => {
    if (!fromBatch) return null;
    const proposed = convertedName || (toSize ? proposedConvertedBatchId(fromBatch, toSize) : null);
    const categoryLabel =
      CONVERSION_REASON_CATEGORIES.find((c) => c.id === reasonCategory)?.label ?? reasonCategory;
    return {
      fromBatch: formatBatchIdInput(fromBatch),
      toBatch: proposed,
      fromSize: fromSize ? (fromSize.endsWith("Fr") ? fromSize : `${fromSize}Fr`) : null,
      toSize: toSize ? (toSize.endsWith("Fr") ? toSize : `${toSize}Fr`) : null,
      convertedOn,
      reason: notes.trim() ? `${categoryLabel}: ${notes.trim()}` : categoryLabel,
      changedQty: changedQty > 0 ? changedQty : null,
      stageId: changeStageId || null,
      originalChecked: stageAvailable,
      originalAccepted: stageAvailable,
    };
  }, [fromBatch, convertedName, toSize, fromSize, convertedOn, reasonCategory, notes, changedQty, changeStageId, stageAvailable]);

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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/entry-template", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        const tpl = res.ok ? data.template : null;
        if (cancelled) return;
        setSchema(resolveEntrySchema(tpl?.stages?.length ? tpl : null));
      })
      .catch(() => {
        if (!cancelled) setSchema(resolveEntrySchema(null));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Read URL search params (e.g. from Data Entry "Convert batch" button)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const from = params.get("fromBatch") || params.get("batch");
    const sz = params.get("toSize");
    const d = params.get("date") || params.get("convertedOn");
    const r = params.get("reason");
    const sid = params.get("stageId") ?? "";
    const chk = params.get("checked") ? Number(params.get("checked")) : undefined;
    const acc = params.get("accepted") ? Number(params.get("accepted")) : undefined;
    const qtyParam = params.get("changedQty") ? Number(params.get("changedQty")) : undefined;
    const seededQty = qtyParam ?? acc ?? chk;

    if (sid) setChangeStageId(sid);
    if (seededQty && Number.isFinite(seededQty) && seededQty > 0) {
      setChangedQtyInput(String(Math.trunc(seededQty)));
    }

    if (from) setFromBatch(formatBatchIdInput(from));
    // Never prefill new size with the original size — that yields the same ID.
    if (sz && sizeOfLot(from || "") !== sz) setToSize(sz);
    if (d) setConvertedOn(d);
    if (r) setNotes(r);
    const view = params.get("view");
    if (view === "source" || view === "converted") setFocusPanel(view);
  }, []);

  useEffect(() => {
    if (!fromBatch) {
      sourceHydrateKey.current = null;
      setSourceHydrate(null);
      return;
    }
    const lot = formatBatchIdInput(fromBatch);
    const key = `${lot}|${changeStageId}|${fromBatchGroup?.rowCount ?? 0}|${fromBatchGroup?.eventCount ?? 0}`;
    if (sourceHydrateKey.current === key) return;
    sourceHydrateKey.current = key;
    setSourceHydrate(
      hydrateFromBatchGroup(fromBatchGroup, {
        batchId: lot,
        stageId: changeStageId,
        date: fromBatchGroup?.dateTo || convertedOn,
        size: fromSize,
        mode: "edit",
      }),
    );
  }, [fromBatch, changeStageId, fromBatchGroup, convertedOn, fromSize]);

  useEffect(() => {
    if (!convertedName) return;
    const key = `${convertedName}|${changeStageId}|${changedQty}|${convertedOn}|${toSize}|${convertBatchGroup?.rowCount ?? 0}`;
    if (hydrateKey.current === key) return;
    hydrateKey.current = key;
    const recorded = hydrateFromBatchGroup(convertBatchGroup, {
      batchId: convertedName,
      stageId: changeStageId,
      date: convertedOn,
      size: toSize.endsWith("Fr") ? toSize : `${toSize}Fr`,
      mode: convertBatchGroup ? "edit" : "reuse-lot",
    });
    if (recorded && convertBatchGroup && recorded.checked > 0) {
      setHydrate(recorded);
      setEntryReady(true);
      setFocusBatch(convertedName);
      return;
    }
    if (!conversionReady || changedQty <= 0) {
      setHydrate(
        recorded ??
          reuseLot(convertedName, convertedOn, toSize.endsWith("Fr") ? toSize : `${toSize}Fr`),
      );
      setEntryReady(true);
      return;
    }
    openEntryFor({
      batchId: convertedName,
      date: convertedOn,
      size: toSize.endsWith("Fr") ? toSize : `${toSize}Fr`,
      checked: changedQty,
      accepted: 0,
      hold: 0,
      rejected: 0,
      productType: fromBatchGroup?.stages[0]?.rows[0]?.productType ?? null,
      stageId: changeStageId,
    });
  }, [conversionReady, convertedName, changeStageId, changedQty, convertedOn, toSize, fromBatchGroup, convertBatchGroup, openEntryFor]);

  useEffect(() => {
    if (!focusBatch) {
      setChain(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/batch-conversions?batch=${encodeURIComponent(focusBatch)}`, {
        credentials: "same-origin",
        cache: "no-store",
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
          changedQty,
          stageId: changeStageId,
          convertedOn,
          reasonCategory,
          reasonNote: notes.trim(),
        }),
      });
      const data = (await res.json()) as { conversion?: BatchConversion; error?: string };
      if (!res.ok) {
        setFormError(data.error || "Could not record conversion.");
        return;
      }
      const row = data.conversion!;
      noteConversion(row);
      setFormOk(`${conversionFlowLabel(row.fromBatch, row.toBatch)}. Stored as ${historyNameForLot(row.toBatch, [row])}.`);
      setFocusBatch(row.toBatch);
      setChangeStageId(row.stageId);
      setChangedQtyInput(String(row.changedQty));
      openEntryFor({
        batchId: row.toBatch,
        date: row.convertedOn,
        size: row.toSize,
        checked: row.changedQty,
        accepted: 0,
        hold: 0,
        rejected: 0,
        stageId: row.stageId,
      });
      await refreshConversions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not record conversion.");
    } finally {
      setSaving(false);
    }
  }

  async function undoConversion(c: BatchConversion) {
    const why = undoReason.trim();
    if (!why) {
      setFormError("Say why this conversion is being undone.");
      return;
    }
    setUndoing(true);
    setFormError(null);
    setFormOk(null);
    try {
      const res = await fetch("/api/batch-conversions/undo", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, reason: why }),
      });
      const data = (await res.json()) as { error?: string; warning?: string | null };
      if (!res.ok) {
        setFormError(data.error || "Could not undo the conversion.");
        return;
      }
      setUndoId(null);
      setUndoReason("");
      setFormOk(
        data.warning
          ? `${c.fromBatch} to ${c.toBatch} was reversed. ${data.warning}`
          : `${c.fromBatch} to ${c.toBatch} was reversed. The row is kept, and it no longer counts as the current lineage.`,
      );
      await refreshConversions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not undo the conversion.");
    } finally {
      setUndoing(false);
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

  const revealPanel = useCallback((view: "source" | "converted") => {
    setFocusPanel(view);
    setActiveTab("matrix");
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      document.getElementById(`conversion-panel-${view}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const loadRecordedConversion = useCallback(
    (c: BatchConversion, view: "source" | "converted") => {
      setFromBatch(c.fromBatch);
      setToSize(c.toSize);
      setConvertedOn(c.convertedOn);
      setReasonCategory(c.reasonCategory || "");
      setNotes(c.reasonNote || "");
      setChangeStageId(c.stageId || "");
      setChangedQtyInput(c.changedQty > 0 ? String(c.changedQty) : "");
      setFocusBatch(view === "converted" ? c.toBatch : c.fromBatch);
      const targetGroup = findLotGroup(batchGroups, c.fromBatch);
      openEntryFor({
        batchId: c.toBatch,
        date: c.convertedOn,
        size: c.toSize,
        checked: c.changedQty > 0 ? c.changedQty : 0,
        accepted: 0,
        stageId: c.stageId || undefined,
        productType: targetGroup?.stages[0]?.rows[0]?.productType,
      });
      revealPanel(view);
    },
    [batchGroups, openEntryFor, revealPanel],
  );

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
          Original lot stays the reference. Record the size change, then enter
          quantities on the original and converted lots side by side using the
          same Data Entry structure.
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
              A. Conversion details
            </h2>
            <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
              Only the quantity you enter moves to the new size. The rest stays on the original lot.
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
              {convertibleLots.map((b) => (
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
              onChange={(v) => {
                setConvertedOn(v);
                setFormOk(null);
              }}
              max={today}
              ariaLabel="Conversion date"
              size="sm"
            />
          </label>

          <label style={labelStyle}>
            Reason
            <Select
              value={reasonCategory}
              onChange={(v) => {
                setReasonCategory(v);
                setFormOk(null);
                setFormError(null);
              }}
              options={CONVERSION_REASON_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
              placeholder="Why"
              ariaLabel="Reason for conversion"
              variant="pill"
              size="sm"
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 10,
            alignItems: "end",
            marginTop: 12,
          }}
        >
          <label style={labelStyle}>
            Changes at
            <Select
              value={changeStageId}
              onChange={(v) => {
                setChangeStageId(v);
                setFormOk(null);
                setFormError(null);
              }}
              options={stageOptions}
              placeholder="Station"
              ariaLabel="Station where the size changes"
              variant="pill"
              size="sm"
            />
          </label>
          <label style={labelStyle}>
            Quantity changed
            <input
              value={changedQtyInput}
              onChange={(e) => {
                setChangedQtyInput(e.target.value.replace(/[^\d]/g, ""));
                setFormOk(null);
                setFormError(null);
              }}
              inputMode="numeric"
              placeholder="0"
              aria-label="Quantity changed"
              style={inputStyle}
              required
            />
          </label>
          <label style={labelStyle}>
            Notes
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened"
              aria-label="Conversion note"
              required
              style={{ ...inputStyle, fontFamily: "inherit" }}
            />
          </label>
          <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.45, color: qtyError ? "var(--warning)" : undefined }}>
            {qtyError
              ? qtyError
              : stageAvailable != null && stageAvailable > 0
                ? `${stageLabel} on the original lot has ${stageAvailable.toLocaleString()} available. Enter how many of those changed size. The rest stay on the original lot.`
                : "Pick the station where the size changes. Entry on the new lot starts there and continues to the end."}
          </p>
        </div>

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
              {stationFigures ? (
                <>
                  <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700 }}>
                    At {stageLabel || "station"}
                  </span>
                  <Figure label="Checked" value={stationFigures.checked} />
                  <Figure label="Accepted (Available to Convert)" value={stationFigures.available} color="var(--accent)" />
                  {stationFigures.hold > 0 && <Figure label="Hold" value={stationFigures.hold} />}
                  {stationFigures.rejected > 0 && (
                    <Figure label="Rejected" value={stationFigures.rejected} color="var(--danger, #e5484d)" />
                  )}
                </>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "inherit" }}>
                  {changeStageId
                    ? `${fromBatchGroup.batch} has no entries at ${stageLabel || "this station"}.`
                    : "Pick the station where the size changes to see what is available."}
                </span>
              )}
            </div>
          </div>
        )}

        {lotError && (
          <p role="alert" style={{ color: "var(--warning)", fontSize: 13, margin: "10px 0 0" }}>{lotError}</p>
        )}
        {targetLedgerError && (
          <p role="alert" style={{ color: "var(--warning)", fontSize: 13, margin: "10px 0 0" }}>{targetLedgerError}</p>
        )}
        {dateError && !formError && (
          <p style={{ color: "var(--warning)", fontSize: 13, margin: "10px 0 0" }}>{dateError}</p>
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
      </section>

      <section style={{ marginBottom: 20 }} aria-label="Mirrored batch entry">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <h2 className="h3" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              B. Mirrored batch entry
            </h2>
            <p className="muted" style={{ fontSize: 12, margin: "2px 0 0", maxWidth: "72ch" }}>
              Same Data Entry quantity structure on both lots. Original identity stays locked;
              the converted lot starts at the change station.
            </p>
          </div>
          <Tabs
            ariaLabel="Conversion entry mode"
            active={activeTab}
            onSelect={(id) => setActiveTab(id as EntryMode)}
            items={[
              { id: "matrix", label: "Log batches" },
              { id: "history", label: "Converted history" },
            ]}
          />
        </div>

        {activeTab === "history" ? (
          <EntryHistory
            events={historyEvents}
            onEdit={handleEdit}
            onReuse={handleReuse}
            grain={t.grain}
            batchLabel={(batch) => historyNameForLot(batch, conversions)}
          />
        ) : fromBatch ? (
          <>
            <style>{`
              .moid-conversion-panels {
                display: grid;
                grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                gap: 16px;
                align-items: start;
              }
              @media (max-width: 1100px) {
                .moid-conversion-panels { grid-template-columns: minmax(0, 1fr); }
              }
            `}</style>
            <div className="moid-conversion-panels">
              <ConversionEntryPanel
                tone="source"
                batchId={formatBatchIdInput(fromBatch)}
                size={fromSize}
                stageLabel={stageLabel || undefined}
                focused={focusPanel === "source"}
                relatedBatch={convertedName}
              >
                <BatchMatrixEntry
                  hydrate={sourceHydrate}
                  onHydrateConsumed={() => setSourceHydrate(null)}
                  hideConvertBatch
                  identityLocked
                  draftScope="conversion-source"
                  embedded
                />
              </ConversionEntryPanel>
              {convertedName ? (
                <ConversionEntryPanel
                  tone="converted"
                  batchId={convertedName}
                  size={toSize ? (toSize.endsWith("Fr") ? toSize : `${toSize}Fr`) : null}
                  stageLabel={stageLabel || undefined}
                  focused={focusPanel === "converted"}
                  relatedBatch={formatBatchIdInput(fromBatch)}
                >
                  <BatchMatrixEntry
                    hydrate={hydrate}
                    onHydrateConsumed={() => setHydrate(null)}
                    hideConvertBatch
                    conversionFlow={conversionFlow}
                    identityLocked
                    draftScope="conversion-converted"
                    embedded
                  />
                </ConversionEntryPanel>
              ) : (
                <ConversionEntryPanel
                  tone="converted"
                  batchId="—"
                  focused={focusPanel === "converted"}
                  relatedBatch={formatBatchIdInput(fromBatch)}
                >
                  <p className="muted" style={{ fontSize: 13, margin: 0, padding: "12px 4px 20px" }}>
                    Pick a new size, the change station, and a positive quantity to open the
                    converted lot on the same entry structure.
                  </p>
                </ConversionEntryPanel>
              )}
            </div>
          </>
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Enter the original lot from Data Entry or type it above. Both quantity panels use the
            same inspection-entry structure as Data Entry.
          </p>
        )}
      </section>

      <section
        aria-label="Audit trail and batch lineage"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "14px 16px 16px",
          boxShadow: "var(--shadow-1)",
          marginBottom: 24,
        }}
      >
        <h2 className="h3" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          C. Audit trail & batch lineage
        </h2>
        <p className="muted" style={{ fontSize: 12, margin: "2px 0 12px" }}>
          Click either batch ID to open that lot in the mirrored entry panels. History is the
          recorded conversion, not the current form.
        </p>

        {chain && chain.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {chain.map((node, i) => (
              <span key={node.batch} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {i > 0 && (
                  <span style={{ color: "var(--accent)", fontSize: 11, letterSpacing: "0.06em" }}>CT</span>
                )}
                <button
                  type="button"
                  onClick={() => revealPanel(node.origin ? "source" : "converted")}
                  style={{
                    ...inputStyle,
                    width: "auto",
                    height: 30,
                    padding: "0 10px",
                    cursor: "pointer",
                    fontWeight: 800,
                    borderColor: node.origin ? "var(--border-strong)" : "color-mix(in srgb, var(--accent) 45%, var(--border))",
                  }}
                >
                  {node.batch}
                </button>
              </span>
            ))}
          </div>
        )}

        {conversions.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={thLeft}>Original</th>
                  <th style={thLeft}>Converted</th>
                  <th style={th}>Changed</th>
                  <th style={thLeft}>At</th>
                  <th style={th}>On</th>
                  <th style={thLeft}>By</th>
                  <th style={thLeft}>Reason</th>
                  <th style={thLeft}>Note</th>
                  {persona === "gm" && <th style={thLeft}>Undo</th>}
                </tr>
              </thead>
              <tbody>
                {conversions.map((c) => (
                  <tr key={c.id}>
                    <td style={tdMono}>
                      <button
                        type="button"
                        onClick={() => loadRecordedConversion(c, "source")}
                        style={idBtn}
                        title={`Open original ${c.fromBatch}`}
                      >
                        {c.fromBatch}
                      </button>
                      <span style={sizeBit}>{c.fromSize}</span>
                    </td>
                    <td style={tdMono}>
                      <button
                        type="button"
                        onClick={() => loadRecordedConversion(c, "converted")}
                        style={idBtn}
                        title={`Open converted ${c.toBatch}`}
                      >
                        {c.toBatch}
                      </button>
                      <span style={sizeBit}>{c.toSize}</span>
                    </td>
                    <td style={tdMuted}>{c.changedQty > 0 ? c.changedQty.toLocaleString() : "—"}</td>
                    <td style={tdMuted}>
                      {c.stageId ? STAGE_LABELS[resolveStageId(c.stageId) ?? ""] ?? c.stageId : "—"}
                    </td>
                    <td style={tdMuted}>{c.convertedOn}</td>
                    <td style={tdMuted}>{c.createdBy || "—"}</td>
                    <td style={tdMuted}>
                      {CONVERSION_REASON_CATEGORIES.find((x) => x.id === c.reasonCategory)?.label || c.reasonCategory || c.reason}
                    </td>
                    <td style={tdMuted}>{c.reasonNote || "—"}</td>
                    {persona === "gm" && (
                      <td style={tdMuted}>
                        {undoId === c.id ? (
                          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              value={undoReason}
                              onChange={(e) => setUndoReason(e.target.value)}
                              placeholder="Why undo"
                              aria-label={`Reason for undoing ${c.fromBatch} to ${c.toBatch}`}
                              style={{ ...inputStyle, height: 30, width: 160, fontFamily: "inherit" }}
                            />
                            <button
                              type="button"
                              disabled={undoing || !undoReason.trim()}
                              onClick={() => void undoConversion(c)}
                              style={{ ...idBtn, color: "var(--warning)" }}
                            >
                              {undoing ? "Undoing…" : "Confirm"}
                            </button>
                            <button type="button" onClick={() => setUndoId(null)} style={idBtn}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setUndoId(c.id);
                              setUndoReason("");
                              setFormError(null);
                            }}
                            style={idBtn}
                          >
                            Undo
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No recorded conversions yet. Recording one writes an immutable lineage edge and keeps
            the original lot as the parent identity.
          </p>
        )}
      </section>
    </AppShell>
  );
}

function Figure({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700, marginRight: 5 }}>
        {label}
      </span>
      <span style={{ fontWeight: 800, color: color ?? "var(--text)" }}>{value.toLocaleString()}</span>
    </div>
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
const idBtn: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "inherit",
  font: "inherit",
  fontFamily: "var(--font-mono)",
  fontWeight: 800,
  letterSpacing: "0.03em",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};
