// Group ledger events into human-scale "sessions" for the Audit Trail.
// One session ≈ one save / upload / ingest batch (ingestionId), not one atom row.

export type AuditDatePreset = "7d" | "30d" | "90d" | "all";

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
  return typeof b === "string" && b.trim() ? b.trim() : null;
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
  defects: { code: string; qty: number }[];
  source: "manual" | "excel" | "mixed";
  fileLabel: string;
  recordedAt: string;
  eventIds: string[];
  commentCount: number;
  hasCorrection: boolean;
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

function sizeOf(e: AuditEventLike): string | null {
  const s = (e as { size?: string | null }).size;
  return s != null && String(s).trim() ? String(s).trim() : null;
}

/**
 * Collapse atom events into Excel-like entry rows:
 * key = date | batch | stage | size
 */
export function buildEntryRows(
  events: AuditEventLike[],
  commentsMap: Map<string, string[]> = new Map()
): AuditEntryRow[] {
  type Acc = {
    date: string;
    batch: string;
    stageId: string;
    size: string | null;
    checked: number;
    explicitAccepted: number;
    rejected: number;
    defects: Map<string, number>;
    manual: number;
    excel: number;
    fileLabel: string;
    recordedAt: string;
    eventIds: string[];
    commentCount: number;
    hasCorrection: boolean;
  };

  const map = new Map<string, Acc>();

  for (const e of events) {
    if (e.eventType === "annotation") continue;
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
        checked: 0,
        explicitAccepted: 0,
        rejected: 0,
        defects: new Map(),
        manual: 0,
        excel: 0,
        fileLabel: "Data Entry",
        recordedAt: "",
        eventIds: [],
        commentCount: 0,
        hasCorrection: false,
      };
      map.set(key, a);
    }

    if (e.eventId) a.eventIds.push(e.eventId);
    const ts = eventTs(e);
    if (ts > a.recordedAt) a.recordedAt = ts;

    if (e.provenance?.file && e.provenance.file !== "Manual Entry") {
      a.fileLabel = e.provenance.file;
    }
    if (isDirectEntry(e)) a.manual++;
    else a.excel++;

    if (e.eventType === "production") a.checked += Number(e.quantity ?? 0);
    if (e.eventType === "inspection") {
      if (e.disposition === "accepted" || e.disposition === "good") {
        a.explicitAccepted += Number(e.quantity ?? 0);
      } else if (e.disposition === "rejected") {
        a.rejected += Number(e.quantity ?? 0);
      }
    }
    if (e.eventType === "rejection") {
      const code = e.defectCodeRaw || e.defectCode || "defect";
      a.defects.set(code, (a.defects.get(code) ?? 0) + Number(e.quantity ?? 0));
    }
    if (e.eventType === "correction") a.hasCorrection = true;
    if (e.eventId) {
      a.commentCount += (commentsMap.get(e.eventId) ?? []).length;
    }
  }

  const rows: AuditEntryRow[] = [];
  for (const a of map.values()) {
    let source: AuditEntryRow["source"] = "mixed";
    if (a.manual > 0 && a.excel === 0) source = "manual";
    else if (a.excel > 0 && a.manual === 0) source = "excel";

    const accepted =
      a.explicitAccepted > 0 ? a.explicitAccepted : Math.max(0, a.checked - a.rejected);

    rows.push({
      id: `${a.date}|${a.batch}|${a.stageId}|${a.size ?? ""}`,
      date: a.date,
      batch: a.batch,
      stageId: a.stageId,
      size: a.size,
      checked: a.checked,
      accepted,
      rejected: a.rejected,
      defects: [...a.defects.entries()]
        .map(([code, qty]) => ({ code, qty }))
        .sort((x, y) => y.qty - x.qty),
      source,
      fileLabel: source === "manual" ? "Data Entry" : a.fileLabel,
      recordedAt: a.recordedAt,
      eventIds: a.eventIds,
      commentCount: a.commentCount,
      hasCorrection: a.hasCorrection,
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

    // Prefer quality-gate order when known
    const STAGE_ORDER = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];
    const stageIds = [...byStage.keys()].sort((a, b) => {
      const ia = STAGE_ORDER.indexOf(a);
      const ib = STAGE_ORDER.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.localeCompare(b);
    });

    const stages: AuditStageBucket[] = [];
    let initialBatchLotChecked = 0;
    let rejectedQty = 0;
    let eventCount = 0;
    let dateFrom = "9999-99-99";
    let dateTo = "";
    const sources = new Set<"manual" | "excel" | "mixed">();

    let prevStageAccepted: number | null = null;

    for (let idx = 0; idx < stageIds.length; idx++) {
      const stageId = stageIds[idx];
      const srowsRaw = (byStage.get(stageId) ?? []).sort((a, b) => b.date.localeCompare(a.date));
      let sc = 0;
      let sa = 0;
      let sr = 0;

      // Calculate initial stage sum
      for (const r of srowsRaw) {
        sc += r.checked;
        sa += r.accepted;
        sr += r.rejected;
      }

      if (idx === 0) {
        initialBatchLotChecked = sc;
      }

      // If this is a subsequent stage (idx > 0) and the previous stage passed forward units,
      // check if this stage's recorded checked was set to the batch initial lot size or missing.
      let cascadedChecked = sc;
      let cascadedAccepted = sa;
      if (idx > 0 && prevStageAccepted != null && prevStageAccepted > 0) {
        // If current stage raw checked equals initial batch lot size (e.g. 400),
        // or if it was 0/missing, cascade the previous stage's accepted qty (e.g. 120).
        if (sc === initialBatchLotChecked || sc === 0) {
          cascadedChecked = prevStageAccepted;
          cascadedAccepted = Math.max(0, cascadedChecked - sr);
        }
      }

      // Clone rows with updated cascaded checked / accepted if adjusted
      const srows: AuditEntryRow[] = srowsRaw.map((r) => {
        let rowChecked = r.checked;
        let rowAccepted = r.accepted;
        if (idx > 0 && prevStageAccepted != null && prevStageAccepted > 0) {
          if (r.checked === initialBatchLotChecked || r.checked === 0) {
            rowChecked = prevStageAccepted;
            rowAccepted = Math.max(0, rowChecked - r.rejected);
          }
        }
        return {
          ...r,
          checked: rowChecked,
          accepted: rowAccepted,
        };
      });

      for (const r of srows) {
        eventCount += r.eventIds.length;
        sources.add(r.source);
        if (r.date && r.date < dateFrom) dateFrom = r.date;
        if (r.date && r.date > dateTo) dateTo = r.date;
      }

      rejectedQty += sr;
      prevStageAccepted = cascadedAccepted;

      stages.push({
        stageId,
        rows: srows,
        checkedQty: cascadedChecked,
        acceptedQty: cascadedAccepted,
        rejectedQty: sr,
        rowCount: srows.length,
      });
    }

    if (dateFrom === "9999-99-99") dateFrom = "—";
    if (!dateTo) dateTo = dateFrom;

    const finalStageAccepted = stages.length > 0 ? stages[stages.length - 1].acceptedQty : 0;

    groups.push({
      batch,
      stages,
      checkedQty: initialBatchLotChecked,
      acceptedQty: finalStageAccepted,
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

export function filterEntryRows(
  rows: AuditEntryRow[],
  opts: {
    source?: "all" | "manual" | "excel";
    stageId?: string;
    search?: string;
    exceptionsOnly?: boolean;
  }
): AuditEntryRow[] {
  const q = (opts.search ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (opts.source === "manual" && r.source !== "manual") return false;
    if (opts.source === "excel" && r.source !== "excel") return false;
    if (opts.stageId && opts.stageId !== "all" && r.stageId !== opts.stageId) return false;
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
