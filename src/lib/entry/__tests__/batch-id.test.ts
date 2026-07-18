import {
  buildBatchId,
  parseBatchId,
  isValidBatchId,
  toCanonicalSize,
  toDisplaySize,
  frDigitsFromSize,
} from "@/lib/entry/batch-id";

describe("batch-id bi-directional binding", () => {
  test("form → ID: June 27 2026 + 14Fr → 26F27-14", () => {
    expect(buildBatchId("2026-06-27", "14Fr")).toBe("26F27-14");
    expect(buildBatchId("2026-06-27", "Fr14")).toBe("26F27-14");
  });

  test("form → ID: August 23 2026 + 16Fr → 26H23-16", () => {
    expect(buildBatchId("2026-08-23", "16Fr")).toBe("26H23-16");
  });

  test("ID → form: 26H23-16", () => {
    const p = parseBatchId("26H23-16");
    expect(p).not.toBeNull();
    expect(p!.date).toBe("2026-08-23");
    expect(p!.sizeFr).toBe("16");
    expect(p!.monthName).toBe("August");
    expect(p!.monthCode).toBe("H");
  });

  test("ID → form is case-insensitive and trims", () => {
    const p = parseBatchId("  26f27-14  ");
    expect(p!.date).toBe("2026-06-27");
    expect(p!.sizeFr).toBe("14");
  });

  test("invalid IDs rejected", () => {
    expect(parseBatchId("")).toBeNull();
    expect(parseBatchId("ABCDEF")).toBeNull();
    expect(parseBatchId("26Z27-14")).toBeNull(); // bad month
    expect(isValidBatchId("26F27")).toBe(false); // size required for save
    expect(isValidBatchId("26F27-14")).toBe(true);
  });

  test("size helpers", () => {
    expect(frDigitsFromSize("14Fr")).toBe("14");
    expect(toCanonicalSize("14Fr")).toBe("Fr14");
    expect(toDisplaySize("Fr14")).toBe("14Fr");
  });
});
