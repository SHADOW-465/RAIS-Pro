process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { authedHeaders, authedJsonHeaders } from "@/__tests__/fixtures/auth";
import { __resetGrantsForTests } from "@/lib/entry/edit-grants";
import { createNotification, listNotifications, __resetNotificationsForTests } from "@/lib/notifications/store";
import {
  __resetSharedStateForTests,
  __setSharedStateStoreForTests,
  getSharedStateStore,
  SharedStateUnavailableError,
} from "@/lib/shared-state/store";
import { GET as readShared } from "@/app/api/shared-state/route";
import { PATCH } from "../route";

const entryKey = "2026-10-01|26J01-14|visual|14Fr|2 way";

beforeEach(async () => {
  await __resetNotificationsForTests();
  __resetSharedStateForTests();
  __resetGrantsForTests();
});

afterEach(() => {
  __setSharedStateStoreForTests(null);
});

async function approve(id: string) {
  return PATCH(new NextRequest("http://localhost/api/notifications", {
    method: "PATCH",
    headers: await authedJsonHeaders("gm"),
    body: JSON.stringify({ id, action: "approve" }),
  }));
}

describe("edit grant reaches the requester", () => {
  it("stores the grant before closing the request, and an operator can read it", async () => {
    const n = await createNotification({
      type: "edit_request",
      title: "Edit 26J01-14",
      body: "Outside the shift window",
      createdBy: "operator",
      targetPersona: "gm",
      payload: {
        entryKey,
        date: "2026-10-01",
        batchId: "26J01-14",
        stageId: "visual",
        size: "14Fr",
      },
    });
    const res = await approve(n.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grant.entryKey).toBe(entryKey);
    expect(body.notification.status).toBe("approved");

    const stored = await getSharedStateStore().read("default", "edit-grants");
    expect((stored.record as { grants: { entryKey: string }[] }).grants.map((g) => g.entryKey)).toEqual([entryKey]);

    const seen = await readShared(new NextRequest("http://localhost/api/shared-state?kind=edit-grants", {
      headers: await authedHeaders("operator"),
    }));
    expect(seen.status).toBe(200);
    const grants = (await seen.json()).record.grants as { entryKey: string }[];
    expect(grants.map((g) => g.entryKey)).toEqual([entryKey]);
  });

  it("leaves the request open when the grant table is missing", async () => {
    __setSharedStateStoreForTests({
      read: async () => ({ source: "db", record: null }),
      replace: async () => { throw new SharedStateUnavailableError(); },
      importIfEmpty: async () => { throw new SharedStateUnavailableError(); },
      mergeGrant: async () => { throw new SharedStateUnavailableError(); },
      revokeGrant: async () => { throw new SharedStateUnavailableError(); },
    });
    const n = await createNotification({
      type: "edit_request",
      title: "Edit 26J01-14",
      body: "Outside the shift window",
      createdBy: "operator",
      targetPersona: "gm",
      payload: {
        entryKey,
        date: "2026-10-01",
        batchId: "26J01-14",
        stageId: "visual",
        size: "14Fr",
      },
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await approve(n.id);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain("20261031140000_plant_shared_state.sql");
      const still = await listNotifications({ status: "all" });
      expect(still.find((row) => row.id === n.id)?.status).toBe("open");
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
