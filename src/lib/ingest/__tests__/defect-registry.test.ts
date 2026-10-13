import { getKnowledgeStore } from "@/core/ontology/store/knowledge-store";
import { emitStageDay, type StageDayRecord } from "@/lib/ingest/emit";
import { registryForNewEntries } from "@/lib/ingest/defect-registry";

const COMPANY = "defect-alias-save-test";

function rec(raw: string): StageDayRecord {
  return {
    occurredOn: { kind: "day", start: "2026-08-01", end: "2026-08-01" },
    stageId: "visual",
    size: "Fr14",
    source: { file: "Manual Entry", fileHash: "h", sheet: "S", tableId: "t" },
    checked: { value: 10, cell: "ENTRY!checked", header: "Checked Qty" },
    acceptedGood: null,
    rework: null,
    rejected: { value: 2, cell: "ENTRY!reject", header: "Rejected Qty" },
    defects: [{ raw, value: 2, cell: `ENTRY!defect!${raw}` }],
    statedPct: null,
    extractedBy: "direct-entry",
    ingestionId: "ing-alias",
  };
}

test("a new entry resolves a schema alias and does not require a ledger rewrite", async () => {
  await getKnowledgeStore().learn([
    {
      companyId: COMPANY,
      kind: "defect-alias",
      key: "bm",
      canonicalId: "DEFECT:BM",
      confidence: 1,
      learnedFrom: null,
    },
  ]);
  const reg = await registryForNewEntries(null, COMPANY);
  const events = emitStageDay(rec("BM"), reg as never);
  const rejection = events.find((e) => e.eventType === "rejection");
  expect(rejection && "defectCode" in rejection ? rejection.defectCode : null).toBe("BM");
  expect(rejection && "defectCodeRaw" in rejection ? rejection.defectCodeRaw : null).toBe("BM");
});
