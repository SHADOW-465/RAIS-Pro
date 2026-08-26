// src/app/api/ingest/route.ts
// Commit verified StageDayRecords → canonical events + live clarification checks.
// The classify/verify step happens client-side; this route is the deterministic
// emit + append + check stage (MOID-SPEC §8/§9/§13).

import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guard";
import { emitMany, type StageDayRecord } from "@/lib/ingest/emit";
import { checkRecord } from "@/lib/entry/validate-entry";
import { massBalanceIssues } from "@/lib/ingest/mass-balance";
import { getStores } from "@/lib/store";
import { entryIdentity, identityKey, identityOfEvent } from "@/lib/entry/identity";

interface IngestBody {
  ingestionId: string;
  fileName: string;
  records: StageDayRecord[];
  /** MOD v2 (Phase 3): resolve entities via this MOD lineage's company catalog
   *  instead of the registry-preset chain. */
  modId?: string;
  modVersion?: number;
  /** per-mapping-row comments keyed by mapping id (carried for provenance/audit) */
  comments?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "write");
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as IngestBody;
    const records = body.records ?? [];
    if (records.length === 0) {
      return NextResponse.json({ error: "No records to ingest." }, { status: 400 });
    }

    // Attach comments to records (keyed by stageId or by row index)
    const recordsWithComments = records.map((r, idx) => {
      // Fall back to the record's own comment — data-entry attaches the
      // reconciliation reason there, and it must not be nulled out here.
      const comment = body.comments?.[r.stageId] || body.comments?.[idx.toString()] || r.comment || null;
      return {
        ...r,
        comment: comment && comment.trim() ? comment.trim() : null
      };
    });

    // Two different questions, two different candidate sets.
    //
    //   `existingEvents` — what else was recorded on THESE DAYS. Mass balance
    //     and value-conflict reconciliation are both day-scoped, so they get
    //     the window.
    //   `allEffective`   — every effective event, whatever day it carries.
    //     Identity is (lot · station · date · pass). Mass balance still has
    //     to see the previous gate on an earlier day of the same lot, so
    //     priors are built from this unwindowed set.
    //
    // One fetch, windowed in memory: both store adapters already load the full
    // table and apply from/to in JS, so the window never saved a round trip.
    const dates = recordsWithComments.map(r => r.occurredOn.start);
    const from = dates.reduce((min, d) => d < min ? d : min, dates[0]);
    const to = dates.reduce((max, d) => d > max ? d : max, dates[0]);

    const { events: store, findings: findingsStore } = getStores();
    const allEffective = await store.effective({});
    // Same predicate `effective({ from, to })` applies — fully inside the window.
    const existingEvents = allEffective.filter(
      (e) => e.occurredOn.start >= from && e.occurredOn.end <= to,
    );

    // What each gate already passed forward, per lot — across EVERY day.
    // Direct entry submits ONE station per save, and that station often runs
    // on a later day than the one before it, so a date-windowed prior set
    // made Balloon on the 4th blind to Visual on the 1st.
    const priorAgg = new Map<
      string,
      { stageId: string; date: string; size: string | null; batch: string; accepted: number; checked: number; rejected: number }
    >();
    for (const e of allEffective as any[]) {
      const stageId = e.stageId;
      if (!stageId) continue;
      const date = e.occurredOn?.start;
      if (!date) continue;
      const batch = String(e.batchNo ?? e.customFields?.batch ?? "").trim();
      const size = e.size ?? null;
      const key = `${date}|${size ?? ""}|${batch}|${stageId}`;
      const cur =
        priorAgg.get(key) ?? { stageId, date, size, batch, accepted: 0, checked: 0, rejected: 0 };
      const q = e.quantity ?? 0;
      if (e.eventType === "production") cur.checked += q;
      else if (e.eventType === "inspection" && e.disposition === "accepted") cur.accepted += q;
      else if (e.eventType === "inspection" && e.disposition === "rejected") cur.rejected += q;
      priorAgg.set(key, cur);
    }
    const priors = [...priorAgg.values()].map((p) => ({
      stageId: p.stageId,
      date: p.date,
      size: p.size,
      batch: p.batch,
      // Same rule as `available()`: accepted when stated, else checked − rejected.
      available: p.accepted > 0 ? p.accepted : Math.max(0, p.checked - p.rejected),
      checked: p.checked,
    }));

    // 1. Live clarification checks (point-in-time) — surfaced, never blocking.
    const issues = [
      ...recordsWithComments.flatMap((r) =>
        checkRecord(r).map((i) => ({ ...i, stageId: r.stageId, date: r.occurredOn.start }))
      ),
      // Cross-stage mass balance (V-014): checked(N+1) must not exceed what
      // stage N passed forward — Disposafe's data-tampering tripwire.
      ...massBalanceIssues(recordsWithComments, undefined, priors),
    ];

    // Map existing events to minimal StageDayRecord shape for comparison
    const existingMap = new Map<string, { stageId: string, size: string | null, date: string, rejectedVal: number }>();
    for (const event of existingEvents) {
      if (event.eventType === "inspection" && (event as any).disposition === "rejected") {
        const stageId = (event as any).stageId;
        const size = (event as any).size ?? null;
        const date = event.occurredOn.start;
        const key = `${stageId}|${size ?? "·"}|${date}`;
        existingMap.set(key, {
          stageId,
          size,
          date,
          rejectedVal: (event as any).quantity ?? 0
        });
      }
    }

    const existingRecords = Array.from(existingMap.values()).map(x => ({
      stageId: x.stageId,
      size: x.size,
      occurredOn: { kind: "day" as const, start: x.date, end: x.date },
      rejected: { value: x.rejectedVal, cell: "", header: "" },
      checked: null,
      acceptedGood: null,
      rework: null,
      defects: [],
      statedPct: null,
      extractedBy: "heuristic",
      ingestionId: ""
    }));

    // Reconcile conflicts
    const { reconcileConflicts } = require("@/core/ingest/reconcile");
    const { toWrite, conflicts } = reconcileConflicts(existingRecords, recordsWithComments);

    // Turn conflicts into Findings and upsert them
    if (conflicts.length > 0) {
      const { hashFinding } = require("@/lib/contract/hash");
      const { Finding } = require("@/lib/contract/d3");
      const findingsToUpsert = conflicts.map((c: any) => {
        const ruleId = "V-010" as const;
        const subtype = "value-conflict";
        const matchingEventIds = existingEvents
          .filter(e => (e as any).stageId === c.stageId && ((e as any).size ?? null) === c.size && e.occurredOn.start === c.day)
          .map(e => e.eventId);

        const findingId = hashFinding({
          ruleId,
          subtype,
          evidenceEventIds: matchingEventIds.length > 0 ? matchingEventIds : [`conflict-${c.stageId}-${c.day}`]
        });

        // The source cell of the value that conflicts. Provenance.cells is
        // `.min(1)`, so an empty array threw here and 500'd the whole ingest —
        // meaning every correction to an already-saved Rejected value failed.
        const source = recordsWithComments.find(
          (r) => r.stageId === c.stageId && (r.size ?? null) === c.size && r.occurredOn.start === c.day,
        );
        const cell = source?.rejected?.cell || `${c.stageId}!${c.day}`;

        return Finding.parse({
          findingId,
          schemaVersion: "1.0.0",
          ingestionId: body.ingestionId,
          ruleId,
          subtype,
          severity: "critical",
          question: `Value conflict on ${c.stageId} for ${c.day}`,
          detail: `Existing rejected count is ${c.existing}, but incoming uploaded/entered count is ${c.incoming}.`,
          evidence: {
            eventIds: matchingEventIds.length > 0 ? matchingEventIds : [`conflict-${c.stageId}-${c.day}`],
            cells: [cell],
            provenance: {
              file: source?.source.file ?? body.fileName,
              fileHash: source?.source.fileHash ?? "local",
              sheet: source?.source.sheet ?? c.size ?? "Unknown",
              tableId: source?.source.tableId ?? "t1",
              cells: [cell],
              headerPath: ["Rejected Qty"],
              rowLabel: null,
              formulaText: null,
              cachedValue: null,
              externalRef: null,
            },
            statedValue: c.existing,
            computedValue: c.incoming,
            magnitude: Math.abs(c.existing - c.incoming),
          },
          hypotheses: [
            { kind: "mistake", text: "Typo in manual entry or spreadsheet data." },
            { kind: "intentional-practice", text: "Intentional correction/revision of previous data." }
          ],
          requiresGmAuthority: false,
          occurredOn: { kind: "day", start: c.day, end: c.day },
          recordedAt: new Date().toISOString(),
        });
      });

      await findingsStore.upsert(findingsToUpsert);
    }

    // 2. Emit canonical events and append (idempotent on content hash).
    let activeRegistry = undefined;
    if (body.modId) {
      // MOD path: the company's merged verified-MOD catalog is the registry.
      const { getModStore } = require("@/core/ontology/store/mod-store") as typeof import("@/core/ontology/store/mod-store");
      const company = process.env.MOID_COMPANY_ID || "default";
      const catalog = await getModStore().catalogFor(company);
      activeRegistry = {
        clientId: company,
        registryVersion: `mod:${body.modId}@${body.modVersion ?? "latest"}`,
        fiscalYearStartMonth: catalog.fiscalYearStartMonth,
        stages: catalog.stages,
        defects: catalog.defects,
        sizes: catalog.sizes,
        costConfig: null,
      };
    }

    const events = emitMany(toWrite, activeRegistry);

    // Upsert reconcile: when a re-ingest changes a value, supersede the prior
    // event for the same stage·day·size·batch·kind so totals UPDATE instead of
    // doubling. Byte-identical re-ingests fall through to content-hash dedup.
    //
    // A *removal* (operator clears a defect, or deletes a row) has no incoming
    // event to point at, so it supersedes with a null replacement. That is what
    // used to require a hard DELETE against the events table — which broke the
    // append-only guarantee, ran only when Supabase was configured, and pruned
    // just records[0]'s date, leaving the rest of a month-long save behind.
    //
    // Both keys below now derive from ONE identity —
    // (lot · station · date · pass) — so they can no longer disagree.
    // Same day restates (supersedes); a different recorded-on date is a
    // split-day continuation of the same lot at that station.
    const PRIMARY = new Set(["production", "inspection", "rejection"]);
    //
    // Not every row has a lot code: workbook imports and rows written before
    // lot codes were required have none, and those must keep behaving exactly
    // as they did. They fall back to the old day-based slice, which is the
    // only thing that identifies them.
    const idOf = (e: any): string => {
      const id = identityOfEvent(e);
      if (id) return identityKey(id);
      return `nolot|${e.occurredOn?.start ?? ""}|${e.stageId ?? ""}|${e.size ?? ""}|${e.provenance?.sheet ?? ""}`;
    };
    /** Supersede key: one identity, one atom (a defect code is its own atom). */
    const sk = (e: any) =>
      `${idOf(e)}|${e.eventType}|${e.disposition ?? ""}|${e.defectCode ?? e.defectCodeRaw ?? ""}`;
    // Built from the RECORDS, not the emitted events: a row whose Rejected was
    // just cleared to nothing emits no rejection event, but it still owns its
    // identity — that is exactly the row whose stale event must be superseded.
    const ownedIdentities = new Set(
      recordsWithComments
        .filter((r) => r.extractedBy === "direct-entry")
        .map((r) => {
          const cf = r.customFields ?? {};
          const batch = String(cf.batch ?? cf.batchId ?? cf.batchNo ?? "").trim();
          const pass = typeof cf.pass === "number" ? cf.pass : 1;
          const id = entryIdentity(batch, r.stageId, r.occurredOn.start, pass);
          if (id) return identityKey(id);
          return `nolot|${r.occurredOn.start}|${r.stageId}|${r.size ?? ""}|${r.source.sheet}`;
        }),
    );

    const incomingByKey = new Map<string, string[]>();
    for (const e of events as any[]) {
      if (!PRIMARY.has(e.eventType)) continue;
      const k = sk(e);
      const arr = incomingByKey.get(k); if (arr) arr.push(e.eventId); else incomingByKey.set(k, [e.eventId]);
    }
    const { hashEvent } = require("@/lib/contract/hash");
    const { CorrectionEvent } = require("@/lib/contract/d1");
    const corrections: any[] = [];
    const supersede = (e: any, replacementEventId: string | null, reason: string) => {
      const payload = { supersedesEventId: e.eventId, replacementEventId, reason, authorisedBy: "ingest:auto-reconcile" };
      const eventId = hashEvent({ eventType: "correction", occurredOn: e.occurredOn, provenance: e.provenance, payload });
      corrections.push(CorrectionEvent.parse({ eventId, schemaVersion: "1.0.0", ingestionId: body.ingestionId, occurredOn: e.occurredOn, provenance: e.provenance, confidence: { score: 1, basis: "exact" }, extractedBy: "ingest:auto-reconcile", recordedAt: new Date().toISOString(), supersededBy: null, eventType: "correction", ...payload }));
    };
    // Unbounded on purpose — see `allEffective` above. Rows with no lot code
    // are unaffected: their key falls back to `nolot|date|…`, which still
    // carries the date, so a payload for another day cannot match them.
    for (const e of allEffective as any[]) {
      if (!PRIMARY.has(e.eventType)) continue;
      const ids = incomingByKey.get(sk(e));
      if (ids) {
        if (ids.includes(e.eventId)) continue; // identical → keep as-is
        supersede(e, ids[0], "Re-entry updated this value");
        continue;
      }
      // Not in the payload. Only a removal if this payload owns the identity,
      // and only direct entry claims one — re-saving a typed row must never
      // supersede what a workbook import stated.
      if (e.extractedBy !== "direct-entry") continue;
      if (!ownedIdentities.has(idOf(e))) continue;
      supersede(e, null, "Cleared by re-entry — value removed from this entry");
    }
    const { inserted, deduped } = await store.append([...events, ...corrections]);

    // 2b. Persist the clarification issues as Findings.
    //
    // These used to be computed, returned in the response, and dropped — the
    // browser only read the body on failure, and nothing wrote them down. So
    // an impossible count or an unexplained rejection left no trace for a QM
    // to work through later. Now every issue lands in the findings store,
    // keyed by content so re-saving the same bad row does not pile up copies.
    if (issues.length > 0) {
      const { hashFinding } = require("@/lib/contract/hash");
      const { Finding } = require("@/lib/contract/d3");
      const SEV: Record<string, "critical" | "warning" | "info"> = {
        critical: "critical",
        warning: "warning",
        info: "info",
      };
      const firstRecord = recordsWithComments[0];
      const issueFindings = issues.map((i: any) => {
        const day = i.date ?? firstRecord?.occurredOn.start ?? new Date().toISOString().slice(0, 10);
        const stageId = i.stageId ?? firstRecord?.stageId ?? "unknown";
        const source = recordsWithComments.find(
          (r) => r.stageId === stageId && r.occurredOn.start === day,
        ) ?? firstRecord;
        const cell = source?.checked?.cell || `${stageId}!${day}`;
        return Finding.parse({
          findingId: hashFinding({
            ruleId: i.code,
            subtype: i.field,
            evidenceEventIds: [`${stageId}-${day}-${i.field}-${i.stated ?? ""}`],
          }),
          schemaVersion: "1.0.0",
          ingestionId: body.ingestionId,
          ruleId: i.code,
          subtype: i.field,
          severity: SEV[i.severity] ?? "warning",
          question: i.message,
          detail: i.message,
          evidence: {
            eventIds: events.map((e) => e.eventId),
            cells: [cell],
            provenance: {
              file: source?.source.file ?? body.fileName,
              fileHash: source?.source.fileHash ?? "local",
              sheet: source?.source.sheet ?? "",
              tableId: source?.source.tableId ?? "t1",
              cells: [cell],
              headerPath: [i.field],
              rowLabel: null,
              formulaText: null,
              cachedValue: null,
              externalRef: null,
            },
            statedValue: i.stated,
            computedValue: i.computed,
            magnitude:
              typeof i.stated === "number" && typeof i.computed === "number"
                ? Math.abs(i.stated - i.computed)
                : null,
          },
          hypotheses: [
            { kind: "mistake", text: "Mis-keyed count, or a column read from the wrong row." },
            { kind: "intentional-practice", text: "Real process event the sheet does not model yet." },
          ],
          requiresGmAuthority: false,
          occurredOn: { kind: "day", start: day, end: day },
          recordedAt: new Date().toISOString(),
        });
      });
      await findingsStore.upsert(issueFindings);
    }

    // 3. Per-stage rollup for the success summary (deterministic, from events).
    const byStage: Record<string, { checked: number; rejected: number; days: number }> = {};
    for (const r of toWrite) {
      const s = (byStage[r.stageId] ??= { checked: 0, rejected: 0, days: 0 });
      s.checked += r.checked?.value ?? 0;
      s.rejected += r.rejected?.value ?? 0;
      s.days += 1;
    }

    return NextResponse.json({
      ingestionId: body.ingestionId,
      fileName: body.fileName,
      eventsEmitted: events.length,
      inserted,
      deduped,
      issues,
      byStage,
      commentCount: body.comments ? Object.values(body.comments).filter((c) => c.trim()).length : 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ingestion failed" }, { status: 500 });
  }
}
