// Cross-stage mass-balance verification (Disposafe diagnostic requirement #1).
//
// Units flow forward through the gate chain (Visual → Balloon → Valve → Final):
// a stage's Checked qty cannot exceed what the previous stage made available
// (acceptedGood when stated, else checked − rejected). A violation means units
// appeared from nowhere — under-reported rejections upstream or a mis-keyed
// count — and must be surfaced as a data-integrity question, never silently
// accepted or auto-fixed.
//
// Pure and deterministic, same policy as validate-entry: surfaced, never
// blocking. Emitted as V-014 ClarificationIssues alongside checkRecord's.

import type { StageDayRecord } from "@/lib/ingest/emit";
import type { ClarificationIssue } from "@/lib/entry/validate-entry";
import { FLOW_CHAIN, resolveStageId } from "@/core/ontology/plant-catalog";
import { passedForward } from "@/lib/entry/passed-forward";

export { FLOW_CHAIN };

/** Canonical assembly gate chain (Grain Contract A16). Used when a row has
 *  no lot code — Primary and Assembly are then separate populations. */
export const GATE_CHAIN = ["visual", "balloon", "valve-integrity", "final"] as const;

function chainId(stageId: string): string {
  return resolveStageId(stageId) ?? stageId;
}

export interface MassBalanceIssue extends ClarificationIssue {
  stageId: string;   // the receiving stage (where the impossible Checked was entered)
  date: string;
}

/** Units the stage made available to the next gate. Null when not derivable.
 *  accept = checked − (rejected + hold) when accepted was not stated. */
function available(rec: StageDayRecord): number | null {
  if (rec.acceptedGood?.value != null) return rec.acceptedGood.value;
  if (rec.checked?.value == null) return null;
  return passedForward({
    checked: rec.checked.value,
    rejected: rec.rejected?.value ?? 0,
    hold: rec.rework?.value ?? 0,
  });
}

/**
 * Compare consecutive gates within each size · batch (lot) group and flag
 * every hop where checked(N+1) > available(N). A lot can sit at one gate
 * across several days, so the group is date-free: Visual on the 1st still
 * bounds Balloon on the 4th. Records for stages outside `stageOrder`, or
 * groups missing either side of a hop, are skipped — we only ever compare
 * numbers that were actually stated.
 */
/**
 * What a stage already passed forward, read back from the ledger.
 *
 * Direct entry saves ONE station per submission, so comparing only within a
 * payload meant the check never had two gates to compare and silently passed
 * every manual entry — precisely the path where a mis-keyed count is most
 * likely. Callers supply the previous gate's stored numbers through this so the
 * hop can be checked against what is actually on the ledger.
 *
 * Each prior is one (stage, date) fact. Split days of the same gate are
 * summed; a payload row for the same stage+date replaces that day's prior
 * rather than adding to it.
 */
export interface PriorGateQty {
  stageId: string;
  date: string;
  size: string | null;
  batch: string;
  /** Units this gate made available downstream (accepted, else checked − rejected). */
  available: number;
  /** Units this gate checked. Used when summing split days of a receiving gate. */
  checked?: number;
}

type StageDayQty = {
  avail: number;
  checked: number;
  hasAvail: boolean;
  hasChecked: boolean;
};

function lotKey(size: string | null | undefined, batch: string, date: string): string {
  // A named lot flows across days. Rows with no lot code have nothing else
  // to group by, so they stay day-scoped the way they always were.
  return batch ? `${size ?? ""}|${batch}` : `${date}|${size ?? ""}|`;
}

export function massBalanceIssues(
  records: StageDayRecord[],
  stageOrder: readonly string[] = FLOW_CHAIN,
  priors: PriorGateQty[] = [],
): MassBalanceIssue[] {
  const inboundRank = new Map(stageOrder.map((s, i) => [s, i]));
  // Group by the physical lot: same size, same batch. Date is a split of
  // that lot at a gate, not a different flow.
  const groups = new Map<string, StageDayRecord[]>();
  for (const r of records) {
    if (!inboundRank.has(chainId(r.stageId))) continue;
    const batch = String(r.customFields?.batch ?? r.customFields?.batchId ?? "").trim();
    const key = lotKey(r.size, batch, r.occurredOn.start);
    const arr = groups.get(key);
    if (arr) arr.push(r); else groups.set(key, [r]);
  }

  // Index what the ledger already holds, by the same lot.
  const priorsByGroup = new Map<string, PriorGateQty[]>();
  for (const p of priors) {
    if (!inboundRank.has(chainId(p.stageId))) continue;
    const key = lotKey(p.size, p.batch, p.date);
    const arr = priorsByGroup.get(key);
    if (arr) arr.push(p); else priorsByGroup.set(key, [p]);
  }

  const issues: MassBalanceIssue[] = [];
  for (const [groupKey, group] of groups) {
    const batch = String(group[0]?.customFields?.batch ?? group[0]?.customFields?.batchId ?? "").trim();
    // Unnamed Excel rows are section-separate populations. A named lot is
    // one physical flow: dipping → secondary → assembly.
    const order = batch ? stageOrder : GATE_CHAIN;
    const rank = new Map(order.map((s, i) => [s, i]));
    // Per (stage, date) so a payload restatement of Tuesday does not drop
    // Monday's numbers of the same gate, and does not double-count Tuesday.
    const byStageDate = new Map<string, StageDayQty>();
    const stageDateKey = (stageId: string, date: string) => `${stageId}|${date}`;

    for (const p of priorsByGroup.get(groupKey) ?? []) {
      const sid = chainId(p.stageId);
      if (!rank.has(sid)) continue;
      byStageDate.set(stageDateKey(sid, p.date), {
        avail: p.available,
        checked: p.checked ?? 0,
        hasAvail: true,
        hasChecked: (p.checked ?? 0) > 0,
      });
    }

    const payloadDays = new Set<string>();
    for (const r of group) {
      const sid = chainId(r.stageId);
      if (!rank.has(sid)) continue;
      const key = stageDateKey(sid, r.occurredOn.start);
      // First payload row for this stage+date replaces the ledger fact for
      // that day (a restatement). Further payload rows of the same day sum,
      // the way two sheets covering one inspection always have.
      const s: StageDayQty = payloadDays.has(key)
        ? (byStageDate.get(key) ?? { avail: 0, checked: 0, hasAvail: false, hasChecked: false })
        : { avail: 0, checked: 0, hasAvail: false, hasChecked: false };
      payloadDays.add(key);
      const a = available(r);
      if (a != null) { s.avail += a; s.hasAvail = true; }
      if (r.checked?.value != null) { s.checked += r.checked.value; s.hasChecked = true; }
      byStageDate.set(key, s);
    }

    const byStage = new Map<string, StageDayQty>();
    for (const [k, day] of byStageDate) {
      const stageId = k.slice(0, k.lastIndexOf("|"));
      const s = byStage.get(stageId) ?? { avail: 0, checked: 0, hasAvail: false, hasChecked: false };
      s.avail += day.avail;
      s.checked += day.checked;
      if (day.hasAvail) s.hasAvail = true;
      if (day.hasChecked) s.hasChecked = true;
      byStage.set(stageId, s);
    }

    const present = [...byStage.keys()].filter((id) => rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!);
    for (let i = 1; i < present.length; i++) {
      // Compare against the nearest UPSTREAM gate present in the data — a
      // missing middle gate (data gap) must not suppress the check entirely.
      const prev = byStage.get(present[i - 1])!;
      const cur = byStage.get(present[i])!;
      if (!prev.hasAvail || !cur.hasChecked) continue;
      if (cur.checked > prev.avail) {
        const rec = group.find((r) => chainId(r.stageId) === present[i]);
        issues.push({
          code: "V-014",
          severity: "critical",
          field: "checked",
          stageId: rec?.stageId ?? present[i],
          date: rec?.occurredOn.start ?? group[0]!.occurredOn.start,
          message:
            `Mass balance: ${present[i]} checked ${cur.checked} units, but ${present[i - 1]} ` +
            `only passed forward ${prev.avail}. Where did the extra ${cur.checked - prev.avail} come from?`,
          stated: cur.checked,
          computed: prev.avail,
        });
      }
    }
  }
  return issues;
}
