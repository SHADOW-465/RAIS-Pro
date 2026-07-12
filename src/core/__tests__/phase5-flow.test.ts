/** @jest-environment node */
// Phase 5a proof: the MOD-only staging flow end-to-end at the API layer —
// upload → proposals → verify (stage overrides) → publish → extract records →
// ingest into the ledger with the MOD catalog. No family parser, no schema
// extractor, no preset is touched anywhere on this path.

import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";

const CORPUS = path.join(process.cwd(), "DATA", "VISUAL INSPECTION REPORT 2025.xlsx");
const maybe = fs.existsSync(CORPUS) ? describe : describe.skip;

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

maybe("Phase 5a: MOD-only upload → verify → publish → extract → ingest", () => {
  jest.setTimeout(60000);

  it("runs the whole flow through the routes", async () => {
    // 1. Upload (llm off — deterministic rungs only).
    const buf = fs.readFileSync(CORPUS);
    const fd = new FormData();
    fd.append("file", new File([buf], "VISUAL INSPECTION REPORT 2025.xlsx"));
    fd.append("llm", "off");
    const workbooks = await import("@/app/api/workbooks/route");
    const upRes = await workbooks.POST(new NextRequest("http://localhost/api/workbooks", { method: "POST", body: fd }));
    expect(upRes.status).toBe(200);
    const { mods } = await upRes.json();
    expect(mods).toHaveLength(1);
    const { modId, version, proposals } = mods[0];

    // 2. Verify: name the stage for every sheet region (rung 6); accept the rest.
    const decisions = proposals.map((p: any) =>
      p.kind === "stage"
        ? { entityId: p.entityId, action: "override", canonical: "STAGE:visual", kind: "stage", comment: null }
        : { entityId: p.entityId, action: "accept", canonical: null, kind: null, comment: null },
    );
    const verify = await import("@/app/api/mods/verify/route");
    const vRes = await verify.POST(jsonReq("/api/mods/verify", { modId, version, decisions }));
    expect(vRes.status).toBe(200);

    // 3. Publish (validator-gated) — the company learns the mappings.
    const modsRoute = await import("@/app/api/mods/route");
    const pRes = await modsRoute.POST(jsonReq("/api/mods", { modId, version }));
    expect(pRes.status).toBe(200);
    expect((await pRes.json()).learnedMappings).toBeGreaterThan(0);

    // 4. Extract records from the verified MOD + snapshot.
    const recordsRoute = await import("@/app/api/mods/records/route");
    const rRes = await recordsRoute.POST(jsonReq("/api/mods/records", { modId, ingestionId: "phase5-test" }));
    expect(rRes.status).toBe(200);
    const { records } = await rRes.json();
    expect(records.length).toBeGreaterThan(100);
    expect(records[0].extractedBy).toBe("mod");
    expect(records[0].modId).toBe(modId);
    expect(records.every((r: any) => r.stageId === "visual")).toBe(true);

    // 5. Ingest into the ledger with the MOD catalog (no registry preset).
    const ingest = await import("@/app/api/ingest/route");
    const iRes = await ingest.POST(jsonReq("/api/ingest", {
      ingestionId: "phase5-test", fileName: "VISUAL INSPECTION REPORT 2025.xlsx",
      records, modId, modVersion: version,
    }));
    expect(iRes.status).toBe(200);
    const ingested = await iRes.json();
    expect(ingested.inserted).toBeGreaterThan(0);
    expect(ingested.byStage.visual.checked).toBeGreaterThan(0);
  });
});
