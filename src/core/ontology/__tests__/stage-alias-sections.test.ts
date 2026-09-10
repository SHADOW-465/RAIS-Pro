// Every place that asks "which section is this stage in?" must resolve the
// plant's own stage names first.
//
// A stage has one authored id and any number of names the plant uses:
// `production` is the catalog's id for Dipping, and the live ledger holds ~700
// rows under `production-dipping`. `STAGE_CATEGORY` is a plain object keyed by
// authored ids, so a raw lookup returns undefined for every one of those rows —
// and each call site then does something different and wrong with the miss.
// The Sources filter dropped them, Data Entry filed them under Assembly, and
// the View menu hid the station unless every section was selected.
//
// This walks the source rather than testing one function, because the bug is
// "somebody used the raw table" and that is invisible in any single unit test.
// Same approach as route-auth-coverage.test.ts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STAGE_CATEGORY, stageCategoryOf, resolveStageId } from "@/core/ontology/plant-catalog";

describe("stageCategoryOf", () => {
  test("resolves an alias to the section its authored stage sits in", () => {
    expect(resolveStageId("production-dipping")).toBe("production");
    expect(stageCategoryOf("production-dipping")).toBe("primary");
    // The raw table is exactly what it cannot do — this is the bug in one line.
    expect(STAGE_CATEGORY["production-dipping"]).toBeUndefined();
  });

  test("still answers directly for an authored id", () => {
    expect(stageCategoryOf("visual")).toBe("assembly");
    expect(stageCategoryOf("production")).toBe("primary");
  });

  test("a stage nobody authored stays unclassified rather than guessing", () => {
    expect(stageCategoryOf("not-a-stage")).toBeUndefined();
    expect(stageCategoryOf("")).toBeUndefined();
    expect(stageCategoryOf(null)).toBeUndefined();
  });
});

describe("no call site reads the raw table", () => {
  // Two files may: plant-catalog.ts, where stageCategoryOf is defined, and
  // load-catalog.ts, whose lookup sits behind `authoredById.get(stageId)` and
  // so can only ever see an authored id.
  const ALLOWED = ["src/core/ontology/plant-catalog.ts", "src/core/ontology/load-catalog.ts"];

  const files = [
    "src/lib/entry/entry-schema.ts",
    "src/lib/analytics/rejection.ts",
    "src/lib/analytics/source-trace.ts",
    "src/lib/analytics/scope.ts",
    "src/app/api/entry-template/route.ts",
    "src/components/app/AppShell.tsx",
    "src/components/app/SourcesScopePanel.tsx",
  ];

  test.each(files)("%s asks stageCategoryOf, not STAGE_CATEGORY[...]", (rel) => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    // Ignore the word in comments — those explain the rule.
    const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/STAGE_CATEGORY\s*\[/);
  });

  test("the allow-list is honest about what still reads it", () => {
    for (const rel of ALLOWED) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).toMatch(/STAGE_CATEGORY\s*\[/);
    }
  });
});
