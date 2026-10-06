"use client";

// Shop-floor Data Entry Matrix — Single-batch form redesigned with Impeccable craft.
// Uploads to ledger (POST /api/ingest) and manages local shift operational queue.
// Preserves all append-only event ledger and deterministic validation invariants.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmContext";
import {
  MATRIX_STAGES,
  ENTRY_ROLES,
  toEntryRole,
  SHIFT_STORAGE_KEY,
  PRODUCT_TYPE_STORAGE_KEY,
  sizesFor,
  typeIsSelectable,
  productTypeFor,
  categoryAndTypeFrom,
  type MacroId,
  type ProductType,
  type CatheterCategory,
  type CatheterType,
  type ShiftBatchRecord,
  type DefectDef,
} from "@/lib/entry/disposafe-matrix";
import {
  migrateToStageId,
  previousAcceptedStageId,
  resolveEntrySchema,
  schemaCategories,
  stationById,
  stationsIn,
  type ResolvedEntrySchema,
  type QtyKey,
} from "@/lib/entry/entry-schema";
import {
  parseBatchId,
  canonicalBatchId,
  isValidBatchId,
  toCanonicalSize,
  toDisplaySize,
} from "@/lib/entry/batch-id";
import { checkEntry, summariseLedger } from "@/lib/entry/check-entry";
import {
  inheritedStageIds,
  isLineCompleteStage,
  lotHasStage,
  mayOpenStation,
  occupiedStageIds,
  stageIsBefore,
  type ProcessEventLike,
} from "@/lib/entry/process-sequence";
import { buildLineStatus } from "@/lib/entry/line-status";
import { stageCategoryOf } from "@/core/ontology/plant-catalog";
import {
  latestLedgerRowForLotStation,
  latestLocalRowForLotStation,
  trolleyDefectsFromEvents,
  trolleysFromEvents,
} from "@/lib/entry/inspect-station";
import {
  resizeTrolleyDefects,
  setTrolleyDefect,
  sumTrolleyDefects,
  rowsFromLegacyTotals,
  type TrolleyDefectRow,
} from "@/lib/entry/trolley-defects";
import { hydrateFromAuditRow } from "@/lib/entry/hydrate-entry";
import {
  readLotMemory,
  snapshotLotMemory,
  writeLotMemory,
} from "@/lib/entry/lot-memory";
import { entryIdentity, identityKey } from "@/lib/entry/identity";
import { upstreamRemainder } from "@/lib/entry/upstream-remainder";
import { nextDefectColumns } from "@/lib/entry/defect-columns";
import {
  isWithinShiftWindow,
  readShiftWindowConfig,
} from "@/lib/entry/shift-window";
import { entryKey, hasValidGrant } from "@/lib/entry/edit-grants";
import { toStageDayRecord } from "@/lib/entry/to-stage-day-record";
import { collectEntryReasons, remarksFromReasons } from "@/lib/entry/exception-reasons";
import { formatLedgerBlockReason } from "@/lib/entry/format-ingest-error";
import { readPrefill, clearPrefill } from "@/lib/agent/prefill";
import type { EntryHydrate } from "@/lib/entry/hydrate-entry";
import { useEvents } from "@/components/app/EventsContext";
import { useLineage } from "@/components/app/LineageContext";
import { notifyNotificationsChanged } from "@/lib/client/live-signals";
import { usePersona } from "@/components/app/PersonaContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { loadDraft, saveDraft } from "@/lib/entry/draft";
import { buildBatchProgress, progressFor } from "@/lib/analytics/batch-progress";
import { buildEntryRows, type AuditEventLike } from "@/lib/analytics/audit-sessions";
import { sizeOfLot, type BatchConversion } from "@/lib/lineage";

// Modular Child Components
import EntryContextBar from "@/components/entry/EntryContextBar";
import BatchIdentityZone, { type ConversionFlowInfo } from "@/components/entry/BatchIdentityZone";
import QuantityReconciliationZone from "@/components/entry/QuantityReconciliationZone";
import DefectWorkspace from "@/components/entry/DefectWorkspace";
import IssueSummaryZone from "@/components/entry/IssueSummaryZone";
import LedgerReceiptCard from "@/components/entry/LedgerReceiptCard";
import StickySaveBar from "@/components/entry/StickySaveBar";
import ShiftQueueTable from "@/components/entry/ShiftQueueTable";

const today = () => new Date().toISOString().slice(0, 10);

/** "1 Aug" — operator friendly date */
function shortEntryDate(iso: string | null): string {
  if (!iso) return "an earlier day";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
}

const DRAFT_KEY = "moid_entry_draft_batch";
const EMPTY_COLUMNS: QtyKey[] = [];
const EMPTY_DEFECTS: DefectDef[] = [];

export interface EntryIssue {
  code: string;
  severity: "critical" | "warning" | "info";
  field: string;
  message: string;
  stated: number | null;
  computed: number | null;
  stageId?: string;
  date?: string;
}

interface BatchDraft {
  macro: string;
  stageId?: string;
  micro?: string;
  date: string;
  size: string;
  productType?: string;
  operator: string;
  shift: string;
  batchId: string;
  batchDate: string;
  checked: number;
  trolleys: number;
  bin: string;
  accept: number;
  hold: number;
  reject: number;
  defects: Record<string, number>;
  trolleyDefects?: TrolleyDefectRow[];
  remarks: string;
}

function loadShift(): ShiftBatchRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SHIFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShiftBatchRecord[]) : [];
  } catch {
    return [];
  }
}

function persistShift(rows: ShiftBatchRecord[]) {
  localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(rows));
}

export default function BatchMatrixEntry({
  onSynced,
  hydrate,
  onHydrateConsumed,
  hideConvertBatch = false,
  conversionFlow,
}: {
  onSynced?: () => void;
  hydrate?: EntryHydrate | null;
  onHydrateConsumed?: () => void;
  hideConvertBatch?: boolean;
  conversionFlow?: ConversionFlowInfo | null;
}) {
  const { events, refreshEvents } = useEvents();
  const { noteConversion, refreshConversions } = useLineage();
  const { canWrite, canEraseLedger, persona } = usePersona();
  const { schemaRev } = useRegistry();
  const passCtxRef = useRef<string | null>(null);
  const { confirm: confirmModal, notify } = useConfirm();

  const [macro, setMacro] = useState<MacroId>("primary");
  const [stageId, setStageId] = useState("production");
  const [date, setDate] = useState(today);
  const [size, setSize] = useState("14Fr");
  const [productType, setProductType] = useState<ProductType | string>("2 way");
  const [category, setCategory] = useState<CatheterCategory>("Male");
  const [catheterType, setCatheterType] = useState<CatheterType>("2 way");

  const applyProductType = useCallback((pt: string) => {
    setProductType(pt);
    const { category: c, type: ty } = categoryAndTypeFrom(pt);
    setCategory(c);
    setCatheterType(ty);
  }, []);

  const [operator, setOperator] = useState<string>(ENTRY_ROLES[0]);
  const [shift, setShift] = useState("Day Shift");
  const [batchId, setBatchId] = useState("");
  const [batchDate, setBatchDate] = useState(today);
  const [lotMemoryOn, setLotMemoryOn] = useState(false);
  const [tick, setTick] = useState(0);

  const [checked, setChecked] = useState(0);
  const [trolleys, setTrolleys] = useState(0);
  const [bin, setBin] = useState("");
  const [accept, setAccept] = useState(0);
  const [hold, setHold] = useState(0);
  const [reject, setReject] = useState(0);
  const [defects, setDefects] = useState<Record<string, number>>({});
  const [trolleyDefects, setTrolleyDefects] = useState<TrolleyDefectRow[]>([]);
  const [remarks, setRemarks] = useState("");

  const [saved, setSaved] = useState<ShiftBatchRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const setEditing = useCallback((id: string | null) => {
    editingIdRef.current = id;
    setEditingId(id);
  }, []);

  const duplicateConfirmedOfRef = useRef<string | null>(null);
  const [pass, setPass] = useState(1);
  const [passReason, setPassReason] = useState("");

  const [receipt, setReceipt] = useState<{
    batchId: string;
    stageName: string;
    size: string;
    checked: number;
    accept: number;
    reject: number;
    savedAt: string;
    synced: boolean;
    error?: string | null;
  } | null>(null);

  const [lastIssues, setLastIssues] = useState<{
    batchId: string;
    stage: string;
    issues: EntryIssue[];
  } | null>(null);

  const userTouchedQty = useRef(false);
  const conversionApplyKey = useRef<string | null>(null);
  const conversionLanded = useRef<string | null>(null);
  const userPickedStation = useRef(false);
  const lastLineJump = useRef<string | null>(null);
  const prefillAppliedKey = useRef<string | null>(null);
  const [schema, setSchema] = useState<ResolvedEntrySchema | null>(null);
  const draftReady = useRef(false);
  const workingStageInputsRef = useRef<
    Record<
      string,
      {
        checked: number;
        accept: number;
        hold: number;
        reject: number;
        defects: Record<string, number>;
        trolleys: number;
        trolleyDefects: TrolleyDefectRow[];
        bin: string;
        remarks: string;
      }
    >
  >({});

  const [lineageConversion, setLineageConversion] = useState<ConversionFlowInfo | null>(null);

  useEffect(() => {
    if (conversionFlow) return;
    const target = isValidBatchId(batchId.trim())
      ? canonicalBatchId(batchId) ?? batchId.trim().toUpperCase()
      : null;
    if (!target) {
      setLineageConversion(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/batch-conversions?batch=${encodeURIComponent(target)}`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          chain?: Array<{
            batch: string;
            size?: string;
            via?: {
              fromBatch?: string;
              fromSize?: string;
              toSize?: string;
              stageId?: string;
              changedQty?: number;
              convertedOn?: string;
              reason?: string;
            } | null;
          }>;
        };
        if (cancelled || !data.chain || data.chain.length < 2) {
          setLineageConversion(null);
          return;
        }
        const idx = data.chain.findIndex((n) => n.batch === target);
        if (idx > 0) {
          const node = data.chain[idx];
          const parent = data.chain[idx - 1];
          const via = node.via;
          setLineageConversion({
            fromBatch: via?.fromBatch || parent.batch,
            toBatch: target,
            fromSize: via?.fromSize || parent.size || sizeOfLot(parent.batch),
            toSize: via?.toSize || node.size || sizeOfLot(target),
            stageId: via?.stageId || null,
            changedQty: via?.changedQty ?? null,
            convertedOn: via?.convertedOn ?? null,
            reason: via?.reason ?? null,
          });
        } else {
          setLineageConversion(null);
        }
      })
      .catch(() => {
        if (!cancelled) setLineageConversion(null);
      });
    return () => {
      cancelled = true;
    };
  }, [conversionFlow, batchId]);

  const activeConversionFlow = conversionFlow ?? lineageConversion;

  // Keep form state synchronized when a batch conversion is being authored
  useEffect(() => {
    if (!conversionFlow?.toBatch) return;
    const targetLot = conversionFlow.toBatch;
    const applyKey = [
      targetLot,
      conversionFlow.stageId ?? "",
      conversionFlow.changedQty ?? "",
      conversionFlow.toSize ?? "",
      conversionFlow.convertedOn ?? "",
    ].join("|");
    if (conversionApplyKey.current === applyKey) return;
    conversionApplyKey.current = applyKey;
    setEditing(null);
    setBatchId(targetLot);
    const p = parseBatchId(targetLot);
    if (p?.date) setBatchDate(p.date);
    if (conversionFlow.toSize) {
      const sz = conversionFlow.toSize.endsWith("Fr")
        ? conversionFlow.toSize
        : `${conversionFlow.toSize}Fr`;
      setSize(sz);
    }
    if (conversionFlow.convertedOn) {
      setDate(conversionFlow.convertedOn);
    }
    if (conversionFlow.stageId) {
      setStageId(conversionFlow.stageId);
      const cat = ((schema ? stationById(schema, conversionFlow.stageId)?.category : undefined) ?? stageCategoryOf(conversionFlow.stageId) ?? "assembly") as MacroId;
      setMacro(cat);
      userPickedStation.current = true;
      lastLineJump.current = `${targetLot}|${conversionFlow.stageId}`;
    }
    const qty = conversionFlow.changedQty ?? 0;
    if (qty > 0) {
      setChecked(qty);
      setAccept(qty);
      userTouchedQty.current = true;
    }
  }, [conversionFlow, setEditing, schema]);

  // A converted lot opened from Data Entry still starts with the quantity that moved.
  useEffect(() => {
    if (conversionFlow) return;
    const qty = lineageConversion?.changedQty ?? 0;
    const start = lineageConversion?.stageId?.trim();
    if (!start || qty <= 0) return;
    if (stageId !== start) return;
    if (userTouchedQty.current || checked > 0) return;
    setChecked(qty);
    setAccept(qty);
  }, [conversionFlow, lineageConversion, stageId, checked]);

  // Load shift records & local draft on mount
  useEffect(() => {
    setSaved(loadShift());
    const op = localStorage.getItem("rais_hdr_operator");
    if (op) setOperator(toEntryRole(op));
    const sh = localStorage.getItem("rais_hdr_shift");
    if (sh) setShift(sh);
    const pt = localStorage.getItem(PRODUCT_TYPE_STORAGE_KEY);
    if (pt) applyProductType(pt);

    const d = loadDraft<BatchDraft>(DRAFT_KEY);
    const mem = readLotMemory();
    if (hydrate?.mode === "edit" || hydrate?.mode === "reuse-lot" || Boolean(conversionFlow)) {
      // Applied in hydrate effect below / conversion flow
    } else if (d) {
      setMacro((d.macro as MacroId) || "primary");
      setStageId(migrateToStageId(d));
      setDate(d.date);
      setSize(d.size);
      if (d.productType) applyProductType(d.productType);
      if (d.operator) setOperator(toEntryRole(d.operator));
      if (d.shift) setShift(d.shift);
      setBatchId(d.batchId);
      setBatchDate(d.batchDate || parseBatchId(d.batchId)?.date || today());
      setChecked(d.checked);
      setTrolleys(d.trolleys);
      setBin(d.bin);
      setAccept(d.accept);
      setHold(d.hold);
      setReject(d.reject);
      setDefects(d.defects ?? {});
      setTrolleyDefects(
        d.trolleyDefects ??
          rowsFromLegacyTotals(d.defects ?? {}, d.trolleys ?? 0),
      );
      setRemarks(d.remarks);
      userTouchedQty.current = true;
    } else {
      const agent = readPrefill();
      if (agent) {
        const m = agent.macro as MacroId;
        if (m === "primary" || m === "secondary" || m === "assembly") setMacro(m);
        setStageId(migrateToStageId(agent));
        if (agent.date) setDate(agent.date);
        if (agent.size) setSize(agent.size);
        if (agent.productType) applyProductType(agent.productType);
        if (agent.shift) setShift(agent.shift);
        if (agent.batchId) {
          setBatchId(agent.batchId);
          setBatchDate(parseBatchId(agent.batchId)?.date || agent.date || today());
        }
        setChecked(agent.checked);
        setAccept(agent.accept);
        setHold(agent.hold);
        setReject(agent.reject);
        setDefects(agent.defects ?? {});
        if (agent.remarks) setRemarks(agent.remarks);
        userTouchedQty.current = true;
        clearPrefill();
      } else if (mem?.on) {
        setBatchId(mem.batchId);
        if (mem.batchDate) setBatchDate(mem.batchDate);
        if (mem.size) setSize(mem.size);
        if (mem.productType) applyProductType(mem.productType);
      }
    }
    if (mem?.on) setLotMemoryOn(true);
    draftReady.current = true;
  }, [applyProductType, hydrate]);

  // Minute tick for shift-window checks
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Autosave draft
  useEffect(() => {
    if (!draftReady.current) return;
    const empty =
      !checked &&
      !trolleys &&
      !accept &&
      !hold &&
      !reject &&
      !remarks &&
      !bin &&
      Object.keys(defects).length === 0;
    saveDraft(
      DRAFT_KEY,
      empty
        ? null
        : {
            macro,
            stageId,
            date,
            size,
            productType,
            operator,
            shift,
            batchId,
            batchDate,
            checked,
            trolleys,
            bin,
            accept,
            hold,
            reject,
            defects,
            trolleyDefects,
            remarks,
          },
    );
  }, [
    macro,
    stageId,
    date,
    size,
    productType,
    operator,
    shift,
    batchId,
    batchDate,
    checked,
    trolleys,
    bin,
    accept,
    hold,
    reject,
    defects,
    trolleyDefects,
    remarks,
  ]);

  // Fetch live schema template
  useEffect(() => {
    let cancelled = false;
    fetch("/api/entry-template", { cache: "no-store" })
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
  }, [schemaRev]);

  useEffect(() => {
    if (!lotMemoryOn) return;
    writeLotMemory(
      snapshotLotMemory({
        on: true,
        batchId,
        batchDate,
        size,
        category,
        catheterType,
        productType: String(productType),
      }),
    );
  }, [lotMemoryOn, batchId, batchDate, size, category, catheterType, productType]);

  const isPrimary = macro === "primary";
  const isSecondary = macro === "secondary";
  const isAssembly = macro === "assembly";

  const station = useMemo(
    () => (schema ? stationById(schema, stageId) : undefined),
    [schema, stageId],
  );
  const processName = station?.label ?? stageId;
  const columns = station?.columns ?? EMPTY_COLUMNS;
  const capturesHold = columns.includes("hold");
  const showChecked = !station || columns.includes("checked");
  const showAccept = columns.includes("accepted");
  const showReject = columns.includes("rejected");
  const showTrolleys = station?.extras.includes("trolleys") ?? false;
  const showBin = station?.extras.includes("bin") ?? false;
  const resolvedDefects = station?.defects ?? EMPTY_DEFECTS;

  const activeDefectsStageRef = useRef<string | null>(null);
  const [activeDefects, setActiveDefects] = useState(resolvedDefects);
  const defectsRef = useRef<Record<string, number>>({});
  defectsRef.current = defects;

  useEffect(() => {
    const stageChanged = activeDefectsStageRef.current !== stageId;
    activeDefectsStageRef.current = stageId;
    setActiveDefects((prev) =>
      nextDefectColumns({
        prev,
        incoming: resolvedDefects,
        stageChanged,
        touched: userTouchedQty.current,
        values: defectsRef.current,
      }),
    );
  }, [resolvedDefects, stageId]);

  const hideDefects = resolvedDefects.length === 0 && activeDefects.length === 0;

  useEffect(() => {
    if (!showTrolleys) return;
    setTrolleyDefects((prev) => {
      const next = resizeTrolleyDefects(prev, trolleys);
      if (next.length === prev.length) return prev;
      setDefects(sumTrolleyDefects(next));
      return next;
    });
  }, [showTrolleys, trolleys]);
  const sizeCanon = useMemo(() => toCanonicalSize(size), [size]);
  const catheterSizeOptions = useMemo(
    () => sizesFor(category, catheterType),
    [category, catheterType],
  );
  const prevStageId = useMemo(
    () => (schema ? previousAcceptedStageId(schema, stageId) : null),
    [schema, stageId],
  );

  // Fallback to valid station if renamed
  useEffect(() => {
    if (!schema) return;
    if (stationById(schema, stageId)) return;
    const first = stationsIn(schema, macro)[0] ?? schema.stations[0];
    if (first) {
      setStageId(first.stageId);
      setMacro((first.category as MacroId) || "primary");
    }
  }, [schema, stageId, macro]);

  const lotProgress = useMemo(
    () => progressFor(buildBatchProgress((events ?? []) as AuditEventLike[]), batchId),
    [events, batchId],
  );

  // Upstream carry-forward assist
  useEffect(() => {
    setPrefillNote(null);
    if (!prevStageId) return;
    if (userTouchedQty.current) return;
    if (!events || events.length === 0) return;
    const batchKey = canonicalBatchId(batchId) ?? batchId.trim().toUpperCase();
    if (!batchKey || !sizeCanon) return;
    const ctxKey = `${prevStageId}|${stageId}|${batchKey}|${sizeCanon}|${date}`;
    if (prefillAppliedKey.current === ctxKey) return;
    const r = upstreamRemainder({
      events: events as AuditEventLike[],
      lot: batchKey,
      previousStation: prevStageId,
      currentStation: stageId,
      size: sizeCanon,
      excludeDate: date,
    });
    if (r.remaining <= 0) return;
    setChecked(r.remaining);
    prefillAppliedKey.current = ctxKey;
    const prevLabel =
      (schema && stationById(schema, prevStageId)?.label) || prevStageId;
    const already =
      r.alreadyChecked > 0
        ? ` Remaining after ${r.alreadyChecked.toLocaleString()} already checked.`
        : "";
    setPrefillNote(
      `Auto-filled ${r.remaining} from ${prevLabel} accepted (${r.previousAccepted.toLocaleString()}) for batch ${batchKey}.${already}`,
    );
  }, [prevStageId, stageId, batchId, sizeCanon, date, events, schema]);

  const defectSum = useMemo(
    () => Object.values(defects).reduce((a, b) => a + (Number(b) || 0), 0),
    [defects],
  );

  // Reset Hold when leaving Hold-capturing stations
  useEffect(() => {
    if (!capturesHold) setHold((cur) => (cur === 0 ? cur : 0));
  }, [capturesHold]);

  const holdPart = capturesHold ? hold : 0;
  const impliedRejectFromBalance = Math.max(0, checked - accept - holdPart);

  useEffect(() => {
    if (!showReject) return;
    const next = checked > 0 ? impliedRejectFromBalance : 0;
    setReject((cur) => (cur === next ? cur : next));
  }, [showReject, checked, impliedRejectFromBalance]);

  const defectCoverage = useMemo(() => {
    if (!showReject || hideDefects) return null;
    const unexplained = reject - defectSum;
    return {
      sum: defectSum,
      reject,
      unexplained,
      state:
        reject === 0 && defectSum === 0
          ? ("empty" as const)
          : unexplained === 0
            ? ("complete" as const)
            : unexplained > 0
              ? ("short" as const)
              : ("over" as const),
    };
  }, [showReject, hideDefects, reject, defectSum]);

  const sumParts = (showAccept ? accept : 0) + holdPart + (showReject ? reject : 0);
  const qtyMismatch = showReject && (checked !== sumParts || checked === 0);
  const defectMismatch =
    !hideDefects && showReject && (reject > 0 || defectSum > 0) && defectSum !== reject;
  const qtyLabel = isPrimary ? "Quantity Produced" : isSecondary ? "Quantity" : "Checked Qty";

  const ledgerSummary = useMemo(
    () => summariseLedger((events ?? []) as AuditEventLike[]),
    [events],
  );

  const processSchema = useMemo(() => schema ?? resolveEntrySchema(null), [schema]);
  const entryFromStageId = activeConversionFlow?.stageId?.trim() || null;

  // The converted lot has its own rows. Parent stages are not this lot's
  // progress — they only tell us where entry is allowed to start.
  const occupied = useMemo(
    () => occupiedStageIds((events ?? []) as ProcessEventLike[], batchId, saved),
    [events, batchId, saved],
  );

  const inheritedStages = useMemo(
    () => (entryFromStageId ? inheritedStageIds(processSchema, entryFromStageId) : []),
    [processSchema, entryFromStageId],
  );

  const lineStatus = useMemo(
    () => buildLineStatus({ lot: batchId, schema: processSchema, occupied, entryFromStageId }),
    [batchId, processSchema, occupied, entryFromStageId],
  );

  const completedStageIds = useMemo(
    () => processSchema.stations.filter((s) => lotHasStage(occupied, s.stageId)).map((s) => s.stageId),
    [processSchema, occupied],
  );

  const inspectAll = persona === "gm";

  const trackedLot = isValidBatchId(batchId.trim())
    ? (canonicalBatchId(batchId) ?? batchId.trim().toUpperCase())
    : "";

  useEffect(() => {
    if (editingId) return;
    // Land once on the station where the size changed, including for a GM.
    // After that, a GM can still open earlier stations to inspect them.
    if (entryFromStageId && stageIsBefore(stageId, entryFromStageId)) {
      const landKey = `${trackedLot}|${entryFromStageId}`;
      if (conversionLanded.current !== landKey) {
        conversionLanded.current = landKey;
        const cat = stationById(processSchema, entryFromStageId)?.category;
        if (cat) setMacro(cat as MacroId);
        setStageId(entryFromStageId);
        userPickedStation.current = true;
        lastLineJump.current = landKey;
        return;
      }
    }
    if (inspectAll) return;
    const sig = `${trackedLot}|${lineStatus.nextStationId ?? ""}`;
    const prevLot = lastLineJump.current?.split("|")[0] ?? null;
    const lotChanged = prevLot !== trackedLot;
    if (lotChanged) {
      if (entryFromStageId) {
        const cat = stationById(processSchema, entryFromStageId)?.category;
        if (cat) setMacro(cat as MacroId);
        setStageId(entryFromStageId);
        userPickedStation.current = true;
        lastLineJump.current = `${trackedLot}|${entryFromStageId}`;
        return;
      }
      userPickedStation.current = false;
    }
    if (!lotChanged && userPickedStation.current) {
      lastLineJump.current = sig;
      return;
    }
    if (lastLineJump.current === sig) return;
    lastLineJump.current = sig;
    if (!lineStatus.nextStationId) return;
    if (stageId === lineStatus.nextStationId) return;
    if (lineStatus.nextLaneId) setMacro(lineStatus.nextLaneId as MacroId);
    setStageId(lineStatus.nextStationId);
    // stageId is read for the no-op guard only; jumping is keyed on the lot + next station.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedLot, lineStatus.nextStationId, lineStatus.nextLaneId, editingId, inspectAll, entryFromStageId, processSchema, stageId]);

  const lockedMacroIds = useMemo(() => {
    if (editingId || inspectAll) return [];
    return schemaCategories(processSchema)
      .map((c) => c.id)
      .filter((id) => {
        const sts = stationsIn(processSchema, id);
        if (sts.some((s) => lotHasStage(occupied, s.stageId))) return false;
        const first = sts[0];
        if (!first) return false;
        return !mayOpenStation({
          lot: batchId,
          station: first.stageId,
          schema: processSchema,
          occupied,
          entryFromStageId,
        }).ok;
      });
  }, [processSchema, batchId, occupied, editingId, inspectAll, entryFromStageId]);

  const lockedStageIds = useMemo(() => {
    if (editingId || inspectAll) return [];
    return stationsIn(processSchema, macro)
      .map((st) => st.stageId)
      .filter(
        (id) =>
          !mayOpenStation({
            lot: batchId,
            station: id,
            schema: processSchema,
            occupied,
            entryFromStageId,
          }).ok,
      );
  }, [processSchema, macro, batchId, occupied, editingId, inspectAll, entryFromStageId]);

  const verdict = useMemo(
    () =>
      checkEntry(
        {
          lot: batchId.trim().toUpperCase(),
          station: stageId,
          stationLabel: processName,
          pass,
          passReason,
          size,
          date,
          checked,
          accepted: showAccept ? accept : 0,
          hold: capturesHold ? hold : 0,
          rejected: showReject ? reject : 0,
          defectSum,
          capturesAccepted: showAccept,
          capturesHold,
          capturesRejected: showReject,
          capturesDefects: !hideDefects,
          editing: !!editingId,
        },
        ledgerSummary,
        today(),
        { schema: processSchema, occupied, entryFromStageId },
      ),
    [
      batchId,
      stageId,
      processName,
      pass,
      passReason,
      size,
      date,
      checked,
      accept,
      hold,
      reject,
      defectSum,
      showAccept,
      capturesHold,
      showReject,
      hideDefects,
      editingId,
      ledgerSummary,
      processSchema,
      occupied,
      entryFromStageId,
    ],
  );

  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const [ackReasons, setAckReasons] = useState<Record<string, string>>({});
  const warningKey = verdict.warnings.map((w) => w.code).join(",");
  useEffect(() => {
    setAcked({});
    setAckReasons({});
  }, [warningKey]);

  const [saveAttempted, setSaveAttempted] = useState(false);
  const formEngaged =
    checked > 0 ||
    accept > 0 ||
    hold > 0 ||
    trolleys > 0 ||
    bin.trim() !== "" ||
    remarks.trim() !== "" ||
    defectSum > 0 ||
    !!editingId;
  const showBlocks = formEngaged || saveAttempted;
  const showAdvisories = saveAttempted || !!editingId;

  const attemptCtx = `${stageId}|${batchId.trim().toUpperCase()}`;
  const attemptCtxRef = useRef(attemptCtx);
  useEffect(() => {
    if (attemptCtxRef.current === attemptCtx) return;
    attemptCtxRef.current = attemptCtx;
    setSaveAttempted(false);
  }, [attemptCtx]);

  const passCtx = `${stageId}|${canonicalBatchId(batchId) ?? batchId.trim().toUpperCase()}`;
  useEffect(() => {
    if (passCtxRef.current === null) {
      passCtxRef.current = passCtx;
      return;
    }
    if (passCtxRef.current === passCtx) return;
    passCtxRef.current = passCtx;
    setPass(1);
    setPassReason("");
  }, [passCtx]);

  const shiftConfig = useMemo(() => readShiftWindowConfig(), [tick]);
  const withinShift = useMemo(
    () => isWithinShiftWindow(shift, new Date(), shiftConfig),
    [shift, shiftConfig, tick],
  );
  const currentEntryKey = useMemo(
    () =>
      entryKey({
        date,
        batchId: batchId.trim().toUpperCase(),
        stageId,
        size: sizeCanon ?? size,
        productType: String(productType),
      }),
    [date, batchId, stageId, sizeCanon, size, productType],
  );
  const hasGrant = useMemo(
    () => hasValidGrant(currentEntryKey),
    [currentEntryKey, tick],
  );
  const mayEdit = canWrite && (persona !== "operator" || withinShift || hasGrant);

  const unackedWarnings = verdict.warnings.filter((w) => !acked[w.code]);
  const saveDisabled =
    saving || !mayEdit || !verdict.canSave || (showAdvisories && unackedWarnings.length > 0);

  const resetQtys = useCallback(() => {
    setChecked(0);
    setTrolleys(0);
    setBin("");
    setAccept(0);
    setHold(0);
    setReject(0);
    setDefects({});
    setTrolleyDefects([]);
    setRemarks("");
    setPrefillNote(null);
    userTouchedQty.current = false;
    prefillAppliedKey.current = null;
    duplicateConfirmedOfRef.current = null;
  }, []);

  const touchQty = useCallback(() => {
    userTouchedQty.current = true;
    setPrefillNote(null);
  }, []);

  const loadRecordIntoForm = useCallback(
    (rec: {
      batchId: string;
      date: string;
      stageId: string;
      size?: string | null;
      productType?: string | null;
      shift?: string | null;
      operator?: string | null;
      checked: number;
      accept: number;
      hold: number;
      reject: number;
      trolleys?: number;
      bin?: string;
      defects?: Record<string, number>;
      trolleyDefects?: TrolleyDefectRow[];
      remarks?: string;
      pass?: number;
      passReason?: string | null;
      editingId: string;
    }) => {
      const sid = rec.stageId;
      const macro = ((schema ? stationById(schema, sid)?.category : undefined) ?? "assembly") as MacroId;
      setMacro(macro);
      setStageId(sid);
      setDate(rec.date);
      if (rec.size) {
        const display = toDisplaySize(rec.size) ?? rec.size;
        setSize(display);
      }
      if (rec.productType) applyProductType(rec.productType);
      if (rec.shift) setShift(rec.shift);
      if (rec.operator) setOperator(toEntryRole(rec.operator));
      const lot = rec.batchId.trim().toUpperCase();
      setBatchId(lot);
      const parsedLot = parseBatchId(lot);
      if (parsedLot?.date) setBatchDate(parsedLot.date);
      setChecked(rec.checked);
      setTrolleys(rec.trolleys ?? 0);
      setBin(rec.bin ?? "");
      setAccept(rec.accept);
      setHold(rec.hold);
      setReject(rec.reject);
      setDefects({ ...(rec.defects ?? {}) });
      setTrolleyDefects(
        rec.trolleyDefects && rec.trolleyDefects.length > 0
          ? rec.trolleyDefects
          : rowsFromLegacyTotals(rec.defects ?? {}, rec.trolleys ?? 0),
      );
      setRemarks(rec.remarks ?? "");
      setPass(rec.pass ?? 1);
      setPassReason(rec.passReason ?? "");
      passCtxRef.current = `${sid}|${canonicalBatchId(lot) ?? lot}`;
      userTouchedQty.current = true;
      prefillAppliedKey.current = null;
      setPrefillNote(null);
      setEditing(rec.editingId);
      setReceipt(null);
      setLastIssues(null);
    },
    [schema, applyProductType, setEditing],
  );

  // History hydration
  useEffect(() => {
    if (!hydrate) return;
    if (hydrate.mode === "reuse-lot") {
      setEditing(null);
      setBatchId(hydrate.batchId);
      const p = parseBatchId(hydrate.batchId);
      if (p?.date) setBatchDate(p.date);
      if (hydrate.date) setDate(hydrate.date);
      if (p?.sizeFr) {
        setSize(`${p.sizeFr}Fr`);
      } else if (hydrate.size) {
        setSize(hydrate.size.endsWith("Fr") ? hydrate.size : `${hydrate.size}Fr`);
      }
      if (hydrate.productType) {
        applyProductType(hydrate.productType);
      }
      if (hydrate.stageId) {
        setStageId(hydrate.stageId);
        setMacro((stageCategoryOf(hydrate.stageId) as MacroId) || "primary");
        userPickedStation.current = true;
        lastLineJump.current = `${hydrate.batchId}|${hydrate.stageId}`;
      }
      if (hydrate.checked > 0) {
        setChecked(hydrate.checked);
        setAccept(hydrate.accepted > 0 ? hydrate.accepted : hydrate.checked);
        setHold(hydrate.hold ?? 0);
        setReject(hydrate.rejected ?? 0);
        setDefects(hydrate.defects ?? {});
        setTrolleyDefects([]);
        userTouchedQty.current = true;
      }
      onHydrateConsumed?.();
      return;
    }
    const local = loadShift().find(
      (b) =>
        b.batchId.trim().toUpperCase() === hydrate.batchId.trim().toUpperCase() &&
        migrateToStageId(b) === hydrate.stageId &&
        b.date === hydrate.date,
    );
    loadRecordIntoForm({
      batchId: hydrate.batchId,
      date: hydrate.date,
      stageId: hydrate.stageId,
      size: hydrate.size,
      productType: hydrate.productType,
      shift: hydrate.shift,
      checked: hydrate.checked,
      accept: hydrate.accepted,
      hold: hydrate.hold,
      reject: hydrate.rejected,
      trolleys: local?.trolleys,
      bin: local?.bin,
      defects: Object.keys(hydrate.defects).length ? hydrate.defects : local?.defects ?? {},
      trolleyDefects: local?.trolleyDefects,
      remarks: local?.remarks,
      pass: local?.pass,
      passReason: local?.passReason,
      editingId: local?.id ?? hydrate.editingId,
    });
    onHydrateConsumed?.();
  }, [hydrate, loadRecordIntoForm, onHydrateConsumed]);

  const handleCategoryChange = (next: CatheterCategory) => {
    setCategory(next);
    const nextType = typeIsSelectable(next) ? catheterType : "2 way";
    if (!typeIsSelectable(next)) setCatheterType("2 way");
    setProductType(productTypeFor(next, nextType));
    const options = sizesFor(next, nextType);
    if (!options.includes(size)) setSize(options[0]);
  };

  const handleCatheterTypeChange = (next: CatheterType) => {
    setCatheterType(next);
    setProductType(productTypeFor(category, next));
    const options = sizesFor(category, next);
    if (!options.includes(size)) setSize(options[0]);
  };

  const handleSetQty = (
    field: "checked" | "trolleys" | "accept" | "hold" | "reject",
    n: number | null,
  ) => {
    touchQty();
    const v = n ?? 0;
    if (field === "checked") setChecked(v);
    else if (field === "trolleys") {
      setTrolleys(v);
      if (showTrolleys) {
        const next = resizeTrolleyDefects(trolleyDefects, v);
        setTrolleyDefects(next);
        setDefects(sumTrolleyDefects(next));
      }
    } else if (field === "accept") setAccept(v);
    else if (field === "hold") setHold(v);
    else if (!showReject) setReject(v);
  };

  const handleSetDefectQty = (key: string, n: number | null) => {
    touchQty();
    setDefects((prev) => {
      const next = { ...prev };
      if (n == null || n === 0) delete next[key];
      else next[key] = n;
      return next;
    });
  };

  const handleSetTrolleyDefectQty = (trolleyIndex: number, key: string, n: number | null) => {
    touchQty();
    const next = setTrolleyDefect(trolleyDefects, trolleyIndex, key, n);
    setTrolleyDefects(next);
    setDefects(sumTrolleyDefects(next));
  };

  const clearFormKeepContext = () => {
    resetQtys();
    setSaveAttempted(false);
    if (lotMemoryOn) return;
    setBatchId("");
  };

  const startFreshLotAtDipping = () => {
    setLotMemoryOn(false);
    writeLotMemory(null);
    setBatchId("");
    resetQtys();
    setSaveAttempted(false);
    setPass(1);
    setPassReason("");
    const first = stationsIn(processSchema, "primary")[0];
    setMacro("primary");
    setStageId(first?.stageId ?? "production");
    notify("Lot finished at Final. Start the next lot at Dipping.", "success", "Next lot");
  };

  const toggleLotMemory = () => {
    if (lotMemoryOn) {
      setLotMemoryOn(false);
      writeLotMemory(null);
      return;
    }
    const lot = batchId.trim().toUpperCase();
    if (!isValidBatchId(lot)) {
      notify("Create the lot at Dipping first, then turn Memory on.", "warning", "Lot memory");
      return;
    }
    setLotMemoryOn(true);
    writeLotMemory(
      snapshotLotMemory({
        on: true,
        batchId: lot,
        batchDate,
        size,
        category,
        catheterType,
        productType: String(productType),
      }),
    );
  };

  const openStationForLot = async (sid: string): Promise<boolean> => {
    const allowed = mayOpenStation({
      lot: batchId,
      station: sid,
      schema: processSchema,
      occupied,
      editing: !!editingIdRef.current,
      inspectAll,
      entryFromStageId,
    });
    if (!allowed.ok) {
      const go = await confirmModal({
        title: "Complete earlier entry first",
        description: `${allowed.gap.message} ${allowed.gap.action}`,
        confirmText: `Go to ${allowed.gap.missingStationLabel}`,
        cancelText: "Stay here",
        variant: "warning",
      });
      if (go) {
        setMacro((allowed.gap.missingLane as MacroId) || "primary");
        setStageId(allowed.gap.missingStationId);
      }
      return false;
    }

    if (
      stageId &&
      stageId !== sid &&
      (checked > 0 || accept > 0 || hold > 0 || reject > 0 || Object.keys(defects).length > 0)
    ) {
      workingStageInputsRef.current[stageId] = {
        checked,
        accept,
        hold,
        reject,
        defects: { ...defects },
        trolleys,
        trolleyDefects: [...trolleyDefects],
        bin,
        remarks,
      };
    }

    userPickedStation.current = true;

    const working = workingStageInputsRef.current[sid];
    if (working && (working.checked > 0 || working.accept > 0 || working.hold > 0 || working.reject > 0)) {
      const cat = (stationById(processSchema, sid)?.category as MacroId) || "primary";
      setMacro(cat);
      setStageId(sid);
      setChecked(working.checked);
      setAccept(working.accept);
      setHold(working.hold);
      setReject(working.reject);
      setDefects({ ...working.defects });
      setTrolleys(working.trolleys);
      setTrolleyDefects(working.trolleyDefects);
      setBin(working.bin);
      setRemarks(working.remarks);
      setEditing(null);
      userTouchedQty.current = true;
      setPrefillNote(null);
      return true;
    }

    const local = latestLocalRowForLotStation(saved, batchId, sid);
    if (local && (local.checked > 0 || local.accept > 0 || local.hold > 0 || local.reject > 0)) {
      loadRecordIntoForm({
        batchId: local.batchId,
        date: local.date,
        stageId: local.stageId || sid,
        size: local.size,
        productType: local.productType,
        shift: local.shift,
        operator: local.operator,
        checked: local.checked,
        accept: local.accept,
        hold: local.hold,
        reject: local.reject,
        trolleys: local.trolleys,
        bin: local.bin,
        defects: local.defects,
        trolleyDefects: local.trolleyDefects,
        remarks: local.remarks,
        pass: local.pass,
        passReason: local.passReason,
        editingId: local.id,
      });
      setPrefillNote(`Showing ${local.processName || sid} as recorded for this lot.`);
      return true;
    }

    const row = latestLedgerRowForLotStation((events ?? []) as AuditEventLike[], batchId, sid);
    if (row && (row.checked > 0 || row.accepted > 0 || row.rejected > 0 || row.rework > 0)) {
      const h = hydrateFromAuditRow(row, "edit");
      const targetLot = h.batchId;
      const tCount = trolleysFromEvents((events ?? []) as AuditEventLike[], targetLot, sid);
      loadRecordIntoForm({
        batchId: h.batchId,
        date: h.date,
        stageId: h.stageId,
        size: h.size,
        productType: h.productType,
        shift: h.shift,
        checked: h.checked,
        accept: h.accepted,
        hold: h.hold,
        reject: h.rejected,
        trolleys: tCount,
        defects: h.defects,
        trolleyDefects:
          trolleyDefectsFromEvents((events ?? []) as AuditEventLike[], targetLot, sid) ??
          rowsFromLegacyTotals(h.defects, tCount),
        editingId: h.editingId,
      });
      const label = stationById(processSchema, sid)?.label ?? sid;
      setPrefillNote(`Showing ${label} as recorded for this lot.`);
      return true;
    }

    const cat = (stationById(processSchema, sid)?.category as MacroId) || "primary";
    setMacro(cat);
    setStageId(sid);
    resetQtys();
    setEditing(null);
    return true;
  };

  async function commitRecord(rec: ShiftBatchRecord): Promise<EntryIssue[]> {
    const ingestionId = globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}`;
    const payload = [toStageDayRecord(rec, ingestionId)];
    const res = await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingestionId,
        fileName: `Batch Entry ${rec.batchId}`,
        records: payload,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const issues = Array.isArray(body.issues) ? (body.issues as EntryIssue[]) : [];
    if (!res.ok) {
      const err = new Error(formatLedgerBlockReason(body.error, issues));
      (err as Error & { issues?: EntryIssue[] }).issues = issues;
      throw err;
    }
    return issues;
  }

  function buildPendingRecord(): ShiftBatchRecord {
    const canon = toCanonicalSize(size) ?? size;
    return {
      id: editingIdRef.current ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      operator: operator.trim(),
      macro,
      micro: stageId,
      stageId,
      stageName: processName,
      processName,
      size: toDisplaySize(size) ?? size,
      sizeCanonical: canon,
      productType: productType || "2 way",
      batchId: batchId.trim().toUpperCase(),
      checked,
      accept: showAccept ? accept : 0,
      hold: capturesHold ? hold : 0,
      reject: showReject ? reject : 0,
      trolleys: showTrolleys ? trolleys : undefined,
      trolleyDefects: showTrolleys && trolleyDefects.length > 0 ? trolleyDefects : undefined,
      bin: showBin ? bin.trim() : undefined,
      defects: hideDefects ? {} : { ...defects },
      remarks: remarks.trim(),
      shift,
      savedAt: new Date().toISOString(),
      synced: false,
      duplicateConfirmedOf: duplicateConfirmedOfRef.current,
      pass,
      passReason: pass > 1 ? passReason.trim() : null,
    };
  }

  async function postNotification(body: Record<string, unknown>) {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) notifyNotificationsChanged();
    } catch {
      /* non-blocking */
    }
  }

  async function notifyException(opts: {
    kind: string;
    reason: string;
    warningMessage?: string;
  }) {
    const body =
      `${operator.trim() || "Operator"} saved ${batchId.trim().toUpperCase() || "(no batch)"} · ` +
      `${processName} · ${size} · ${date}. Reason: ${opts.reason}`;

    await postNotification({
      type: "entry_exception",
      title: `Exception Recorded: ${opts.kind}`,
      body,
      createdBy: operator.trim() || "operator",
      targetPersona: "gm",
      payload: {
        kind: opts.kind,
        date,
        batchId: batchId.trim().toUpperCase(),
        stageId,
        operator: operator.trim(),
        shift,
        checked,
        accept,
        reject,
        reason: opts.reason,
      },
    });
  }

  async function finalizeSave(rec: ShiftBatchRecord) {
    setSaving(true);
    try {
      const revising = saved.some((b) => b.id === rec.id);
      const issues = await commitRecord(rec);
      setLastIssues(issues.length ? { batchId: rec.batchId, stage: rec.processName, issues } : null);
      const withSync = { ...rec, synced: true };
      const next = revising
        ? saved.map((b) => (b.id === rec.id ? withSync : b))
        : [withSync, ...saved];
      setSaved(next);
      persistShift(next);

      localStorage.setItem("rais_hdr_operator", rec.operator);
      localStorage.setItem("rais_hdr_shift", rec.shift);
      if (rec.productType) localStorage.setItem(PRODUCT_TYPE_STORAGE_KEY, String(rec.productType));

      if (activeConversionFlow?.fromBatch && activeConversionFlow?.toSize) {
        try {
          const posted = await fetch("/api/batch-conversions", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fromBatch: activeConversionFlow.fromBatch,
              toSize: activeConversionFlow.toSize,
              toBatch: rec.batchId,
              changedQty: activeConversionFlow.changedQty ?? rec.checked,
              stageId: activeConversionFlow.stageId || rec.stageId,
              convertedOn: rec.date,
              reason: activeConversionFlow.reason || "Customer / process",
            }),
          });
          if (posted.ok) {
            const body = (await posted.json().catch(() => null)) as { conversion?: BatchConversion } | null;
            if (body?.conversion) noteConversion(body.conversion);
            await refreshConversions().catch(() => {});
          }
        } catch {
          /* non-blocking */
        }
      }

      setReceipt({
        batchId: rec.batchId,
        stageName: rec.processName,
        size: rec.size,
        checked: rec.checked,
        accept: rec.accept,
        reject: rec.reject,
        savedAt: rec.savedAt,
        synced: true,
      });

      setEditing(null);
      userPickedStation.current = false;
      if (isLineCompleteStage(rec.stageId)) startFreshLotAtDipping();
      else clearFormKeepContext();
      refreshEvents().catch(console.error);
      onSynced?.();
    } catch (e: any) {
      // Offline / ledger-reject fallback: keep the row on this workstation.
      const next = saved.some((b) => b.id === rec.id)
        ? saved.map((b) => (b.id === rec.id ? rec : b))
        : [rec, ...saved];
      setSaved(next);
      persistShift(next);

      const issues = Array.isArray(e?.issues) ? (e.issues as EntryIssue[]) : [];
      setLastIssues(issues.length ? { batchId: rec.batchId, stage: rec.processName, issues } : null);

      setReceipt({
        batchId: rec.batchId,
        stageName: rec.processName,
        size: rec.size,
        checked: rec.checked,
        accept: rec.accept,
        reject: rec.reject,
        savedAt: rec.savedAt,
        synced: false,
        error: formatLedgerBlockReason(e?.message ?? "Could not reach ledger server", issues),
      });

      setEditing(null);
      userPickedStation.current = false;
      if (isLineCompleteStage(rec.stageId)) startFreshLotAtDipping();
      else clearFormKeepContext();
    } finally {
      setSaving(false);
    }
  }

  async function flushPendingToLedger(rows: ShiftBatchRecord[]) {
    const pending = rows.filter((b) => !b.synced);
    if (pending.length === 0) return;
    setIsSyncingAll(true);
    let next = [...rows];
    let ok = 0;
    for (const rec of pending) {
      try {
        await commitRecord(rec);
        next = next.map((b) => (b.id === rec.id ? { ...b, synced: true } : b));
        ok++;
      } catch {
        /* fail recorded locally */
      }
    }
    setSaved(next);
    persistShift(next);
    setIsSyncingAll(false);
    if (ok > 0) refreshEvents().catch(console.error);
  }

  // Submit Handler
  const submitForm = async () => {
    setSaveAttempted(true);
    if (!verdict.canSave) return;

    if (unackedWarnings.length > 0) return;

    const pending = buildPendingRecord();

    // Exception notifications for acknowledged warnings
    const reasons = collectEntryReasons({
      warnings: verdict.warnings,
      ackReasons,
      pass,
      passReason,
    });
    if (reasons.length > 0) {
      for (const r of reasons) {
        await notifyException({
          kind: r.kind,
          reason: r.reason,
          warningMessage: r.warningMessage,
        });
      }
    }

    await finalizeSave(pending);
  };

  const deleteLocal = async (id: string) => {
    const rec = saved.find((b) => b.id === id);
    if (!rec) return;

    const ok = await confirmModal({
      title: rec.synced ? "Erase Ledger Record" : "Remove Local Batch",
      description: rec.synced
        ? `Are you sure you want to erase batch ${rec.batchId} from the plant ledger?`
        : `Remove batch ${rec.batchId} from this device's shift list?`,
      confirmText: rec.synced ? "Erase Record" : "Remove",
      variant: "danger",
    });
    if (!ok) return;

    const next = saved.filter((b) => b.id !== id);
    setSaved(next);
    persistShift(next);
    if (editingId === id) {
      setEditing(null);
      resetQtys();
    }
  };

  const exportCSV = () => {
    if (saved.length === 0) return;
    const headers = [
      "ID",
      "Date",
      "Shift",
      "Operator",
      "Section",
      "Stage",
      "Product Type",
      "Size",
      "Batch ID",
      "Checked Qty",
      "Trolleys",
      "Bin",
      "Accepted Qty",
      "Hold Qty",
      "Rejected Qty",
      "Defects Log",
      "Remarks",
      "Synced To Ledger",
    ];
    const rows = saved.map((r) => [
      r.id,
      r.date,
      r.shift,
      r.operator,
      r.macro,
      r.processName,
      r.productType || "2 way",
      r.size,
      r.batchId,
      r.checked,
      r.trolleys ?? "",
      r.bin ?? "",
      r.accept,
      r.hold,
      r.reject,
      JSON.stringify(r.defects || {}),
      `"${(r.remarks || "").replace(/"/g, '""')}"`,
      r.synced ? "YES" : "NO",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `shift_entries_${today()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 60 }}>
      {/* 1. Context & Station Selection */}
      <EntryContextBar
        macro={macro}
        onSelectMacro={async (m) => {
          const lane = lineStatus.lanes.find((l) => l.id === m);
          const target =
            (inspectAll ? null : lane?.nextStationId) ??
            stationsIn(processSchema, m)[0]?.stageId;
          if (target) {
            await openStationForLot(target);
            return;
          }
          userPickedStation.current = true;
          setMacro(m);
        }}
        stageId={stageId}
        onSelectStage={(sid) => {
          void openStationForLot(sid);
        }}
        schema={schema}
        shift={shift}
        withinShift={withinShift}
        hasGrant={hasGrant}
        editingId={editingId}
        onCancelEdit={() => {
          setEditing(null);
          resetQtys();
        }}
        persona={persona}
        lockedMacroIds={lockedMacroIds}
        lockedStageIds={lockedStageIds}
        lineStatus={lineStatus}
        completedStageIds={completedStageIds}
        inheritedStageIds={inheritedStages}
        inspectAll={inspectAll}
      />

      {/* 2. Durable Receipt Card & Server Clarifications */}
      <LedgerReceiptCard
        receipt={receipt}
        lastIssues={lastIssues}
        onDismissReceipt={() => setReceipt(null)}
        onDismissIssues={() => setLastIssues(null)}
        onRetrySync={() => flushPendingToLedger(saved)}
        isRetryingSync={isSyncingAll}
      />

      {/* 3. Batch Identity Workspace */}
      <BatchIdentityZone
        date={date}
        onDateChange={setDate}
        shift={shift}
        onShiftChange={setShift}
        operator={operator}
        onOperatorChange={setOperator}
        category={category}
        onCategoryChange={handleCategoryChange}
        catheterType={catheterType}
        onCatheterTypeChange={handleCatheterTypeChange}
        size={size}
        onSizeChange={setSize}
        catheterSizeOptions={catheterSizeOptions}
        batchId={batchId}
        onBatchIdChange={setBatchId}
        batchDate={batchDate}
        onBatchDateChange={setBatchDate}
        pass={pass}
        onPassChange={setPass}
        passReason={passReason}
        onPassReasonChange={setPassReason}
        lotProgress={lotProgress}
        processName={processName}
        macro={macro}
        editingId={editingId}
        memoryOn={lotMemoryOn}
        onToggleMemory={toggleLotMemory}
        hideConvertBatch={hideConvertBatch || Boolean(activeConversionFlow)}
        conversionFlow={activeConversionFlow}
        stageId={stageId}
        checked={checked}
        accepted={accept}
        hold={hold}
        reject={reject}
      />

      {/* 4. Quantity Reconciliation Workspace */}
      <QuantityReconciliationZone
        macro={macro}
        processName={processName}
        showChecked={showChecked}
        showAccept={showAccept}
        capturesHold={capturesHold}
        showReject={showReject}
        showTrolleys={showTrolleys}
        showBin={showBin}
        checked={checked}
        accept={accept}
        hold={hold}
        reject={reject}
        trolleys={trolleys}
        bin={bin}
        onSetQty={handleSetQty}
        onSetBin={setBin}
        prefillNote={prefillNote}
        impliedRejectFromBalance={impliedRejectFromBalance}
        defectCoverage={defectCoverage}
      />

      {/* 5. Defect Breakdown Workspace */}
      {!hideDefects && showReject && (
        <DefectWorkspace
          activeDefects={activeDefects}
          defects={defects}
          onSetDefectQty={handleSetDefectQty}
          onClearAllDefects={() => {
            touchQty();
            setDefects({});
            setTrolleyDefects(showTrolleys ? resizeTrolleyDefects([], trolleys) : []);
          }}
          reject={reject}
          trolleyMode={showTrolleys}
          trolleyCount={trolleys}
          trolleyDefects={trolleyDefects}
          onSetTrolleyDefectQty={handleSetTrolleyDefectQty}
        />
      )}

      {/* 6. Remarks & Operational Evidence */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "16px 20px",
          marginBottom: 20,
          boxShadow: "var(--shadow-1)",
        }}
      >
        <label
          htmlFor="batch-remarks"
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-2)",
            marginBottom: 6,
          }}
        >
          Remarks & Shift Hand-Over Notes (Optional)
        </label>
        <textarea
          id="batch-remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Optional notes for QA / next operator regarding lot condition or line setup…"
          style={{
            width: "100%",
            minHeight: 52,
            padding: "10px 12px",
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border-strong)",
            background: "var(--surface-2)",
            color: "var(--text)",
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
          }}
        />
      </div>

      {/* 7. Issue & Decision Summary */}
      <IssueSummaryZone
        verdict={verdict}
        showBlocks={showBlocks}
        showAdvisories={showAdvisories}
        acked={acked}
        onAckChange={(code, val) => setAcked((prev) => ({ ...prev, [code]: val }))}
        ackReasons={ackReasons}
        onAckReasonChange={(code, val) => setAckReasons((prev) => ({ ...prev, [code]: val }))}
      />

      {/* 8. Sticky Save Bar */}
      <StickySaveBar
        batchId={batchId}
        processName={processName}
        size={size}
        qtyLabel={qtyLabel}
        checked={checked}
        showReject={showReject}
        qtyMismatch={qtyMismatch}
        defectMismatch={defectMismatch}
        defectSum={defectSum}
        reject={reject}
        editingId={editingId}
        onCancelEdit={() => {
          setEditing(null);
          resetQtys();
        }}
        onSubmitForm={submitForm}
        saveDisabled={saveDisabled}
        saving={saving}
        blockMessage={verdict.blocks[0]?.message}
      />

      {/* 9. Current Shift Queue */}
      <ShiftQueueTable
        saved={saved}
        onEditRow={(rec) => {
          loadRecordIntoForm({
            batchId: rec.batchId,
            date: rec.date,
            stageId: migrateToStageId(rec),
            size: rec.size,
            productType: rec.productType,
            shift: rec.shift,
            operator: rec.operator,
            checked: rec.checked,
            accept: rec.accept,
            hold: rec.hold,
            reject: rec.reject,
            trolleys: rec.trolleys,
            bin: rec.bin,
            defects: rec.defects,
            trolleyDefects: rec.trolleyDefects,
            remarks: rec.remarks,
            pass: rec.pass,
            passReason: rec.passReason,
            editingId: rec.id,
          });
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onDeleteRow={deleteLocal}
        onSyncSingleRow={async (rec) => {
          await finalizeSave(rec);
        }}
        onSyncAllPending={() => flushPendingToLedger(saved)}
        isSyncingAll={isSyncingAll}
        onExportCSV={exportCSV}
        canEraseLedger={canEraseLedger}
        editingId={editingId}
      />
    </div>
  );
}
