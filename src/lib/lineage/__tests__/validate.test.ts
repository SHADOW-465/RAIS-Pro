import { planConversion } from "../validate";
import {
  proposedConvertedBatchId,
  conversionFlowLabel,
  conversionHistoryName,
  historyNameForLot,
} from "../ids";
import { ConversionError, type BatchConversion } from "../types";
import { lineageChain } from "../graph";

const on = "2026-09-23";

function create(
  from: string,
  toSize: string,
  extra: Partial<Parameters<typeof planConversion>[0]> = {},
  existing: BatchConversion[] = [],
) {
  return planConversion(
    {
      fromBatch: from,
      toSize,
      convertedOn: on,
      reason: "Customer size change",
      createdBy: "gm",
      ...extra,
    },
    existing,
  );
}

test("history name is original CT converted", () => {
  expect(conversionFlowLabel("26I17-16", "26I17-18")).toBe("26I17-16 converted to 26I17-18");
  expect(conversionHistoryName("26I17-16", "26I17-18")).toBe("26I17-16 CT 26I17-18");
  expect(
    historyNameForLot("26I17-18", [{ fromBatch: "26I17-16", toBatch: "26I17-18" }]),
  ).toBe("26I17-16 CT 26I17-18");
});

test("26I21-14 + 16Fr proposes 26I21-16 and keeps the start-date stem", () => {
  expect(proposedConvertedBatchId("26I21-14", "16Fr")).toBe("26I21-16");
  expect(proposedConvertedBatchId("26I21-14", "16")).toBe("26I21-16");
});

test("records an immutable lineage edge, never a rename", () => {
  const row = create("26I21-14", "16Fr");
  expect(row.fromBatch).toBe("26I21-14");
  expect(row.toBatch).toBe("26I21-16");
  expect(row.fromSize).toBe("14Fr");
  expect(row.toSize).toBe("16Fr");
  expect(row.id).toBe("bc_26I21-14_26I21-16");
});

test("canonicalises odd spellings of the source lot", () => {
  const row = create("26i2114", "16Fr");
  expect(row.fromBatch).toBe("26I21-14");
  expect(row.toBatch).toBe("26I21-16");
});

test("rejects converting to the same size", () => {
  try {
    create("26I21-14", "14Fr");
    throw new Error("expected throw");
  } catch (e) {
    expect(e).toBeInstanceOf(ConversionError);
    expect((e as ConversionError).code).toBe("same-size");
  }
});

test("rejects a converted ID whose start date does not match the original", () => {
  try {
    create("26I21-14", "16Fr", { toBatch: "26I22-16" });
    throw new Error("expected throw");
  } catch (e) {
    expect(e).toBeInstanceOf(ConversionError);
    expect((e as ConversionError).code).toBe("stem-mismatch");
  }
});

test("a source lot may convert only once", () => {
  const first = create("26I21-14", "16Fr");
  try {
    create("26I21-14", "18Fr", {}, [first]);
    throw new Error("expected throw");
  } catch (e) {
    expect((e as ConversionError).code).toBe("already-converted");
  }
});

test("repeating the same conversion is idempotent", () => {
  const first = create("26I21-14", "16Fr");
  const again = create("26I21-14", "16Fr", {}, [first]);
  expect(again).toBe(first);
});

test("a converted identity cannot be claimed by a second original", () => {
  const first = create("26I21-14", "16Fr");
  try {
    create("26I21-18", "16Fr", {}, [first]);
    throw new Error("expected throw");
  } catch (e) {
    expect((e as ConversionError).code).toBe("target-taken");
  }
});

test("chains 14 → 16 → 18 as one lineage", () => {
  const a = create("26I21-14", "16Fr");
  const b = create("26I21-16", "18Fr", {}, [a]);
  const chain = lineageChain("26I21-16", [a, b]);
  expect(chain.map((n) => n.batch)).toEqual(["26I21-14", "26I21-16", "26I21-18"]);
  expect(chain[0].origin).toBe(true);
  expect(chain[2].via?.fromBatch).toBe("26I21-16");
});

test("rejects a cycle back to an ancestor", () => {
  const a = create("26I21-14", "16Fr");
  try {
    create("26I21-16", "14Fr", {}, [a]);
    throw new Error("expected throw");
  } catch (e) {
    expect((e as ConversionError).code).toBe("cycle");
  }
});

test("requires a reason", () => {
  try {
    create("26I21-14", "16Fr", { reason: "  " });
    throw new Error("expected throw");
  } catch (e) {
    expect((e as ConversionError).code).toBe("reason-required");
  }
});
