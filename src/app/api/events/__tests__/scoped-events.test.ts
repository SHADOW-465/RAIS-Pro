// The scope has to hold at the endpoint, not only in the helper it calls.
//
// This is the difference the whole phase turns on: a screen a role cannot open
// is tidiness, because /api/events hands the browser everything anyway. A scope
// that is only applied in the browser is the same thing wearing a different
// hat. So these tests go through the route.
process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { GET } from "../route";
import { GET as POLICY_GET } from "../../policy/route";
import { sessionCookie } from "@/__tests__/fixtures/auth";
import { __resetRoleStoreForTests, __seedRoleForTests, type RoleRecord } from "@/lib/auth/roles";
import { getStores } from "@/lib/store";
import { DEFAULT_POLICY } from "@/core/policy/policy";
import { defaultEventRange } from "@/lib/store/event-page";

const role = (over: Partial<RoleRecord>): RoleRecord => ({
  roleId: "supervisor.moulding",
  label: "Supervisor — Moulding",
  title: "",
  initial: "S",
  homeHref: "/data-entry",
  navAllow: ["dashboard", "data-entry", "hold"],
  capabilities: { write: true, approve: false, configure: false, eraseLedger: false },
  grants: [],
  scope: { stages: [] },
  builtin: false,
  active: true,
  sortOrder: 30,
  ...over,
});

const call = async (handler: (r: NextRequest) => Promise<Response>, url: string, as: string | null) => {
  const headers: Record<string, string> = {};
  if (as) headers["Cookie"] = await sessionCookie(as as "gm");
  return handler(new NextRequest(url, { headers }));
};

const events = (as: string | null) => call(GET, "http://localhost/api/events?span=all", as);

/** Two stages' worth of production, plus one row belonging to neither. */
async function seedLedger() {
  const { events: store } = getStores();
  await store.append([
    {
      eventType: "production",
      eventId: "e-visual",
      stageId: "visual",
      quantity: 10,
      unit: "pcs",
      batchNo: null,
      size: null,
      occurredOn: { start: "2026-01-05", end: "2026-01-05" },
      source: { channel: "direct-entry", extractedBy: "direct-entry" },
    },
    {
      eventType: "production",
      eventId: "e-balloon",
      stageId: "balloon",
      quantity: 20,
      unit: "pcs",
      batchNo: null,
      size: null,
      occurredOn: { start: "2026-01-05", end: "2026-01-05" },
      source: { channel: "direct-entry", extractedBy: "direct-entry" },
    },
  ] as never);
}

// The ledger is append-only and content-addressed, so re-seeding the same two
// rows in every test is a no-op after the first — `append` dedups by eventId.
beforeEach(() => __resetRoleStoreForTests());

describe("/api/events is no longer role-blind", () => {
  test("an unauthenticated caller gets 401 rather than the ledger", async () => {
    expect((await events(null)).status).toBe(401);
  });

  test("an unscoped role still receives everything — nobody's view narrows", async () => {
    await seedLedger();
    const body = await (await events("gm")).json();
    const ids = body.events.map((e: { eventId: string }) => e.eventId);
    expect(ids).toEqual(expect.arrayContaining(["e-visual", "e-balloon"]));
    expect(body.scopedToStages).toBeUndefined();
  });

  test("a stage-scoped role never receives the other line's rows", async () => {
    await seedLedger();
    __seedRoleForTests(role({ scope: { stages: ["visual"] } }));

    const body = await (await events("supervisor.moulding")).json();
    const ids = body.events.map((e: { eventId: string }) => e.eventId);
    expect(ids).toContain("e-visual");
    expect(ids).not.toContain("e-balloon");
    // Said out loud in the payload: a scoped number that does not announce
    // itself is a wrong number.
    expect(body.scopedToStages).toEqual(["visual"]);
  });

  // A client that can ask for a wider scope than its role has is not a scope.
  test("the scope comes from the session's role, never from the request", async () => {
    await seedLedger();
    __seedRoleForTests(role({ scope: { stages: ["visual"] } }));

    const res = await call(
      GET,
      "http://localhost/api/events?span=all&stageId=balloon",
      "supervisor.moulding",
    );
    const ids = (await res.json()).events.map((e: { eventId: string }) => e.eventId);
    expect(ids).not.toContain("e-balloon");
  });
});

describe("/api/policy withholds plant money", () => {
  test("a role with the Cost screen receives the unit cost", async () => {
    const body = await (await call(POLICY_GET, "http://localhost/api/policy", "gm")).json();
    expect(body.policy.unitCostInr).toBe(DEFAULT_POLICY.unitCostInr);
    expect(body.costRedacted).toBeUndefined();
  });

  test("a role without it receives no unit cost, and is told so", async () => {
    __seedRoleForTests(role({ navAllow: ["dashboard", "data-entry", "hold"] }));
    const body = await (
      await call(POLICY_GET, "http://localhost/api/policy", "supervisor.moulding")
    ).json();
    expect(body.policy.unitCostInr).toBe(0);
    expect(body.costRedacted).toBe(true);
  });

  // Withholding today's figure while handing over every previous one is not
  // withholding it.
  test("past versions and the baseline are redacted too", async () => {
    __seedRoleForTests(role({ navAllow: ["dashboard"] }));
    const body = await (
      await call(POLICY_GET, "http://localhost/api/policy", "supervisor.moulding")
    ).json();
    for (const v of body.history ?? []) expect(v.policy.unitCostInr).toBe(0);
    if (body.baseline) expect(body.baseline.policy.unitCostInr).toBe(0);
  });

  test("an unauthenticated caller gets nothing at all", async () => {
    expect((await call(POLICY_GET, "http://localhost/api/policy", null)).status).toBe(401);
  });
});

describe("GET /api/events?bounds=1", () => {
  test("an unauthenticated caller gets 401", async () => {
    expect((await call(GET, "http://localhost/api/events?bounds=1", null)).status).toBe(401);
  });

  test("returns the date ends of the caller's ledger and not the rows", async () => {
    await seedLedger();
    const res = await call(GET, "http://localhost/api/events?bounds=1", "gm");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toBeUndefined();
    expect(body.boundsUnavailable).toBeUndefined();
    expect(typeof body.min).toBe("string");
    expect(typeof body.max).toBe("string");
    // The memory store is process-global, so other suites may have appended
    // rows. The seeded day has to sit inside the ends, not be the only day.
    expect(body.min <= "2026-01-05").toBe(true);
    expect(body.max >= "2026-01-05").toBe(true);
    expect(typeof body.maxEnd).toBe("string");
    expect(body.maxEnd >= "2026-01-05").toBe(true);
  });
});

describe("GET /api/events date window and pages", () => {
  test("omitting dates returns the last 30 UTC days and not an older row", async () => {
    const { events: store } = getStores();
    const window = defaultEventRange(new Date());
    await store.append([
      {
        eventType: "production",
        eventId: "e-step-e-inside",
        stageId: "visual",
        quantity: 1,
        unit: "pcs",
        batchNo: null,
        size: null,
        occurredOn: { start: window.to, end: window.to },
        source: { channel: "direct-entry", extractedBy: "direct-entry" },
      },
      {
        eventType: "production",
        eventId: "e-step-e-outside",
        stageId: "visual",
        quantity: 1,
        unit: "pcs",
        batchNo: null,
        size: null,
        occurredOn: { start: "2000-01-01", end: "2000-01-01" },
        source: { channel: "direct-entry", extractedBy: "direct-entry" },
      },
    ] as never);
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const url = new URL("http://localhost/api/events");
      if (cursor) url.searchParams.set("cursor", cursor);
      const body = await (await call(GET, url.toString(), "gm")).json();
      if (i === 0) {
        expect(body.from).toBe(window.from);
        expect(body.to).toBe(window.to);
      }
      for (const e of body.events as { eventId: string }[]) ids.push(e.eventId);
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(ids).toContain("e-step-e-inside");
    expect(ids).not.toContain("e-step-e-outside");
    if (window.from > "2026-01-05" || window.to < "2026-01-05") {
      expect(ids).not.toContain("e-visual");
    }
  });

  test("span=all with an explicit range uses the range", async () => {
    await seedLedger();
    const body = await (
      await call(GET, "http://localhost/api/events?span=all&from=2026-01-05&to=2026-01-05", "gm")
    ).json();
    const ids = body.events.map((e: { eventId: string }) => e.eventId);
    expect(ids).toContain("e-visual");
    expect(ids).not.toContain("e-step-e-outside");
    expect(body.from).toBe("2026-01-05");
    expect(body.to).toBe("2026-01-05");
  });

  test("limit and cursor walk the scoped ledger without a skip or a repeat", async () => {
    await seedLedger();
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5000; i++) {
      const url = new URL("http://localhost/api/events");
      url.searchParams.set("span", "all");
      url.searchParams.set("limit", "1");
      if (cursor) url.searchParams.set("cursor", cursor);
      const body = await (await call(GET, url.toString(), "gm")).json();
      expect(body.events.length).toBeLessThanOrEqual(1);
      for (const e of body.events) seen.push(e.eventId);
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(cursor).toBeNull();
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(["e-visual", "e-balloon"]));
  });

  test("a bad cursor is 400 and returns no rows", async () => {
    const res = await call(GET, "http://localhost/api/events?span=all&cursor=not-a-cursor", "gm");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.events).toBeUndefined();
  });
});
