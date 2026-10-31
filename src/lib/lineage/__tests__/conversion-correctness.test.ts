// planConversion rules added for batch-conversion correctness: quantity bounds,
// the ledger-eligible cap, repeat handling, and real calendar dates.

import { planConversion } from "../validate";
import { ConversionError, type BatchConversion } from "../types";

const now = new Date("2026-10-31T12:00:00Z");

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
      changedQty: 200,
      stageId: "visual",
      convertedOn: "2026-09-23",
      reason: "Customer size change",
      createdBy: "gm",
      ...extra,
    },
    existing,
    now,
  );
}

function fails(fn: () => unknown, code: string, message?: RegExp) {
  try {
    fn();
  } catch (e) {
    expect((e as ConversionError).code).toBe(code);
    if (message) expect((e as Error).message).toMatch(message);
    return;
  }
  throw new Error("expected throw");
}

test("changed quantity must be a positive whole number", () => {
  for (const bad of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    fails(() => create("26I21-14", "16Fr", { changedQty: bad }), "qty-invalid");
  }
});

test("changed quantity above the ledger-eligible quantity is rejected", () => {
  fails(() => create("26I21-14", "16Fr", { changedQty: 701, eligibleQty: 700 }), "qty-exceeds-eligible", /Only 700/);
  expect(create("26I21-14", "16Fr", { changedQty: 700, eligibleQty: 700 }).changedQty).toBe(700);
  expect(create("26I21-14", "16Fr", { changedQty: 1, eligibleQty: 700 }).changedQty).toBe(1);
});

test("when nothing was accepted at the station (eligible 0) nothing can convert", () => {
  fails(() => create("26I21-14", "16Fr", { changedQty: 1, eligibleQty: 0 }), "qty-exceeds-eligible", /no quantity at/);
});

test("repeat of the same lot with a different quantity is refused, not silently kept", () => {
  const first = create("26I21-14", "16Fr", { changedQty: 200 });
  fails(
    () => create("26I21-14", "16Fr", { changedQty: 150 }, [first]),
    "already-converted",
    /already converted to 26I21-16 \(200 pieces\).*only be converted once.*cannot be changed to 150/,
  );
  expect(create("26I21-14", "16Fr", { changedQty: 200 }, [first])).toBe(first);
});

test("an identical repeat stays idempotent even if the ledger figure has since moved", () => {
  const first = create("26I21-14", "16Fr", { changedQty: 200, eligibleQty: 200 });
  expect(create("26I21-14", "16Fr", { changedQty: 200, eligibleQty: 50 }, [first])).toBe(first);
});

test("converting an already-converted lot to another size says so explicitly", () => {
  const first = create("26I21-14", "16Fr");
  fails(() => create("26I21-14", "18Fr", {}, [first]), "already-converted", /only be converted once.*26I21-18/);
});

test("a row stored before quantities existed (0) accepts a repeat", () => {
  const legacy = { ...create("26I21-14", "16Fr"), changedQty: 0 };
  expect(create("26I21-14", "16Fr", { changedQty: 90 }, [legacy])).toBe(legacy);
});

describe("conversion date", () => {
  test("a day that does not exist is rejected", () => {
    for (const d of ["2026-02-31", "2026-04-31", "2026-13-01", "2026-00-10", "2025-02-29", "2026-1-5", ""]) {
      fails(() => create("26I21-14", "16Fr", { convertedOn: d }), "invalid-date", /not a real calendar date/);
    }
  });

  test("real days are accepted, including 29 Feb in a leap year", () => {
    expect(create("26I21-14", "16Fr", { convertedOn: "2024-02-29" }).convertedOn).toBe("2024-02-29");
    expect(create("26I21-14", "16Fr", { convertedOn: "2026-10-31" }).convertedOn).toBe("2026-10-31");
    // one day of time-zone slack for a plant east of UTC
    expect(create("26I21-14", "16Fr", { convertedOn: "2026-11-01" }).convertedOn).toBe("2026-11-01");
  });

  test("a future day is rejected", () => {
    fails(() => create("26I21-14", "16Fr", { convertedOn: "2026-11-02" }), "invalid-date", /in the future/);
    fails(() => create("26I21-14", "16Fr", { convertedOn: "2027-01-01" }), "invalid-date", /in the future/);
  });
});
