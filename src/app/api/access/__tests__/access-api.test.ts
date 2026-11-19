const KEYS = {
  AUTH_PROVIDER: "clerk",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dummy",
  CLERK_SECRET_KEY: "sk_test_dummy",
} as const;

for (const [k, v] of Object.entries(KEYS)) process.env[k] = v;

const auth = jest.fn();
const getUser = jest.fn();
const getUserList = jest.fn();
const updateUserMetadata = jest.fn();
const unbanUser = jest.fn();
const getInvitationList = jest.fn();
const createInvitation = jest.fn();
const revokeInvitation = jest.fn();
const getSessionList = jest.fn();
const revokeSession = jest.fn();

jest.mock("@clerk/nextjs/server", () => ({
  auth: () => auth(),
  clerkClient: async () => ({
    users: { getUser, getUserList, updateUserMetadata, unbanUser },
    invitations: { getInvitationList, createInvitation, revokeInvitation },
    sessions: { getSessionList, revokeSession },
  }),
}));

import { NextRequest } from "next/server";
import { GET as listUsers } from "../users/route";
import { PATCH as patchUser } from "../users/[id]/route";
import { POST as revokeUser } from "../users/[id]/revoke/route";
import { POST as createInvite, GET as listInvites } from "../invitations/route";
import { DELETE as deleteInvite } from "../invitations/[id]/route";
import { clearClerkActorCache } from "@/lib/auth/clerk-actor";
import { __resetRoleStoreForTests } from "@/lib/auth/roles";
import { LAST_ADMIN_ERROR } from "@/lib/auth/access-admin";

const adminUser = {
  id: "user_admin",
  emailAddresses: [{ emailAddress: "kumaarsk465@gmail.com", id: "idn_1" }],
  primaryEmailAddressId: "idn_1",
  privateMetadata: { moid: { username: "showmik", role: "admin" } },
  publicMetadata: {},
  lastSignInAt: Date.now(),
  banned: false,
};

const gmUser = {
  id: "user_gm",
  emailAddresses: [{ emailAddress: "gm@example.com", id: "idn_2" }],
  primaryEmailAddressId: "idn_2",
  privateMetadata: { moid: { username: "plant-gm", role: "gm" } },
  publicMetadata: {},
  lastSignInAt: Date.now(),
  banned: false,
};

const operatorUser = {
  id: "user_op",
  emailAddresses: [{ emailAddress: "op@example.com", id: "idn_3" }],
  primaryEmailAddressId: "idn_3",
  privateMetadata: { moid: { username: "r.kumar", role: "operator" } },
  publicMetadata: {},
  lastSignInAt: Date.now(),
  banned: false,
};

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
}

function signInAs(user: typeof adminUser) {
  auth.mockResolvedValue({ userId: user.id });
  getUser.mockResolvedValue(user);
}

beforeEach(() => {
  for (const [k, v] of Object.entries(KEYS)) process.env[k] = v;
  clearClerkActorCache();
  __resetRoleStoreForTests();
  auth.mockReset();
  getUser.mockReset();
  getUserList.mockReset();
  updateUserMetadata.mockReset().mockResolvedValue({});
  unbanUser.mockReset().mockResolvedValue({});
  getInvitationList.mockReset().mockResolvedValue({ data: [], totalCount: 0 });
  createInvitation.mockReset();
  revokeInvitation.mockReset().mockResolvedValue({});
  getSessionList.mockReset().mockResolvedValue({ data: [], totalCount: 0 });
  revokeSession.mockReset().mockResolvedValue({});
});

afterEach(() => {
  for (const k of Object.keys(KEYS)) delete process.env[k];
});

describe("access API authorization", () => {
  test("GM is 403", async () => {
    signInAs(gmUser);
    expect((await listUsers(req("/api/access/users"))).status).toBe(403);
    expect((await createInvite(req("/api/access/invitations", { method: "POST", body: { email: "a@b.co", username: "a", role: "operator" } }))).status).toBe(403);
    expect((await revokeUser(req("/api/access/users/user_op/revoke", { method: "POST" }), { params: Promise.resolve({ id: "user_op" }) })).status).toBe(403);
  });

  test("operator is 403", async () => {
    signInAs(operatorUser);
    expect((await listUsers(req("/api/access/users"))).status).toBe(403);
  });
});

describe("invite and revoke (Clerk mocked)", () => {
  test("admin can invite", async () => {
    signInAs(adminUser);
    createInvitation.mockResolvedValue({
      id: "inv_1",
      emailAddress: "new@example.com",
      publicMetadata: { moid: { username: "n.rao", role: "operator" } },
      status: "pending",
      createdAt: Date.now(),
    });
    const res = await createInvite(
      req("/api/access/invitations", {
        method: "POST",
        body: { email: "new@example.com", username: "n.rao", role: "operator" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invitation.email).toBe("new@example.com");
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: "new@example.com",
        publicMetadata: { moid: { username: "n.rao", role: "operator" } },
        redirectUrl: "http://localhost/login",
      }),
    );
  });

  test("invitation redirectUrl is absolute on the request origin, not /login", async () => {
    signInAs(adminUser);
    createInvitation.mockResolvedValue({
      id: "inv_2",
      emailAddress: "new@example.com",
      publicMetadata: { moid: { username: "n.rao", role: "operator" } },
      status: "pending",
      createdAt: Date.now(),
    });
    const incoming = new NextRequest("http://127.0.0.1/api/access/invitations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-host": "rais-pro.vercel.app",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ email: "new@example.com", username: "n.rao", role: "operator" }),
    });
    const res = await createInvite(incoming);
    expect(res.status).toBe(201);
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUrl: "https://rais-pro.vercel.app/login" }),
    );
    const redirectUrl = createInvitation.mock.calls[0][0].redirectUrl as string;
    expect(redirectUrl.startsWith("https://")).toBe(true);
    expect(redirectUrl).not.toBe("/login");
  });

  test("admin can revoke a pending invitation", async () => {
    signInAs(adminUser);
    const res = await deleteInvite(req("/api/access/invitations/inv_1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "inv_1" }),
    });
    expect(res.status).toBe(200);
    expect(revokeInvitation).toHaveBeenCalledWith("inv_1");
  });

  test("admin can revoke a user's access and their sessions", async () => {
    signInAs(adminUser);
    getUserList.mockResolvedValue({ data: [adminUser, operatorUser], totalCount: 2 });
    getSessionList.mockResolvedValue({
      data: [{ id: "sess_1", status: "active" }],
      totalCount: 1,
    });
    const res = await revokeUser(req("/api/access/users/user_op/revoke", { method: "POST" }), {
      params: Promise.resolve({ id: "user_op" }),
    });
    expect(res.status).toBe(200);
    expect(updateUserMetadata).toHaveBeenCalledWith(
      "user_op",
      expect.objectContaining({ privateMetadata: { moid: null } }),
    );
    expect(revokeSession).toHaveBeenCalledWith("sess_1");
  });

  test("the last admin cannot revoke themselves", async () => {
    signInAs(adminUser);
    getUserList.mockResolvedValue({ data: [adminUser, operatorUser], totalCount: 2 });
    const res = await revokeUser(req("/api/access/users/user_admin/revoke", { method: "POST" }), {
      params: Promise.resolve({ id: "user_admin" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe(LAST_ADMIN_ERROR);
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  test("the last admin cannot demote themselves", async () => {
    signInAs(adminUser);
    getUserList.mockResolvedValue({ data: [adminUser], totalCount: 1 });
    const res = await patchUser(
      req("/api/access/users/user_admin", { method: "PATCH", body: { role: "gm", username: "showmik" } }),
      { params: Promise.resolve({ id: "user_admin" }) },
    );
    expect(res.status).toBe(409);
  });
});
