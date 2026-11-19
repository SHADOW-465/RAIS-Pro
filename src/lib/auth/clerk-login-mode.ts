// Invitation accept links land on /login with a Clerk ticket. SignIn cannot
// complete that ticket; SignUp can. Either a ticket or an explicit sign_up
// status is enough to pick the SignUp branch.

export type ClerkLoginMode = "sign-in" | "sign-up";

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function isClerkSignUpTicket(params: {
  __clerk_ticket?: string | string[];
  __clerk_status?: string | string[];
}): boolean {
  const ticket = first(params.__clerk_ticket)?.trim();
  if (ticket) return true;
  const status = first(params.__clerk_status)?.trim();
  return status === "sign_up";
}

export function clerkLoginMode(params: {
  __clerk_ticket?: string | string[];
  __clerk_status?: string | string[];
}): ClerkLoginMode {
  return isClerkSignUpTicket(params) ? "sign-up" : "sign-in";
}
