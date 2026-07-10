// Forces the memory store so this test never touches a real Supabase project.
process.env.MOID_STORE = "memory";

import { POST } from "../route";
import { NextRequest } from "next/server";
import { getStores } from "@/lib/store";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/registry-alias", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/registry-alias", () => {
  it("persists a normalized alias against the preset's registry row", async () => {
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

    const res = await POST(post({ presetId: "acme", sheetName: "Visual QC", stageId: "visual" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.key).toBe("visual qc");

    const updated = await registries.get("acme");
    expect(updated?.stageAliases["visual qc"]).toMatchObject({ stageId: "visual", basis: "alias" });
  });

  it("rejects a request missing stageId", async () => {
    const res = await POST(post({ presetId: "acme", sheetName: "Visual QC" }));
    expect(res.status).toBe(400);
  });
});
