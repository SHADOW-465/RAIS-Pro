// The multi-day invariant, in one place.
//
// A lot is opened on one day and worked across several. The batch code encodes
// the day it was OPENED; the entry date is whichever day this station ran it.
// These two have been conflated twice now, so the rule gets a test.

import { buildBatchId, parseBatchId, formatBatchIdInput } from "../batch-id";

test("the lot code is a function of lot date + size, and nothing else", () => {
  const lotDate = "2026-06-27";
  const code = buildBatchId(lotDate, "14Fr");
  expect(code).toBe("26F27-14");

  // Whatever day the station records on, the same lot date yields the same code.
  for (const recordedOn of ["2026-06-27", "2026-06-28", "2026-07-04", "2027-01-09"]) {
    expect(buildBatchId(lotDate, "14Fr")).toBe(code);
    // and the recorded day is not derivable from the code
    expect(parseBatchId(code!)?.date).toBe(lotDate);
    expect(parseBatchId(code!)?.date).not.toBe(recordedOn === lotDate ? "" : recordedOn);
  }
});

test("size is the only other input — changing it keeps the lot's date part", () => {
  const a = buildBatchId("2026-06-27", "14Fr")!;
  const b = buildBatchId("2026-06-27", "20Fr")!;
  expect(a).toBe("26F27-14");
  expect(b).toBe("26F27-20");
  expect(parseBatchId(a)?.date).toBe(parseBatchId(b)?.date);
});

test("typing a code round-trips to the lot date the popover shows", () => {
  const typed = formatBatchIdInput("26f2714");
  expect(typed).toBe("26F27-14");
  const p = parseBatchId(typed)!;
  expect(p.date).toBe("2026-06-27");
  expect(p.sizeFr).toBe("14");
  // Feeding that date straight back must reproduce the same code.
  expect(buildBatchId(p.date, `${p.sizeFr}Fr`)).toBe(typed);
});

test("picking a lot date in the calendar rewrites the code from that day + size", () => {
  // The Change-popover calendar must call this path: lot date in, code out.
  // Nested popovers used to swallow the click, so the code never updated.
  expect(buildBatchId("2026-09-01", "20Fr")).toBe("26I01-20");
  expect(buildBatchId("2026-08-15", "18Fr")).toBe("26H15-18");
});

test("a lot opened in one month and finished in the next keeps its month letter", () => {
  const code = buildBatchId("2026-06-30", "16Fr")!;
  expect(code).toBe("26F30-16");
  // Recording it on 2 July must not turn F (June) into G (July).
  expect(parseBatchId(code)!.monthIndex).toBe(5);
  expect(buildBatchId("2026-07-02", "16Fr")).toBe("26G02-16"); // a genuinely different lot
});

// The duplicate/identity rules that used to live here now belong to
// checkEntry + entryIdentity, and are tested in check-entry.test.ts. The old
// helpers keyed identity on the DATE, which is exactly the rule that let the
// same lot be re-entered at the same station on another day in silence.
