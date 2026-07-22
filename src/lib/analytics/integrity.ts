// Scope integrity scan — deterministic open issues from the event ledger.
// Powers the Status integrity gate (UX philosophy F5 / IG-1): Understand must
// not show trustworthy "ok" while these remain open in scope.
//
// Pure JS. Does not require the findings store for V-004 / V-014; callers may
// also pass open critical findings (e.g. V-010 conflicts) via options.

import type { Event } from "@/lib/store/types";
import { type Scope, scopeEvents } from "./scope";
import { GATE_CHAIN } from "@/lib/ingest/mass-balance";

export type IntegrityCode = "V-004" | "V-014" | "V-010" | string;

export interface IntegrityIssue {
  code: IntegrityCode;
  severity: "critical" | "warning";
  /** Plain-language question (plant vocabulary). */
  message: string;
  stageId?: string;
  date?: string;
  size?: string | null;
  batch?: string;
  stated?: number | null;
  computed?: number | null;
}

/**
 * Focus coordinates carried on deep links (Schema → Audit / Data Entry).
 * Same fields as an issue row — enough to open the right batch·stage·day.
 */
export interface IntegrityFocus {
  code: string;
  severity?: "critical" | "warning";
  message?: string;
  stageId?: string;
  date?: string;
  size?: string;
  batch?: string;
  stated?: number | null;
  computed?: number | null;
}

/** Stable id for list keys / highlight matching. */
export function integrityIssueId(issue: Pick<IntegrityIssue, "code" | "stageId" | "date" | "size" | "batch">): string {
  return [
    issue.code,
    issue.stageId ?? "",
    issue.date ?? "",
    issue.size ?? "",
    issue.batch ?? "",
  ].join("|");
}

/**
 * Primary jump: Audit trail focused on this issue's coordinates.
 * Always uses view=batch + date range all so the row is not filtered out of the 30d window.
 */
export function integrityAuditHref(issue: IntegrityIssue): string {
  const q = new URLSearchParams();
  q.set("view", "batch");
  q.set("range", "all");
  q.set("code", issue.code);
  if (issue.stageId) q.set("stage", issue.stageId);
  if (issue.date) q.set("date", issue.date);
  if (issue.size) q.set("size", issue.size);
  if (issue.batch) q.set("batch", issue.batch);
  if (issue.severity) q.set("sev", issue.severity);
  // Compact message for the focus chip (cap length for URL hygiene)
  if (issue.message) {
    q.set("msg", issue.message.length > 160 ? `${issue.message.slice(0, 157)}…` : issue.message);
  }
  if (issue.stated != null && Number.isFinite(issue.stated)) q.set("stated", String(issue.stated));
  if (issue.computed != null && Number.isFinite(issue.computed)) q.set("computed", String(issue.computed));
  return `/audit?${q.toString()}`;
}

/**
 * Secondary jump: Data Entry when we have a batch (or at least a date cue).
 * Operators fix numbers here after seeing the mismatch on Audit.
 */
export function integrityFixHref(issue: IntegrityIssue): string | null {
  if (!issue.batch && !issue.date) return "/data-entry";
  const q = new URLSearchParams();
  if (issue.batch) q.set("batch", issue.batch);
  if (issue.date) q.set("date", issue.date);
  if (issue.stageId) q.set("stage", issue.stageId);
  return `/data-entry?${q.toString()}`;
}

/** Parse focus params from an Audit / Schema deep link. */
export function parseIntegrityFocus(
  input: URLSearchParams | Record<string, string | null | undefined>
): IntegrityFocus | null {
  const get = (key: string): string | undefined => {
    if (input instanceof URLSearchParams) {
      const v = input.get(key);
      return v && v.trim() ? v.trim() : undefined;
    }
    const v = input[key];
    return v && v.trim() ? v.trim() : undefined;
  };
  const code = get("code");
  const batch = get("batch");
  const date = get("date");
  const stage = get("stage");
  // Need at least one locator or a rule code
  if (!code && !batch && !date && !stage) return null;

  const statedRaw = get("stated");
  const computedRaw = get("computed");
  const sev = get("sev");

  return {
    code: code ?? "issue",
    severity: sev === "warning" || sev === "critical" ? sev : undefined,
    message: get("msg"),
    stageId: stage,
    date,
    size: get("size"),
    batch,
    stated: statedRaw != null && statedRaw !== "" ? Number(statedRaw) : null,
    computed: computedRaw != null && computedRaw !== "" ? Number(computedRaw) : null,
  };
}

/** True when an entry row matches the focused issue coordinates. */
export function rowMatchesIntegrityFocus(
  row: { date?: string; size?: string | null; stageId?: string; batch?: string | null },
  focus: IntegrityFocus
): boolean {
  if (focus.date && row.date && row.date !== focus.date) return false;
  if (focus.stageId && row.stageId && row.stageId !== focus.stageId) return false;
  if (focus.size && (row.size ?? "") !== focus.size) return false;
  if (focus.batch && row.batch && row.batch !== focus.batch && row.batch !== "(no batch)") return false;
  // If we only have a code (no coords), don't highlight everything
  if (!focus.date && !focus.stageId && !focus.size && !focus.batch) return false;
  return true;
}

export interface IntegrityScanOptions {
  /** Open findings from the store (optional). Critical + open only. */
  openFindings?: Array<{
    ruleId: string;
    severity: string;
    state?: string;
    question?: string;
    detail?: string;
    occurredOn?: { start?: string; end?: string };
  }>;
  /** Gate order for mass-balance; defaults to Grain A16 chain. */
  stageOrder?: readonly string[];
}

function qty(e: Event): number {
  return "quantity" in e ? Number((e as { quantity?: number }).quantity ?? 0) : 0;
}

function stageOf(e: Event): string | null {
  return "stageId" in e ? ((e as { stageId?: string }).stageId ?? null) : null;
}

function sizeOf(e: Event): string | null {
  return "size" in e ? ((e as { size?: string | null }).size ?? null) : null;
}

function batchOf(e: Event): string {
  const cf = (e as { customFields?: Record<string, unknown> }).customFields;
  const b = cf?.batch ?? cf?.batchId ?? (e as { batchNo?: string }).batchNo;
  return typeof b === "string" ? b.trim() : "";
}

/**
 * Scan scoped events for open integrity issues.
 * - V-004: defect column sum ≠ rejected for same stage·day·size
 * - V-014: mass-balance hop checked(N+1) > available(N) on gate chain
 * - external open findings when provided
 */
export function scopeIntegrityIssues(
  events: Event[],
  scope: Scope,
  opts: IntegrityScanOptions = {}
): IntegrityIssue[] {
  const ev = scopeEvents(events, scope);
  const issues: IntegrityIssue[] = [];

  issues.push(...defectSumMismatches(ev));
  issues.push(...massBalanceFromEvents(ev, opts.stageOrder ?? GATE_CHAIN));

  for (const f of opts.openFindings ?? []) {
    if (f.state && f.state !== "open") continue;
    if (f.severity !== "critical" && f.severity !== "warning") continue;
    // Only surface findings that overlap the scope date window when known.
    if (scope.dateFrom && f.occurredOn?.end && f.occurredOn.end < scope.dateFrom) continue;
    if (scope.dateTo && f.occurredOn?.start && f.occurredOn.start > scope.dateTo) continue;
    issues.push({
      code: f.ruleId,
      severity: f.severity === "critical" ? "critical" : "warning",
      message: f.question || f.detail || `Open finding ${f.ruleId}`,
      date: f.occurredOn?.start,
    });
  }

  return issues;
}

/** True when any critical integrity issue is open in scope. */
export function hasOpenCriticalIntegrity(
  events: Event[],
  scope: Scope,
  opts: IntegrityScanOptions = {}
): boolean {
  return scopeIntegrityIssues(events, scope, opts).some((i) => i.severity === "critical");
}

function defectSumMismatches(ev: Event[]): IntegrityIssue[] {
  // key = stage|day|size
  type Agg = { rejected: number; defectSum: number; hasRejected: boolean; hasDefects: boolean };
  const map = new Map<string, Agg>();

  for (const e of ev) {
    const stageId = stageOf(e);
    if (!stageId) continue;
    const day = e.occurredOn.start;
    const size = sizeOf(e) ?? "";
    const key = `${stageId}|${day}|${size}`;
    const a = map.get(key) ?? { rejected: 0, defectSum: 0, hasRejected: false, hasDefects: false };

    if (e.eventType === "inspection" && (e as { disposition?: string }).disposition === "rejected") {
      a.rejected += qty(e);
      a.hasRejected = true;
    } else if (e.eventType === "rejection") {
      a.defectSum += qty(e);
      a.hasDefects = true;
    }
    map.set(key, a);
  }

  const out: IntegrityIssue[] = [];
  for (const [key, a] of map) {
    if (!a.hasRejected || !a.hasDefects) continue;
    if (a.rejected === a.defectSum) continue;
    const [stageId, date, size] = key.split("|");
    out.push({
      code: "V-004",
      severity: Math.abs(a.rejected - a.defectSum) > 0.05 * Math.max(a.rejected, 1) ? "critical" : "warning",
      message:
        `Defect reasons add up to ${a.defectSum}, not the ${a.rejected} rejected` +
        (size ? ` for ${size}` : "") +
        ` at ${stageId} on ${date}. Which number is right?`,
      stageId,
      date,
      size: size || null,
      stated: a.rejected,
      computed: a.defectSum,
    });
  }
  return out;
}

function massBalanceFromEvents(
  ev: Event[],
  stageOrder: readonly string[]
): IntegrityIssue[] {
  const rank = new Map(stageOrder.map((s, i) => [s, i]));
  // group by day|size|batch → per-stage checked / available
  type StageQty = { checked: number; rejected: number; hasChecked: boolean };
  const groups = new Map<string, Map<string, StageQty>>();

  for (const e of ev) {
    const stageId = stageOf(e);
    if (!stageId || !rank.has(stageId)) continue;
    const day = e.occurredOn.start;
    const size = sizeOf(e) ?? "";
    const batch = batchOf(e);
    const gKey = `${day}|${size}|${batch}`;
    let byStage = groups.get(gKey);
    if (!byStage) {
      byStage = new Map();
      groups.set(gKey, byStage);
    }
    const s = byStage.get(stageId) ?? { checked: 0, rejected: 0, hasChecked: false };
    if (e.eventType === "production") {
      s.checked += qty(e);
      s.hasChecked = true;
    } else if (e.eventType === "inspection" && (e as { disposition?: string }).disposition === "rejected") {
      s.rejected += qty(e);
    } else if (e.eventType === "inspection" && (e as { disposition?: string }).disposition === "accepted") {
      // accepted counts improve available when present; tracked via checked−rejected otherwise
    }
    byStage.set(stageId, s);
  }

  const out: IntegrityIssue[] = [];
  for (const [gKey, byStage] of groups) {
    const [date, size, batch] = gKey.split("|");
    const present = [...byStage.keys()].sort((a, b) => rank.get(a)! - rank.get(b)!);
    for (let i = 1; i < present.length; i++) {
      const prevId = present[i - 1];
      const curId = present[i];
      const prev = byStage.get(prevId)!;
      const cur = byStage.get(curId)!;
      if (!prev.hasChecked || !cur.hasChecked) continue;
      const avail = prev.checked - prev.rejected;
      if (cur.checked > avail) {
        out.push({
          code: "V-014",
          severity: "critical",
          message:
            `Mass balance: ${curId} checked ${cur.checked} units, but ${prevId} ` +
            `only passed forward ${avail}. Where did the extra ${cur.checked - avail} come from?`,
          stageId: curId,
          date,
          size: size || null,
          batch: batch || undefined,
          stated: cur.checked,
          computed: avail,
        });
      }
    }
  }
  return out;
}
