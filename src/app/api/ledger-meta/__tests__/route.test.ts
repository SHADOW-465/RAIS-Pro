process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { authedHeaders } from "@/__tests__/fixtures/auth";
import { LedgerMetaUnavailableError } from "@/lib/ledger-meta/store";
import { GET } from "../route";

const read = jest.fn();
jest.mock("@/lib/ledger-meta/store", () => ({
  ...jest.requireActual("@/lib/ledger-meta/store"),
  readLedgerMeta: () => read(),
}));

const get = async (signedIn = true) =>
  GET(new NextRequest("http://localhost/api/ledger-meta", { headers: signedIn ? await authedHeaders("operator") : {} }));

beforeEach(() => {
  read.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("/api/ledger-meta", () => {
  it("requires a session", async () => {
    expect((await get(false)).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  it("returns the version, never cached", async () => {
    read.mockResolvedValue({ version: 7, updatedAt: "2026-11-01T00:00:00Z" });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 7, updatedAt: "2026-11-01T00:00:00Z", source: "db" });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers 503 with a null version before the migration is applied, and warns", async () => {
    read.mockRejectedValue(new LedgerMetaUnavailableError());
    const res = await get();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.version).toBeNull();
    expect(body.code).toBe("ledger-meta-unavailable");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers 500 on an unexpected failure rather than faking a version", async () => {
    read.mockRejectedValue(new Error("boom"));
    const res = await get();
    expect(res.status).toBe(500);
    expect((await res.json()).version).toBeNull();
  });
});
