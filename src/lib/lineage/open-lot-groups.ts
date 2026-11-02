// Group open-lot source batches into three categories:
//   1. "completed"     — cleared the process / station / line
//   2. "not_completed" — still open / missing the process and not a conversion
//   3. "converted"     — size-converted batch (explicit lineage or same date-stem sibling)
//
// Lives in src/lib/lineage so src/lib/analytics stays isolated from lineage.

import { canonicalBatchId, parseBatchId, frDigitsFromSize } from "@/lib/entry/batch-id";
import { STAGE_LABELS, resolveStageId, stageCategoryOf, stageSortKey } from "@/core/ontology/plant-catalog";
import { PROCESS_ORDER, processLabel, type OpenLotRow, type ProcessId } from "@/lib/analytics/open-lots";
import type { AuditBatchGroup } from "@/lib/analytics/audit-sessions";
import type { SourceRow } from "@/lib/analytics/source-trace";
import type { BatchConversion } from "./types";

export type LotSourceCategory = "completed" | "not_completed" | "converted";

/**
 * Structured batch nomenclature breakdown matching shop-floor specification:
 * - OK batch:      26 J 16 - 24          (Year · Month · Day - Size)
 * - Convert batch: 26 J 16 - 24 CT 22    (Year · Month · Day - Main size · CT · Convert size)
 */
export interface ConvertBatchBreakdown {
  isConverted: boolean;
  year: string;              // "26"
  month: string;             // "J"
  day: string;               // "16"
  mainSize: string;          // "24"
  convertMarker: "CT" | null;
  convertSize: string | null; // "22"
  okBatchCode: string;       // "26J16-24"
  convertBatchCode: string;  // "26J16-24 CT 22" (or "26J16-24" for OK batch)
  rawTargetBatch: string;    // "26J16-22"
}

export interface LotCategoryMeta {
  batch: string;
  category: LotSourceCategory;
  /** Original batch ID when category === "converted" (or target batch if outgoing conversion) */
  fromBatch?: string | null;
  /** Formatted Convert batch code (e.g. "26J16-24 CT 22") */
  convertBatchCode?: string | null;
  /** Structured parts breakdown (Year, Month, Day, Main size, CT, Convert size) */
  breakdown?: ConvertBatchBreakdown | null;
  /** Station where the converted batch entered the line */
  convertedAtStage?: string | null;
  /** Changed quantity when known from explicit conversion record */
  changedQty?: number | null;
  /** Short badge text shown on the batch tile */
  statusLabel: string;
}

export interface ProcessLotGrouping {
  byBatch: Record<string, LotCategoryMeta>;
  completedBatches: string[];
  notCompletedBatches: string[];
  convertedBatches: string[];
  totalCount: number;
  completedCount: number;
  notCompletedCount: number;
  convertedCount: number;
}

function canon(raw: string | null | undefined): string {
  if (!raw) return "";
  return canonicalBatchId(raw) ?? raw.trim().toUpperCase();
}

/**
 * Format a converted batch in the shop-floor CT nomenclature:
 *   mainBatch = "26J16-24", convertBatchOrSize = "26J16-22" (or "22Fr" / "22")
 *   -> "26J16-24 CT 22"
 *   (Year: 26, Month: J, Day: 16, Main size: 24, Convert: CT, Convert size: 22)
 */
export function formatConvertBatchCode(
  mainBatch: string | null | undefined,
  convertBatchOrSize: string | null | undefined,
): string {
  const rawMain = (mainBatch ?? "").trim().toUpperCase();
  const rawTarget = (convertBatchOrSize ?? "").trim().toUpperCase();

  // Check if either input already carries explicit CT syntax: "26J16-24 CT 22" or "26J16-24CT22"
  for (const candidate of [rawTarget, rawMain]) {
    const ctMatch = candidate.match(
      /^(\d{2})([A-L])(\d{1,2})[-_/ ]?(\d{1,2})\s*[-_/ ]?\s*CT\s*[-_/ ]?\s*(?:\d{2}[A-L]\d{1,2}[-_/ ]?)?(\d{1,2})(?:FR)?$/i,
    );
    if (ctMatch) {
      const [, yy, mCode, dd, mainSz, convSz] = ctMatch;
      return `${yy}${mCode}${dd.padStart(2, "0")}-${Number(mainSz)} CT ${Number(convSz)}`;
    }
  }

  const mainCanon = canon(rawMain);
  const mainParsed = parseBatchId(mainCanon);
  const targetCanon = canon(rawTarget);
  const targetParsed = parseBatchId(targetCanon);
  const convSize =
    targetParsed?.sizeFr ||
    frDigitsFromSize(rawTarget) ||
    rawTarget.match(/-(\d{1,2})$/)?.[1] ||
    "";

  if (mainParsed && mainParsed.sizeFr && convSize) {
    return `${mainParsed.year2}${mainParsed.monthCode}${mainParsed.day}-${mainParsed.sizeFr} CT ${Number(convSize)}`;
  }
  if (mainCanon && convSize) {
    return `${mainCanon} CT ${Number(convSize)}`;
  }
  if (mainCanon && targetCanon && mainCanon !== targetCanon) {
    return `${mainCanon} CT ${targetCanon}`;
  }
  return targetCanon || mainCanon;
}

/**
 * Parse a batch ID (and optional parent `fromBatch`) into its OK batch or Convert batch parts:
 *   - OK batch:      26 J 16 - 24       (Year Month Day - size)
 *   - Convert batch: 26 J 16 - 24 CT 22 (Year Month Day - mainsize CT Convert size)
 */
export function parseConvertBatchParts(
  batchOrLabel: string | null | undefined,
  fromBatch?: string | null,
): ConvertBatchBreakdown | null {
  const raw = (batchOrLabel ?? "").trim().toUpperCase();
  if (!raw || raw === "(NO BATCH)") return null;

  // 1. Direct CT string e.g. "26J16-24 CT 22", "26J16-24CT22", "26J16-24 CT 26J16-22"
  const ctMatch = raw.match(
    /^(\d{2})([A-L])(\d{1,2})[-_/ ]?(\d{1,2})\s*[-_/ ]?\s*CT\s*[-_/ ]?\s*(?:\d{2}[A-L]\d{1,2}[-_/ ]?)?(\d{1,2})(?:FR)?$/i,
  );
  if (ctMatch) {
    const [, yy, mCode, ddRaw, mainSzRaw, convSzRaw] = ctMatch;
    const day = ddRaw.padStart(2, "0");
    const mainSize = String(Number(mainSzRaw));
    const convertSize = String(Number(convSzRaw));
    const okBatchCode = `${yy}${mCode}${day}-${mainSize}`;
    const rawTargetBatch = `${yy}${mCode}${day}-${convertSize}`;
    return {
      isConverted: true,
      year: yy,
      month: mCode,
      day,
      mainSize,
      convertMarker: "CT",
      convertSize,
      okBatchCode,
      convertBatchCode: `${okBatchCode} CT ${convertSize}`,
      rawTargetBatch,
    };
  }

  const targetCanon = canon(raw);
  const targetParsed = parseBatchId(targetCanon);

  // 2. Paired with a parent `fromBatch` (e.g. target = "26J16-22", fromBatch = "26J16-24")
  if (fromBatch) {
    const fromCanon = canon(fromBatch);
    const fromParsed = parseBatchId(fromCanon);
    if (fromParsed && targetParsed && fromCanon !== targetCanon) {
      const mainSize = fromParsed.sizeFr || targetParsed.sizeFr;
      const convertSize = targetParsed.sizeFr;
      const okBatchCode = `${fromParsed.year2}${fromParsed.monthCode}${fromParsed.day}-${mainSize}`;
      return {
        isConverted: true,
        year: fromParsed.year2,
        month: fromParsed.monthCode,
        day: fromParsed.day,
        mainSize,
        convertMarker: "CT",
        convertSize,
        okBatchCode,
        convertBatchCode: `${okBatchCode} CT ${convertSize}`,
        rawTargetBatch: targetCanon,
      };
    }
  }

  // 3. Standard OK batch e.g. "26J16-24"
  if (targetParsed) {
    return {
      isConverted: false,
      year: targetParsed.year2,
      month: targetParsed.monthCode,
      day: targetParsed.day,
      mainSize: targetParsed.sizeFr,
      convertMarker: null,
      convertSize: null,
      okBatchCode: targetParsed.batchId,
      convertBatchCode: targetParsed.batchId,
      rawTargetBatch: targetParsed.batchId,
    };
  }

  return null;
}

function earliestStageLabel(occupied: string[]): string | null {
  if (!occupied || occupied.length === 0) return null;
  const sorted = [...occupied].sort((a, b) => stageSortKey(a) - stageSortKey(b));
  const first = sorted[0];
  if (!first) return null;
  const resolved = resolveStageId(first) ?? first;
  return STAGE_LABELS[resolved] ?? first;
}

function earliestProcessRank(lot: OpenLotRow): number {
  for (let i = 0; i < PROCESS_ORDER.length; i++) {
    const p = PROCESS_ORDER[i];
    if ((lot.processes[p]?.done ?? 0) > 0) return i;
  }
  return 99;
}

/**
 * Classify started lots into Completed, Not completed, and Converted batch
 * for a given process, station, or overall line.
 */
export function buildProcessLotGrouping(
  lots: OpenLotRow[],
  conversions: BatchConversion[] = [],
  opts: { process?: ProcessId; stageId?: string } = {},
): ProcessLotGrouping {
  // Only lots that have started the line (matching report.startedCount / processMix).
  const startedLots = lots.filter(
    (l) => l.open || l.lineComplete || PROCESS_ORDER.some((p) => (l.processes[p]?.done ?? 0) > 0),
  );

  const incomingByBatch = new Map<string, BatchConversion>();
  const outgoingByBatch = new Map<string, BatchConversion>();
  for (const c of conversions) {
    const fromKey = canon(c.fromBatch);
    const toKey = canon(c.toBatch);
    if (toKey) incomingByBatch.set(toKey, c);
    if (fromKey) outgoingByBatch.set(fromKey, c);
  }

  // Group lots by start-date stem (YY+Month+DD -> YYYY-MM-DD) to detect
  // shop-floor size conversions that share a start date with a dipped/upstream batch.
  const byStemDate = new Map<string, OpenLotRow[]>();
  for (const l of startedLots) {
    const key = canon(l.batch);
    const parsed = parseBatchId(key);
    const stemKey = parsed?.date ?? key.replace(/-\d{1,2}$/, "");
    if (!stemKey) continue;
    const list = byStemDate.get(stemKey) ?? [];
    list.push(l);
    byStemDate.set(stemKey, list);
  }

  // Map: convertedBatchKey -> { fromBatch, convertedAtStage }
  const stemConverted = new Map<string, { fromBatch: string; convertedAtStage: string | null }>();
  // Map: originalBatchKey -> { toBatch } when the original batch's tail converted downstream
  const stemOriginalWithConvert = new Map<string, { toBatch: string }>();

  for (const [, group] of byStemDate) {
    if (group.length <= 1) continue;
    const dipped = group.filter((x) => x.processes.primary?.complete);
    if (dipped.length > 0) {
      // Sort dipped lots by highest lastAccepted / earliest date so the main lot is primary
      const sortedDipped = [...dipped].sort(
        (a, b) => b.lastAccepted - a.lastAccepted || a.batch.localeCompare(b.batch),
      );
      const primaryOrig = canon(sortedDipped[0].batch);
      for (const x of group) {
        const xKey = canon(x.batch);
        if (!x.processes.primary?.complete && xKey !== primaryOrig) {
          stemConverted.set(xKey, {
            fromBatch: primaryOrig,
            convertedAtStage: earliestStageLabel(x.occupied),
          });
          stemOriginalWithConvert.set(primaryOrig, { toBatch: xKey });
        }
      }
    } else {
      // None of the lots on this date stem have Dipping recorded.
      // The one that started earliest on the line (or has the largest quantity) is the base lot;
      // sibling size lots on the same date stem are converted lots from it.
      const sorted = [...group].sort((a, b) => {
        const ra = earliestProcessRank(a);
        const rb = earliestProcessRank(b);
        if (ra !== rb) return ra - rb;
        if ((a.firstDate ?? "") !== (b.firstDate ?? "")) {
          return (a.firstDate ?? "9999").localeCompare(b.firstDate ?? "9999");
        }
        if (b.lastAccepted !== a.lastAccepted) return b.lastAccepted - a.lastAccepted;
        return a.batch.localeCompare(b.batch);
      });
      const baseOrig = canon(sorted[0].batch);
      for (const x of sorted.slice(1)) {
        const xKey = canon(x.batch);
        if (xKey !== baseOrig) {
          stemConverted.set(xKey, {
            fromBatch: baseOrig,
            convertedAtStage: earliestStageLabel(x.occupied),
          });
          stemOriginalWithConvert.set(baseOrig, { toBatch: xKey });
        }
      }
    }
  }

  const byBatch: Record<string, LotCategoryMeta> = {};
  const completedBatches: string[] = [];
  const notCompletedBatches: string[] = [];
  const convertedBatches: string[] = [];

  for (const l of startedLots) {
    const key = canon(l.batch);
    let isComplete = false;
    if (opts.stageId) {
      const targetStage = resolveStageId(opts.stageId) ?? opts.stageId;
      isComplete =
        l.occupied.includes(targetStage) ||
        ( (targetStage === "eye-punching" || targetStage === "hanging") && l.occupied.includes("secondary") );
    } else if (opts.process) {
      isComplete = Boolean(l.processes[opts.process]?.complete);
    } else {
      isComplete = Boolean(l.lineComplete);
    }

    if (isComplete) {
      const statusLabel = opts.stageId
        ? `${STAGE_LABELS[resolveStageId(opts.stageId) ?? ""] ?? opts.stageId} complete`
        : opts.process
          ? `${processLabel(opts.process)} complete`
          : "Line complete";
      byBatch[key] = {
        batch: key,
        category: "completed",
        statusLabel,
      };
      completedBatches.push(key);
      continue;
    }

    // Lot is not complete in this scope — determine if it is a Converted batch vs Not completed.
    const inc = incomingByBatch.get(key);
    const out = outgoingByBatch.get(key);
    const stemInc = stemConverted.get(key);
    const stemOut = stemOriginalWithConvert.get(key);
    const hasCtToken = /\bCT\b/i.test(l.batch);

    if (inc || stemInc || out || stemOut || hasCtToken) {
      const fromBatch = inc
        ? canon(inc.fromBatch)
        : stemInc
          ? stemInc.fromBatch
          : out
            ? canon(out.toBatch)
            : stemOut
              ? stemOut.toBatch
              : null;
      const convertedAtStage = inc?.stageId
        ? (STAGE_LABELS[resolveStageId(inc.stageId) ?? ""] ?? inc.stageId)
        : (stemInc?.convertedAtStage ?? earliestStageLabel(l.occupied));
      const isOutgoing = !inc && !stemInc && Boolean(out || stemOut);
      const mainLot = isOutgoing ? key : (fromBatch ?? key);
      const targetLot = isOutgoing ? (fromBatch ?? key) : key;
      const breakdown = parseConvertBatchParts(targetLot, mainLot);
      const convertBatchCode = formatConvertBatchCode(mainLot, targetLot);
      byBatch[key] = {
        batch: key,
        category: "converted",
        fromBatch,
        convertBatchCode,
        breakdown,
        convertedAtStage,
        changedQty: inc?.changedQty ?? out?.changedQty ?? null,
        statusLabel: convertBatchCode || (fromBatch
          ? isOutgoing
            ? `Converted → ${fromBatch}`
            : `From ${fromBatch}`
          : "Converted batch"),
      };
      convertedBatches.push(key);
    } else {
      let statusLabel = "Not completed";
      if (opts.process) {
        const proc = l.processes[opts.process];
        if (proc && proc.done > 0 && proc.total > 1) {
          statusLabel = `${proc.done}/${proc.total} ${processLabel(opts.process)}`;
        } else {
          statusLabel = `Waiting on ${proc?.nextStageLabel ?? processLabel(opts.process)}`;
        }
      } else if (l.waitingOn) {
        statusLabel = `Waiting on ${processLabel(l.waitingOn)}`;
      }
      byBatch[key] = {
        batch: key,
        category: "not_completed",
        statusLabel,
      };
      notCompletedBatches.push(key);
    }
  }

  return {
    byBatch,
    completedBatches,
    notCompletedBatches,
    convertedBatches,
    totalCount: startedLots.length,
    completedCount: completedBatches.length,
    notCompletedCount: notCompletedBatches.length,
    convertedCount: convertedBatches.length,
  };
}

/**
 * Scope source rows for a process modal so completed lots only include rows from
 * that process (preventing downstream stages like Hanging from polluting
 * Production Dipping), while incomplete / converted lots that have not touched
 * the process retain their recorded rows so their batch tiles and history remain visible.
 */
export function scopeRowsForProcessLots(
  allRows: SourceRow[],
  grouping: ProcessLotGrouping,
  process?: ProcessId,
): SourceRow[] {
  const validBatches = new Set(Object.keys(grouping.byBatch));
  const byLot = new Map<string, SourceRow[]>();

  for (const r of allRows) {
    const b = canon(r.batch);
    if (!b || !validBatches.has(b)) continue;
    const list = byLot.get(b) ?? [];
    list.push(r);
    byLot.set(b, list);
  }

  if (!process) {
    const out: SourceRow[] = [];
    for (const rows of byLot.values()) out.push(...rows);
    return out;
  }

  const out: SourceRow[] = [];
  for (const [, rows] of byLot) {
    const inProcess = rows.filter((r) => stageCategoryOf(r.stageId || r.stage) === process);
    if (inProcess.length > 0) {
      out.push(...inProcess);
    } else {
      // Lot has no rows in this process (e.g. Not completed or Converted at a later stage);
      // keep its rows so the batch appears in the Not completed / Converted batch group.
      out.push(...rows);
    }
  }
  return out;
}

export interface AuditBatchConvertInfo {
  batch: string;
  isConverted: boolean;
  /** Parent / main batch ID (e.g. "26J16-24") when converted */
  fromBatch: string | null;
  /** Child / converted batch ID (e.g. "26J16-22") when this is a parent or converted batch */
  toBatch: string | null;
  /** Display code following Image 2: "26J16-24" for OK batch, "26J16-24 CT 22" for Convert batch */
  displayCode: string;
  /** Structured parts breakdown (Year, Month, Day, Main size, CT, Convert size) */
  breakdown: ConvertBatchBreakdown | null;
  /** Stage where the converted batch entered the line */
  convertedAtStage: string | null;
  /** Explicit conversion record if present */
  explicitConversion: BatchConversion | null;
}

export interface AuditConversionLookup {
  byBatch: Record<string, AuditBatchConvertInfo>;
  okCount: number;
  convertedCount: number;
  totalCount: number;
}

function hasPrimaryStage(g: AuditBatchGroup): boolean {
  return g.stages.some((s) => {
    const cat = stageCategoryOf(s.stageId);
    if (cat === "primary") return true;
    const low = s.stageId.toLowerCase();
    return low.includes("dipp") || low.includes("prod") || low.includes("leach") || low.includes("chlor");
  });
}

function earliestGroupStageOrder(g: AuditBatchGroup): number {
  if (g.stages.length === 0) return 999;
  return Math.min(...g.stages.map((s) => stageSortKey(s.stageId)));
}

/**
 * Build a lookup classifying every AuditBatchGroup into:
 *   - OK batch:      26 J 16 - 24       (Year Month Day - size)
 *   - Convert batch: 26 J 16 - 24 CT 22 (Year Month Day - mainsize CT Convert size)
 */
export function buildAuditConversionLookup(
  allGroups: AuditBatchGroup[],
  conversions: BatchConversion[] = [],
): AuditConversionLookup {
  const incomingByBatch = new Map<string, BatchConversion>();
  const outgoingByBatch = new Map<string, BatchConversion>();
  for (const c of conversions) {
    const fromKey = canon(c.fromBatch);
    const toKey = canon(c.toBatch);
    if (toKey) incomingByBatch.set(toKey, c);
    if (fromKey) outgoingByBatch.set(fromKey, c);
  }

  // Group by start-date stem (YY+Month+DD -> YYYY-MM-DD) to detect same-stem conversions
  const byStemDate = new Map<string, AuditBatchGroup[]>();
  for (const g of allGroups) {
    if (!g.batch || g.batch === "(no batch)") continue;
    const key = canon(g.batch);
    const parsed = parseBatchId(key);
    const stemKey = parsed?.date ?? key.replace(/-\d{1,2}$/, "");
    if (!stemKey) continue;
    const list = byStemDate.get(stemKey) ?? [];
    list.push(g);
    byStemDate.set(stemKey, list);
  }

  const stemConverted = new Map<string, { fromBatch: string; convertedAtStage: string | null }>();
  for (const [, list] of byStemDate) {
    if (list.length <= 1) continue;
    const dipped = list.filter(hasPrimaryStage);
    if (dipped.length > 0) {
      const sortedDipped = [...dipped].sort(
        (a, b) => b.checkedQty - a.checkedQty || a.batch.localeCompare(b.batch),
      );
      const primaryMain = canon(sortedDipped[0].batch);
      for (const g of list) {
        const gKey = canon(g.batch);
        if (!hasPrimaryStage(g) && gKey !== primaryMain) {
          const stageIds = g.stages.map((s) => s.stageId);
          stemConverted.set(gKey, {
            fromBatch: primaryMain,
            convertedAtStage: earliestStageLabel(stageIds),
          });
        }
      }
    } else {
      const sorted = [...list].sort((a, b) => {
        const sa = earliestGroupStageOrder(a);
        const sb = earliestGroupStageOrder(b);
        if (sa !== sb) return sa - sb;
        if (b.checkedQty !== a.checkedQty) return b.checkedQty - a.checkedQty;
        return a.batch.localeCompare(b.batch);
      });
      const baseMain = canon(sorted[0].batch);
      for (const g of sorted.slice(1)) {
        const gKey = canon(g.batch);
        if (gKey !== baseMain) {
          const stageIds = g.stages.map((s) => s.stageId);
          stemConverted.set(gKey, {
            fromBatch: baseMain,
            convertedAtStage: earliestStageLabel(stageIds),
          });
        }
      }
    }
  }

  const byBatch: Record<string, AuditBatchConvertInfo> = {};
  let okCount = 0;
  let convertedCount = 0;

  for (const g of allGroups) {
    const key = canon(g.batch);
    const inc = incomingByBatch.get(key);
    const out = outgoingByBatch.get(key);
    const stemInc = stemConverted.get(key);
    const directBreakdown = parseConvertBatchParts(g.batch);
    const isDirectCt = Boolean(directBreakdown?.isConverted);

    if (inc || stemInc || isDirectCt) {
      const fromBatch = inc
        ? canon(inc.fromBatch)
        : stemInc
          ? stemInc.fromBatch
          : directBreakdown?.okBatchCode ?? null;
      const breakdown = parseConvertBatchParts(key, fromBatch);
      const displayCode = breakdown?.convertBatchCode ?? formatConvertBatchCode(fromBatch, key);
      const stageIds = g.stages.map((s) => s.stageId);
      const convertedAtStage = inc?.stageId
        ? (STAGE_LABELS[resolveStageId(inc.stageId) ?? ""] ?? inc.stageId)
        : (stemInc?.convertedAtStage ?? earliestStageLabel(stageIds));

      const info: AuditBatchConvertInfo = {
        batch: key,
        isConverted: true,
        fromBatch,
        toBatch: key,
        displayCode,
        breakdown,
        convertedAtStage,
        explicitConversion: inc ?? null,
      };
      byBatch[key] = info;
      byBatch[g.batch] = info;
      convertedCount++;
    } else if (out) {
      // Explicit outgoing conversion parent (attached with its convert half on Audit Trail)
      const toBatch = canon(out.toBatch);
      const breakdown = parseConvertBatchParts(toBatch, key);
      const displayCode = breakdown?.convertBatchCode ?? formatConvertBatchCode(key, toBatch);
      const convertedAtStage = out.stageId
        ? (STAGE_LABELS[resolveStageId(out.stageId) ?? ""] ?? out.stageId)
        : null;
      const info: AuditBatchConvertInfo = {
        batch: key,
        isConverted: true,
        fromBatch: key,
        toBatch,
        displayCode,
        breakdown,
        convertedAtStage,
        explicitConversion: out,
      };
      byBatch[key] = info;
      byBatch[g.batch] = info;
      convertedCount++;
    } else {
      const breakdown = parseConvertBatchParts(key);
      const info: AuditBatchConvertInfo = {
        batch: key,
        isConverted: false,
        fromBatch: null,
        toBatch: null,
        displayCode: breakdown?.okBatchCode ?? g.batch,
        breakdown,
        convertedAtStage: null,
        explicitConversion: null,
      };
      byBatch[key] = info;
      byBatch[g.batch] = info;
      okCount++;
    }
  }

  return {
    byBatch,
    okCount,
    convertedCount,
    totalCount: okCount + convertedCount,
  };
}


