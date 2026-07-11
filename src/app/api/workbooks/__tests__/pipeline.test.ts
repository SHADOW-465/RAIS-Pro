// End-to-end Phase 2 loop on the real corpus, no LLM, memory stores:
// upload → draft MOD + proposals → verify (with a stage override) → publish
// (validator-gated, learns) → re-upload → stage now resolves at rung 1/2.
process.env.MOID_STORE = "memory";
process.env.MOID_COMPANY_ID = "test-co";

import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";
import { POST as uploadPOST } from "../route";
import { POST as verifyPOST } from "../../mods/verify/route";
import { POST as publishPOST, GET as modsGET } from "../../mods/route";

const CORPUS = path.join(process.cwd(), "DATA", "VISUAL INSPECTION REPORT 2025.xlsx");
const maybe = fs.existsSync(CORPUS) ? describe : describe.skip;

function jsonReq(url: string, body: unknown) {
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

async function upload(): Promise<any> {
  const form = new FormData();
  const bytes = fs.readFileSync(CORPUS);
  form.append("file", new File([new Uint8Array(bytes)], "VISUAL INSPECTION REPORT 2025.xlsx"));
  form.append("llm", "off");
  const res = await uploadPOST(new NextRequest("http://localhost/api/workbooks", { method: "POST", body: form }));
  const data = await res.json();
  expect(res.status).toBe(200);
  return data;
}

maybe("MOD pipeline end-to-end (upload → verify → publish → learn → re-upload)", () => {
  jest.setTimeout(30000);

  it("closes the learning loop", async () => {
    // 1. First upload: draft MOD, stage honestly unresolved (fresh company).
    const first = await upload();
    expect(first.mods).toHaveLength(1);
    const mod = first.mods[0];
    expect(mod.version).toBe(1);
    const stageProposals = mod.proposals.filter((p: any) => p.kind === "stage");
    expect(stageProposals.length).toBeGreaterThan(0);
    expect(stageProposals.every((p: any) => p.canonical === null)).toBe(true);

    // 2. Verify: accept everything, but OVERRIDE every stage to STAGE:visual.
    const decisions = mod.proposals.map((p: any) =>
      p.kind === "stage"
        ? { entityId: p.entityId, action: "override", canonical: "STAGE:visual", kind: "stage", comment: "it is the visual gate" }
        : { entityId: p.entityId, action: "accept", canonical: null, kind: null, comment: null },
    );
    const vRes = await verifyPOST(jsonReq("http://localhost/api/mods/verify", { modId: mod.modId, version: 1, decisions }));
    const vData = await vRes.json();
    expect(vRes.status).toBe(200);
    expect(vData.verifiedCount).toBe(mod.proposals.length);
    expect(vData.stages.map((s: any) => s.stageId)).toContain("visual");

    // 3. Publish: validator-gated, supersedes nothing (first version), learns.
    const pRes = await publishPOST(jsonReq("http://localhost/api/mods", { modId: mod.modId, version: 1, verifiedBy: "qm" }));
    const pData = await pRes.json();
    expect(pRes.status).toBe(200);
    expect(pData.status).toBe("verified");
    expect(pData.learnedMappings).toBeGreaterThan(0);

    // Draft can't be published twice.
    const again = await publishPOST(jsonReq("http://localhost/api/mods", { modId: mod.modId, version: 1 }));
    expect(again.status).toBe(409);

    // 4. Re-upload the same file: new draft version of the SAME lineage, and
    // the stage now resolves without the user (exact/knowledge rungs).
    const second = await upload();
    const mod2 = second.mods[0];
    expect(mod2.modId).toBe(mod.modId);
    expect(mod2.version).toBe(2);
    const stages2 = mod2.proposals.filter((p: any) => p.kind === "stage");
    expect(stages2.length).toBeGreaterThan(0);
    for (const s of stages2) {
      expect(s.canonical).toBe("STAGE:visual");
      expect(["exact", "knowledge"]).toContain(s.resolvedBy);
      expect(s.confidence).toBe(1);
    }

    // 5. The MOD list shows both versions' lineage state.
    const listRes = await modsGET(new NextRequest("http://localhost/api/mods"));
    const list = (await listRes.json()).mods;
    expect(list.find((m: any) => m.version === 1)?.status).toBe("verified");
    expect(list.find((m: any) => m.version === 2)?.status).toBe("draft");
  });
});
