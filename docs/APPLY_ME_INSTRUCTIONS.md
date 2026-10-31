# Applying the 2026-10-31 database update (non-technical guide)

This update has two parts, done **in this order, with a check in between**:

1. **Add the new tables** the app now uses (CAPA register, shared plant
   settings, live-update counter, faster totals). Safe to do at any time.
2. **Lock the database** so only the MOID server can read or write plant data.
   This must wait until the server has its master key (Part B below), or the
   app stops working.

Until Part 1 is done the app keeps working with the old database; the new
features just say they are "not set up yet". Until Part 2 is done, the
database stays as open as it is today.

You need access to the **Supabase** project and the **Vercel** project.
Allow about 30 minutes. Do not skip the check in step C.

---

## Step A — Add the new tables (Supabase)

1. Make sure you are in the **same** Supabase project the app uses. In Vercel →
   your MOID project → **Settings → Environment Variables**, find
   `NEXT_PUBLIC_SUPABASE_URL` (looks like `https://abcdxyz.supabase.co`) and
   note the part before `.supabase.co`. In Supabase, open **Project Settings →
   API** and check the **Project URL** has the identical first part. If it
   differs, stop: you are in the wrong project.
2. In Supabase open **SQL Editor → New query**.
3. Open the file `supabase/APPLY_ME_2026-10-31.sql` from the repository,
   select everything (Ctrl+A), copy, paste into the editor.
4. Press **Run**. Supabase may warn about "destructive operations" (the script
   re-creates some rules so it can be run twice). Confirm.

**Expected result:** no red error, and a table listing the database tables.
(`anon_can_read` showing `true` is normal at this point.)

If you get a red error, nothing was changed (the script is all-or-nothing).
Copy the full message and send it to the developer. Running the script a
second time is harmless.

## Step B — Give the app its master key (Vercel)

1. In Supabase open **Project Settings → API → Project API keys**. Find the
   key named **`service_role`** (the secret one, **not** `anon`). Click
   **Reveal** and **Copy**.
2. In Vercel → your MOID project → **Settings → Environment Variables** add:

   | Name | Value | Environments |
   |---|---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key you just copied | **Production** (tick Preview too if you use previews) |

   Change nothing else.
3. Go to **Deployments**, open the latest one, choose **⋯ → Redeploy** (untick
   "use existing build cache" if offered). If this branch has not been
   deployed yet, deploy it. Wait until it says **Ready**.

The key is a master key. Never paste it into chat, email or a document. It is
only ever typed into Vercel.

## Step C — Confirm the app is using the master key (important)

1. Open the live site and **sign in**.
2. In the same browser tab, change the address to
   `https://<your-site>/api/health` (add `/api/health` after the site address)
   and press Enter.
3. You should see text containing:

   `"dbKey":"service_role"` and `"lockdownSafe":true`

   - If it says `"dbKey":"anon"` the app is **not** using the master key yet.
     Re-check step B (exact name `SUPABASE_SERVICE_ROLE_KEY`, set for
     Production, app redeployed after saving). **Do not go on to step D.**
   - The page never shows the key itself.
4. Also click through the Dashboard and Audit pages; data should look as before.

## Step D — Lock the database (Supabase)

Only after step C shows `"dbKey":"service_role"`:

1. Supabase → **SQL Editor → New query**.
2. Open `supabase/APPLY_ME_2026-10-31_LOCKDOWN.sql`, copy everything, paste,
   **Run**. Confirm any "destructive operations" prompt.

**Expected result:** no red error, and a table where every row has `rls_on` =
`true` and `anon_can_read` = `false`.

## Step E — Quick test

1. Reload the site, sign in, open the **Dashboard**, **Audit**, **CAPA** and
   **Settings** pages. Data should be there and there should be no "not set up
   yet" or database error message.
2. Make one small change you can safely undo (for example edit and save a
   CAPA note) and reload to see it stuck.

## Step F — If something breaks: undo the lockdown

If the app shows database errors or empty screens after step D:

1. Supabase → **SQL Editor → New query**.
2. Open `supabase/ROLLBACK_LOCKDOWN_2026-10-31.sql`, copy everything, paste,
   **Run**. This gives the database back the same open access it had before
   step D. No data is lost or changed. Reload the site; it should work again.
3. Tell the developer what you saw (a screenshot of `/api/health` and of the
   error helps). Do not run the lockdown again until `/api/health` says
   `"dbKey":"service_role"`.

---

### What this update changes, in plain words

- After step D, nobody with only the public website address or the public
  "anon" key can read or change plant data (including the plant's user table);
  only the MOID server can.
- The browser never talks to the database directly; everything goes through
  the app's own server, which is why the master key lives only in Vercel.
- Sign-in, passwords and roles are **not** changed by this update.
- Browser tabs left open across a deploy recover on their own: a stale tab
  reloads itself once if a page file has gone, and shows a **"New version -
  reload"** bar when a newer deploy exists.
