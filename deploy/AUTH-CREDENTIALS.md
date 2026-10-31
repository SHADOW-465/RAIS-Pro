# MOID preset login credentials

These are the **fixed logins** on `/login` — the same three roles as the topbar
persona switcher. **Auth is always on** (no env flag required).

> **Change passwords before any real plant deploy** (via env overrides below).  
> Defaults are for pilot / shared Vercel only.

## Accounts

| Role (select on login page) | Username (fixed) | Default password   |
|-----------------------------|------------------|--------------------|
| General Manager (GM)        | `gm`             | `moid-gm`          |
| Owner                       | `owner`          | `moid-owner`       |
| Data Entry Operator         | `operator`       | `moid-operator`    |

## Optional overrides (`.env.local` / `deploy/.env` / Vercel)

```bash
# Optional — custom session HMAC (built-in default is used if unset)
# MOID_AUTH_SECRET=use-openssl-rand-hex-32

# Optional — override pilot passwords
# MOID_AUTH_PASSWORD_GM=...
# MOID_AUTH_PASSWORD_OWNER=...
# MOID_AUTH_PASSWORD_OPERATOR=...
# Or one shared password for all three:
# MOID_AUTH_PASSWORD=your-shared-password
```

## How to sign in

1. Open any page — you are redirected to `/login` until signed in.
2. Select **GM**, **Owner**, or **Operator**.
3. Enter that role’s password.
4. Sign out from the topbar account menu when finished.

## Local override (optional)

Copy this file to `deploy/AUTH-CREDENTIALS.local.md` for plant-specific
passwords. That path is gitignored — do not commit real production secrets.
