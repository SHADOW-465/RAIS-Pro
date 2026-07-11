// Forces the memory store so this test never touches a real Supabase project
// — this is the exact environment that made /api/schema hard-fail before the
// RegistryStore fix (RC1): createServerClient() threw before ever reaching
// the DISPOSAFE_REGISTRY fallback, so an uploaded workbook's real extracted
// schema could never be saved, and every page silently fell back to the
// hardcoded registry regardless of what was actually uploaded.
process.env.MOID_STORE = "memory";

import { GET, POST, PATCH, DELETE } from "../route";
import { NextRequest } from "next/server";

function get(qs = "") {
  return new NextRequest(`http://localhost/api/schema${qs}`);
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/schema", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function patch(qs: string, body: unknown) {
  return new NextRequest(`http://localhost/api/schema${qs}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const sampleSchema = {
  stages: [{ stageId: "visual", label: "Visual Inspection", fields: [] }],
  defects: [{ defectCode: "COAG", label: "Coagulum", aliases: ["COAG"], stages: ["visual"] }],
  sizes: [{ sizeId: "Fr8", label: "8 FR" }],
};

describe("/api/schema (memory store — no Supabase configured)", () => {
  // getStores() caches its store instances on globalThis (a process
  // singleton, by design, so state survives across requests in one running
  // server). Reset it before each test so tests don't see presets left over
  // from a previous one in this file.
  beforeEach(() => {
    delete (globalThis as any).__moidStores;
  });

  it("GET with nothing saved falls back to the hardcoded DISPOSAFE_REGISTRY, unconfigured", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.configured).toBe(false);
    expect(json.registry.presetId).toBeNull();
    expect(json.registry.stages.length).toBeGreaterThan(1); // the real hardcoded stage list
  });

  it("POST creates a preset, and it persists — no 500 without Supabase", async () => {
    const res = await POST(post({ schema: sampleSchema, name: "Test Workbook" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.registry.presetId).toBe("test-workbook");
  });

  it("GET with no presetId returns the saved preset, not the hardcoded fallback (the actual bug)", async () => {
    await POST(post({ schema: sampleSchema, name: "Only Preset" }));
    const res = await GET(get());
    const json = await res.json();
    expect(json.configured).toBe(true);
    expect(json.registry.presetId).toBe("only-preset");
    expect(json.registry.stages).toHaveLength(1);
    expect(json.registry.stages[0].stageId).toBe("visual");
  });

  it("GET ?list=true lists saved presets", async () => {
    await POST(post({ schema: sampleSchema, name: "Listed Preset" }));
    const res = await GET(get("?list=true"));
    const json = await res.json();
    expect(json.presets.some((p: any) => p.presetId === "listed-preset")).toBe(true);
  });

  it("POST without a presetId or name is a 400", async () => {
    const res = await POST(post({ schema: sampleSchema }));
    expect(res.status).toBe(400);
  });

  it("POST with an existing presetId extends it without requiring a name", async () => {
    await POST(post({ schema: sampleSchema, name: "Extend Me" }));
    const res = await POST(post({ schema: sampleSchema, presetId: "extend-me" }));
    expect(res.status).toBe(200);
  });

  it("two presets: GET with no presetId returns the MOST RECENTLY saved one, not the oldest", async () => {
    // POST marks whichever preset it just touched as active -- otherwise
    // "active" would silently stay pinned to the oldest preset ever created,
    // ignoring every schema actually uploaded/saved afterward.
    await POST(post({ schema: sampleSchema, name: "First Created" }));
    await POST(post({ schema: sampleSchema, name: "Second Created" }));
    const res = await GET(get());
    const json = await res.json();
    expect(json.registry.presetId).toBe("second-created");
  });

  it("re-saving an older preset makes it active again", async () => {
    await POST(post({ schema: sampleSchema, name: "First Created" }));
    await POST(post({ schema: sampleSchema, name: "Second Created" }));
    await POST(post({ schema: sampleSchema, presetId: "first-created" }));
    const res = await GET(get());
    const json = await res.json();
    expect(json.registry.presetId).toBe("first-created");
  });

  it("PATCH renames a preset", async () => {
    await POST(post({ schema: sampleSchema, name: "Old Name" }));
    const res = await PATCH(patch("?presetId=old-name", { name: "New Name" }));
    expect(res.status).toBe(200);
    const listRes = await GET(get("?list=true"));
    const list = (await listRes.json()).presets;
    expect(list.find((p: any) => p.presetId === "old-name").name).toBe("New Name");
  });

  it("DELETE removes a preset; GET then falls back to the hardcoded default again", async () => {
    await POST(post({ schema: sampleSchema, name: "Delete Me" }));
    const delRes = await DELETE(new NextRequest("http://localhost/api/schema?presetId=delete-me", { method: "DELETE" }));
    expect(delRes.status).toBe(200);
    const res = await GET(get("?presetId=delete-me"));
    const json = await res.json();
    // Not found by that presetId -> falls back to the hardcoded default, unconfigured.
    expect(json.configured).toBe(false);
  });

  it("POST with an existing presetId preserves previously-learned stageAliases (regression: must not wipe them)", async () => {
    await POST(post({ schema: sampleSchema, name: "Alias Keeper" }));
    const { getStores } = await import("@/lib/store");
    const { registries } = getStores();
    const existing = (await registries.get("alias-keeper"))!;
    await registries.upsert({
      ...existing,
      stageAliases: { "visual qc": { stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" } },
    });
    await POST(post({ schema: sampleSchema, presetId: "alias-keeper" }));
    const row = await registries.get("alias-keeper");
    expect(row?.stageAliases["visual qc"]).toEqual({
      stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z",
    });
  });

  it("GET with no presetId prefers the explicitly-activated preset over the oldest one", async () => {
    await POST(post({ schema: sampleSchema, name: "First Created" }));
    await POST(post({ schema: sampleSchema, name: "Second Created" }));
    const { getStores } = await import("@/lib/store");
    const { registries } = getStores();
    await registries.setActive("second-created");
    const res = await GET(get());
    const json = await res.json();
    expect(json.registry.presetId).toBe("second-created");
  });

  it("POST rejects a request whose stages resolve to a duplicate stageId (new-stage label collides with an existing stageId)", async () => {
    await POST(post({ schema: sampleSchema, name: "Collision Preset" }));
    const res = await POST(post({
      presetId: "collision-preset",
      registry: {
        stages: [...sampleSchema.stages, { label: "Visual" }], // slugifies to "visual" — already taken
        defects: sampleSchema.defects,
        sizes: sampleSchema.sizes,
      },
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/visual/i);
  });

  it("POST response reflects preserved fiscalYearStartMonth and stageAliases on merge, not stale defaults", async () => {
    // Create initial preset
    await POST(post({ schema: sampleSchema, name: "Response Merge Test" }));

    // Manually set custom values in the store to simulate prior configuration
    const { getStores } = await import("@/lib/store");
    const { registries } = getStores();
    const existing = (await registries.get("response-merge-test"))!;
    await registries.upsert({
      ...existing,
      fiscalYearStartMonth: 7, // Non-default
      stageAliases: { "qc inspection": { stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z" } },
    });

    // POST to the same preset to extend/merge it
    const res = await POST(post({ schema: sampleSchema, presetId: "response-merge-test" }));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Response should reflect the preserved values, not hardcoded defaults
    expect(json.registry.fiscalYearStartMonth).toBe(7);
    expect(json.registry.stageAliases["qc inspection"]).toEqual({
      stageId: "visual", confidence: 1, basis: "alias", learnedAt: "2026-07-10T00:00:00.000Z",
    });
  });
});
