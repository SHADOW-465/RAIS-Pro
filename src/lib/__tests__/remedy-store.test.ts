import { isRemedyComplete, lookupRemedy, resolveRemedyKey, RANK_WORDS } from "../remedy-store";
import { catalogLabelFor, validatedDefects } from "../remedies/identity";

test("PS / Ply Separation resolve to the authored code", () => {
  expect(resolveRemedyKey("PS")).toBe("PS");
  expect(resolveRemedyKey("Ply Separation")).toBe("PS");
});

test("BIC and Bend In Catheter address the same plant-book row", () => {
  expect(resolveRemedyKey("BIC")).toBe("BIC");
  expect(resolveRemedyKey("Bend In Catheter")).toBe("BIC");
  expect(resolveRemedyKey("bend in catheter")).toBe("BIC");
  expect(catalogLabelFor("BIC")).toBe("Bend In Catheter");
});

test("lookupRemedy matches a Pareto label to the catalog code", () => {
  const book = {
    defects: {
      BIC: {
        code: "BIC",
        defectName: "Bend In Catheter",
        description: "Catheter bent at forming.",
        remedy: "Check mandrel alignment.",
        createdAt: "",
        createdBy: "gm",
        updatedAt: "",
        updatedBy: "gm",
        version: 1,
      },
    },
    trends: [],
  };
  expect(lookupRemedy(book, "Bend In Catheter")?.code).toBe("BIC");
  expect(lookupRemedy(book, "BIC")?.remedy).toBe("Check mandrel alignment.");
});

test("a remedy is complete only with both description and action", () => {
  expect(isRemedyComplete({ description: "Ply split", remedy: "Check dip" })).toBe(true);
  expect(isRemedyComplete({ description: "Ply split", remedy: "  " })).toBe(false);
  expect(isRemedyComplete(null)).toBe(false);
});

test("validatedDefects drops incomplete rows and remaps labels to codes", () => {
  const out = validatedDefects({
    "Bend In Catheter": { code: "Bend In Catheter", description: "Bent", remedy: "Align" },
    EMPTY: { code: "EMPTY", description: "only desc", remedy: "  " },
  });
  expect(Object.keys(out)).toEqual(["BIC"]);
  expect(out.BIC.code).toBe("BIC");
});

test("ranks are Primary, Secondary, Tertiary", () => {
  expect(RANK_WORDS).toEqual(["Primary", "Secondary", "Tertiary"]);
});
