import type { Event } from "@/lib/store/types";
import { eventEntryDate } from "./date-basis";
import type { ReportViewModel } from "./report-model";
import { qualifyingReportEvents, type ResolvedReportScope } from "./report-scope";
import { eventSourceChannel, eventSourceFileLabel, eventBatchId } from "@/lib/analytics/scope";

export interface EvidenceManifest {
  reportTitle: string;
  generatedAt: string;
  dateFrom: string;
  dateTo: string;
  dateBasis: "Date of Entry";
  qualifyingEventCount: number;
  events: {
    eventId: string;
    eventType: string;
    entryDate: string | null;
    recordedAt: string | null;
    occurredOn: string | null;
    stageId: string | null;
    size: string | null;
    quantity: number | null;
    defectCode: string | null;
    defectCodeRaw: string | null;
    batchId: string | null;
    sourceChannel: string;
    file: string | null;
  }[];
}

export function buildEvidenceManifest(
  events: Event[],
  scope: ResolvedReportScope,
  model: ReportViewModel,
): EvidenceManifest {
  const { included } = qualifyingReportEvents(events, scope);
  return {
    reportTitle: model.identity.title,
    generatedAt: model.identity.generatedAt,
    dateFrom: model.identity.dateFrom,
    dateTo: model.identity.dateTo,
    dateBasis: "Date of Entry",
    qualifyingEventCount: included.length,
    events: included.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      entryDate: eventEntryDate(e),
      recordedAt: e.recordedAt ?? null,
      occurredOn: e.occurredOn?.start ?? null,
      stageId: "stageId" in e ? ((e as { stageId?: string }).stageId ?? null) : null,
      size: "size" in e ? ((e as { size?: string | null }).size ?? null) : null,
      quantity: "quantity" in e ? Number((e as { quantity?: number }).quantity ?? 0) : null,
      defectCode: (e as { defectCode?: string | null }).defectCode ?? null,
      defectCodeRaw: (e as { defectCodeRaw?: string | null }).defectCodeRaw ?? null,
      batchId: eventBatchId(e),
      sourceChannel: eventSourceChannel(e),
      file: eventSourceFileLabel(e) || e.provenance?.file || null,
    })),
  };
}
