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
  stationById,
  stationsIn,
  type ResolvedEntrySchema,
  type QtyKey,
} from "@/lib/entry/entry-schema";
import {
  buildBatchId,
  parseBatchId,
  canonicalBatchId,
  toCanonicalSize,
  toDisplaySize,
} from "@/lib/entry/batch-id";
import { checkEntry, summariseLedger } from "@/lib/entry/check-entry";
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
import { readPrefill, clearPrefill } from "@/lib/agent/prefill";
import type { EntryHydrate } from "@/lib/entry/hydrate-entry";
import { useEvents } from "@/components/app/EventsContext";
import { usePersona } from "@/components/app/PersonaContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { loadDraft, saveDraft } from "@/lib/entry/draft";
import { buildBatchProgress, progressFor } from "@/lib/analytics/batch-progress";
import { buildEntryRows, type AuditEventLike } from "@/lib/analytics/audit-sessions";

// Modular Child Components
import EntryContextBar from "@/components/entry/EntryContextBar";
import BatchIdentityZone from "@/components/entry/BatchIdentityZone";
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
}: {
  onSynced?: () => void;
  hydrate?: EntryHydrate | null;
  onHydrateConsumed?: () => void;
}) {
  const { events, refreshEvents } = useEvents();
  const { canWrite, canEraseLedger, persona } = usePersona();
  const { schemaRev } = useRegistry();
  const passCtxRef = useRef<string | null>(null);
  const { confirm: confirmModal, notify } = useConfirm();

  const [macro, setMacro] = useState<MacroId>("assembly");
  const [stageId, setStageId] = useState("visual");
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
  const [batchId, setBatchId] = useState(() => buildBatchId(today(), "14Fr") ?? "");
  const [batchDate, setBatchDate] = useState(today);
  const [tick, setTick] = useState(0);

  const [checked, setChecked] = useState(0);
  const [trolleys, setTrolleys] = useState(0);
  const [bin, setBin] = useState("");
  const [accept, setAccept] = useState(0);
  const [hold, setHold] = useState(0);
  const [reject, setReject] = useState(0);
  const [defects, setDefects] = useState<Record<string, number>>({});
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
  const prefillAppliedKey = useRef<string | null>(null);
  const [schema, setSchema] = useState<ResolvedEntrySchema | null>(null);
  const draftReady = useRef(false);

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
    if (hydrate?.mode === "edit") {
      // Applied in hydrate effect below
    } else if (d) {
      setMacro((d.macro as MacroId) || "assembly");
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
      }
    }
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

  // Auto-compose batchId when batchDate or size changes
  useEffect(() => {
    const id = buildBatchId(batchDate, size);
    if (id) setBatchId(id);
  }, [batchDate, size]);

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
      setMacro((first.category as MacroId) || "assembly");
    }
  }, [schema, stageId, macro]);

  const lotProgress = useMemo(
    () => progressFor(buildBatchProgress((events ?? []) as AuditEventLike[]), batchId),
    [events, batchId],
  );

  // Upstream carry-forward assist
  useEffect(() => {
    setPrefillNote(null);
    if (!isAssembly || !prevStageId) return;
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
  }, [isAssembly, prevStageId, stageId, batchId, sizeCanon, date, events, schema]);

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
      setDefects({ ...rec.defects });
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
      setBatchId(hydrate.batchId);
      const p = parseBatchId(hydrate.batchId);
      if (p?.date) setBatchDate(p.date);
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
    else if (field === "trolleys") setTrolleys(v);
    else if (field === "accept") setAccept(v);
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

  const clearFormKeepContext = () => {
    resetQtys();
    setSaveAttempted(false);
    const id = buildBatchId(batchDate, size);
    if (id) setBatchId(id);
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
    if (!res.ok) throw new Error(body.error ?? "Ingest failed");
    return Array.isArray(body.issues) ? (body.issues as EntryIssue[]) : [];
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
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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
      clearFormKeepContext();
      refreshEvents().catch(console.error);
      onSynced?.();
    } catch (e: any) {
      // Offline fallback: save locally
      const next = saved.some((b) => b.id === rec.id)
        ? saved.map((b) => (b.id === rec.id ? rec : b))
        : [rec, ...saved];
      setSaved(next);
      persistShift(next);

      setReceipt({
        batchId: rec.batchId,
        stageName: rec.processName,
        size: rec.size,
        checked: rec.checked,
        accept: rec.accept,
        reject: rec.reject,
        savedAt: rec.savedAt,
        synced: false,
        error: String(e?.message ?? "Could not reach ledger server"),
      });

      setEditing(null);
      clearFormKeepContext();
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
        onSelectMacro={(m) => {
          setMacro(m);
          const first = schema ? stationsIn(schema, m)[0] : undefined;
          if (first) setStageId(first.stageId);
        }}
        stageId={stageId}
        onSelectStage={setStageId}
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
          }}
          reject={reject}
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
