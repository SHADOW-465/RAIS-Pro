import type { NextRequest } from "next/server";
import { actorFrom, requireCapability } from "../guard";
import { createSessionToken, SESSION_COOKIE } from "../session";
import { resolveRole, __resetRoleStoreForTests, __seedRoleForTests, type RoleRecord } from "../roles";
import { ADMIN_ROLE_ID } from "@/lib/persona";
import {
  LAST_ADMIN_ERROR,
  adminCount,
  isLastAdmin,
  wouldRemoveLastAdmin,
  type MappedClerkUser,
} from "../access-admin";

const reqWith = (token?: string) =>
  ({
    cookies: { get: (name: string) => (name === SESSION_COOKIE && token ? { value: token } : undefined) },
  }) as unknown as NextRequest;

beforeEach(() => {
  delete process.env.AUTH_PROVIDER;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_SECRET_KEY;
  __resetRoleStoreForTests();
});

describe("admin vs gm capability split", () => {
  test("admin has every GM capability plus manageAccess", async () => {
    const admin = await actorFrom(
      reqWith(await createSessionToken({ username: "showmik", role: ADMIN_ROLE_ID })),
    );
    const gm = await actorFrom(reqWith(await createSessionToken({ username: "gm", role: "gm" })));
    expect(admin?.capabilities).toEqual({
      write: true,
      approve: true,
      configure: true,
      eraseLedger: true,
      manageAccess: true,
    });
    expect(gm?.capabilities).toEqual({
      write: true,
      approve: true,
      configure: true,
      eraseLedger: true,
      manageAccess: false,
    });
    expect((await requireCapability(reqWith(await createSessionToken({ username: "showmik", role: "admin" })), "manageAccess")).ok).toBe(true);
    const gmCap = await requireCapability(reqWith(await createSessionToken({ username: "gm", role: "gm" })), "manageAccess");
    expect(gmCap.ok).toBe(false);
    if (!gmCap.ok) expect(gmCap.response.status).toBe(403);
  });

  test("resolveRole returns built-in admin when plant_roles has no admin row", async () => {
    const role = await resolveRole("admin");
    expect(role?.roleId).toBe("admin");
    expect(role?.builtin).toBe(true);
    expect(role?.active).toBe(true);
    expect(role?.capabilities.manageAccess).toBe(true);
  });

  test("a plant role cannot grant itself manageAccess", async () => {
    const fake: RoleRecord = {
      roleId: "supervisor.moulding",
      label: "Supervisor",
      title: "",
      initial: "S",
      homeHref: "/",
      navAllow: ["dashboard"],
      capabilities: {
        write: true,
        approve: false,
        configure: true,
        eraseLedger: false,
        manageAccess: true,
      },
      grants: [],
      scope: { stages: [] },
      builtin: false,
      active: true,
      sortOrder: 40,
    };
    __seedRoleForTests(fake);
    const role = await resolveRole("supervisor.moulding");
    expect(role?.capabilities.manageAccess).toBe(false);
    const actor = await actorFrom(
      reqWith(await createSessionToken({ username: "s.patel", role: "supervisor.moulding" })),
    );
    expect(actor?.capabilities.manageAccess).toBe(false);
    const g = await requireCapability(
      reqWith(await createSessionToken({ username: "s.patel", role: "supervisor.moulding" })),
      "manageAccess",
    );
    expect(g.ok).toBe(false);
  });
});

describe("last-admin protection", () => {
  const admin = (id: string): MappedClerkUser => ({
    id,
    privateMetadata: { moid: { username: id, role: "admin" } },
  });
  const gm = (id: string): MappedClerkUser => ({
    id,
    privateMetadata: { moid: { username: id, role: "gm" } },
  });

  test("a lone admin cannot be revoked or demoted", () => {
    const users = [admin("user_1"), gm("user_2")];
    expect(adminCount(users)).toBe(1);
    expect(isLastAdmin(users, "user_1")).toBe(true);
    expect(wouldRemoveLastAdmin(users, "user_1", null)).toBe(true);
    expect(wouldRemoveLastAdmin(users, "user_1", "gm")).toBe(true);
    expect(wouldRemoveLastAdmin(users, "user_1", "admin")).toBe(false);
    expect(LAST_ADMIN_ERROR).toMatch(/last admin/i);
  });

  test("with two admins, one may be demoted or revoked", () => {
    const users = [admin("user_1"), admin("user_2")];
    expect(isLastAdmin(users, "user_1")).toBe(false);
    expect(wouldRemoveLastAdmin(users, "user_1", "gm")).toBe(false);
    expect(wouldRemoveLastAdmin(users, "user_1", null)).toBe(false);
  });

  test("a non-admin is never treated as the last admin", () => {
    const users = [admin("user_1"), gm("user_2")];
    expect(isLastAdmin(users, "user_2")).toBe(false);
    expect(wouldRemoveLastAdmin(users, "user_2", null)).toBe(false);
  });
});
