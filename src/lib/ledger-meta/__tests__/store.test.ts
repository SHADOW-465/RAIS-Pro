process.env.MOID_STORE = "memory";

import { LedgerMetaUnavailableError, ledgerMetaMissing, readLedgerMeta } from "../store";

describe("ledgerMetaMissing", () => {
  it.each(["42P01", "PGRST205", "42501"])("treats %s as not set up", (code) => {
    expect(ledgerMetaMissing({ code })).toBe(true);
  });
  it("matches a schema-cache message and ignores unrelated errors", () => {
    expect(ledgerMetaMissing({ message: "Could not find the table 'public.ledger_meta' in the schema cache" })).toBe(true);
    expect(ledgerMetaMissing({ code: "57014", message: "statement timeout" })).toBe(false);
    expect(ledgerMetaMissing(null)).toBe(false);
  });
});

describe("readLedgerMeta", () => {
  it("is unavailable on the memory store, never a fake version 0", async () => {
    await expect(readLedgerMeta()).rejects.toBeInstanceOf(LedgerMetaUnavailableError);
  });
});
