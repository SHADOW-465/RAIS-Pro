// Proves the confirm-alias write path (Task 6) actually closes the loop into
// a subsequent recognition pass (Task 3/4's stageAliases threading), instead
// of only persisting to the registry with nothing ever reading it back.
process.env.MOID_STORE = "memory";

import { POST } from "@/app/api/registry-alias/route";
import { NextRequest } from "next/server";
import { getStores } from "@/lib/store";
import { groupIntoDatasets } from "../registry";
import type { ProfiledTableInput } from "../types";
import type { SchemaSignature } from "@/lib/schema/types";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/registry-alias", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const sig = (hash: string): SchemaSignature => ({
  hash,
  columns: [
    { role: "dimension-date", name: "date" },
    { role: "measure", name: "checked" },
    { role: "measure", name: "rejected" },
  ],
});

const input = (fileName: string, sheetName: string, hash: string): ProfiledTableInput => ({
  fileName, sheetName, signature: sig(hash), columns: [], rowCount: 10,
});

describe("alias write path closes the loop into groupIntoDatasets", () => {
  it("a sheet unrecognized by regex is recognized after its alias is confirmed", async () => {
    const { registries } = getStores();
    await registries.upsert({
      presetId: "acme",
      name: "Acme",
      createdFromFilename: null,
      registryVersion: "1.0.0",
      fiscalYearStartMonth: 1,
      stages: [],
      defects: [],
      sizes: [],
      stageAliases: {},
    });

    // "16FR" matches none of recognize.ts's hardcoded STAGE_PATTERNS (valve,
    // balloon, eye-punch, final, visual) — a company-specific station code with
    // no stage keyword substring, so it's unrecognized before an alias exists.
    const before = groupIntoDatasets([input("x.xlsx", "16FR", "hhhh")]);
    expect(before[0].recognizedStageId).toBeNull();

    const res = await POST(post({ presetId: "acme", sheetName: "16FR", stageId: "visual" }));
    expect(res.status).toBe(200);

    // Re-fetch the registry the same way the Staging-upload path now does
    // (src/app/api/schema/route.ts's toClientRegistry -> src/app/staging/page.tsx
    // threading activeRegistry.stageAliases into datasetsWithRowsFromWorkbooks).
    const row = await registries.get("acme");
    const after = groupIntoDatasets([input("x.xlsx", "16FR", "hhhh")], row?.stageAliases ?? {});
    expect(after[0].recognizedStageId).toBe("visual");
    expect(after[0].recognitionBasis).toBe("alias");
  });
});
