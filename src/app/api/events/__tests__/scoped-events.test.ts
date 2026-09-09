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

const events = (as: string | null) => call(GET, "http://localhost/api/events", as);

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
      "http://localhost/api/events?stageId=balloon",
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
