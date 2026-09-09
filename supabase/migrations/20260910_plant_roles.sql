-- Roles as rows.
--
-- A role used to be a TypeScript union of exactly three values, which meant a
-- plant that wanted a Supervisor or a QA login needed a code change touching
-- twenty-odd files, the session token type, and the CHECK constraint below.
-- The capability model was never the problem — write / approve / configure /
-- eraseLedger is the right shape — only that its subjects were compiled in.
--
-- This table holds the same fields `PersonaDef` always had. `lib/auth/roles.ts`
-- reads it; `lib/auth/guard.ts` resolves a session's capabilities through it.
--
-- The three built-ins are seeded here AND kept in code (persona.ts). Code is
-- the fallback, not a duplicate source of truth: if this table is missing,
-- unreadable, or empty, a GM is still a GM and the app behaves exactly as it
-- did before this migration existed. A deploy can run without it.
--
-- `builtin` roles may be edited but never deleted — deleting the last role that
-- holds `configure` would leave nobody able to administer the plant, the same
-- failure the "last active GM" check in /api/users guards against.

CREATE TABLE IF NOT EXISTS plant_roles (
  company_id   text        NOT NULL,
  role_id      text        NOT NULL,
  label        text        NOT NULL,
  title        text        NOT NULL DEFAULT '',
  initial      text        NOT NULL DEFAULT '?',
  home_href    text        NOT NULL DEFAULT '/',
  -- Sidebar destinations (NavKey[]). Deny by omission, same rule as navAllow.
  nav_allow    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- { write, approve, configure, eraseLedger } — all booleans, absent = false.
  capabilities jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Every granted leaf id (lib/access/catalog.ts), nav_allow and capabilities
  -- included. Redundant with those two by construction — all three are written
  -- from one picker state — but it is the only home for grants that are neither
  -- a screen nor a capability bit, dashboard cards today. nav_allow and
  -- capabilities stay the columns the guard reads, so a role whose grants
  -- column is empty still authorizes exactly as it did.
  grants       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- Data scope: { "stages": ["visual", ...] }. Empty means the whole plant,
  -- which is what every role has always had. Unlike nav_allow this is not
  -- presentation — /api/events filters on it, so a scoped role's browser never
  -- receives another line's rows rather than merely not drawing them.
  scope        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  builtin      boolean     NOT NULL DEFAULT false,
  active       boolean     NOT NULL DEFAULT true,
  sort_order   int         NOT NULL DEFAULT 100,
  created_by   text        NOT NULL DEFAULT 'system',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, role_id)
);

CREATE INDEX IF NOT EXISTS plant_roles_active ON plant_roles (company_id, active);

ALTER TABLE plant_roles ENABLE ROW LEVEL SECURITY;

-- Service role only. Roles decide who may erase the ledger, so this is closer
-- to plant_users than to the catalog tables: never readable by anon.
DROP POLICY IF EXISTS plant_roles_service_role_all ON plant_roles;
CREATE POLICY plant_roles_service_role_all ON plant_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON plant_roles FROM anon, authenticated;
GRANT ALL ON plant_roles TO service_role;

-- Seed the built-ins, mirroring src/lib/persona.ts. ON CONFLICT DO NOTHING so
-- re-running the migration never overwrites a GM's edits to these rows.
-- `grants` is seeded as nav_allow + the capability leaves + every dashboard
-- card, which is the state these roles are in today: nobody's cards are
-- withheld, because until now there was no way to withhold one.
INSERT INTO plant_roles
  (company_id, role_id, label, title, initial, home_href, nav_allow, capabilities, grants, builtin, sort_order)
VALUES
  ('default', 'gm', 'General Manager (GM)', 'Full access', 'G', '/',
   '["dashboard","workbooks","data-entry","staging","stage","size","defect","hold","open-lots","spc","process-flow","copq","reports","capa","remedies","alerts","ask","audit","schema","settings"]'::jsonb,
   '{"write":true,"approve":true,"configure":true,"eraseLedger":true}'::jsonb,
   '["screen.dashboard","screen.workbooks","screen.data-entry","screen.staging","screen.stage","screen.size","screen.defect","screen.hold","screen.open-lots","screen.spc","screen.process-flow","screen.copq","screen.reports","screen.capa","screen.remedies","screen.alerts","screen.ask","screen.audit","screen.schema","screen.settings","permission.write","permission.approve","permission.configure","permission.eraseLedger","card.kpis","card.wip","card.trend","card.by-stage","card.pareto","card.stage-trend","card.heatmap","card.size-ytd","card.size-trend","card.copq","card.audit","card.quality","card.funnel","card.attention","card.ai-brief"]'::jsonb, true, 0),
  ('default', 'owner', 'Owner', 'View only', 'O', '/',
   '["dashboard","stage","size","defect","hold","open-lots","spc","process-flow","copq","reports","capa","remedies","alerts","ask"]'::jsonb,
   '{"write":false,"approve":false,"configure":false,"eraseLedger":false}'::jsonb,
   '["screen.dashboard","screen.stage","screen.size","screen.defect","screen.hold","screen.open-lots","screen.spc","screen.process-flow","screen.copq","screen.reports","screen.capa","screen.remedies","screen.alerts","screen.ask","card.kpis","card.wip","card.trend","card.by-stage","card.pareto","card.stage-trend","card.heatmap","card.size-ytd","card.size-trend","card.copq","card.audit","card.quality","card.funnel","card.attention","card.ai-brief"]'::jsonb, true, 10),
  ('default', 'operator', 'Data Entry Operator', 'Entry & review', 'D', '/data-entry',
   '["data-entry","staging","workbooks","dashboard","stage","size","defect","hold","open-lots","spc","process-flow","copq","reports","capa","remedies","alerts","ask","audit"]'::jsonb,
   '{"write":true,"approve":false,"configure":false,"eraseLedger":false}'::jsonb,
   '["screen.data-entry","screen.staging","screen.workbooks","screen.dashboard","screen.stage","screen.size","screen.defect","screen.hold","screen.open-lots","screen.spc","screen.process-flow","screen.copq","screen.reports","screen.capa","screen.remedies","screen.alerts","screen.ask","screen.audit","permission.write","card.kpis","card.wip","card.trend","card.by-stage","card.pareto","card.stage-trend","card.heatmap","card.size-ytd","card.size-trend","card.copq","card.audit","card.quality","card.funnel","card.attention","card.ai-brief"]'::jsonb, true, 20)
ON CONFLICT (company_id, role_id) DO NOTHING;

-- plant_users.role may now name any role in the table above, so the closed
-- three-value CHECK has to go. Deliberately NOT replaced with a foreign key:
-- deleting a role would then cascade into orphaning or blocking a login
-- mid-shift. Assignment is validated in the API (lib/auth/users.ts), and a
-- session naming a role that no longer exists is treated as signed-out.
ALTER TABLE plant_users DROP CONSTRAINT IF EXISTS plant_users_role_check;
