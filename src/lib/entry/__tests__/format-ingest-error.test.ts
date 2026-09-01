import { formatIngestError, formatLedgerBlockReason } from "../format-ingest-error";

const ZOD_RULEID = JSON.stringify([
  {
    code: "invalid_value",
    values: ["V-001", "V-002", "V-003", "V-004", "V-005", "V-006", "V-007", "V-008", "V-009", "V-010", "V-011", "V-012", "V-013"],
    path: ["ruleId"],
    message: 'Invalid option: expected one of "V-001"|"V-002"|"V-003"|"V-004"|"V-005"|"V-006"|"V-007"|"V-008"|"V-009"|"V-010"|"V-011"|"V-012"|"V-013"',
  },
]);

const MASS_BALANCE =
  "Mass balance: balloon checked 1000 units, but visual only passed forward 900. Where did the extra 100 come from?";

test("Zod ruleId dump becomes a mass-balance warning, not JSON", () => {
  const text = formatIngestError(ZOD_RULEID);
  expect(text).not.toMatch(/invalid_value/);
  expect(text).not.toMatch(/V-001/);
  expect(text.toLowerCase()).toMatch(/previous station|passed forward|mass/);
});

test("a plain ledger sentence is kept", () => {
  expect(formatIngestError("Could not reach ledger server")).toBe("Could not reach ledger server");
});

test("exact mass-balance issue wins over a Zod dump", () => {
  const text = formatLedgerBlockReason(ZOD_RULEID, [
    { message: MASS_BALANCE },
  ]);
  expect(text).toBe(MASS_BALANCE);
  expect(text).not.toMatch(/invalid_value/);
});

test("falls back to the formatted dump when there are no issues", () => {
  const text = formatLedgerBlockReason(ZOD_RULEID, []);
  expect(text).not.toMatch(/invalid_value/);
  expect(text.toLowerCase()).toMatch(/passed forward|previous station/);
});
