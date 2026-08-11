-- =============================================================================
-- 0004 — RLS for members and member_activities
-- =============================================================================
-- A member sees their own row. Admins and executives see everyone. Nobody else
-- sees anything, and an anonymous caller — anyone holding the anon key, which
-- ships in the browser bundle — reads no row at all.
--
-- For anon that is enforced one level below RLS: 0002 revokes SELECT on
-- `members` from anon, so PostgREST refuses the request outright with 42501
-- `permission denied for table members` rather than returning an empty array.
-- Both outcomes disclose nothing, but the distinction matters when reading this
-- file against the acceptance criterion "anon returns zero rows" — anon never
-- reaches a policy, because it has no privilege to evaluate one against. No
-- browser code path reads `members` anyway; lib/supabase.ts exposes only the
-- public_* tables and `officials` to the browser client.
--
-- Each CREATE POLICY is preceded by DROP POLICY IF EXISTS on the same name, so
-- re-applying this chain to the same database replaces the policy instead of
-- erroring. Migrations run in one transaction, so the drop and the tightened
-- create land together and the table is never briefly open.
--
-- The drops that name LEGACY policies are defence in depth and nothing more.
-- Postgres ORs permissive policies together, so a surviving
-- `Public read access for members USING (true)` would not compete with
-- `members_select_self_or_admin` — it would win outright, with `pg_policies`
-- showing both so the tightened policy looked like it took. That state is not
-- reachable: the preflight guard in 0001 refuses to start on a database holding
-- the old schema, so this file only ever runs where those names do not exist.
-- The drops are kept because they cost nothing and keep 0004 through 0012
-- uniform, not because anything here depends on them.
--
-- "Own row" is not the whole story on a table that stores its own access control
-- in a column. RLS is row-granular and has nothing to say about which columns a
-- permitted write may touch, so a self-update policy on `members` is also a
-- self-promotion policy: set `role = 'admin'` on your own row and `is_admin()`
-- answers true everywhere for the rest of the session's life. Two things stop
-- that here. `authenticated` holds no write grant on `members` at all (0002) —
-- every write in this application is a Netlify Function on `service_role` — and
-- the guard trigger at the bottom of this file rejects any change to `role` or
-- `user_id` made by an unprivileged caller, so the hole does not reopen if a
-- later change hands the grant back for self-service profile editing.
--
-- Re-run safety: DROP POLICY IF EXISTS before every CREATE POLICY.
-- Empty-database-only, like the rest of the chain, and enforced there — see the
-- preflight guard in 0001.
-- =============================================================================

-- --- members ---------------------------------------------------------------

-- Superseded permissive policies from the old schema. No-ops: 0001 will not let
-- the chain start on a database that has them. Kept as defence in depth.
DROP POLICY IF EXISTS "Public read access for members"     ON public.members;
DROP POLICY IF EXISTS "Users can insert own member record" ON public.members;
DROP POLICY IF EXISTS "Users can update own member record" ON public.members;
DROP POLICY IF EXISTS "Admins can delete members"          ON public.members;

DROP POLICY IF EXISTS "members_select_self_or_admin" ON public.members;
CREATE POLICY "members_select_self_or_admin" ON public.members
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_executive(auth.uid()));

DROP POLICY IF EXISTS "members_insert_self_or_admin" ON public.members;
CREATE POLICY "members_insert_self_or_admin" ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin_or_executive(auth.uid()));

DROP POLICY IF EXISTS "members_update_self_or_admin" ON public.members;
CREATE POLICY "members_update_self_or_admin" ON public.members
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_executive(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin_or_executive(auth.uid()));

-- Deletion is admin-only; an executive can edit the roster but not erase it.
DROP POLICY IF EXISTS "members_delete_admin" ON public.members;
CREATE POLICY "members_delete_admin" ON public.members
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- --- member_activities -----------------------------------------------------

DROP POLICY IF EXISTS "Public read access for member_activities"   ON public.member_activities;
DROP POLICY IF EXISTS "Public insert access for member_activities" ON public.member_activities;
DROP POLICY IF EXISTS "Public update access for member_activities" ON public.member_activities;
DROP POLICY IF EXISTS "Public delete access for member_activities" ON public.member_activities;

DROP POLICY IF EXISTS "member_activities_select_self_or_admin" ON public.member_activities;
CREATE POLICY "member_activities_select_self_or_admin" ON public.member_activities
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_activities.member_id
        AND (m.user_id = auth.uid() OR public.is_admin_or_executive(auth.uid()))
    )
  );

-- Writes are an administrative act: a member cannot log their own attendance.
DROP POLICY IF EXISTS "member_activities_modify_admin" ON public.member_activities;
CREATE POLICY "member_activities_modify_admin" ON public.member_activities
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_executive(auth.uid()))
  WITH CHECK (public.is_admin_or_executive(auth.uid()));

-- --- privilege-column guard ------------------------------------------------
-- The backstop described in the header. `role` decides what every other policy
-- in the schema will let this user do and `user_id` decides whose row it is, so
-- neither may be set by the person the row is about. Everything else on the row
-- — name, phone, address, emergency contact — is theirs to edit.
--
-- Deliberately NOT security definer: the function reads `current_user` to tell a
-- browser session apart from the trusted write path, and inside a definer
-- function `current_user` is the owner, which would disable the check entirely.
-- It needs no elevated rights of its own; `is_admin` is already definer and is
-- executable by `authenticated`.
--
-- `service_role` bypasses RLS but NOT triggers, so the early return matters: the
-- admin UI changes member roles through netlify/functions/members.ts, and that
-- path has to keep working. Same for `postgres` running this chain.
CREATE OR REPLACE FUNCTION public.members_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Trusted callers: service_role, the migration owner, anything not PostgREST.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- An admin editing the roster from a browser session is legitimate.
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Claiming a row for yourself is fine; claiming it at a privileged role is
    -- the same escalation as the UPDATE, one step earlier.
    IF NEW.role IS NOT NULL AND LOWER(NEW.role) IN ('admin', 'executive') THEN
      RAISE EXCEPTION
        'members.role cannot be set to % by the member themselves', NEW.role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'members.role can only be changed by an admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'members.user_id can only be changed by an admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.members_guard_privileged_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_members_guard_privileged_columns ON public.members;
CREATE TRIGGER trg_members_guard_privileged_columns
  BEFORE INSERT OR UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.members_guard_privileged_columns();

COMMENT ON FUNCTION public.members_guard_privileged_columns() IS
  'Backstop for members RLS: an unprivileged PostgREST session cannot set or change members.role or members.user_id, even on its own row. service_role and the migration owner are unaffected.';
