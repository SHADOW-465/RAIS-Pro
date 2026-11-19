import {
  normalizeOrigin,
  originFromRequest,
  resolveInvitationRedirectUrl,
} from "../invitation-redirect";
import { clerkLoginMode, isClerkSignUpTicket } from "../clerk-login-mode";

describe("resolveInvitationRedirectUrl", () => {
  const empty = {};

  test("uses the request origin and always returns an absolute /login URL", () => {
    expect(resolveInvitationRedirectUrl("https://rais-pro.vercel.app", empty)).toBe(
      "https://rais-pro.vercel.app/login",
    );
    expect(resolveInvitationRedirectUrl("http://localhost:3000/", empty)).toBe(
      "http://localhost:3000/login",
    );
  });

  test("ignores a relative path (the bug that landed invitees on accounts.dev)", () => {
    expect(resolveInvitationRedirectUrl("/login", empty)).toBe("https://rais-pro.vercel.app/login");
  });

  test("falls back to APP_URL, then NEXT_PUBLIC_APP_URL, then production", () => {
    expect(
      resolveInvitationRedirectUrl(null, { APP_URL: "https://preview.example.com" }),
    ).toBe("https://preview.example.com/login");
    expect(
      resolveInvitationRedirectUrl(null, { NEXT_PUBLIC_APP_URL: "https://from-public.example" }),
    ).toBe("https://from-public.example/login");
    expect(
      resolveInvitationRedirectUrl(null, {
        APP_URL: "https://app.example",
        NEXT_PUBLIC_APP_URL: "https://ignored.example",
      }),
    ).toBe("https://app.example/login");
    expect(resolveInvitationRedirectUrl(null, empty)).toBe("https://rais-pro.vercel.app/login");
  });

  test("strips a path on APP_URL down to the origin", () => {
    expect(resolveInvitationRedirectUrl(null, { APP_URL: "https://moid.example/app" })).toBe(
      "https://moid.example/login",
    );
  });
});

describe("normalizeOrigin / originFromRequest", () => {
  test("rejects non-http schemes and empty values", () => {
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("/login")).toBeNull();
  });

  test("prefers x-forwarded-host on Vercel", () => {
    const headers = new Headers({
      "x-forwarded-host": "rais-pro.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(originFromRequest({ url: "http://127.0.0.1:3000/api/access/invitations", headers })).toBe(
      "https://rais-pro.vercel.app",
    );
  });

  test("falls back to the request URL origin", () => {
    const headers = new Headers();
    expect(originFromRequest({ url: "http://localhost:3000/api/access/invitations", headers })).toBe(
      "http://localhost:3000",
    );
  });
});

describe("clerk login mode (invitation ticket => SignUp)", () => {
  test("a ticket or sign_up status selects SignUp; otherwise SignIn", () => {
    expect(isClerkSignUpTicket({ __clerk_ticket: "tick_abc" })).toBe(true);
    expect(isClerkSignUpTicket({ __clerk_status: "sign_up" })).toBe(true);
    expect(isClerkSignUpTicket({ __clerk_ticket: "tick_abc", __clerk_status: "sign_up" })).toBe(true);
    expect(isClerkSignUpTicket({ __clerk_status: "sign_in" })).toBe(false);
    expect(isClerkSignUpTicket({})).toBe(false);
    expect(isClerkSignUpTicket({ __clerk_ticket: "  " })).toBe(false);
    expect(clerkLoginMode({ __clerk_ticket: "tick_abc" })).toBe("sign-up");
    expect(clerkLoginMode({})).toBe("sign-in");
  });
});
