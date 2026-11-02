import {
  REASON_OPTIONS,
  canUndoConversion,
  conversionReasonBody,
  conversionReasonError,
  conversionReasonText,
  undoConversion,
} from "../conversion-actions";
import { CONVERSION_REASON_CATEGORIES, normalizeReasonCategory } from "@/lib/lineage/types";
import { planConversion } from "@/lib/lineage/validate";

afterEach(() => jest.restoreAllMocks());

test("the picker offers exactly the backend's categories", () => {
  expect(REASON_OPTIONS.map((o) => o.value)).toEqual(CONVERSION_REASON_CATEGORIES.map((c) => c.id));
  for (const o of REASON_OPTIONS) expect(normalizeReasonCategory(o.value)).toBe(o.value);
});

test("a new conversion needs a category and a note, like planConversion", () => {
  expect(conversionReasonError("", "x")).toMatch(/why/i);
  expect(conversionReasonError("bogus", "x")).toMatch(/why/i);
  expect(conversionReasonError("rework", "  ")).toMatch(/note/i);
  expect(conversionReasonError("rework", "split at visual")).toBeNull();
  expect(conversionReasonBody("Size reclassification", " 16 to 18 ")).toEqual({
    reasonCategory: "size-reclassification",
    reasonNote: "16 to 18",
  });
  // The server rejects what the client rejects.
  expect(() => planConversion({ fromBatch: "x", toSize: "Fr18", changedQty: 1, stageId: "visual", convertedOn: "2026-01-01", reasonCategory: "", reasonNote: "n", createdBy: "gm" } as never, [])).toThrow(/size changed/);
});

test("older rows without a category still read", () => {
  expect(conversionReasonText({ reason: "customer request" })).toBe("customer request");
  expect(conversionReasonText({ reason: "" })).toMatch(/older/);
  expect(conversionReasonText({ reason: "rework: x", reasonCategory: "rework", reasonNote: "x" })).toBe("Rework: x");
});

test("only a GM with write access can undo", () => {
  expect(canUndoConversion("gm", true)).toBe(true);
  expect(canUndoConversion("gm", false)).toBe(false);
  expect(canUndoConversion("operator", true)).toBe(false);
  expect(canUndoConversion(undefined, true)).toBe(false);
});

test("undo posts id and reason to the undo route and needs a reason", async () => {
  expect(await undoConversion("bc_1", " ")).toEqual({ ok: false, error: expect.any(String) });
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ conversion: { id: "bc_1", reversedAt: "2026-11-03T00:00:00Z" }, warning: null }),
  } as Response);
  const r = await undoConversion("bc_1", " wrong lot ");
  expect(r.ok).toBe(true);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/batch-conversions/undo");
  expect(JSON.parse(String((init as RequestInit).body))).toEqual({ id: "bc_1", reason: "wrong lot" });
});

test("a refused undo reports the server's message", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Only a General Manager can undo a conversion." }) } as Response);
  expect(await undoConversion("bc_1", "x")).toEqual({ ok: false, error: "Only a General Manager can undo a conversion." });
});
