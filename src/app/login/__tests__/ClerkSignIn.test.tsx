import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clerkLoginMode } from "@/lib/auth/clerk-login-mode";

const signIn = jest.fn((props: { path?: string; fallbackRedirectUrl?: string }) => (
  <div data-testid="clerk-signin" data-path={props.path} data-redirect={props.fallbackRedirectUrl} />
));
const signUp = jest.fn((props: { path?: string; fallbackRedirectUrl?: string }) => (
  <div data-testid="clerk-signup" data-path={props.path} data-redirect={props.fallbackRedirectUrl} />
));

jest.mock("@clerk/nextjs", () => ({
  SignIn: (props: { path?: string; fallbackRedirectUrl?: string }) => signIn(props),
  SignUp: (props: { path?: string; fallbackRedirectUrl?: string }) => signUp(props),
}));

import { ClerkSignIn } from "../ClerkSignIn";

describe("ClerkSignIn ticket branch", () => {
  beforeEach(() => {
    signIn.mockClear();
    signUp.mockClear();
  });

  test("renders SignUp when the login URL carries an invitation ticket", () => {
    const mode = clerkLoginMode({
      __clerk_ticket: "tick_dummy",
      __clerk_status: "sign_up",
    });
    expect(mode).toBe("sign-up");
    const html = renderToStaticMarkup(<ClerkSignIn mode={mode} />);
    expect(html).toContain("data-testid=\"clerk-signup\"");
    expect(html).toContain("Accept invitation");
    expect(html).not.toContain("data-testid=\"clerk-signin\"");
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: "path",
        path: "/login",
        fallbackRedirectUrl: "/",
      }),
    );
  });

  test("renders SignIn for a normal /login visit", () => {
    const html = renderToStaticMarkup(<ClerkSignIn mode={clerkLoginMode({})} />);
    expect(html).toContain("data-testid=\"clerk-signin\"");
    expect(html).toContain("Sign in");
    expect(html).not.toContain("data-testid=\"clerk-signup\"");
  });
});
