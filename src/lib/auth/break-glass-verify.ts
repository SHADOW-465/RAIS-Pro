// Node-only password check for the break-glass login. Keep this out of the
// Edge proxy (it pulls node:crypto through users.ts).

import { verifyPassword } from "./users";
import {
  breakGlassUsername,
  constantTimeEqual,
  isBreakGlassEnabled,
  normalizeIdentity,
} from "./break-glass";

export async function verifyBreakGlassCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  if (!isBreakGlassEnabled()) return false;
  const userOk = constantTimeEqual(normalizeIdentity(username), normalizeIdentity(breakGlassUsername()));
  const hash = (process.env.GM_PASSWORD_LOGIN_HASH ?? "").trim();
  const passOk = await verifyPassword(password, hash);
  return userOk && passOk;
}
