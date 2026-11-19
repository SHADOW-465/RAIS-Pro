import {
  homeAfterAccessGranted,
  isAuthExemptPath,
  shouldRedirectToNoAccess,
} from "../clerk-session-ui";

const base = {
  isLoaded: true,
  authReady: true,
  sessionChecked: true,
  isSignedIn: true,
  hasMappedUser: false,
  pathname: "/",
};

describe("shouldRedirectToNoAccess", () => {
  test("does not redirect until a post-session /api/auth/me has finished", () => {
    expect(shouldRedirectToNoAccess({ ...base, sessionChecked: false })).toBe(false);
    expect(shouldRedirectToNoAccess({ ...base, authReady: false })).toBe(false);
    expect(shouldRedirectToNoAccess({ ...base, isLoaded: false })).toBe(false);
  });

  test("redirects only after a confirmed post-session 401 (signed in, no mapping)", () => {
    expect(shouldRedirectToNoAccess(base)).toBe(true);
  });

  test("does not redirect a mapped user, a signed-out user, or someone already on /no-access or /login", () => {
    expect(shouldRedirectToNoAccess({ ...base, hasMappedUser: true })).toBe(false);
    expect(shouldRedirectToNoAccess({ ...base, isSignedIn: false })).toBe(false);
    expect(shouldRedirectToNoAccess({ ...base, pathname: "/no-access" })).toBe(false);
    expect(shouldRedirectToNoAccess({ ...base, pathname: "/login" })).toBe(false);
    expect(shouldRedirectToNoAccess({ ...base, pathname: "/login/sso-callback" })).toBe(false);
  });
});

describe("homeAfterAccessGranted", () => {
  test("uses a safe in-app home, otherwise /", () => {
    expect(homeAfterAccessGranted("/data-entry")).toBe("/data-entry");
    expect(homeAfterAccessGranted(undefined)).toBe("/");
    expect(homeAfterAccessGranted("//evil.example")).toBe("/");
  });
});

describe("isAuthExemptPath", () => {
  test("login and no-access are exempt", () => {
    expect(isAuthExemptPath("/login")).toBe(true);
    expect(isAuthExemptPath("/no-access")).toBe(true);
    expect(isAuthExemptPath("/settings")).toBe(false);
  });
});
