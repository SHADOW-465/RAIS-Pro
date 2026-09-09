// Secondary Production existed in the authored plant catalog but never reached
// Data Entry on plants whose catalog was stored before it was authored — and a
// stored stage with no capture columns is filtered out of /api/entry-template.
// Both holes are closed in loadCatalog; this pins them.

import { loadCatalog } from "../load-catalog";
import { getCatalogStore, __resetCatalogStoreForTests } from "../store/catalog-store";
import { plantCatalog } from "../plant-catalog";
import { templateFrom } from "@/app/api/entry-template/route";

beforeEach(() => {
  __resetCatalogStoreForTests();
});

const authoredSecondary = plantCatalog().stages.find((s) => s.stageId === "secondary")!;

test("the authored catalog carries Secondary Production as its own category", () => {
  expect(authoredSecondary).toBeTruthy();
  expect(authoredSecondary.category).toBe("secondary");
  expect((authoredSecondary.captures ?? []).length).toBeGreaterThan(0);
});

test("a stored catalog missing Secondary gains it, in process order", async () => {
  const store = getCatalogStore();
  const authored = plantCatalog();
  await store.put("acme", {
    ...authored,
    // The plant configured its schema before Secondary was authored.
    stages: authored.stages.filter((s) => s.stageId !== "secondary"),
    lastMergedFrom: null,
  });

  const loaded = await loadCatalog("acme");
  const ids = loaded.stages.map((s) => s.stageId);
  expect(ids).toContain("secondary");
  // Inserted where the process puts it — after trimming, before visual.
  expect(ids.indexOf("secondary")).toBeLessThan(ids.indexOf("visual"));
  expect(ids.indexOf("trimming")).toBeLessThan(ids.indexOf("secondary"));
});

test("a stage stored with no capture columns is repaired, so Data Entry can render it", async () => {
  const store = getCatalogStore();
  const authored = plantCatalog();
  await store.put("acme", {
    ...authored,
    stages: authored.stages.map((s) =>
      s.stageId === "secondary" ? { ...s, captures: [] } : s,
    ),
    lastMergedFrom: null,
  });

  const loaded = await loadCatalog("acme");
  const secondary = loaded.stages.find((s) => s.stageId === "secondary")!;
  expect(secondary.captures).toEqual(authoredSecondary.captures);

  // ...and it survives the entry-template projection that had been dropping it.
  const template = templateFrom(loaded);
  const stage = template.stages.find((s) => s.stageId === "secondary");
  expect(stage).toBeTruthy();
  expect(stage!.category).toBe("secondary");
  expect(stage!.columns.length).toBeGreaterThan(0);
});

test("Hold added on balloon in Data Schema is still on the entry template after reload", async () => {
  const store = getCatalogStore();
  const authored = plantCatalog();
  await store.put("acme", {
    ...authored,
    stages: authored.stages.map((s) =>
      s.stageId === "balloon"
        ? { ...s, captures: ["checked", "accepted", "hold", "rejected"] }
        : s,
    ),
    lastMergedFrom: "plant-catalog@dipping-label-and-sections",
    sections: authored.sections,
  });
  const loaded = await loadCatalog("acme");
  expect(loaded.stages.find((s) => s.stageId === "balloon")!.captures).toContain("hold");
  const template = templateFrom(loaded);
  expect(template.stages.find((s) => s.stageId === "balloon")!.columns.map((c) => c.key)).toContain(
    "rework",
  );
});

test("the backfill runs once — a stage deleted on Data Schema afterwards stays deleted", async () => {
  const store = getCatalogStore();
  const authored = plantCatalog();
  await store.put("acme", { ...authored, lastMergedFrom: null });
  await loadCatalog("acme"); // tags the catalog

  const tagged = await store.get("acme");
  await store.put("acme", {
    ...tagged,
    stages: tagged.stages.filter((s) => s.stageId !== "secondary"),
  });

  const loaded = await loadCatalog("acme");
  expect(loaded.stages.map((s) => s.stageId)).not.toContain("secondary");
});

test("a catalog tagged by mergePlantCatalog does not resurrect a deleted authored stage", async () => {
  const store = getCatalogStore();
  const authored = plantCatalog();
  await store.put("acme", {
    ...authored,
    stages: authored.stages.filter((s) => s.stageId !== "visual"),
    lastMergedFrom: "plant-catalog",
  });

  const loaded = await loadCatalog("acme");
  expect(loaded.stages.map((s) => s.stageId)).not.toContain("visual");
});

test("the duplicate Production (Dipping) stage label is rewritten to Dipping once", async () => {
  const store = getCatalogStore();
  const authored = plantCatalog();
  await store.put("acme", {
    ...authored,
    stages: authored.stages.map((s) =>
      s.stageId === "production" ? { ...s, label: "Production (Dipping)" } : s,
    ),
    lastMergedFrom: "plant-catalog@eye-punching-hanging-secondary",
  });
  const loaded = await loadCatalog("acme");
  expect(loaded.stages.find((s) => s.stageId === "production")?.label).toBe("Dipping");
  expect(loaded.sections?.some((s) => s.id === "primary")).toBe(true);
});

test("a stored catalog holding the old section for eye-punching/hanging is realigned once", async () => {
  const store = getCatalogStore();
  const authored = plantCatalog();
  await store.put("acme", {
    ...authored,
    // Seeded before these two moved to the secondary line.
    stages: authored.stages.map((s) =>
      s.stageId === "eye-punching" || s.stageId === "hanging"
        ? { ...s, category: "primary" as const }
        : s,
    ),
    lastMergedFrom: "plant-catalog@secondary-production",
  });

  const loaded = await loadCatalog("acme");
  const catOf = (id: string) => loaded.stages.find((s) => s.stageId === id)?.category;
  expect(catOf("eye-punching")).toBe("secondary");
  expect(catOf("hanging")).toBe("secondary");
  expect(catOf("production")).toBe("primary");

  // Realignment is a one-time correction: a later hand edit sticks.
  const tagged = await store.get("acme");
  await store.put("acme", {
    ...tagged,
    stages: tagged.stages.map((s) =>
      s.stageId === "hanging" ? { ...s, category: "primary" as const } : s,
    ),
  });
  const again = await loadCatalog("acme");
  expect(again.stages.find((s) => s.stageId === "hanging")?.category).toBe("primary");
});
