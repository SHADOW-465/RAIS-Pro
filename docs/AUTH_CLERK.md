# Clerk sign-in for MOID

MOID can use [Clerk](https://clerk.com) so staff sign in with **Continue with Google** or an email code, instead of a shared username and password. This is for the hosted app (currently `https://rais-pro.vercel.app`). It is not suitable for an offline plant install — Clerk needs the internet.

The current username/password login is still the default, and stays available as an emergency fallback.

## How it works

Clerk only answers **"who is this person"**. MOID still decides **what they can do**.

1. The user signs in at `/login` with Google or an email code.
2. The server looks up that Clerk user and reads their **private metadata**:

   ```json
   {
     "moid": {
       "username": "r.kumar",
       "role": "gm"
     }
   }
   ```

3. That `role` is passed through the same `resolveRole` / active checks used today (`plant_roles`). The same `Actor` shape (`username`, `role`, `roleLabel`, `capabilities`) is handed to every API route, so capability checks, the audit trail, and `MOID_ADMIN_USERS` (matched on `username`) do not change.
4. If there is no mapping, or the role is missing or switched off, the user is not a MOID session. Pages send them to `/no-access`. APIs return 401.

The mapping lives in **private metadata** as the source of truth. Invitations carry the same `{ moid: { username, role } }` object in **invitation public metadata** (backend-only writable). When the person accepts, Clerk copies that onto the user; on the first authenticated request MOID promotes it into private metadata. Unsafe metadata is ignored. The user cannot edit either of these bags themselves.

A short in-memory cache (60 seconds) avoids calling Clerk on every API request during a burst of saves.

## Admin vs GM

`admin` is a built-in role, separate from `gm`. It has every capability the GM has, plus `manageAccess` — the right to invite people, change their role, and revoke access. A GM does not get `manageAccess`, and a plant-created role cannot tick it on in Settings → Roles. `resolveRole("admin")` still works if `plant_roles` has no admin row.

Admin is not added to `MOID_ADMIN_USERS`. That env var still gates the destructive purge / schema-reset tools only, and is independent of this role.

In Clerk mode, an admin opens **Settings → Access** to:

- see Clerk users (email, MOID username, role, status, last sign-in)
- invite someone by email, username and role
- change a role, revoke access (clears the mapping and signs them out) or re-grant it
- see pending invitations and revoke one

Invitation links must redirect to an **absolute** `/login` URL (the origin of the Access request, or `APP_URL` / `NEXT_PUBLIC_APP_URL`, or `https://rais-pro.vercel.app`). A relative `/login` is resolved by Clerk against `accounts.dev` and the invitee gets a 404. `/login` renders Clerk `<SignIn>` normally, and `<SignUp>` when the URL has `__clerk_ticket` and/or `__clerk_status=sign_up`, so the ticket can be completed with Google or email. After accept, the first authenticated request still promotes invitation `public_metadata.moid` into private metadata, and the invitee lands in the app with their role (not `/no-access`). If `/api/auth/me` races the Clerk cookie, the client retries once and only then may send them to `/no-access`. That page re-checks on load and has a **Check again** button; a mapped account is sent to their home. Unmapped Clerk results are cached at most 5 seconds, and Access changes invalidate that user in the same instance.

## Break-glass GM password

Clerk (Google or email) stays the normal sign-in. When `GM_PASSWORD_LOGIN_USER` and `GM_PASSWORD_LOGIN_HASH` are both set, `/login` also shows a low-key **Sign in with username** option for exactly that one account. The role is always `gm` (not admin, no `manageAccess`). The password is a scrypt hash in the env, not a value in the repo or the plant database — do not change the Supabase `gm` row for this. Other legacy logins (operator, owner, named plant users) stay off in Clerk mode.

Sessions use the same signed `moid_session` / `moid_nav` cookies as legacy login. `MOID_AUTH_SECRET` must be set in the host environment so those cookies cannot be forged with the public built-in default. Sign-out clears both the cookies and any Clerk session.


You cannot revoke or demote yourself if you are the last remaining admin.

The plant ledger audit trail is for production data, not login administration; access changes are not written there (that would need a new table). Use Settings → Access as the record of who holds which role.


## Switching the provider

| `AUTH_PROVIDER` | Keys present | What happens |
|---|---|---|
| unset / `legacy` | anything | Existing username/password login. This is the default. |
| `clerk` | both keys set | Clerk sign-in at `/login`. Password login is refused. |
| `clerk` | a key missing | Falls back to the legacy login automatically, so a missing key cannot take the app down. |

Required environment variables (Vercel or `.env.local` — never commit real values):

```
AUTH_PROVIDER=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...   # or pk_live_... in production
CLERK_SECRET_KEY=sk_test_...                    # or sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/login
```

To fall back in an emergency, set `AUTH_PROVIDER=legacy` (or remove it) and redeploy. Existing named users and preset passwords still work.

## How to set a user's role

Do this in the [Clerk Dashboard](https://dashboard.clerk.com) for the **MOID** application, or via Clerk's Backend API. The user cannot set this themselves.

1. Open **Users**, find the person (or accept their invite first).
2. Open **Private metadata** (not public, not unsafe).
3. Set:

   ```json
   {
     "moid": {
       "username": "showmik",
       "role": "gm"
     }
   }
   ```

`username` is the name MOID will write on the ledger and match against `MOID_ADMIN_USERS`. It does not have to be the Gmail address.

`role` must be a live MOID role id: `gm`, `owner`, `operator`, or a role id created under Settings → Roles (for example `supervisor.moulding`). If the role is later switched off, they lose access until it is turned back on or the metadata is pointed at another live role.

A metadata change can take up to a minute to show (the server caches the mapping for 60 seconds). Signing out and back in always picks up the new value.

## Go-live steps

A Clerk **development** application named **MOID** already exists in the connected Clerk account (`app_3MKjq3Bl3l296b3ar8tqXwXblwG`). Development mode is fine for a Vercel preview. Production (`rais-pro.vercel.app` or a real domain) needs Clerk's production instance — see the catch at the end.

### 1. Confirm the Clerk app

In the Clerk Dashboard, for the MOID development instance:

- Turn on **Google** and **Email code** (email/password can stay off).
- Set sign-ups to **Restricted** (invite only). Without this, anyone with a Gmail account could sign in and land on `/no-access` — still wrong, because they would have an account.
- Set the sign-in URL to `/login`.
- Add the preview and production origins under **Allowed origins / redirect URLs**, for example `http://localhost:3000`, the Vercel preview URL, and later the production domain.

### 2. Put the keys in Vercel (preview first)

In the Vercel project, add the five variables above to the **Preview** environment. Paste them in the Vercel dashboard. Do not put them in chat, in the repo, or in a commit.

Leave production on the legacy login until the preview is proven.

### 3. Invite the two Gmail accounts and set their roles

1. In Clerk, **Invite** each Gmail address.
2. Each person accepts the invite and signs in once (Google is enough).
3. In **Users**, set that person's **private metadata** as above, with the username and role you want them to have (for example `role: "gm"`).
4. They sign out and back in, and should land on their role's home screen — not `/no-access`.

No SQL migration is required.

### 4. Flip the preview to Clerk

Set `AUTH_PROVIDER=clerk` on the Preview environment and redeploy the `feat/clerk-auth` branch (or merge to a preview). Open the preview `/login`, confirm the Google button, and walk through both accounts.

### 5. Production, only after that works

- Clerk **production** mode needs a domain you own (for example `moid.yourcompany.com`). `rais-pro.vercel.app` can only run Clerk's development mode, which shows a "Development mode" badge and is not meant for real plant users.
- Create Clerk's production instance, add **your own** Google Cloud OAuth credentials, copy the `pk_live_` / `sk_live_` keys into Vercel's **Production** env, set `AUTH_PROVIDER=clerk`, and deploy.
- Budget roughly ₹800–₹1,000 a year for a domain.

Until a custom domain is ready, keep production on the legacy login.

## What this branch does not change

- No business logic, batch conversion, or `.impeccable/config.json`.
- No SQL migration. Named users in `plant_users` stay as they are; Clerk mapping does not write to that table.
- Logout still goes through the account menu. In Clerk mode it also signs the person out of Clerk, so the next person on a shared terminal is not still signed in to Google.
