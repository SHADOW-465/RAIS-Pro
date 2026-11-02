process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { authedHeaders, authedJsonHeaders } from "@/__tests__/fixtures/auth";
import {
  __resetSharedStateForTests,
  __setSharedStateStoreForTests,
  SharedStateUnavailableError,
  SHARED_STATE_UNAVAILABLE_MESSAGE,
} from "@/lib/shared-state/store";
import { GET, PUT } from "../route";

beforeEach(() => {
  __resetSharedStateForTests();
});

afterEach(() => {
  __setSharedStateStoreForTests(null);
});

async function put(body: unknown, role: "gm" | "operator" | "owner" = "gm") {
  return PUT(new NextRequest("http://localhost/api/shared-state", {
    method: "PUT",
    headers: await authedJsonHeaders(role),
    body: JSON.stringify(body),
  }));
}

async function get(kind: string, role: "gm" | "operator" | "owner" = "operator") {
  return GET(new NextRequest(`http://localhost/api/shared-state?kind=${kind}`, {
    headers: await authedHeaders(role),
  }));
}

describe("/api/shared-state", () => {
  it("requires a session", async () => {
    const res = await GET(new NextRequest("http://localhost/api/shared-state?kind=lot-memory"));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown kind and a document that does not match", async () => {
    const badKind = await get("not-a-kind");
    expect(badKind.status).toBe(400);
    const badDoc = await put({ kind: "shift-windows", record: { timezone: "" } });
    expect(badDoc.status).toBe(400);
  });

  it("lets an operator read and blocks them from replacing shift windows", async () => {
    const denied = await put({
      kind: "shift-windows",
      record: { timezone: "Asia/Kolkata", windows: { "Day Shift": { start: "08:00", end: "20:00" } } },
    }, "operator");
    expect(denied.status).toBe(403);
    const saved = await put({
      kind: "shift-windows",
      record: { timezone: "Asia/Kolkata", windows: { "Day Shift": { start: "09:00", end: "18:00" } } },
    }, "gm");
    expect(saved.status).toBe(200);
    const read = await get("shift-windows", "operator");
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("private, no-store");
    const body = await read.json();
    expect(body.record.windows["Day Shift"].start).toBe("09:00");
  });

  it("does not overwrite a plant document on import", async () => {
    await put({
      kind: "report-presets",
      record: [{ id: "user:server", name: "Server", spec: { title: "S" } }],
    });
    const imported = await put({
      kind: "report-presets",
      import: true,
      record: [{ id: "user:local", name: "Local", spec: { title: "L" } }],
    });
    expect(imported.status).toBe(200);
    const body = await imported.json();
    expect(body.imported).toBe(false);
    expect(body.record).toEqual([{ id: "user:server", name: "Server", spec: { title: "S" } }]);
  });

  it("imports into an empty document and then serves it to another role", async () => {
    const imported = await put({
      kind: "lot-memory",
      import: true,
      record: { on: true, batchId: "26J01-20", batchDate: "2026-10-01", size: "20Fr" },
    }, "operator");
    expect(imported.status).toBe(200);
    expect((await imported.json()).imported).toBe(true);
    const read = await get("lot-memory", "owner");
    expect((await read.json()).record.batchId).toBe("26J01-20");
  });

  it("merges a grant by entry key instead of replacing the list", async () => {
    const first = await put({
      kind: "edit-grants",
      grant: {
        entryKey: "row-a",
        approvedBy: "gm",
        approvedAt: "2026-10-01T10:00:00.000Z",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
    });
    expect(first.status).toBe(200);
    await put({
      kind: "edit-grants",
      grant: {
        entryKey: "row-b",
        approvedBy: "gm",
        approvedAt: "2026-10-01T10:00:00.000Z",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
    });
    const read = await get("edit-grants", "operator");
    const keys = (await read.json()).record.grants.map((g: { entryKey: string }) => g.entryKey).sort();
    expect(keys).toEqual(["row-a", "row-b"]);
    const denied = await put({
      kind: "edit-grants",
      grant: {
        entryKey: "row-c",
        approvedBy: "operator",
        approvedAt: "2026-10-01T10:00:00.000Z",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
    }, "operator");
    expect(denied.status).toBe(403);
  });

  it("returns 503 naming the migration when the table is missing", async () => {
    __setSharedStateStoreForTests({
      read: async () => { throw new SharedStateUnavailableError(); },
      replace: async () => { throw new SharedStateUnavailableError(); },
      importIfEmpty: async () => { throw new SharedStateUnavailableError(); },
      mergeGrant: async () => { throw new SharedStateUnavailableError(); },
      revokeGrant: async () => { throw new SharedStateUnavailableError(); },
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await get("custom-defects", "gm");
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe(SHARED_STATE_UNAVAILABLE_MESSAGE);
      expect(body.code).toBe("storage-unavailable");
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
