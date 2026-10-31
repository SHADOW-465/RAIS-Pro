# Applying the 2026-10-31 database update (non-technical guide)

This update does two things: it adds the new tables the app now uses (CAPA
register, shared plant settings, live-update counter, faster totals), and it
**locks the database** so only the MOID server can read or write plant data.
Until the SQL below is run, the app keeps working with the old database; the
new features just say they are "not set up yet".

You need: access to the **Supabase** project and the **Vercel** project. Allow
about 20 minutes. Do the steps in this order.

---

## Step 1 — Set three things in Vercel (before touching the database)

Open Vercel → your MOID project → **Settings → Environment Variables**. Add or
check each of these for **Production** (tick Preview too if you use previews):

| Name | What to put | Where to get it |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | The **service_role** secret key | Supabase → Project Settings → **API** → *Project API keys* → `service_role` → Reveal → Copy |
| `MOID_AUTH_SECRET` | A long random text, at least 16 characters (40+ is better) | Make one up with a password manager ("generate 48 characters"). Keep a copy somewhere safe |
| `MOID_AUTH_PASSWORD_GM`, `MOID_AUTH_PASSWORD_OWNER`, `MOID_AUTH_PASSWORD_OPERATOR` | The password each shared login should use | Choose them. The old built-in passwords (`moid-gm` etc.) **no longer exist** — a role with no password set cannot sign in |

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` is a master key. Never paste it into chat, email
  or a document. It is only ever typed into Vercel.
- Changing `MOID_AUTH_SECRET` later signs everyone out. That is the way to
  force a log-out; do not change it otherwise.
- If you skip these, the app deliberately refuses to start and shows
  "Server misconfigured" with the name of the missing setting. That is the
  safe behaviour, not a bug.

Also turn on **Skew Protection**: Vercel → Settings → **Advanced** →
**Skew Protection** → Enable. This stops browser tabs that were open during an
update from breaking.

## Step 2 — Check you are in the same Supabase project the app uses

1. In Vercel → Settings → Environment Variables, find `NEXT_PUBLIC_SUPABASE_URL`.
   It looks like `https://abcdxyz.supabase.co`. Note the part before `.supabase.co`.
2. In Supabase, open the project you intend to change and look at its
   **Project URL** (Project Settings → API). The part before `.supabase.co`
   must be identical.

If they differ, stop — you are in the wrong project.

## Step 3 — Run the SQL

1. In Supabase, open **SQL Editor → New query**.
2. Open the file `supabase/APPLY_ME_2026-10-31.sql` from the repository, select
   everything (Ctrl+A), copy, and paste it into the editor.
3. Press **Run**. Supabase may warn about "destructive operations" (the script
   re-creates some rules so it can be run twice). Confirm.

**Expected result:** no red error message, and a table listing every table in
the database where `rls_on` is `true` and `anon_can_read` is `false` for every
row.

If you get a red error: nothing was changed (the script is all-or-nothing).
Copy the full message and send it to the developer. One known cause:
*"Table public.batch_conversions is missing"* means an older update was never
applied; send the message on.

Running the script a second time is harmless.

## Step 4 — Redeploy

Vercel → **Deployments** → open the latest one → **⋯ → Redeploy** (untick "use
existing build cache" if offered). Wait until it says **Ready**.

## Step 5 — Quick check

1. Open the site and sign in with a role and the password you set in Step 1.
2. Open the Dashboard and Audit pages; data should be there as before.
3. Open **CAPA** and **Settings**: they should load without a
   "not set up yet" message.

If sign-in says the server is misconfigured, a Step 1 setting is missing or
mistyped (check the exact names). If the dashboard is empty with a database
error, check that `SUPABASE_SERVICE_ROLE_KEY` is the **service_role** key and not
the anon key, then redeploy.

---

### What this update changes, in plain words

- Nobody with the public website address or the public "anon" key can read or
  change plant data or see password hashes any more; only the server can.
- The app no longer has built-in passwords or a built-in signing secret.
- The browser never talks to the database directly; everything goes through
  the app's own server.
