process.env.MOID_STORE = "memory";

import { NextRequest } from "next/server";
import { POST } from "../route";
import { sessionCookie } from "@/__tests__/fixtures/auth";
import { getStores } from "@/lib/store";
import { resolveRole, __resetRoleStoreForTests, __seedRoleForTests, type RoleRecord } from "@/lib/auth/roles";
import { scopeEventsForRole } from "@/lib/access/scope";
import { resolveScope } from "@/lib/analytics/scope";
import { plantTotalsFromEvents } from "@/lib/analytics/plant-totals";
import { loadPlantRegistry } from "@/lib/analytics/load-plant-registry";
import { __resetTotalsWarnForTests } from "@/lib/analytics/server-totals";

const role = (over: Partial<RoleRecord>): RoleRecord => ({
  roleId: "supervisor.moulding",
  label: "Supervisor — Moulding",
  title: "",
  initial: "S",
  homeHref: "/data-entry",
  navAllow: ["dashboard", "data-entry"],
  capabilities: { write: true, approve: false, configure: false, eraseLedger: false },
  grants: [],
  scope: { stages: [] },
  builtin: false,
  active: true,
  sortOrder: 30,
  ...over,
});

async function post(body: unknown, as: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (as) headers.Cookie = await sessionCookie(as as "gm");
  return POST(new NextRequest("http://localhost/api/analytics/totals", { method: "POST", headers, body: JSON.stringify(body) }));
}

beforeEach(() => {
  __resetRoleStoreForTests();
  __resetTotalsWarnForTests();
});

test("an unauthenticated caller gets 401", async () => {
  expect((await post({ span: "all" }, null)).status).toBe(401);
});

test("memory store warns and returns the same headlines as the selectors", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const { events: store } = getStores();
  await store.append([
    {
      eventType: "production",
      eventId: "e-totals-visual",
      stageId: "visual",
      quantity: 100,
      unit: "pcs",
      batchNo: "T1",
      size: null,
      occurredOn: { start: "2026-07-04", end: "2026-07-04" },
      recordedAt: "2026-07-04T01:00:00.000Z",
      source: { channel: "direct-entry", extractedBy: "direct-entry" },
    },
    {
      eventType: "inspection",
      eventId: "e-totals-rej",
      stageId: "visual",
      disposition: "rejected",
      quantity: 6,
      unit: "pcs",
      batchNo: "T1",
      size: null,
      occurredOn: { start: "2026-07-04", end: "2026-07-04" },
      recordedAt: "2026-07-04T01:00:00.000Z",
      source: { channel: "direct-entry", extractedBy: "direct-entry" },
    },
  ] as never);

  const res = await post({ span: "all", datePreset: "all", grain: "month" }, "gm");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.source).toBe("js");

  const actor = await resolveRole("gm");
  const { registry, policy } = await loadPlantRegistry(actor?.navAllow ?? []);
  const loaded = await getStores().events.effective();
  const scoped = scopeEventsForRole(loaded, actor?.scope);
  const scope = resolveScope(scoped, { grain: "month", datePreset: "all", dateFrom: "", dateTo: "" }, policy);
  const expected = plantTotalsFromEvents(scoped, scope, registry);
  expect(body.headlines).toEqual(expected.headlines);
  expect(body.stages.map((s: { stageId: string; checked: number; rejected: number }) => [s.stageId, s.checked, s.rejected])).toEqual(
    expected.stages.map((s) => [s.stageId, s.checked, s.rejected]),
  );
  expect(warn.mock.calls.some((c) => String(c[0]).includes("JS aggregation"))).toBe(true);
  warn.mockRestore();
});

test("a role without the cost screen does not receive a COPQ figure", async () => {
  __seedRoleForTests(role({ navAllow: ["dashboard", "data-entry"] }));
  const res = await post({ span: "all", datePreset: "all", grain: "month" }, "supervisor.moulding");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.headlines.copq).toBeNull();
  expect(body.source).toBe("js");
});
