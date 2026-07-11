process.env.MOID_STORE = "memory";

import { POST } from "../route";
import { NextRequest } from "next/server";
import { getStores } from "@/lib/store";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/ingest", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/ingest resolves defects against the correct registry", () => {
  beforeEach(() => {
    delete (globalThis as any).__moidStores;
  });

  it("resolves a defect alias defined only in the given presetId's custom registry, not DISPOSAFE_REGISTRY", async () => {
    const { registries, events } = getStores();
    await registries.upsert({
      presetId: "acme", name: "Acme", createdFromFilename: null, registryVersion: "1.0.0",
      fiscalYearStartMonth: 4,
      stages: [{ stageId: "visual", label: "Visual", fields: [] }],
      defects: [{ defectCode: "XYZ", label: "Custom Defect", aliases: ["FOOBAR"], stages: ["visual"] }],
      sizes: [],
      stageAliases: {},
    });

    const res = await POST(post({
      ingestionId: "ing-active-registry-test",
      fileName: "test.xlsx",
      presetId: "acme",
      records: [{
        occurredOn: { kind: "day", start: "2026-07-11", end: "2026-07-11" },
        stageId: "visual",
        source: { file: "test.xlsx", fileHash: "h1", sheet: "VISUAL", tableId: "t1" },
        checked: { value: 100, cell: "B2", header: "CHECKED" },
        acceptedGood: null,
        rework: null,
        rejected: { value: 10, cell: "D2", header: "REJECTED" },
        defects: [{ raw: "FOOBAR", value: 10, cell: "E2" }],
        statedPct: null,
        extractedBy: "heuristic",
        ingestionId: "ing-active-registry-test",
      }],
    }));
    expect(res.status).toBe(200);

    const stored = await events.effective({ from: "2026-07-11", to: "2026-07-11" });
    const rejection = stored.find((e: any) => e.eventType === "rejection");
    expect(rejection).toBeDefined();
    // Proves the "acme" registry was actually consulted — DISPOSAFE_REGISTRY
    // has no "FOOBAR" alias, so without the fix this would be null.
    expect((rejection as any).defectCode).toBe("XYZ");
  });
});
