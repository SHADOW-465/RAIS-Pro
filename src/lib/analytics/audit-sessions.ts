// Group ledger events into human-scale "sessions" for the Audit Trail.
// One session ≈ one save / upload / ingest batch (ingestionId), not one atom row.

export type AuditDatePreset = "7d" | "30d" | "90d" | "all";
import { canonicalBatchId } from "@/lib/entry/batch-id";
import { passedForward } from "@/lib/entry/passed-forward";
import { sortStageIds } from "@/core/ontology/plant-catalog";
import { periodKey, periodLabel, type Grain } from "./scope";

export interface AuditEventLike {
  eventId?: string;
  eventType?: string;
  ingestionId?: string;
  recordedAt?: string;
  occurredOn?: { start?: string; end?: string };
  stageId?: string;
  size?: string | null;
  quantity?: number;
  statedValue?: number | string;
  disposition?: string;
  defectCodeRaw?: string;
  defectCode?: string;
  extractedBy?: string;
  isDirectEntry?: boolean;
  batchNo?: string | null;
  customFields?: Record<string, unknown>;
  provenance?: {
    file?: string;
    fileHash?: string;
    cells?: string[];
    sheet?: string;
  };
  text?: string;
  targetEventIds?: string[];
}

export interface AuditSession {
  /** Stable key (usually ingestionId). */
  id: string;
  ingestionId: string;
  /** Newest recordedAt in the group (ISO). */
  recordedAt: string;
  /** Business dates covered (occurredOn.start min/max). */
  dateFrom: string;
  dateTo: string;
  source: "manual" | "excel" | "mixed";
  fileLabel: string;
  stages: string[];
  batches: string[];
  eventCount: number;
  /** Sum of production quantities. */
  checkedQty: number;
  /** Net good / accepted quantity. */
  acceptedQty: number;
  /** Sum of inspection(rejected) quantities. */
  rejectedQty: number;
  defectEventCount: number;
  commentCount: number;
  hasCorrection: boolean;
  events: AuditEventLike[];
}

export function batchOf(e: AuditEventLike): string | null {
  const b =
    e.batchNo ??
    (e.customFields?.batch as string | undefined) ??
    (e.customFields?.batchId as string | undefined) ??
    null;
  // Same fold as analytics/scope.eventBatchId — one lot, one spelling.
  return canonicalBatchId(typeof b === "string" ? b : null);
}

export function isDirectEntry(e: AuditEventLike): boolean {
  return e.extractedBy === "direct-entry" || e.isDirectEntry === true;
}

function eventTs(e: AuditEventLike): string {
  return e.recordedAt ?? e.occurredOn?.start ?? "";
}

/** ISO date (yyyy-mm-dd) N calendar days before today (UTC date floor). */
export function dateDaysAgo(days: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Keep events whose business date or recorded date falls on/after `fromIso`.
 * `all` / empty from → no date cut.
 */
export function filterEventsByDatePreset(
  events: AuditEventLike[],
  preset: AuditDatePreset,
  now = new Date()
): AuditEventLike[] {
  if (preset === "all") return events;
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const from = dateDaysAgo(days, now);
  return events.filter((e) => {
    const biz = e.occurredOn?.start ?? "";
    const rec = e.recordedAt ? e.recordedAt.slice(0, 10) : "";
    // Include if either business day or record day is in window
    if (biz && biz >= from) return true;
    if (rec && rec >= from) return true;
    // No dates → keep (don't hide orphan rows)
    if (!biz && !rec) return true;
    return false;
  });
}

/**
 * Group non-annotation events by ingestionId.
 * Annotations are counted via commentsMap / correction events stay in group.
 */
export function groupAuditSessions(
  events: AuditEventLike[],
  commentsMap: Map<string, string[]>
): AuditSession[] {
  const byId = new Map<string, AuditEventLike[]>();

  for (const e of events) {
    if (e.eventType === "annotation") continue;
    const id =
      (e.ingestionId && String(e.ingestionId).trim()) ||
      `orphan:${eventTs(e).slice(0, 13)}:${e.provenance?.fileHash ?? e.provenance?.file ?? "x"}`;
    const arr = byId.get(id);
    if (arr) arr.push(e);
    else byId.set(id, [e]);
  }

  const sessions: AuditSession[] = [];

  for (const [id, list] of byId) {
    const stages = new Set<string>();
    const batches = new Set<string>();
    let checkedQty = 0;
    let explicitAcceptedQty = 0;
    let rejectedQty = 0;
    let defectEventCount = 0;
    let commentCount = 0;
    let hasCorrection = false;
    let manual = 0;
    let excel = 0;
    let dateFrom = "9999-99-99";
    let dateTo = "";
    let recordedAt = "";
    let fileLabel = "Manual Entry";

    for (const e of list) {
      if (e.stageId) stages.add(e.stageId);
      const b = batchOf(e);
      if (b) batches.add(b);

      const day = e.occurredOn?.start ?? "";
      if (day && day < dateFrom) dateFrom = day;
      if (day && day > dateTo) dateTo = day;

      const ts = eventTs(e);
      if (ts > recordedAt) recordedAt = ts;

      if (e.provenance?.file) fileLabel = e.provenance.file;
      if (isDirectEntry(e)) manual++;
      else excel++;

      if (e.eventType === "production") checkedQty += Number(e.quantity ?? 0);
      if (e.eventType === "inspection") {
        if (e.disposition === "accepted" || e.disposition === "good") {
          explicitAcceptedQty += Number(e.quantity ?? 0);
        } else if (e.disposition === "rejected") {
          rejectedQty += Number(e.quantity ?? 0);
        }
      }
      if (e.eventType === "rejection") defectEventCount++;
      if (e.eventType === "correction") hasCorrection = true;

      const comments = e.eventId ? commentsMap.get(e.eventId) ?? [] : [];
      commentCount += comments.length;
    }

    if (dateFrom === "9999-99-99") dateFrom = recordedAt.slice(0, 10) || "—";
    if (!dateTo) dateTo = dateFrom;

    let source: AuditSession["source"] = "mixed";
    if (manual > 0 && excel === 0) source = "manual";
    else if (excel > 0 && manual === 0) source = "excel";

    const acceptedQty =
      explicitAcceptedQty > 0 ? explicitAcceptedQty : Math.max(0, checkedQty - rejectedQty);

    sessions.push({
      id,
      ingestionId: id.startsWith("orphan:") ? id : list[0]?.ingestionId ?? id,
      recordedAt,
      dateFrom,
      dateTo,
      source,
      fileLabel: source === "manual" && fileLabel === "Manual Entry" ? "Data Entry" : fileLabel,
      stages: [...stages],
      batches: [...batches],
      eventCount: list.length,
      checkedQty,
      acceptedQty,
      rejectedQty,
      defectEventCount,
      commentCount,
      hasCorrection,
      events: list.sort((a, b) => eventTs(b).localeCompare(eventTs(a))),
    });
  }

  // Newest session first
  sessions.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return sessions;
}

export interface SessionFilterOpts {
  source?: "all" | "manual" | "excel";
  stageId?: string;
  search?: string;
  /** Only sessions with comments or corrections */
  exceptionsOnly?: boolean;
  commentsMap?: Map<string, string[]>;
}

export function filterSessions(
  sessions: AuditSession[],
  opts: SessionFilterOpts
): AuditSession[] {
  const q = (opts.search ?? "").trim().toLowerCase();
  return sessions.filter((s) => {
    if (opts.source === "manual" && s.source !== "manual") return false;
    if (opts.source === "excel" && s.source !== "excel") return false;
    if (opts.stageId && opts.stageId !== "all" && !s.stages.includes(opts.stageId)) {
      return false;
    }
    if (opts.exceptionsOnly) {
      if (s.commentCount === 0 && !s.hasCorrection) return false;
    }
    if (q) {
      const hay = [
        s.fileLabel,
        s.ingestionId,
        s.dateFrom,
        s.dateTo,
        ...s.stages,
        ...s.batches,
        s.source,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) {
        // Also search event ids / defects inside session
        const hit = s.events.some((e) => {
          const comments = e.eventId
            ? opts.commentsMap?.get(e.eventId) ?? []
            : [];
          return (
            e.eventId?.toLowerCase().includes(q) ||
            e.defectCodeRaw?.toLowerCase().includes(q) ||
            e.defectCode?.toLowerCase().includes(q) ||
            batchOf(e)?.toLowerCase().includes(q) ||
            comments.some((c) => c.toLowerCase().includes(q))
          );
        });
        if (!hit) return false;
      }
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Batch → Stage → Entry (Excel-like) — preferred for Data Entry     */
/* ------------------------------------------------------------------ */

/** One plant row: date · stage · size · batch — like a sheet line, not N event atoms. */
export interface AuditEntryRow {
  id: string;
  date: string;
  batch: string;
  stageId: string;
  size: string | null;
  checked: number;
  accepted: number;
  rejected: number;
  /**
   * Held / reworked units (Visual only). Stored correctly as an
   * inspection·rework event since day one — this row simply never read it
   * back, so Checked never visibly summed to Accepted + Hold + Rejected and
   * the held units looked lost even though the ledger had them.
   */
  rework: number;
  defects: { code: string; qty: number }[];
  source: "manual" | "excel" | "mixed";
  fileLabel: string;
  recordedAt: string;
  eventIds: string[];
  commentCount: number;
  hasCorrection: boolean;
  /**
   * How many distinct primary-event revisions contributed to this row
   * (after last-write-wins). >1 means the entry was edited / re-saved.
   */
  revisionCount: number;
  /**
   * Shift labels (`provenance.sheet`) behind this row — normally one. Carried
   * because DELETE /api/manual-entries scopes by date+shift, and without it the
   * only way to erase a displayed row is the far broader batch-wide purge.
   */
  shifts: string[];
  /**
   * Catheter product type ("Male 2 way", "Female", …). Written onto every
   * event by Data Entry since day one and read back by nothing, so it never
   * appeared on any screen — including the audit trail that is supposed to
   * show what was recorded.
   */
  productType: string | null;
}

export interface AuditStageBucket {
  stageId: string;
  rows: AuditEntryRow[];
  checkedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  rowCount: number;
}

export interface AuditBatchGroup {
  batch: string;
  stages: AuditStageBucket[];
  checkedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  rowCount: number;
  eventCount: number;
  dateFrom: string;
  dateTo: string;
  sources: ("manual" | "excel" | "mixed")[];
}

/**
 * True when a batch's headline figures cannot both be right.
 *
 * `checkedQty` is the FIRST gate's checked (the lot going in) and `acceptedQty`
 * is the LAST gate's accepted (good units coming out), so accepted can only
 * exceed checked when the gate chain has a hole — a skipped gate stops the
 * stage-to-stage cascade below, and a later station's own (larger) lot count
 * passes straight through. Real data, impossible pair: surface it on the row
 * instead of printing it as though it were fine.
 */
export function batchFiguresInconsistent(g: {
  checkedQty: number;
  acceptedQty: number;
}): boolean {
  return g.checkedQty > 0 && g.acceptedQty > g.checkedQty;
}

function sizeOf(e: AuditEventLike): string | null {
  const s = (e as { size?: string | null }).size;
  return s != null && String(s).trim() ? String(s).trim() : null;
}

/**
 * Collapse atom events into Excel-like entry rows:
 * key = date | batch | stage | size
 *
 * Quantities use **last-write-wins** per semantic atom (production, each
 * inspection disposition, each defect code) by `recordedAt`. Summing would
 * double-count when re-saves leave multiple effective primaries (or when
 * callers pass a slightly stale mix). Append-only history stays in the ledger;
 * this surface always shows the current values.
 */
export function buildEntryRows(
  events: AuditEventLike[],
  commentsMap: Map<string, string[]> = new Map()
): AuditEntryRow[] {
  type Atom = { qty: number; ts: string; eventId: string };
  type Acc = {
    date: string;
    batch: string;
    stageId: string;
    size: string | null;
    /** production | inspection:accepted | inspection:rejected | rejection:CODE */
    atoms: Map<string, Atom>;
    manual: number;
    excel: number;
    fileLabel: string;
    productType: string | null;
    recordedAt: string;
    eventIds: string[];
    commentCount: number;
    hasCorrection: boolean;
    /** Times a primary quantity was replaced by a newer event (edit signal). */
    overwriteCount: number;
    shifts: Set<string>;
  };

  const map = new Map<string, Acc>();

  const putAtom = (a: Acc, atomKey: string, qty: number, ts: string, eventId: string) => {
    const prev = a.atoms.get(atomKey);
    if (!prev || ts >= prev.ts) {
      if (prev && prev.eventId && prev.eventId !== eventId) a.overwriteCount += 1;
      a.atoms.set(atomKey, { qty, ts, eventId });
    }
  };

  for (const e of events) {
    if (e.eventType === "annotation") continue;
    // Corrections do not carry quantities; they only flag history.
    if (e.eventType === "correction") {
      // Attach flag to matching slice when possible
      const date = e.occurredOn?.start ?? e.recordedAt?.slice(0, 10) ?? "—";
      const batch = batchOf(e) ?? "(no batch)";
      const stageId = e.stageId ?? "(unknown stage)";
      const size = sizeOf(e);
      const key = `${date}|${batch}|${stageId}|${size ?? ""}`;
      let a = map.get(key);
      if (!a) {
        a = {
          date,
          batch,
          stageId,
          size,
          atoms: new Map(),
          manual: 0,
          excel: 0,
          fileLabel: "Data Entry",
          productType: null,
          recordedAt: "",
          eventIds: [],
          commentCount: 0,
          hasCorrection: true,
          overwriteCount: 0,
          shifts: new Set(),
        };
        map.set(key, a);
      } else {
        a.hasCorrection = true;
      }
      if (e.eventId) {
        a.eventIds.push(e.eventId);
        a.commentCount += (commentsMap.get(e.eventId) ?? []).length;
      }
      const ts = eventTs(e);
      if (ts > a.recordedAt) a.recordedAt = ts;
      continue;
    }

    const date = e.occurredOn?.start ?? e.recordedAt?.slice(0, 10) ?? "—";
    const batch = batchOf(e) ?? "(no batch)";
    const stageId = e.stageId ?? "(unknown stage)";
    const size = sizeOf(e);
    const key = `${date}|${batch}|${stageId}|${size ?? ""}`;

    let a = map.get(key);
    if (!a) {
      a = {
        date,
        batch,
        stageId,
        size,
        atoms: new Map(),
        manual: 0,
        excel: 0,
        fileLabel: "Data Entry",
        productType: null,
        recordedAt: "",
        eventIds: [],
        commentCount: 0,
        hasCorrection: false,
        overwriteCount: 0,
        shifts: new Set(),
      };
      map.set(key, a);
    }
    a.shifts.add(e.provenance?.sheet?.trim() || "Day Shift");
    if (!a.productType) {
      const pt = e.customFields?.productType;
      if (typeof pt === "string" && pt.trim()) a.productType = pt.trim();
    }

    if (e.eventId) a.eventIds.push(e.eventId);
    const ts = eventTs(e);
    if (ts > a.recordedAt) a.recordedAt = ts;

    if (e.provenance?.file && e.provenance.file !== "Manual Entry") {
      a.fileLabel = e.provenance.file;
    }
    if (isDirectEntry(e)) a.manual++;
    else a.excel++;

    const qty = Number(e.quantity ?? 0);
    const eid = e.eventId ?? "";

    if (e.eventType === "production") {
      putAtom(a, "production", qty, ts, eid);
    } else if (e.eventType === "inspection") {
      if (e.disposition === "accepted" || e.disposition === "good") {
        putAtom(a, "inspection:accepted", qty, ts, eid);
      } else if (e.disposition === "rejected") {
        putAtom(a, "inspection:rejected", qty, ts, eid);
      } else if (e.disposition === "rework") {
        putAtom(a, "inspection:rework", qty, ts, eid);
      }
    } else if (e.eventType === "rejection") {
      const code = e.defectCodeRaw || e.defectCode || "defect";
      putAtom(a, `rejection:${code}`, qty, ts, eid);
    }

    if (e.eventId) {
      a.commentCount += (commentsMap.get(e.eventId) ?? []).length;
    }
  }

  const rows: AuditEntryRow[] = [];
  for (const a of map.values()) {
    let source: AuditEntryRow["source"] = "mixed";
    if (a.manual > 0 && a.excel === 0) source = "manual";
    else if (a.excel > 0 && a.manual === 0) source = "excel";

    const checked = a.atoms.get("production")?.qty ?? 0;
    const explicitAccepted = a.atoms.get("inspection:accepted")?.qty ?? 0;
    const rejected = a.atoms.get("inspection:rejected")?.qty ?? 0;
    const rework = a.atoms.get("inspection:rework")?.qty ?? 0;
    // accept = checked − (rejected + hold) when accepted was not stated.
    const accepted =
      explicitAccepted > 0 ? explicitAccepted : passedForward({ checked, rejected, hold: rework });

    const defects: { code: string; qty: number }[] = [];
    for (const [k, atom] of a.atoms) {
      if (!k.startsWith("rejection:")) continue;
      defects.push({ code: k.slice("rejection:".length), qty: atom.qty });
    }
    defects.sort((x, y) => y.qty - x.qty);

    const revisionCount = 1 + a.overwriteCount + (a.hasCorrection ? 1 : 0);

    rows.push({
      id: `${a.date}|${a.batch}|${a.stageId}|${a.size ?? ""}`,
      date: a.date,
      batch: a.batch,
      stageId: a.stageId,
      size: a.size,
      checked,
      accepted,
      rejected,
      rework,
      defects,
      source,
      fileLabel: source === "manual" ? "Data Entry" : a.fileLabel,
      productType: a.productType,
      recordedAt: a.recordedAt,
      eventIds: a.eventIds,
      commentCount: a.commentCount,
      hasCorrection: a.hasCorrection || a.overwriteCount > 0,
      revisionCount,
      shifts: [...a.shifts],
    });
  }

  // Newest business date first, then batch, stage
  rows.sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d) return d;
    const bt = a.batch.localeCompare(b.batch);
    if (bt) return bt;
    return a.stageId.localeCompare(b.stageId);
  });
  return rows;
}

/**
 * Hierarchy for display: Batch → Stage → entry rows (Excel-like sheet feel).
 * Includes dynamic stage-to-stage yield input cascading for multi-stage batches.
 */
/** A run of batch groups that share a calendar period. */
export interface AuditPeriodGroup {
  /** periodKey value — "2026-08-19", "2026-08", "FY26-27". */
  period: string;
  /** Human label for the header. */
  label: string;
  groups: AuditBatchGroup[];
  batchCount: number;
  rowCount: number;
}

/**
 * Bucket batch groups into calendar periods for the History list.
 *
 * A lot spans days, so it is filed under `dateTo` — the last day anything was
 * recorded against it. Splitting a lot across two headers would break the one
 * thing this screen is for: seeing a lot's stages together.
 *
 * Periods come back newest first, which is the order someone looking for what
 * they just entered reads in.
 */
export function groupByPeriod(groups: AuditBatchGroup[], grain: Grain): AuditPeriodGroup[] {
  const byPeriod = new Map<string, AuditBatchGroup[]>();
  for (const g of groups) {
    const day = g.dateTo || g.dateFrom;
    const key = day ? periodKey(day, grain) : "unknown";
    const arr = byPeriod.get(key);
    if (arr) arr.push(g);
    else byPeriod.set(key, [g]);
  }

  return [...byPeriod.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([period, inPeriod]) => ({
      period,
      label: period === "unknown" ? "No date recorded" : periodLabel(period),
      groups: inPeriod,
      batchCount: inPeriod.length,
      rowCount: inPeriod.reduce((n, g) => n + g.rowCount, 0),
    }));
}

export function groupByBatchThenStage(rows: AuditEntryRow[]): AuditBatchGroup[] {
  const byBatch = new Map<string, AuditEntryRow[]>();
  for (const r of rows) {
    const arr = byBatch.get(r.batch);
    if (arr) arr.push(r);
    else byBatch.set(r.batch, [r]);
  }

  const groups: AuditBatchGroup[] = [];

  for (const [batch, batchRows] of byBatch) {
    const byStage = new Map<string, AuditEntryRow[]>();
    for (const r of batchRows) {
      const arr = byStage.get(r.stageId);
      if (arr) arr.push(r);
      else byStage.set(r.stageId, [r]);
    }

    // Plant schema order: Primary dipping → secondary → assembly.
    // The old visual-first list made lot CHECKED read Visual (1,000) while
    // production-dipping had already recorded the units that entered the line.
    const stageIds = sortStageIds([...byStage.keys()]);

    const stages: AuditStageBucket[] = [];
    let rejectedQty = 0;
    let eventCount = 0;
    let dateFrom = "9999-99-99";
    let dateTo = "";
    const sources = new Set<"manual" | "excel" | "mixed">();

    for (const stageId of stageIds) {
      const srows = (byStage.get(stageId) ?? []).sort((a, b) => b.date.localeCompare(a.date));
      let sc = 0;
      let sa = 0;
      let sr = 0;
      let sh = 0;

      for (const r of srows) {
        sc += r.checked;
        sa += r.accepted;
        sr += r.rejected;
        sh += r.rework;
        eventCount += r.eventIds.length;
        sources.add(r.source);
        if (r.date && r.date < dateFrom) dateFrom = r.date;
        if (r.date && r.date > dateTo) dateTo = r.date;
      }

      rejectedQty += sr;

      stages.push({
        stageId,
        rows: srows,
        checkedQty: sc,
        acceptedQty: passedForward({ checked: sc, accepted: sa, rejected: sr, hold: sh }),
        rejectedQty: sr,
        rowCount: srows.length,
      });
    }

    if (dateFrom === "9999-99-99") dateFrom = "—";
    if (!dateTo) dateTo = dateFrom;

    // Lot going in = first plant-schema stage that recorded a check.
    // Lot coming out = last stage's passed-forward (accept = checked − reject − hold).
    const firstIn = stages.find((s) => s.checkedQty > 0);
    const lastOut = [...stages].reverse().find((s) => s.acceptedQty > 0 || s.checkedQty > 0);

    groups.push({
      batch,
      stages,
      checkedQty: firstIn?.checkedQty ?? 0,
      acceptedQty: lastOut?.acceptedQty ?? 0,
      rejectedQty,
      rowCount: batchRows.length,
      eventCount,
      dateFrom,
      dateTo,
      sources: [...sources],
    });
  }

  // Batches with newest activity first
  groups.sort((a, b) => b.dateTo.localeCompare(a.dateTo) || a.batch.localeCompare(b.batch));
  return groups;
}

/** Canonical size ids present on a set of rows, smallest French size first. */
export function listRowSizes(rows: AuditEntryRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) if (r.size) set.add(r.size);
  // "Fr6" before "Fr10": compare the number, not the string.
  return [...set].sort((a, b) => {
    const na = Number(a.replace(/\D/g, ""));
    const nb = Number(b.replace(/\D/g, ""));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

export function filterEntryRows(
  rows: AuditEntryRow[],
  opts: {
    source?: "all" | "manual" | "excel";
    stageId?: string;
    /** Canonical size id ("Fr14"); "all" or omitted keeps every size. */
    size?: string;
    search?: string;
    exceptionsOnly?: boolean;
  }
): AuditEntryRow[] {
  const q = (opts.search ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (opts.source === "manual" && r.source !== "manual") return false;
    if (opts.source === "excel" && r.source !== "excel") return false;
    if (opts.stageId && opts.stageId !== "all" && r.stageId !== opts.stageId) return false;
    if (opts.size && opts.size !== "all" && r.size !== opts.size) return false;
    if (opts.exceptionsOnly && r.commentCount === 0 && !r.hasCorrection) return false;
    if (q) {
      const hay = [
        r.batch,
        r.stageId,
        r.size ?? "",
        r.date,
        r.fileLabel,
        ...r.defects.map((d) => d.code),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
