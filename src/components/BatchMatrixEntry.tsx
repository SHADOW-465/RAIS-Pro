"use client";

// Shop-floor Data Entry Matrix — single-batch form matching
// Disposafe_Data_Entry_System_Documentation.md.
// Upload to ledger (POST /api/ingest) and keep a local shift log.
// Within the shift window operators may re-upload (supersede). After the
// window closes, pending local rows auto-upload and further edits need a GM grant.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import { useConfirm } from "@/components/ui/ConfirmContext";
import {
  MATRIX_STAGES,
  ENTRY_ROLES,
  toEntryRole,
  SECONDARY_BINS,
  SHIFT_STORAGE_KEY,
  PRODUCT_TYPES,
  PRODUCT_TYPE_STORAGE_KEY,
  CATHETER_CATEGORIES,
  CATHETER_TYPES,
  describeProductType,
  defectEntryTitle,
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
  buildBatchId,
  parseBatchId,
  formatBatchIdInput,
  frDigitsFromSize,
  isValidBatchId,
  canonicalBatchId,
  toCanonicalSize,
  toDisplaySize,
} from "@/lib/entry/batch-id";
import { checkEntry, summariseLedger } from "@/lib/entry/check-entry";
import { entryIdentity, identityKey } from "@/lib/entry/identity";
import { upstreamRemainder } from "@/lib/entry/upstream-remainder";
import { nextDefectColumns } from "@/lib/entry/defect-columns";
import {
  describeShiftWindow,
  isWithinShiftWindow,
  readShiftWindowConfig,
} from "@/lib/entry/shift-window";
import { entryKey, hasValidGrant } from "@/lib/entry/edit-grants";
import { toStageDayRecord, qtyHeaderFor } from "@/lib/entry/to-stage-day-record";
import { collectEntryReasons, remarksFromReasons, warningNeedsReason } from "@/lib/entry/exception-reasons";
import { readPrefill, clearPrefill } from "@/lib/agent/prefill";
import type { EntryHydrate } from "@/lib/entry/hydrate-entry";
import { STAGE_CATEGORY } from "@/core/ontology/plant-catalog";
import { useEvents } from "@/components/app/EventsContext";
import { usePersona } from "@/components/app/PersonaContext";
import { useRegistry } from "@/components/app/RegistryContext";
import QtyInput from "@/components/entry/QtyInput";
import { loadDraft, saveDraft } from "@/lib/entry/draft";
import BatchIdField from "@/components/entry/BatchIdField";
import { buildBatchProgress, progressFor } from "@/lib/analytics/batch-progress";
import { buildEntryRows, type AuditEventLike } from "@/lib/analytics/audit-sessions";
import LotProgress from "@/components/LotProgress";

const today = () => new Date().toISOString().slice(0, 10);

/** "1 Aug" — a date the way an operator says it, not "2026-08-01". */
function shortEntryDate(iso: string | null): string {
  if (!iso) return "an earlier day";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
}

/** In-progress (unsubmitted) batch form — restored on return to Data Entry. */
const DRAFT_KEY = "moid_entry_draft_batch";
const EMPTY_COLUMNS: QtyKey[] = [];
const EMPTY_DEFECTS: DefectDef[] = [];

interface BatchDraft {
  macro: string;
  /** Ledger stageId. Older drafts stored `micro` (p15-visual, …) instead. */
  stageId?: string;
  /** @deprecated Retired local process id — still read on restore. */
  micro?: string;
  date: string; size: string;
  productType?: string;
  operator: string; shift: string; batchId: string; batchDate: string;
  checked: number; trolleys: number; bin: string;
  accept: number; hold: number; reject: number;
  defects: Record<string, number>; remarks: string;
}

/** A clarification the ledger raised about a saved row (V-001, V-004, V-014…). */
interface EntryIssue {
  code: string;
  severity: "critical" | "warning" | "info";
  field: string;
  message: string;
  stated: number | null;
  computed: number | null;
  stageId?: string;
  date?: string;
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
  prefillBatchId,
  onPrefillConsumed,
  hydrate,
  onHydrateConsumed,
}: {
  onSynced?: () => void;
  /** @deprecated Use `hydrate` with mode "reuse-lot". Lot id from History → Reuse. */
  prefillBatchId?: string | null;
  onPrefillConsumed?: () => void;
  /** History → Edit (full record) or Reuse lot (code only). */
  hydrate?: EntryHydrate | null;
  onHydrateConsumed?: () => void;
}) {
  const { events, refreshEvents } = useEvents();
  const { canWrite, canConfigure, canEraseLedger, persona } = usePersona();
  const { schemaRev } = useRegistry();
  /** Stamped before pass-reset effect so loading a record does not look like a station change. */
  const passCtxRef = useRef<string | null>(null);
  const { confirm: confirmModal, notify } = useConfirm();

  const [macro, setMacro] = useState<string>("assembly");
  const [stageId, setStageId] = useState("visual");
  const [date, setDate] = useState(today);
  const [size, setSize] = useState("14Fr");
  const [productType, setProductType] = useState<ProductType | string>("2 way");
  const [category, setCategory] = useState<CatheterCategory>("Male");
  const [catheterType, setCatheterType] = useState<CatheterType>("2 way");
  /** Load a saved/legacy `productType` string into category+type WITHOUT
   *  touching size — used when restoring a draft or an existing record, where
   *  the stored size was already valid for that category at save time. The
   *  cascade (handleCategoryChange/handleCatheterTypeChange below) is only for
   *  the operator changing the dropdowns live. */
  const applyProductType = useCallback((pt: string) => {
    setProductType(pt);
    const { category: c, type: ty } = categoryAndTypeFrom(pt);
    setCategory(c);
    setCatheterType(ty);
  }, []);
  const [operator, setOperator] = useState<string>(ENTRY_ROLES[0]);
  const [shift, setShift] = useState("Day Shift");
  const [batchId, setBatchId] = useState(() => buildBatchId(today(), "14Fr") ?? "");
  /**
   * The day this LOT was started — the only input to the date part of the code.
   * Deliberately separate from `date` ("Recorded on"), which is the day this
   * station ran the lot. A batch spans several days on the floor, so the two
   * must not be the same value: coupling them renamed the lot every time the
   * operator moved to the next day's entry.
   */
  const [batchDate, setBatchDate] = useState(today);
  const [tick, setTick] = useState(0);
  const [requestingEdit, setRequestingEdit] = useState(false);
  const [checked, setChecked] = useState(0);
  const [trolleys, setTrolleys] = useState(0);
  const [bin, setBin] = useState("");
  const [accept, setAccept] = useState(0);
  const [hold, setHold] = useState(0);
  const [reject, setReject] = useState(0);
  const [defects, setDefects] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState("");
  const [saved, setSaved] = useState<ShiftBatchRecord[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Batch id currently being manually pushed to the ledger via the "Push to ledger" retry. */
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  /** Row expanded for preview in the shift list (click the row to toggle). */
  const [previewId, setPreviewId] = useState<string | null>(null);
  /** Filter over the defect tiles — 21 codes is a lot to scan on a shop floor. */
  const [defectFilter, setDefectFilter] = useState("");

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [savedSortOrder, setSavedSortOrder] = useState<"newest" | "oldest" | "batch-asc" | "batch-desc" | "volume-desc" | "rejection-desc">("newest");

  // Reset shift type filter if Female or Peadiatric is selected
  useEffect(() => {
    if ((categoryFilter === "Female" || categoryFilter === "Peadiatric") && typeFilter === "3 way") {
      setTypeFilter("all");
    }
  }, [categoryFilter, typeFilter]);

  const shiftTypeOptions = useMemo(() => {
    if (categoryFilter === "Female" || categoryFilter === "Peadiatric") {
      return [{ value: "all", label: "Type: 2 way" }];
    }
    return [
      { value: "all", label: "Type: All" },
      ...CATHETER_TYPES.map((t) => ({ value: t, label: `Type: ${t}` })),
    ];
  }, [categoryFilter]);

  const filteredSaved = useMemo(() => {
    let list = saved;
    if (categoryFilter !== "all" || typeFilter !== "all") {
      list = list.filter((b) => {
        const { category, type } = categoryAndTypeFrom(b.productType || "2 way");
        if (categoryFilter !== "all" && category !== categoryFilter) return false;
        if (typeFilter !== "all" && type !== typeFilter) return false;
        return true;
      });
    }
    return [...list].sort((a, b) => {
      if (savedSortOrder === "newest") return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
      if (savedSortOrder === "oldest") return new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime();
      if (savedSortOrder === "batch-asc") return a.batchId.localeCompare(b.batchId);
      if (savedSortOrder === "batch-desc") return b.batchId.localeCompare(a.batchId);
      if (savedSortOrder === "volume-desc") return b.checked - a.checked;
      if (savedSortOrder === "rejection-desc") return b.reject - a.reject;
      return 0;
    });
  }, [saved, categoryFilter, typeFilter, savedSortOrder]);

  /**
   * Row currently loaded into the form for revision. Save replaces this row in
   * place instead of appending a new one — and re-ingesting supersedes the
   * ledger event, since /api/ingest keys direct entry on date·stage·size·batch.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Same value as `editingId`, readable synchronously — buildPendingRecord
   *  runs in the same tick as the "save as a separate entry" decision, so it
   *  can't wait for a state update to know which id to stamp. */
  const editingIdRef = useRef<string | null>(null);
  const setEditing = useCallback((id: string | null) => {
    editingIdRef.current = id;
    setEditingId(id);
  }, []);
  /** Twin batch code the operator confirmed this one is genuinely distinct
   *  from (matching numbers, different lot) — stamped onto the next save. */
  const duplicateConfirmedOfRef = useRef<string | null>(null);
  /**
   * Which time this lot came through this station. 1 for the normal case — a
   * lot goes through a station once, so a second entry is a correction. The
   * operator can declare a genuine repeat, which then demands a reason; the
   * escape hatch exists so nobody is ever cornered into inventing a fake lot
   * code to get their work saved.
   */
  const [pass, setPass] = useState(1);
  const [passReason, setPassReason] = useState("");
  /** Clarifications the ledger raised about the row just saved. Sticky until
   *  dismissed — they were computed and discarded unread before this. */
  const [lastIssues, setLastIssues] = useState<
    { batchId: string; stage: string; issues: EntryIssue[] } | null
  >(null);
  /** Once the operator edits any qty, never auto-overwrite Checked from upstream. */
  const userTouchedQty = useRef(false);
  /** Prefill key already applied for this (batch, size, station) context. */
  const prefillAppliedKey = useRef<string | null>(null);
  const [schema, setSchema] = useState<ResolvedEntrySchema | null>(null);

  /** Draft restored (or confirmed absent) — gate the autosave so the empty
   *  initial render can't wipe a stored draft before it is read back. */
  const draftReady = useRef(false);

  useEffect(() => {
    setSaved(loadShift());
    const op = localStorage.getItem("rais_hdr_operator");
    if (op) setOperator(toEntryRole(op));
    const sh = localStorage.getItem("rais_hdr_shift");
    if (sh) setShift(sh);
    const pt = localStorage.getItem(PRODUCT_TYPE_STORAGE_KEY);
    if (pt) applyProductType(pt);

    const d = loadDraft<BatchDraft>(DRAFT_KEY);
    // History → Edit remounts this form with the row already in `hydrate`.
    // A leftover empty draft (left after the last save) must not win.
    if (hydrate?.mode === "edit") {
      /* applied in the hydrate effect */
    } else if (d) {
      setMacro(d.macro);
      setStageId(migrateToStageId(d));
      setDate(d.date); setSize(d.size);
      if (d.productType) applyProductType(d.productType);
      if (d.operator) setOperator(toEntryRole(d.operator));
      if (d.shift) setShift(d.shift);
      setBatchId(d.batchId);
      // Older drafts carry no batchDate — recover it from the code itself.
      setBatchDate(d.batchDate || parseBatchId(d.batchId)?.date || today());
      setChecked(d.checked); setTrolleys(d.trolleys); setBin(d.bin);
      setAccept(d.accept); setHold(d.hold); setReject(d.reject);
      setDefects(d.defects ?? {}); setRemarks(d.remarks);
      // Treat a restored draft as operator-touched so upstream prefill and a
      // late entry-template response can't overwrite what they already typed.
      userTouchedQty.current = true;
    } else {
      // Ask MOID agent prefill (Confirm → Open Data Entry)
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
        setMsg("Prefill from Ask MOID — review and save when ready.");
      }
    }
    draftReady.current = true;
  }, []);

  // Re-evaluate shift window every minute.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Success feedback is brief — operators should not have to dismiss it.
  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(() => setMsg(null), 4200);
    return () => window.clearTimeout(id);
  }, [msg]);

  /** True while a shift-end auto-upload is in flight (avoid double fire). */
  const shiftEndFlushRef = useRef(false);

  // Autosave the in-progress form. Cheap (one small JSON write per keystroke)
  // and it is the only thing standing between a half-filled shift and a tab switch.
  useEffect(() => {
    if (!draftReady.current) return;
    const empty =
      !checked && !trolleys && !accept && !hold && !reject && !remarks && !bin &&
      Object.keys(defects).length === 0;
    saveDraft(
      DRAFT_KEY,
      empty
        ? null
        : { macro, stageId, date, size, productType, operator, shift, batchId, batchDate,
            checked, trolleys, bin, accept, hold, reject, defects, remarks },
    );
  }, [macro, stageId, date, size, productType, operator, shift, batchId, batchDate,
      checked, trolleys, bin, accept, hold, reject, defects, remarks]);

  // Schema from the company catalog (Data Schema), projected by /api/entry-template.
  // Total replacement: a live template drives every station / defect / column,
  // or the seed does. Never mix per-field. Refetch when Data Schema writes
  // (schemaRev is catalog.updatedAt from RegistryContext).
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

  // The lot code is composed from the lot's own date plus size. `date`
  // ("Recorded on") is not in this chain and must never be added to it — that
  // coupling is the bug this replaces. No lock flag is needed because there is
  // nothing to lock against.
  useEffect(() => {
    const id = buildBatchId(batchDate, size);
    if (id) setBatchId(id);
  }, [batchDate, size]);

  const isPrimary = macro === "primary";
  const isSecondary = macro === "secondary";
  const isAssembly = macro === "assembly";
  const schemaSource = schema?.source ?? "loading";
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
  // Freeze the defect column set once the operator starts typing so a late
  // /api/entry-template response can't swap keys mid-entry — but only while
  // staying on the SAME stage. A restored draft or an Ask MOID prefill sets
  // `stageId` to the batch's real stage and marks userTouchedQty in the same
  // effect, before this one ever runs.
  const activeDefectsStageRef = useRef<string | null>(null);
  const [activeDefects, setActiveDefects] = useState(resolvedDefects);
  // Mirrored so the effect can read them without depending on them — it must
  // react to the SCHEMA changing, not to every keystroke, and `activeDefects`
  // is its own output.
  const defectsRef = useRef<Record<string, number>>({});
  defectsRef.current = defects;
  const activeDefectsRef = useRef(activeDefects);
  activeDefectsRef.current = activeDefects;
  useEffect(() => {
    const stageChanged = activeDefectsStageRef.current !== stageId;
    activeDefectsStageRef.current = stageId;
    // The rule itself is `lib/entry/defect-columns.ts` — pure, and covered by
    // tests, because getting it wrong is what made the defect grid render
    // blank while the counts were still in state and still saving.
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
  const parsed = useMemo(() => parseBatchId(batchId), [batchId]);
  const sizeCanon = useMemo(() => toCanonicalSize(size), [size]);
  const catheterSizeOptions = useMemo(() => sizesFor(category, catheterType), [category, catheterType]);
  const prevStageId = useMemo(
    () => (schema ? previousAcceptedStageId(schema, stageId) : null),
    [schema, stageId],
  );

  // If the live schema doesn't include the current station (renamed / deleted),
  // land on the first station of this section rather than rendering an empty form.
  useEffect(() => {
    if (!schema) return;
    if (stationById(schema, stageId)) return;
    const first = stationsIn(schema, macro)[0] ?? schema.stations[0];
    if (first) {
      setStageId(first.stageId);
      setMacro(first.category);
    }
  }, [schema, stageId, macro]);

  // Lot completion, read straight off the ledger — a lot spans several days, so
  // the operator needs to see which gates this batch already cleared before
  // deciding what to type. Nothing is stored; purge/correct and the bar moves.
  const lotProgress = useMemo(
    () => progressFor(buildBatchProgress((events ?? []) as AuditEventLike[]), batchId),
    [events, batchId],
  );
  // Assembly chain: one-shot assist prefill of Checked from what the previous
  // station accepted for this lot — summed across every day it ran — minus
  // what this station has already checked on other days. Date is in the
  // context key so moving Recorded on re-evaluates the remainder.
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
        ? ` Remaining after ${r.alreadyChecked.toLocaleString()} already checked at this station.`
        : "";
    setPrefillNote(
      `Auto-filled from ${prevLabel} accepted (${r.previousAccepted.toLocaleString()}) for batch ${batchKey}.${already} Clear or edit freely — it will not overwrite again.`,
    );
  }, [isAssembly, prevStageId, stageId, batchId, sizeCanon, date, events, schema]);
  const defectSum = useMemo(
    () => Object.values(defects).reduce((a, b) => a + (Number(b) || 0), 0),
    [defects],
  );

  // Leaving a Hold-capturing station must not carry a stale Hold downstream.
  useEffect(() => {
    if (!capturesHold) setHold((cur) => (cur === 0 ? cur : 0));
  }, [capturesHold]);

  const holdPart = capturesHold ? hold : 0;
  /**
   * Remainder implied by the quantity balance:
   *   Checked = Accept + Hold + Reject  →  Reject = Checked − Accept − Hold
   * (Primary omits Hold.)
   */
  const impliedRejectFromBalance = Math.max(0, checked - accept - holdPart);

  /**
   * Rejected has ONE definition: the quantity balance. It used to switch to
   * "sum of the defect counts" the moment any defect was typed, which made the
   * number climb while the operator itemised (9 → 15 → 22 …) and, if they only
   * itemised some reasons, quietly redefined Rejected as that partial sum.
   *
   * The balance is what the plant's own sheet computes, so this is also the
   * number that has to match their Excel. Defects now EXPLAIN this figure
   * rather than replace it — see `defectCoverage` below.
   */
  const rejectIsDerived = showReject;

  useEffect(() => {
    if (!showReject) return;
    const next = checked > 0 ? impliedRejectFromBalance : 0;
    setReject((cur) => (cur === next ? cur : next));
  }, [showReject, checked, impliedRejectFromBalance]);

  /** How much of Rejected the defect reasons account for. */
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

  /** Filtered tiles, carrying their ORIGINAL index so the numbering keeps
   *  matching the schema order the operator counts by. */
  const visibleDefects = useMemo(() => {
    const q = defectFilter.trim().toLowerCase();
    return activeDefects
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => !q || d.key.toLowerCase().includes(q) || (d.name ?? "").toLowerCase().includes(q));
  }, [activeDefects, defectFilter]);

  // Balance: Checked = Accept + Hold + Reject for whatever this station captures.
  const sumParts =
    (showAccept ? accept : 0) + holdPart + (showReject ? reject : 0);
  const qtyMismatch = showReject && (checked !== sumParts || checked === 0);
  const defectMismatch =
    !hideDefects && showReject && (reject > 0 || defectSum > 0) && defectSum !== reject;
  const qtyLabel = isPrimary ? "Quantity Produced" : isSecondary ? "Quantity" : "Checked";

  /** Live equation under Checked — shows the correct split, not only "mismatch". */
  const balanceHint =
    !showReject || checked <= 0
      ? null
      : capturesHold
        ? `${checked} = Accept ${accept} + Hold ${hold} + Reject ${reject}`
        : `${checked} = Accept ${accept} + Reject ${reject}`;

  const dateIsToday = date === today();

  // ── The verdict ─────────────────────────────────────────────────────────
  // Recomputed as they type, so a block is visible before the save button is
  // ever pressed rather than appearing as a dialog after it.
  const ledgerSummary = useMemo(
    () => summariseLedger((events ?? []) as AuditEventLike[]),
    [events],
  );

  const sameDayPrior = useMemo(() => {
    const id = entryIdentity(batchId, stageId, date, pass);
    if (!id) return null;
    return ledgerSummary.get(identityKey(id)) ?? null;
  }, [batchId, stageId, date, pass, ledgerSummary]);

  const otherDaysAtStation = useMemo(() => {
    const id = entryIdentity(batchId, stageId, date, pass);
    if (!id) return [];
    return [...ledgerSummary.values()]
      .filter(
        (s) =>
          s.identity.lot === id.lot &&
          s.identity.station === id.station &&
          s.identity.pass === id.pass &&
          s.identity.date !== id.date,
      )
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  }, [batchId, stageId, date, pass, ledgerSummary]);

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
      batchId, stageId, processName, pass, passReason, size, date, checked, accept, hold,
      reject, defectSum, showAccept, capturesHold, showReject, hideDefects, editingId,
      ledgerSummary,
    ],
  );

  // Acknowledgements are per-warning, so one blanket confirm can never stand in
  // as consent to a different problem. Reset whenever the verdict changes shape.
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const [ackReasons, setAckReasons] = useState<Record<string, string>>({});
  const warningKey = verdict.warnings.map((w) => w.code).join(",");
  useEffect(() => {
    setAcked({});
    setAckReasons({});
  }, [warningKey]);

  /**
   * Advisories wait for a save attempt.
   *
   * They used to render live off every keystroke. Type Checked = 400 and the
   * form immediately said "400 of 400 rejected have no reason" — before there
   * was any chance to enter one. Save, and the freshly-written row came
   * straight back as "this station already has this lot". Clear the form and
   * an empty one announced "no quantity has been entered". All three were
   * technically true and none were useful, so operators learned to tick past
   * the panel, which is worse than not showing it.
   *
   * Blocks still appear as soon as there is something to be wrong about — they
   * stop the save, so hiding them would be a dead Save button with no reason
   * given. Warnings and notes appear when the operator asks to save, or when
   * they are editing a row that already exists.
   */
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

  // A different lot or station is a different entry — start quiet again.
  const attemptCtx = `${stageId}|${batchId.trim().toUpperCase()}`;
  const attemptCtxRef = useRef(attemptCtx);
  useEffect(() => {
    if (attemptCtxRef.current === attemptCtx) return;
    attemptCtxRef.current = attemptCtx;
    setSaveAttempted(false);
  }, [attemptCtx]);

  // Pass is "this lot at this station again" — never a leftover from Visual
  // when the operator has moved on to Balloon. Sign-out appeared to "fix" it
  // because pass is not in the draft and reset to 1 on a fresh mount.
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
  // Owner: canWrite false. Operator: needs open shift window or GM grant. GM: always.
  const mayEdit =
    canWrite && (persona !== "operator" || withinShift || hasGrant);

  const unackedWarnings = verdict.warnings.filter((w) => !acked[w.code]);
  // Only once they are on screen. Disabling for a warning the operator has not
  // been shown is a dead button with no stated reason — the first click is
  // what surfaces them.
  const saveDisabled =
    saving || !mayEdit || !verdict.canSave || (showAdvisories && unackedWarnings.length > 0);


  const identityCols = "minmax(150px, 1.1fr) minmax(110px, 0.9fr) minmax(140px, 1fr)";
  const fieldCount =
    (showChecked ? 1 : 0) +
    (showTrolleys ? 1 : 0) +
    (showBin ? 1 : 0) +
    (showAccept ? 1 : 0) +
    (capturesHold ? 1 : 0) +
    (showReject ? 1 : 0);
  const countCols = `repeat(${Math.max(fieldCount, 1)}, minmax(88px, 1fr))`;

  const saveLabel = saving
    ? "Saving…"
    : editingId
      ? "Replace this entry"
      : "Save to plant ledger";

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

  /**
   * True when the operator has typed something they would lose on a
   * station switch. A new station is a new entry — Visual's counts must
   * not appear on Balloon as if they were already recorded there.
   */
  const hasUnsavedQty = () =>
    checked > 0 ||
    accept > 0 ||
    hold > 0 ||
    trolleys > 0 ||
    bin.trim() !== "" ||
    remarks.trim() !== "" ||
    Object.values(defects).some((v) => v > 0);

  const confirmDiscard = async (what: string) => {
    if (!hasUnsavedQty() && !editingId) return true;
    return await confirmModal({
      title: `Switch to ${what}?`,
      description: editingId
        ? "This leaves the entry you were editing. The new station starts blank — lot, size and date stay."
        : "Quantities and defect counts on this form are for the current station only. The new station starts blank — lot, size and date stay.",
      confirmText: "Switch Station",
      variant: "warning",
    });
  };

  const beginFreshStation = (nextStageId: string, nextMacro?: string) => {
    setStageId(nextStageId);
    if (nextMacro) setMacro(nextMacro);
    setEditing(null);
    setPass(1);
    setPassReason("");
    passCtxRef.current = `${nextStageId}|${canonicalBatchId(batchId) ?? batchId.trim().toUpperCase()}`;
    resetQtys();
  };

  const selectMacro = async (id: string) => {
    if (id === macro) return;
    const first = schema ? stationsIn(schema, id)[0] : undefined;
    const label = first?.label ?? id;
    const ok = await confirmDiscard(label);
    if (!ok) return;
    beginFreshStation(first?.stageId ?? migrateToStageId({ macro: id }), id);
  };

  const selectStation = async (id: string) => {
    if (id === stageId) return;
    const st = schema ? stationById(schema, id) : undefined;
    const ok = await confirmDiscard(st?.label ?? id);
    if (!ok) return;
    beginFreshStation(id, st?.category);
  };

  /**
   * Typing a lot code is the same act as picking its parts, so it writes back
   * into `batchDate` and `size`. It still never touches "Recorded on" — the
   * same lot is inspected across days.
   */
  const onBatchInput = (raw: string) => {
    const formatted = formatBatchIdInput(raw);
    setBatchId(formatted);
    const p = parseBatchId(formatted);
    if (p?.date) setBatchDate(p.date);
    if (p?.sizeFr) {
      const display = toDisplaySize(p.sizeFr);
      if (display) setSize(display);
    }
  };

  // History → Reuse: adopt the lot id and its date, leaving "Recorded on"
  // alone. A lot carries across days; the entry date does not follow it back.
  useEffect(() => {
    if (!prefillBatchId) return;
    onBatchInput(prefillBatchId);
    onPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillBatchId]);

  const loadRecordIntoForm = useCallback(
    (rec: {
      batchId: string;
      date: string;
      stageId: string;
      macro?: string;
      size?: string | null;
      productType?: string | null;
      shift?: string | null;
      operator?: string;
      checked: number;
      accept: number;
      hold: number;
      reject: number;
      trolleys?: number;
      bin?: string;
      defects: Record<string, number>;
      remarks?: string;
      pass?: number;
      passReason?: string | null;
      editingId: string;
    }) => {
      const sid = migrateToStageId({ stageId: rec.stageId });
      const macro =
        rec.macro ||
        STAGE_CATEGORY[sid] ||
        "assembly";
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
      setPreviewId(null);
      setMsg(null);
      setErr(null);
    },
    [applyProductType, setEditing],
  );

  /**
   * Recorded-on is part of the row's name. Moving it to a day that already
   * has this lot at this station loads that day's entry; moving it to a
   * blank day starts a new split-day row without copying yesterday's counts
   * (those belong to yesterday).
   */
  const changeRecordedOn = useCallback(
    (next: string) => {
      if (!next || next === date) return;
      const lot = canonicalBatchId(batchId) ?? batchId.trim().toUpperCase();
      const existing = buildEntryRows((events ?? []) as AuditEventLike[]).find(
        (r) => r.batch === lot && r.stageId === stageId && r.date === next,
      );
      if (existing) {
        loadRecordIntoForm({
          batchId: existing.batch,
          date: existing.date,
          stageId: existing.stageId,
          size: existing.size,
          productType: existing.productType,
          shift: existing.shifts[0] ?? null,
          checked: existing.checked,
          accept: existing.accepted,
          hold: existing.rework,
          reject: existing.rejected,
          defects: Object.fromEntries(
            existing.defects.filter((d) => d.qty > 0).map((d) => [d.code, d.qty]),
          ),
          editingId: `ledger:${existing.id}`,
        });
        setMsg(
          `Loaded ${processName} for ${lot} on ${shortEntryDate(next)}. Save replaces this day's entry.`,
        );
        return;
      }
      if (editingId) {
        setEditing(null);
        resetQtys();
      }
      setDate(next);
    },
    [date, batchId, stageId, events, editingId, loadRecordIntoForm, processName, setEditing, resetQtys],
  );

  // History → Edit: put the recorded row on the form. Must run after the
  // mount draft restore so a leftover empty draft cannot blank the numbers.
  useEffect(() => {
    if (!hydrate) return;
    if (hydrate.mode === "reuse-lot") {
      onBatchInput(hydrate.batchId);
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
      defects: Object.keys(hydrate.defects).length ? hydrate.defects : (local?.defects ?? {}),
      remarks: local?.remarks,
      pass: local?.pass,
      passReason: local?.passReason,
      editingId: local?.id ?? hydrate.editingId,
    });
    setMsg(`Editing ${hydrate.batchId} · ${hydrate.stageId}. Save replaces this entry.`);
    onHydrateConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrate]);

  // Defect qty changes update local state; Reject is re-derived from defect
  // sum (when any defect > 0) or from the Checked − Accept (− Hold) remainder.
  const setDefectQty = (key: string, n: number | null) => {
    touchQty();
    setDefects((prev) => {
      const next = { ...prev };
      if (n == null || n === 0) delete next[key];
      else next[key] = n;
      return next;
    });
  };

  /**
   * Category / Type / Size cascade — same rules as the shop-floor matrix tool:
   * Type is Male-only (Female/Peadiatric default to "2 way" behind the scenes),
   * and each category+type pair has its own size range. Changing category or
   * type re-derives the size list; if the currently selected size falls outside
   * it, reset to the lowest size in the new list rather than leaving a value
   * the operator can no longer see reflected in the dropdown.
   */
  const applyCategory = (next: CatheterCategory) => {
    setCategory(next);
    const nextType = typeIsSelectable(next) ? catheterType : "2 way";
    if (!typeIsSelectable(next)) setCatheterType("2 way");
    setProductType(productTypeFor(next, nextType));
    const options = sizesFor(next, nextType);
    if (!options.includes(size)) setSize(options[0]);
  };

  const applyCatheterType = (next: CatheterType) => {
    setCatheterType(next);
    setProductType(productTypeFor(category, next));
    const options = sizesFor(category, next);
    if (!options.includes(size)) setSize(options[0]);
  };

  const setQty = (field: "checked" | "trolleys" | "accept" | "hold" | "reject", n: number | null) => {
    touchQty();
    const v = n ?? 0;
    if (field === "checked") setChecked(v);
    else if (field === "trolleys") setTrolleys(v);
    else if (field === "accept") setAccept(v);
    else if (field === "hold") setHold(v);
    else if (!rejectIsDerived) setReject(v);
    // When reject is derived (balance remainder or defect sum), ignore manual edits.
  };

  const clearFormKeepContext = () => {
    resetQtys();
    // The row just written is now on the ledger, so leaving this on would
    // greet the next entry with "this station already has this lot".
    setSaveAttempted(false);
    // Keep the lot: clearing quantities to enter the next station is the exact
    // multi-day case, so the code must survive it.
    const id = buildBatchId(batchDate, size);
    if (id) setBatchId(id);
  };

  /**
   * Save one record and return whatever the ledger wants to tell us about it.
   *
   * The server has always run checkRecord + mass balance and returned the
   * results as `issues`. This function used to read the body only when the
   * request FAILED, so on the happy path every clarification the system
   * computed was thrown away unread. They are now returned to the caller and
   * shown; the server also writes them down as Findings.
   */
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

  function buildPendingRecord(overrideReject?: number): ShiftBatchRecord {
    const canon = toCanonicalSize(size) ?? size;

    return {
      // Keep the id when revising so the row is replaced, not duplicated.
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
      reject: showReject ? (overrideReject ?? reject) : 0,
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

  async function finalizeSave(rec: ShiftBatchRecord) {
    setSaving(true);
    setErr(null);
    setMsg(null);
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
      setEditing(null);
      clearFormKeepContext();
      setMsg(
        revising
          ? `On the ledger · ${rec.batchId} · ${rec.processName} — previous row superseded.`
          : `On the ledger · ${rec.batchId} · ${rec.processName} · ${rec.size}`,
      );
      refreshEvents().catch(console.error);
      onSynced?.();
    } catch (e: any) {
      // Keep local shift buffer so shift-end can retry upload
      const next = saved.some((b) => b.id === rec.id)
        ? saved.map((b) => (b.id === rec.id ? rec : b))
        : [rec, ...saved];
      setSaved(next);
      persistShift(next);
      setEditing(null);
      clearFormKeepContext();
      setErr(
        `Saved on this device only — could not reach the ledger (${e?.message ?? "unknown error"}). Use "Push to ledger" on the row below, or it will retry automatically when the shift ends.`,
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * Manually push one still-local row to the ledger, for when an operator or
   * GM doesn't want to wait for the automatic shift-end flush.
   */
  async function retrySyncRow(rec: ShiftBatchRecord) {
    if (syncingId) return;
    setSyncingId(rec.id);
    setErr(null);
    try {
      const issues = await commitRecord(rec);
      setLastIssues(issues.length ? { batchId: rec.batchId, stage: rec.processName, issues } : null);
      const next = saved.map((b) => (b.id === rec.id ? { ...b, synced: true } : b));
      setSaved(next);
      persistShift(next);
      refreshEvents().catch(console.error);
      onSynced?.();
      setMsg(`On the ledger · ${rec.batchId} · ${rec.processName}`);
    } catch (e: any) {
      setErr(`Still could not reach the ledger for ${rec.batchId} (${e?.message ?? "unknown error"}).`);
    } finally {
      setSyncingId(null);
    }
  }

  /**
   * When the shift window closes, push any still-local batches to the ledger
   * so nothing sits only on the operator machine after lock-down.
   */
  async function flushPendingToLedger(rows: ShiftBatchRecord[]) {
    const pending = rows.filter((b) => !b.synced);
    if (pending.length === 0) return;
    setMsg(`Shift ended — saving ${pending.length} pending batch(es) to the ledger…`);
    let next = [...rows];
    let ok = 0;
    let fail = 0;
    for (const rec of pending) {
      try {
        await commitRecord(rec);
        next = next.map((b) => (b.id === rec.id ? { ...b, synced: true } : b));
        ok++;
      } catch {
        fail++;
      }
    }
    setSaved(next);
    persistShift(next);
    if (ok > 0) refreshEvents().catch(console.error);
    if (fail === 0) {
      setMsg(
        ok === 1
          ? "Shift ended — last pending batch is on the ledger. Further edits need GM permission."
          : `Shift ended — ${ok} pending batch(es) on the ledger. Further edits need GM permission.`,
      );
      setErr(null);
    } else {
      setErr(`${fail} batch(es) still not on the ledger. ${ok} saved.`);
      if (ok > 0) setMsg(null);
    }
  }

  // Auto-upload pending local rows when the operator's shift window closes.
  useEffect(() => {
    if (withinShift) {
      shiftEndFlushRef.current = false;
      return;
    }
    if (!canWrite) return;
    if (persona === "owner") return;
    if (shiftEndFlushRef.current) return;
    const pending = saved.filter((b) => !b.synced);
    if (pending.length === 0) return;
    shiftEndFlushRef.current = true;
    void flushPendingToLedger(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when window closes / pending appears after close
  }, [withinShift, canWrite, persona, saved]);

  async function postNotification(body: Record<string, unknown>) {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      /* non-blocking for save path */
    }
  }

  /**
   * Tell the GM an entry was saved over a warning. `kind` is the warning's own
   * code from checkEntry, so a new rule needs no change here.
   */
  async function notifyException(opts: {
    kind: string;
    reason: string;
    warningMessage?: string;
    defectSum?: number;
    reject?: number;
  }) {
    const rej = opts.reject ?? reject;
    const dSum = opts.defectSum;
    const balanceLine = isPrimary
      ? `${qtyLabel} ${checked} ≠ Accept ${accept} + Reject ${rej} (sum ${accept + rej})`
      : capturesHold
        ? `${qtyLabel} ${checked} ≠ Accept ${accept} + Hold ${hold} + Reject ${rej} (sum ${accept + hold + rej})`
        : `${qtyLabel} ${checked} ≠ Accept ${accept} + Reject ${rej} (sum ${accept + rej})`;
    const defectLine =
      dSum != null
        ? ` · Defects sum ${dSum}${rej !== dSum ? ` vs Rejected ${rej}` : ""}`
        : "";
    const title =
      opts.kind === "repeat-pass"
        ? `Repeat pass noted: ${processName}`
        : `Entry saved over a warning: ${opts.kind}`;
    const warningBit = opts.warningMessage ? ` Warning: ${opts.warningMessage}.` : "";
    const body =
      `${operator.trim() || "Operator"} saved ${batchId.trim().toUpperCase() || "(no batch)"} · ` +
      `${processName} · ${size} · ${date}. ` +
      `${balanceLine}.${warningBit} Reason: ${opts.reason}`;

    await postNotification({
      type: "entry_exception",
      title,
      body,
      createdBy: operator.trim() || "operator",
      targetPersona: "gm",
      payload: {
        kind: opts.kind,
        date,
        batchId: batchId.trim().toUpperCase(),
        stageId,
        stageName: processName,
        processName,
        size,
        productType,
        operator: operator.trim(),
        shift,
        checked,
        accept,
        hold: capturesHold ? hold : 0,
        reject: rej,
        defectSum: dSum,
        reason: opts.reason,
        path: "/data-entry",
        detail: balanceLine + defectLine,
      },
    });
  }

  async function requestEditPermission() {
    setRequestingEdit(true);
    setErr(null);
    try {
      await postNotification({
        type: "edit_request",
        title: "Edit permission requested",
        body: `${operator.trim() || "Operator"} wants to edit ${batchId} (${processName}, ${size}) outside ${describeShiftWindow(shift, shiftConfig)}.`,
        createdBy: operator.trim() || "operator",
        targetPersona: "gm",
        payload: {
          entryKey: currentEntryKey,
          date,
          batchId: batchId.trim().toUpperCase(),
          stageId,
          stageName: processName,
          size: sizeCanon ?? size,
          productType,
          operator: operator.trim(),
          shift,
          path: "/data-entry",
        },
      });
      setMsg("Edit request sent to GM. You can edit this entry after approval.");
    } catch (e: any) {
      setErr(e?.message ?? "Could not request edit permission");
    } finally {
      setRequestingEdit(false);
    }
  }

  async function submitForm() {
    setErr(null);
    setMsg(null);

    if (!canWrite) {
      setErr("Your role is view-only. Switch to GM or Operator to save entries.");
      return;
    }
    if (!mayEdit) {
      setErr(`Shift closed (${describeShiftWindow(shift, shiftConfig)}). Request edit permission from GM.`);
      return;
    }

    // Every rule lives in checkEntry — one pure function, tested in node.
    // The chain of confirm() dialogs this replaces could not be tested at all,
    // which is how a guard meaning "this station is already recorded" shipped
    // keyed on "all four assembly gates are done" and locked finished lots out
    // of every other station.
    // From here on the operator has asked to save, so everything checkEntry
    // found becomes visible — including the warnings that were held back
    // while they were still typing.
    setSaveAttempted(true);

    if (verdict.blocks.length > 0) {
      setErr(verdict.blocks[0].message);
      document.getElementById("entry-verdict")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const unacked = verdict.warnings.filter((w) => !acked[w.code]);
    if (unacked.length > 0) {
      setErr(
        unacked.length === 1
          ? "One thing needs your confirmation before saving."
          : `${unacked.length} things need your confirmation before saving.`,
      );
      document.getElementById("entry-verdict")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const missingReason = verdict.warnings.filter(
      (w) => warningNeedsReason(w.code) && !(ackReasons[w.code] ?? "").trim(),
    );
    if (missingReason.length > 0) {
      setErr("Add a reason for the GM on each exception before saving.");
      document.getElementById("entry-verdict")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Operator-written reasons go to the GM inbox and onto the row remarks.
    const notes = collectEntryReasons({
      warnings: verdict.warnings,
      ackReasons,
      pass,
      passReason,
    });
    for (const note of notes) {
      await notifyException({
        kind: note.kind,
        reason: note.reason,
        warningMessage: note.warningMessage,
      }).catch(() => {});
    }

    const rec = buildPendingRecord();
    rec.remarks = remarksFromReasons(notes, rec.remarks);
    await finalizeSave(rec);
  }



  /** Load a logged row back into the form above for revision. */
  function editRow(rec: ShiftBatchRecord) {
    if (!canWrite) {
      setErr("View-only role — editing is disabled.");
      return;
    }
    loadRecordIntoForm({
      batchId: rec.batchId,
      date: rec.date,
      stageId: migrateToStageId(rec),
      macro: rec.macro,
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
      defects: rec.defects ?? {},
      remarks: rec.remarks,
      pass: rec.pass,
      passReason: rec.passReason,
      editingId: rec.id,
    });
    document.getElementById("batch-entry-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditing(null);
    clearFormKeepContext();
  }

  /**
   * Remove a logged batch. A synced row also has to leave the LEDGER — deleting
   * it from the local shift list alone left the numbers on the dashboard with
   * no row left to explain them.
   *
   * Scope the erase by date · shift · batch · stage · size so we never wipe
   * every batch that shares the same day, and so Direct Entry is matched via
   * extractedBy / "Manual Entry" (not only provenance.is_direct_entry).
   */
  async function deleteLocal(id: string) {
    const rec = saved.find((b) => b.id === id);
    if (!rec) return;
    const synced = rec.synced;

    // Once a batch reaches the ledger it stops being the operator's to remove.
    // Un-synced rows are still just this shift's local list, so anyone who may
    // write can clear them. Guarded here rather than on the button alone so
    // every caller of deleteLocal is covered.
    if (synced && !canEraseLedger) {
      setErr(
        `Batch ${rec.batchId} is already saved to the ledger. Saved rows can only be erased by a ` +
          `GM, from the Audit trail — ask a GM, or add a correction entry instead.`,
      );
      return;
    }

    const ok = await confirmModal({
      title: synced ? `Permanently delete batch ${rec.batchId}?` : `Remove batch ${rec.batchId}?`,
      description: synced
        ? `${rec.date} · ${rec.processName} · ${rec.size}\n\n` +
          "It is already synced, so this erases it from the ledger too — the numbers leave " +
          "the dashboard and the audit trail. This cannot be undone."
        : `Remove batch ${rec.batchId} from the current shift list?`,
      confirmText: synced ? "Erase from Ledger" : "Remove Batch",
      variant: synced ? "danger" : "default",
    });
    if (!ok) return;

    if (id === editingId) setEditing(null);
    if (id === previewId) setPreviewId(null);

    if (synced) {
      try {
        const qs = new URLSearchParams({
          date: rec.date,
          shift: rec.shift || "Day Shift",
          source: "Direct Entry",
          batch: rec.batchId.trim().toUpperCase(),
        });
        if (rec.stageId) qs.set("stageId", rec.stageId);
        if (rec.sizeCanonical) qs.set("size", rec.sizeCanonical);

        const res = await fetch(`/api/manual-entries?${qs}`, { method: "DELETE" });
        const body = await res.json().catch(() => ({} as { error?: string; deletedCount?: number }));
        if (!res.ok) throw new Error(body.error ?? "Delete failed");
        if (!body.deletedCount) {
          throw new Error(
            "No matching ledger events found for this batch (date/shift/batch). " +
              "It may already be gone, or was saved under a different shift label.",
          );
        }
        await refreshEvents().catch(console.error);
        onSynced?.();
      } catch (e) {
        setErr(
          `Ledger delete failed — batch kept on this list: ${
            e instanceof Error ? e.message : "unknown error"
          }`,
        );
        return;
      }
    }

    const next = saved.filter((b) => b.id !== id);
    setSaved(next);
    persistShift(next);
    setMsg(synced ? `Batch ${rec.batchId} erased from the ledger.` : `Batch ${rec.batchId} removed.`);
  }

  function exportCSV() {
    if (saved.length === 0) {
      notify("No logged batches to export.", "warning");
      return;
    }
    const uniqueDefects = new Set<string>();
    saved.forEach((b) => Object.keys(b.defects || {}).forEach((d) => uniqueDefects.add(d)));
    const defectHeaders = Array.from(uniqueDefects);

    let csv =
      "Date,Operator,Stage,Process,Size,Type,Batch ID,Quantity/Checked,Trolleys,Bin,Accept,Hold,Reject,Yield %,Remarks,Synced";
    defectHeaders.forEach((dh) => {
      csv += `,Defect_${dh}`;
    });
    csv += "\r\n";

    saved.forEach((b) => {
      const isSec = b.macro === "secondary";
      const isPri = b.macro === "primary";
      const yieldPct =
        isSec || b.checked <= 0 ? "" : ((b.accept / b.checked) * 100).toFixed(2);
      const escRem = `"${String(b.remarks || "").replace(/"/g, '""')}"`;
      const trolleyVal = isPri ? (b.trolleys ?? 0) : "";
      const binVal = isSec ? `"${String(b.bin || "").replace(/"/g, '""')}"` : "";
      const acceptVal = isSec ? "" : b.accept;
      const holdVal = isPri || isSec ? "" : b.hold;
      const rejectVal = isSec ? "" : b.reject;
      const typeVal = b.productType || "2 way";
      let row = `${b.date},${b.operator},"${b.stageName}","${b.processName}",${b.size},${typeVal},${b.batchId},${b.checked},${trolleyVal},${binVal},${acceptVal},${holdVal},${rejectVal},${yieldPct},${escRem},${b.synced ? "yes" : "no"}`;
      defectHeaders.forEach((dh) => {
        row += `,${isSec ? 0 : b.defects[dh] || 0}`;
      });
      csv += row + "\r\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `disposafe-session-matrix-${date || "export"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Fixed locale ("en-US"), not `undefined` (runtime default) — the SSR
  // server and the browser can default to different locales (e.g. server
  // Locale-stable date format — long locale strings differed server/client and
  // forced a full remount that wiped mid-entry quantities.
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const qtyInputStyle = (opts?: { mismatch?: boolean; emphasize?: "good" | "bad" | "warn" | null }): React.CSSProperties => ({
    ...inp,
    ...qtyInp,
    textAlign: "center",
    fontWeight: 600,
    fontFamily: "var(--font-mono)",
    borderColor: opts?.mismatch ? "var(--status-warn, #d97706)" : undefined,
    color:
      opts?.emphasize === "bad"
        ? "var(--status-bad)"
        : opts?.emphasize === "good"
          ? "var(--status-good)"
          : opts?.emphasize === "warn"
            ? "var(--status-warn, #d97706)"
            : "var(--text)",
  });

  return (
    <div style={panel} id="batch-entry-form">
      {/* Compact status row — one line of chrome, not a banner stack */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span className="small" style={{ color: "var(--text-2)", fontWeight: 600 }}>{todayLabel}</span>
        {canWrite && persona === "operator" && (
          <span
            style={
              withinShift || hasGrant
                ? statusPill("good")
                : statusPill("warn")
            }
            title={describeShiftWindow(shift, shiftConfig)}
          >
            {withinShift
              ? `Shift open · ${describeShiftWindow(shift, shiftConfig)}`
              : hasGrant
                ? "GM grant active — you may save"
                : `Shift closed · ${describeShiftWindow(shift, shiftConfig)}`}
          </span>
        )}
        {!canWrite && (
          <span style={statusPill("neutral")}>View only — switch to Operator or GM to save</span>
        )}
        {schemaSource === "loading" && (
          <span style={statusPill("neutral")}>Loading schema…</span>
        )}
        {schemaSource === "catalog" && (
          <span style={statusPill("good")} title={`${activeDefects.length} defect codes from Data Schema`}>
            Schema · plant
            {activeDefects.length ? ` · ${activeDefects.length} defects` : ""}
          </span>
        )}
        {schemaSource === "builtin" && (
          <span style={statusPill("warn")}>Schema · built-in</span>
        )}
        {canConfigure && schemaSource === "catalog" && (
          <a href="/schema" className="small" style={{ color: "var(--text-3)", marginLeft: "auto", fontWeight: 500 }}>
            Edit schema
          </a>
        )}
      </div>

      {schemaSource === "builtin" && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--status-warn, #d97706)",
            background: "color-mix(in srgb, var(--status-warn, #d97706) 12%, var(--surface))",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <strong>Using the built-in station list.</strong> Plant schema did not load — every
          station, quantity field, and defect tile on this form is the default, not Data Schema.
          {canConfigure && (
            <>
              {" "}
              <a href="/schema" style={{ color: "var(--accent)", fontWeight: 600 }}>
                Set up plant schema
              </a>
            </>
          )}
        </div>
      )}

      {editingId && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--accent)",
            background: "var(--accent-weak)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>
            Revising <strong style={{ fontFamily: "var(--font-mono)" }}>{saved.find((b) => b.id === editingId)?.batchId}</strong>
            {" "}— save replaces that entry on the ledger.
          </span>
          <button type="button" onClick={cancelEdit} style={{ ...btnGhost, marginLeft: "auto" }}>
            Cancel edit
          </button>
        </div>
      )}

      {canWrite && persona === "operator" && !withinShift && !hasGrant && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--status-warn, #d97706)",
            background: "color-mix(in srgb, var(--status-warn, #d97706) 12%, var(--surface))",
            fontSize: 13,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span style={{ flex: 1, lineHeight: 1.45 }}>
            <strong>Shift closed</strong> — entries on the ledger are locked. Request GM permission to change one.
          </span>
          <button type="button" onClick={requestEditPermission} disabled={requestingEdit} style={btnPrimary}>
            {requestingEdit ? "Requesting…" : "Request edit permission"}
          </button>
        </div>
      )}

      {/* Station selection — tabs from schema categories, chips from template.stages */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionLabel}>Where is this batch?</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {(schema ? schemaCategories(schema) : []).map((c) => (
            <button key={c.id} type="button" onClick={() => selectMacro(c.id)} style={macro === c.id ? chipOn : chipOff}>
              {c.label}
            </button>
          ))}
        </div>
        {schema && stationsIn(schema, macro).length > 1 && (
          <>
            <div style={{ ...sectionLabel, marginTop: 4 }}>Which station?</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {stationsIn(schema, macro).map((s) => (
                <button
                  key={s.stageId}
                  type="button"
                  onClick={() => selectStation(s.stageId)}
                  style={stageId === s.stageId ? chipOn : chipOff}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
        {schemaSource === "builtin" && !isAssembly && (macro === "primary" || macro === "secondary") && MATRIX_STAGES[macro].processes.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MATRIX_STAGES[macro].processes.map((p) => (
              <span key={p.id} style={chipBadge}>{p.name}</span>
            ))}
          </div>
        )}
      </div>

      {/* Identity | Counts — counts carry the visual weight */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
          gap: 14,
          marginBottom: 16,
        }}
        className="batch-matrix-zones"
      >
        <div style={zone}>
          <div style={zoneTitle}>Who / batch</div>
          <div
            style={{ display: "grid", gridTemplateColumns: identityCols, gap: 12, alignItems: "start" }}
            className="batch-matrix-identity"
          >
            <FieldCol label="Recorded by">
              <Select
                value={operator}
                onChange={setOperator}
                options={ENTRY_ROLES.map((o) => ({ value: o, label: o }))}
                ariaLabel="Recorded by"
              />
              {/* Recorded on is stamped, not chosen. It used to keep whatever
                  day was last typed, so a backfill silently sent the next
                  entries to the wrong date. Corrections happen in the entry
                  history, where the change is visible and attributed. */}
              <label style={subLabel}>
                Recorded on
                {dateIsToday || persona === "gm" ? (
                  <div
                    style={{
                      ...inp,
                      marginTop: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      background: "var(--surface-2)",
                    }}
                  >
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {dateIsToday ? `Today · ${shortEntryDate(date)}` : shortEntryDate(date)}
                    </span>
                    {persona === "gm" && (
                      <div style={{ width: 140 }}>
                        <DatePicker
                          value={date}
                          onChange={(d) => d && changeRecordedOn(d)}
                          ariaLabel="Change recorded-on date (GM)"
                          size="sm"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      ...inp,
                      marginTop: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "var(--warning-weak)",
                      borderColor: "var(--warning)",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{shortEntryDate(date)}</span>
                    <button
                      type="button"
                      onClick={() => changeRecordedOn(today())}
                      style={{
                        marginLeft: "auto",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--warning)",
                        background: "var(--surface)",
                        color: "var(--warning)",
                        cursor: "pointer",
                      }}
                    >
                      Back to today
                    </button>
                  </div>
                )}
              </label>
              {/* One plant shift (08:00–20:00). The picker used to offer a
                  "Night Shift" that has no configured window, which silently
                  locked the operator out of saving. */}
              <label style={subLabel}>
                Shift
                <div
                  style={{
                    ...inp,
                    marginTop: 4,
                    background: "var(--surface-2)",
                    color: "var(--text-2)",
                  }}
                >
                  {describeShiftWindow(shift, shiftConfig)}
                </div>
              </label>
            </FieldCol>

            <FieldCol label="Category">
              <Select
                value={category}
                disabled={!mayEdit}
                onChange={(v) => applyCategory(v as CatheterCategory)}
                options={CATHETER_CATEGORIES.map((c) => ({ value: c, label: c }))}
                ariaLabel="Category"
                style={{ fontWeight: 600 }}
              />
              <label style={subLabel}>
                Size
                <Select
                  value={size}
                  disabled={!mayEdit}
                  onChange={setSize}
                  options={catheterSizeOptions.map((s) => ({ value: s, label: s }))}
                  mono
                  ariaLabel="Size"
                  style={{ marginTop: 4, fontWeight: 600 }}
                />
              </label>
              <label
                style={{
                  ...subLabel,
                  visibility: typeIsSelectable(category) ? "visible" : "hidden",
                }}
              >
                Type
                <Select
                  value={catheterType}
                  disabled={!mayEdit || !typeIsSelectable(category)}
                  onChange={(v) => applyCatheterType(v as CatheterType)}
                  options={[
                    { value: "2 way", label: "2 way" },
                    { value: "3 way", label: "3 way" },
                  ]}
                  ariaLabel="Type"
                  style={{ marginTop: 4, fontWeight: 600 }}
                />
              </label>
            </FieldCol>

            <FieldCol label="Batch / lot ID">
              <BatchIdField
                batchId={batchId}
                onBatchIdChange={onBatchInput}
                batchDate={batchDate}
                onBatchDateChange={setBatchDate}
                size={size}
                disabled={!mayEdit}
                recordedOn={date}
              />
              {isAssembly && lotProgress && lotProgress.doneCount > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "7px 9px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface-2, var(--surface))",
                  }}
                >
                  <LotProgress progress={lotProgress} activeStageId={stageId} />
                  {sameDayPrior && !editingId && (
                    <div
                      style={{
                        margin: "8px 0 0",
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid color-mix(in srgb, var(--critical) 35%, transparent)",
                        background: "var(--critical-weak)",
                        color: "var(--critical)",
                        fontSize: "var(--text-2xs)",
                        lineHeight: 1.5,
                      }}
                    >
                      <strong>{processName} already has this lot on {shortEntryDate(sameDayPrior.date)}</strong>
                      {" "}— {sameDayPrior.checked.toLocaleString()} checked. Saving replaces this
                      day&apos;s entry. Change Recorded on to add another day.
                    </div>
                  )}
                  {otherDaysAtStation.length > 0 && !editingId && (
                    <div
                      style={{
                        margin: "8px 0 0",
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--text-2)",
                        fontSize: "var(--text-2xs)",
                        lineHeight: 1.5,
                      }}
                    >
                      {processName} already has{" "}
                      {otherDaysAtStation.length === 1
                        ? "another day"
                        : `${otherDaysAtStation.length} other days`}{" "}
                      on this lot
                      {" — "}
                      {otherDaysAtStation
                        .map((d) => `${shortEntryDate(d.date)} (${d.checked.toLocaleString()})`)
                        .join(", ")}
                      . This records a new day.
                    </div>
                  )}
                </div>
              )}
            </FieldCol>
          </div>
        </div>

        <div style={{ ...zone, borderColor: "var(--border-strong)", background: "var(--surface)" }}>
          <div style={zoneTitle}>Counts</div>
          <div
            style={{ display: "grid", gridTemplateColumns: countCols, gap: 12, alignItems: "start" }}
            className="batch-matrix-counts"
          >
            {showChecked && (
              <FieldCol label={showBin ? `${qtyLabel} *` : qtyLabel} align="center">
                <QtyInput
                  value={checked || null}
                  onChange={(n) => setQty("checked", n)}
                  style={qtyInputStyle({ mismatch: qtyMismatch && checked > 0 })}
                  aria-label={qtyLabel}
                />
                {balanceHint && (
                  <div
                    className="small"
                    style={{
                      marginTop: 6,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 600,
                      textAlign: "center",
                      lineHeight: 1.35,
                      color: qtyMismatch ? "var(--status-warn, #d97706)" : "var(--status-good)",
                    }}
                  >
                    {balanceHint}
                    {qtyMismatch ? " · fix parts" : " · ok"}
                  </div>
                )}
                {prefillNote && (
                  <button
                    type="button"
                    onClick={() => setPrefillNote(null)}
                    title={prefillNote}
                    style={{
                      ...badge("blue"),
                      marginTop: 6,
                      width: "100%",
                      cursor: "pointer",
                      border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                      textAlign: "left",
                      lineHeight: 1.3,
                    }}
                  >
                    From prior station · dismiss
                  </button>
                )}
              </FieldCol>
            )}
            {showTrolleys && (
              <FieldCol label="Trolleys" align="center">
                <QtyInput
                  value={trolleys || null}
                  onChange={(n) => setQty("trolleys", n)}
                  style={qtyInputStyle()}
                  aria-label="Trolleys"
                />
              </FieldCol>
            )}
            {showBin && (
              <FieldCol label="Bin *">
                <input
                  list="secondary-bin-options"
                  value={bin}
                  onChange={(e) => setBin(e.target.value)}
                  placeholder="e.g. Bin A"
                  style={{ ...inp, fontWeight: 600 }}
                />
                <datalist id="secondary-bin-options">
                  {SECONDARY_BINS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </FieldCol>
            )}
            {showAccept && (
              <FieldCol label="Accept" align="center">
                <QtyInput
                  value={accept || null}
                  onChange={(n) => setQty("accept", n)}
                  style={qtyInputStyle({ emphasize: accept > 0 ? "good" : null })}
                  aria-label="Accept"
                />
              </FieldCol>
            )}
            {capturesHold && (
              <FieldCol label="Hold" align="center">
                <QtyInput
                  value={hold || null}
                  onChange={(n) => setQty("hold", n)}
                  style={qtyInputStyle({ emphasize: hold > 0 ? "warn" : null })}
                  aria-label="Hold"
                />
              </FieldCol>
            )}
            {showReject && (
              <FieldCol label="Reject" align="center">
                <div
                  aria-label="Reject"
                  aria-readonly="true"
                  style={{
                    ...qtyInputStyle({ emphasize: reject > 0 ? "bad" : null }),
                    background: "var(--surface-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title={
                    capturesHold
                      ? "Always Checked − Accept − Hold. Defect reasons explain this number; they never change it."
                      : "Always Checked − Accept. Defect reasons explain this number; they never change it."
                  }
                >
                  {reject}
                </div>
                <div className="small" style={{ marginTop: 6, color: "var(--text-3)", textAlign: "center", fontSize: 11, lineHeight: 1.3 }}>
                  {checked > 0
                    ? capturesHold
                      ? `= ${checked} − ${accept} − ${hold}`
                      : `= ${checked} − ${accept}`
                    : "auto"}
                </div>
              </FieldCol>
            )}
          </div>
        </div>
        <style>{`
          @media (max-width: 900px) {
            .batch-matrix-zones {
              grid-template-columns: 1fr !important;
            }
          }
          @media (max-width: 640px) {
            .batch-matrix-identity,
            .batch-matrix-counts {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
          }
          @media (max-width: 420px) {
            .batch-matrix-identity,
            .batch-matrix-counts {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>

      {!hideDefects && (
        <div id="defect-reasons" style={{ marginBottom: 16, padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--status-bad)", display: "inline-block" }} />
                Why were they rejected?
              </div>
              <div className="small" style={{ color: "var(--text-3)", fontWeight: 500, fontSize: 12 }}>
                {processName}
                {defectCoverage && defectCoverage.state !== "empty" && (
                  <>
                    {" · "}
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        color:
                          defectCoverage.state === "complete"
                            ? "var(--positive)"
                            : defectCoverage.state === "over"
                              ? "var(--critical)"
                              : "var(--warning)",
                      }}
                    >
                      {defectCoverage.sum} of {defectCoverage.reject} explained
                    </span>
                  </>
                )}
              </div>
            </div>
            <input
              value={defectFilter}
              onChange={(e) => setDefectFilter(e.target.value)}
              placeholder={`Find a defect (${activeDefects.length})`}
              style={{ ...inp, width: 190, marginLeft: "auto" }}
              aria-label="Filter defect list"
            />
            {defectCoverage && defectCoverage.state !== "empty" && (
              <span
                style={{
                  ...badge(defectCoverage.state === "complete" ? "green" : "amber"),
                }}
                title="Rejected comes from Checked − Accept − Hold. These reasons explain it; they never change it."
              >
                {defectCoverage.state === "complete"
                  ? "All explained"
                  : defectCoverage.state === "over"
                    ? `${-defectCoverage.unexplained} too many`
                    : `${defectCoverage.unexplained} unexplained`}
              </span>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            {visibleDefects.map(({ d, i }) => {
              const val = defects[d.key] || 0;
              const active = val > 0;
              // Operators know the short form (COAG), not the catalog label
              // (Coagulum). Long name stays on the hover title only.
              const title = defectEntryTitle(d);
              return (
                <div
                  key={d.key}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 8,
                    border: active
                      ? "1px solid color-mix(in srgb, var(--status-bad) 40%, var(--border))"
                      : "1px solid transparent",
                    background: active ? "var(--surface-2)" : "transparent",
                    opacity: active ? 1 : 0.72,
                    display: "grid",
                    gridTemplateRows: "36px auto",
                    gap: 6,
                    minHeight: 88,
                    boxSizing: "border-box",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 6,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-3)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <div
                    title={`${i + 1}. ${title}${d.name && d.name !== title ? ` — ${d.name}` : ""}`}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      color: "var(--text)",
                      lineHeight: 1.25,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      overflow: "hidden",
                      wordBreak: "break-word",
                    }}
                  >
                    {title}
                  </div>
                  <QtyInput
                    value={val || null}
                    onChange={(n) => setDefectQty(d.key, n)}
                    aria-label={title}
                    style={{
                      ...inp,
                      textAlign: "center",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      borderColor: active ? "var(--border-strong)" : "var(--border)",
                      height: 40,
                      background: active ? "var(--bg)" : "var(--surface)",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={sectionLabel}>Remarks</div>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Optional hand-over notes for this batch…"
          style={{ ...inp, minHeight: 56, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      {/* Live balance strip — shows the correct split, not only a mismatch flag.
          Hidden until something is entered: on an empty form it read
          "Checked 0 = Accept 0 + Reject 0 · Enter quantities", which is the
          same "you have not typed anything" the operator can already see. */}
      {showReject && formEngaged && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${
              qtyMismatch && checked > 0
                ? "var(--status-warn, #d97706)"
                : defectMismatch
                  ? "var(--status-warn, #d97706)"
                  : "var(--border)"
            }`,
            background:
              qtyMismatch && checked > 0
                ? "color-mix(in srgb, var(--status-warn, #d97706) 10%, var(--surface))"
                : defectMismatch
                  ? "color-mix(in srgb, var(--status-warn, #d97706) 8%, var(--surface))"
                  : "var(--surface-2)",
            fontSize: 12.5,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
            <span>
              {qtyLabel} {checked} ={" "}
              {capturesHold ? (
                <>Accept {accept} + Hold {hold} + Reject {reject}</>
              ) : (
                <>Accept {accept} + Reject {reject}</>
              )}{" "}
              → sum {sumParts}
            </span>
            <span
              style={{
                color:
                  checked === 0
                    ? "var(--text-3)"
                    : qtyMismatch
                      ? "var(--status-warn, #d97706)"
                      : "var(--status-good)",
              }}
            >
              {checked === 0
                ? "Enter quantities"
                : qtyMismatch
                  ? "Not balanced"
                  : "Balanced"}
            </span>
          </div>
          {checked > 0 && (
            <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-2)", fontFamily: "inherit" }}>
              Correct: Reject = {impliedRejectFromBalance}
              {capturesHold
                ? ` (${checked} − Accept ${accept} − Hold ${hold})`
                : ` (${checked} − Accept ${accept})`}
              {defectCoverage?.state === "short" && (
                <span style={{ color: "var(--warning)" }}>
                  {" "}
                  · {defectCoverage.unexplained} of {reject} not yet explained by a defect reason
                </span>
              )}
              {defectCoverage?.state === "over" && (
                <span style={{ color: "var(--critical)" }}>
                  {" "}
                  · defect reasons total {defectSum}, more than the {reject} rejected
                </span>
              )}
              {defectCoverage?.state === "complete" && (
                <span style={{ color: "var(--status-good)" }}> · every rejected piece is explained</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* One panel for everything wrong with this entry. Blocks stop the save;
          warnings need a per-item acknowledgement so a single confirm can never
          stand in as consent to a different problem. */}
      {((showBlocks && verdict.blocks.length > 0) ||
        (showAdvisories && (verdict.warnings.length > 0 || verdict.notes.length > 0))) && (
        <div id="entry-verdict" style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {(showBlocks ? verdict.blocks : []).map((b) => (
            <div
              key={b.code}
              role="alert"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid color-mix(in srgb, var(--critical) 45%, transparent)",
                background: "var(--critical-weak)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--critical)" }}>{b.message}</div>
              {b.action && (
                <div className="small" style={{ color: "var(--text-2)", marginTop: 3, lineHeight: 1.5 }}>
                  {b.action}
                </div>
              )}
            </div>
          ))}

          {(showAdvisories ? verdict.warnings : []).map((w) => {
            const on = !!acked[w.code];
            return (
              <div
                key={w.code}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid color-mix(in srgb, var(--warning) ${on ? 25 : 50}%, transparent)`,
                  background: on ? "var(--surface-2)" : "var(--warning-weak)",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: on ? "var(--text-2)" : "var(--warning)" }}>
                  {w.message}
                </div>
                {w.action && (
                  <div className="small" style={{ color: "var(--text-2)", marginTop: 3, lineHeight: 1.5 }}>
                    {w.action}
                  </div>
                )}
                {/* One decision per warning. Re-entering a lot at a station
                    is a rewrite — the "or keep both as a second pass" option
                    that used to sit here asked an operator mid-entry to make a
                    ledger-shape decision, and the two checkboxes contradicted
                    each other on screen. */}
                <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, fontSize: 12.5, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setAcked((cur) => ({ ...cur, [w.code]: e.target.checked }))}
                  />
                  {w.code === "station-already-recorded"
                    ? "Replace the existing entry"
                    : "I have checked this — save anyway"}
                </label>
                {on && warningNeedsReason(w.code) && (
                  <input
                    value={ackReasons[w.code] ?? ""}
                    onChange={(e) => setAckReasons((cur) => ({ ...cur, [w.code]: e.target.value }))}
                    placeholder="Reason for the GM (required)"
                    style={{ ...inp, marginTop: 7 }}
                  />
                )}
              </div>
            );
          })}

          {(showAdvisories ? verdict.notes : []).map((n) => (
            <div key={n.code} className="small" style={{ color: "var(--text-3)", paddingLeft: 2 }}>
              {n.message}
            </div>
          ))}
        </div>
      )}


      {err && (
        <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "var(--negative-weak, #fee2e2)", color: "var(--status-bad)", fontSize: 13 }}>{err}</div>
      )}
      {msg && (
        <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "var(--positive-weak)", color: "var(--positive)", fontSize: 13 }}>{msg}</div>
      )}

      {/* What the ledger noticed about the row just saved. The entry IS on the
          ledger — these are questions to answer, not a failed save — so this
          stays until dismissed rather than disappearing with the toast. */}
      {lastIssues && lastIssues.issues.length > 0 && (
        <div
          role="status"
          style={{
            marginBottom: 12,
            borderRadius: 10,
            border: "1px solid color-mix(in srgb, var(--warning) 45%, transparent)",
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 12px",
              background: "var(--warning-weak)",
              borderBottom: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
            }}
          >
            <strong style={{ fontSize: 13, color: "var(--warning)" }}>
              {lastIssues.issues.length === 1
                ? "1 thing to check"
                : `${lastIssues.issues.length} things to check`}
            </strong>
            <span className="small" style={{ color: "var(--text-3)" }}>
              {lastIssues.batchId} · {lastIssues.stage} — saved, and flagged for review
            </span>
            <button
              type="button"
              onClick={() => setLastIssues(null)}
              aria-label="Dismiss"
              style={{
                marginLeft: "auto",
                border: "none",
                background: "transparent",
                color: "var(--text-3)",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <ul style={{ margin: 0, padding: "8px 12px 10px 28px", display: "grid", gap: 6 }}>
            {lastIssues.issues.map((i, n) => (
              <li
                key={`${i.code}-${i.field}-${n}`}
                style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-2)" }}
              >
                {i.message}
                <span
                  className="small"
                  style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", marginLeft: 6 }}
                >
                  {i.code}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sticky save bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 5,
          margin: "16px -16px -16px",
          padding: "12px 16px",
          borderTop: "1px solid var(--border-strong)",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>
          {checked === 0 ? (
            <>Enter {qtyLabel} to save.</>
          ) : (
            <>
              <strong style={{ fontFamily: "var(--font-mono)" }}>{batchId}</strong> · {processName} ·{" "}
              {size} · {qtyLabel} {checked}
              {showReject && (
                <span style={{ color: qtyMismatch ? "var(--status-warn, #d97706)" : "var(--status-good)", fontWeight: 600 }}>
                  {" "}· {qtyMismatch ? "mismatch" : "balanced"}
                </span>
              )}
              {showReject && defectMismatch && (
                <span style={{ color: "var(--status-bad)", fontWeight: 700 }}>
                  {" "}· defects {defectSum} of {reject}
                </span>
              )}
            </>
          )}
        </div>
        {editingId && (
          <button type="button" onClick={cancelEdit} style={btnGhost}>
            Cancel edit
          </button>
        )}
        <button
          type="button"
          onClick={submitForm}
          // A block is visible in the panel above, so the button says no rather
          // than accepting the click and answering with a dialog.
          disabled={saveDisabled}
          title={verdict.blocks[0]?.message}
          style={{
            ...btnPrimary,
            marginLeft: "auto",
            padding: "10px 22px",
            fontSize: 14,
            fontWeight: 700,
            opacity: saveDisabled ? 0.5 : 1,
            cursor: saveDisabled ? "not-allowed" : "pointer",
          }}
        >
          {saveLabel}
        </button>
      </div>

      {/* Shift list */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>This shift</div>
            <div className="small" style={{ color: "var(--text-3)", fontSize: 12 }}>
              Rows on the ledger stay until you delete them. Local rows save when the shift ends.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "Category: All" },
                ...CATHETER_CATEGORIES.map((c) => ({ value: c, label: `Category: ${c}` })),
              ]}
              block={false}
              size="sm"
              ariaLabel="Filter by category"
            />
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              options={shiftTypeOptions}
              block={false}
              size="sm"
              ariaLabel="Filter by type"
            />
            <Select
              value={savedSortOrder}
              onChange={(v) => setSavedSortOrder(v as any)}
              options={[
                { value: "newest", label: "Sort: Newest" },
                { value: "oldest", label: "Sort: Oldest" },
                { value: "batch-asc", label: "Sort: Batch A–Z" },
                { value: "batch-desc", label: "Sort: Batch Z–A" },
                { value: "volume-desc", label: "Sort: Qty High–Low" },
                { value: "rejection-desc", label: "Sort: Rejection High–Low" },
              ]}
              block={false}
              size="sm"
              ariaLabel="Sort order"
            />
            <button type="button" onClick={exportCSV} style={btnGhost}>Export Session CSV</button>
          </div>
        </div>

        {saved.length === 0 ? (
          <div style={{ textAlign: "center", padding: 28, color: "var(--text-3)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 10, lineHeight: 1.5 }}>
            No batches this shift yet.
            <br />
            <span style={{ color: "var(--text-2)" }}>Save a batch above — it will list here until the shift ends.</span>
          </div>
        ) : filteredSaved.length === 0 ? (
          <div style={{ textAlign: "center", padding: 28, color: "var(--text-3)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 10 }}>
            No batches match current category / type filter.
          </div>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={thRow}>
                  <th style={th}>Operator</th>
                  <th style={th}>Stage & Process</th>
                  <th style={th}>Type</th>
                  <th style={th}>Batch ID</th>
                  <th style={{ ...th, textAlign: "center" }}>Qty</th>
                  <th style={{ ...th, textAlign: "center" }}>Trolleys</th>
                  <th style={th}>Bin</th>
                  <th style={{ ...th, textAlign: "center" }}>Accept</th>
                  <th style={{ ...th, textAlign: "center" }}>Hold</th>
                  <th style={{ ...th, textAlign: "center" }}>Reject</th>
                  <th style={{ ...th, textAlign: "center" }}>Yield</th>
                  <th style={{ ...th, textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSaved
                  .map((rec) => {
                  const primaryRow = rec.macro === "primary";
                  const secondaryRow = rec.macro === "secondary";
                  const yieldPct =
                    secondaryRow || rec.checked <= 0
                      ? "—"
                      : ((rec.accept / rec.checked) * 100).toFixed(1) + "%";
                  const defLog = Object.entries(rec.defects || {})
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(", ");
                  const open = previewId === rec.id;
                  return (
                    <React.Fragment key={rec.id}>
                    <tr
                      onClick={() => setPreviewId(open ? null : rec.id)}
                      style={{
                        borderBottom: open ? "none" : "1px solid var(--border)",
                        cursor: "pointer",
                        background: open ? "var(--surface-2)" : rec.id === editingId ? "var(--accent-weak)" : undefined,
                      }}
                      title="Click to preview this entry"
                    >
                      <td style={tdCell}>
                        {rec.operator}
                        {rec.synced ? (
                          <div className="small" style={{ color: "var(--positive)", fontSize: 11, fontWeight: 600 }}>On ledger</div>
                        ) : (
                          <div className="small" style={{ color: "var(--status-warn, #d97706)", fontSize: 11, fontWeight: 600 }}>Not on ledger yet</div>
                        )}
                      </td>
                      <td style={tdCell}>
                        <div style={{ fontWeight: 600 }}>{rec.processName}</div>
                        <div className="small" style={{ color: "var(--text-3)", fontSize: 12 }}>{rec.stageName}</div>
                      </td>
                      <td style={tdCell}>{rec.productType || "2 way"}</td>
                      <td style={{ ...tdCell, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                        {rec.batchId}
                        {rec.duplicateConfirmedOf && (
                          <div
                            title={`Confirmed a different lot from ${rec.duplicateConfirmedOf} despite matching checked/accepted/rejected counts — not a duplicate entry.`}
                            style={{
                              display: "inline-block",
                              marginLeft: 6,
                              padding: "1px 6px",
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 700,
                              fontFamily: "var(--font-sans)",
                              letterSpacing: 0.2,
                              color: "var(--accent)",
                              background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                              border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                            }}
                          >
                            Confirmed distinct
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdCell, textAlign: "center" }}>{rec.checked}</td>
                      <td style={{ ...tdCell, textAlign: "center" }}>{primaryRow ? (rec.trolleys ?? 0) : "—"}</td>
                      <td style={tdCell}>{secondaryRow ? (rec.bin || "—") : "—"}</td>
                      <td style={{ ...tdCell, textAlign: "center", fontWeight: 600 }}>
                        {secondaryRow ? "—" : rec.accept}
                      </td>
                      <td style={{ ...tdCell, textAlign: "center" }}>
                        {primaryRow || secondaryRow ? "—" : rec.hold}
                      </td>
                      <td style={{ ...tdCell, textAlign: "center" }}>
                        {secondaryRow ? (
                          "—"
                        ) : (
                          <>
                            <span style={{ color: rec.reject > 0 ? "var(--status-bad)" : "var(--text-2)", fontWeight: 600 }}>{rec.reject}</span>
                            {defLog && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{defLog}</div>}
                          </>
                        )}
                      </td>
                      <td style={{ ...tdCell, textAlign: "center", fontWeight: 700 }}>{yieldPct}</td>
                      <td style={{ ...tdCell, textAlign: "right" }}>
                        {rec.synced && !canEraseLedger ? (
                          <span
                            style={{
                              fontSize: "var(--text-xs)",
                              color: "var(--text-3)",
                              whiteSpace: "nowrap",
                            }}
                            title="Saved to the ledger. Only a GM can erase it, from the Audit trail."
                          >
                            Saved · locked
                          </span>
                        ) : (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            {!rec.synced && canWrite && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); retrySyncRow(rec); }}
                                disabled={syncingId === rec.id}
                                style={btnSyncNow}
                                title="Push this batch to the ledger now instead of waiting for the shift to end"
                              >
                                {syncingId === rec.id ? "Pushing…" : "Push to ledger"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); deleteLocal(rec.id); }}
                              style={btnDanger}
                              title={rec.synced ? "Erase from the ledger too" : "Remove from this shift list"}
                            >
                              {rec.synced ? "Erase" : "Remove"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                        <td colSpan={12} style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 10 }}>
                            <PreviewField label="Date" value={rec.date} mono />
                            <PreviewField label="Shift" value={rec.shift} />
                            <PreviewField label="Stage" value={`${rec.processName} · ${rec.stageName}`} />
                            <PreviewField label="Size" value={rec.size} />
                            <PreviewField label="Type" value={rec.productType || "2 way"} />
                            <PreviewField label="Batch ID" value={rec.batchId} mono />
                            <PreviewField label={qtyHeaderFor(rec.macro)} value={String(rec.checked)} mono />
                            {rec.macro === "primary" && (
                              <PreviewField label="Trolleys" value={String(rec.trolleys ?? 0)} mono />
                            )}
                            {rec.macro === "secondary" && <PreviewField label="Bin" value={rec.bin || "—"} />}
                            {rec.macro !== "secondary" && (
                              <>
                                <PreviewField label="Accept" value={String(rec.accept)} mono />
                                {rec.macro === "assembly" && (
                                  <PreviewField label="Hold" value={String(rec.hold)} mono />
                                )}
                                <PreviewField label="Reject" value={String(rec.reject)} mono />
                              </>
                            )}
                            <PreviewField
                              label="Saved"
                              value={new Date(rec.savedAt).toLocaleString()}
                            />
                            <PreviewField label="Ledger" value={rec.synced ? "On ledger" : "Not on ledger yet"} />
                          </div>

                          {rec.macro !== "secondary" && (
                            <div style={{ marginBottom: 10 }}>
                              <div className="small" style={{ color: "var(--text-3)", fontSize: 12, marginBottom: 4 }}>
                                Rejection log
                              </div>
                              {defLog ? (
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                                  {defLog}
                                  {" — "}
                                  <span
                                    style={{
                                      color:
                                        Object.values(rec.defects || {}).reduce((a, b) => a + b, 0) === rec.reject
                                          ? "var(--status-good)"
                                          : "var(--status-bad)",
                                      fontWeight: 700,
                                    }}
                                  >
                                    sum {Object.values(rec.defects || {}).reduce((a, b) => a + b, 0)} vs reject {rec.reject}
                                  </span>
                                </div>
                              ) : (
                                <div className="small" style={{ color: "var(--text-3)" }}>No defects logged.</div>
                              )}
                            </div>
                          )}

                          {rec.remarks && (
                            <div style={{ marginBottom: 10, fontSize: 12 }}>
                              <span className="small" style={{ color: "var(--text-3)" }}>Remarks: </span>
                              {rec.remarks}
                            </div>
                          )}

                          <button type="button" onClick={() => editRow(rec)} style={btnGhost}>
                            Edit this entry
                          </button>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="small" style={{ color: "var(--text-3)", fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: mono ? "var(--font-mono)" : undefined }}>
        {value}
      </div>
    </div>
  );
}

/* ── styles (token-driven) ─────────────────────────────────────────────── */
function FieldCol({
  label,
  children,
  align,
}: {
  label: string;
  children: React.ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-2)",
          marginBottom: 6,
          textAlign: align ?? "left",
          lineHeight: 1.3,
          minHeight: 20,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: align === "center" ? "center" : "flex-start",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function statusPill(tone: "good" | "warn" | "neutral"): React.CSSProperties {
  const map = {
    good: {
      bg: "color-mix(in srgb, var(--positive) 12%, var(--surface))",
      fg: "var(--positive)",
      bd: "color-mix(in srgb, var(--positive) 30%, var(--border))",
    },
    warn: {
      bg: "color-mix(in srgb, var(--status-warn, #d97706) 12%, var(--surface))",
      fg: "var(--status-warn, #d97706)",
      bd: "color-mix(in srgb, var(--status-warn, #d97706) 35%, var(--border))",
    },
    neutral: {
      bg: "var(--surface-2)",
      fg: "var(--text-2)",
      bd: "var(--border)",
    },
  }[tone];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    color: map.fg,
    background: map.bg,
    border: `1px solid ${map.bd}`,
    lineHeight: 1.3,
  };
}

const panel: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

const zone: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  padding: 14,
  minWidth: 0,
};

const zoneTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
  marginBottom: 12,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-2)",
  marginBottom: 8,
};

const subLabel: React.CSSProperties = {
  display: "block",
  marginTop: 8,
  color: "var(--text-3)",
  fontWeight: 500,
  fontSize: 12,
};

const qtyInp: React.CSSProperties = {
  height: 42,
  fontSize: 16,
  padding: "8px 10px",
};

const chipOn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 9999,
  border: "none",
  background: "var(--accent)",
  color: "var(--text-invert)",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};

const chipOff: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 9999,
  border: "1px solid var(--border-strong)",
  background: "var(--surface-2)",
  color: "var(--text-2)",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
};

const chipBadge: React.CSSProperties = {
  ...chipOff,
  cursor: "default",
  opacity: 0.75,
  fontSize: 11,
};

const thRow: React.CSSProperties = {
  background: "var(--surface-2)",
  borderBottom: "1px solid var(--border)",
};

const th: React.CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-3)",
};

const tdCell: React.CSSProperties = {
  padding: "10px 12px",
  color: "var(--text-2)",
};

const inp: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert)",
  border: "none",
  borderRadius: 9999,
  padding: "10px 24px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

/** Destructive actions must not read as ordinary links — an erase and an edit
 *  should never look the same at a glance. */
const btnDanger: React.CSSProperties = {
  background: "transparent",
  color: "var(--status-bad)",
  border: "1px solid color-mix(in srgb, var(--status-bad) 45%, transparent)",
  borderRadius: 9999,
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const btnSyncNow: React.CSSProperties = {
  background: "transparent",
  color: "var(--accent)",
  border: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)",
  borderRadius: 9999,
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: 9999,
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function badge(tone: "blue" | "green" | "amber" | "purple"): React.CSSProperties {
  const map = {
    blue: { bg: "var(--accent-weak, rgba(59,130,246,.12))", fg: "var(--accent)" },
    green: { bg: "var(--positive-weak)", fg: "var(--positive)" },
    amber: { bg: "rgba(217,119,6,.12)", fg: "var(--status-warn, #d97706)" },
    purple: { bg: "rgba(139,92,246,.12)", fg: "#8b5cf6" },
  }[tone];
  return {
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: map.bg,
    color: map.fg,
    border: `1px solid ${map.fg}33`,
  };
}
