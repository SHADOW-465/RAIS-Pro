process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { authedJsonHeaders } from "@/__tests__/fixtures/auth";
import { GET, POST } from "../route";
import { getCatalogStore, __resetCatalogStoreForTests } from "@/core/ontology/store/catalog-store";

beforeEach(() => {
  __resetCatalogStoreForTests();
});

async function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/schema", {
      method: "POST",
      headers: await authedJsonHeaders("gm"),
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/schema delete stays deleted on the next GET", () => {
  it("does not resurrect a deleted authored stage after load-plant-catalog", async () => {
    const seeded = await post({ action: "load-plant-catalog" });
    expect(seeded.status).toBe(200);
    const before = await seeded.json();
    expect(before.catalog.stages.some((s: { stageId: string }) => s.stageId === "visual")).toBe(
      true,
    );

    const del = await post({ action: "delete-stage", id: "visual" });
    expect(del.status).toBe(200);
    const afterDel = await del.json();
    expect(afterDel.catalog.stages.some((s: { stageId: string }) => s.stageId === "visual")).toBe(
      false,
    );

    const got = await GET(
      new NextRequest("http://localhost/api/schema", { headers: await authedJsonHeaders("gm") }),
    );
    const data = await got.json();
    expect(data.catalog.stages.some((s: { stageId: string }) => s.stageId === "visual")).toBe(
      false,
    );

    const stored = await getCatalogStore().get(process.env.MOID_COMPANY_ID || "default");
    expect(stored.stages.some((s) => s.stageId === "visual")).toBe(false);
  });
});
