-- =============================================================================
-- 0015 — Role model: structural role + capabilities
-- =============================================================================
-- Splits the one overloaded `members.role` column into the two questions it was
-- answering at once.
--
-- `role` keeps the ordered, mutually exclusive answer — member < executive <
-- admin — and gains a CHECK constraint, so it stops being free text.
--
-- `capabilities` is new: a TEXT[] of unordered grants (evaluator, scheduler,
-- instructor, assignor, mentor) that say what a person has been asked to do,
-- independently of where they sit. A member can be an evaluator; so can an
-- executive.
--
-- Why the split had to happen before `evaluator` could reach a policy. With one
-- ordered field there is no way to write "a member, but also an evaluator"
-- without inventing a rung for every combination — member, evaluator,
-- executive-who-evaluates, and so on — and each new rung multiplies through
-- every USING clause in the schema. So 0006 wrote the evaluator check into
-- netlify/functions/evaluations.ts instead and said so in its header. This file
-- is that header's promise being kept: with capabilities in their own column,
-- `has_capability(auth.uid(), 'evaluator')` is one function and the policy is
-- one line.
--
-- ## Migration path for existing rows
--
-- There are none, and that is enforced rather than assumed. The preflight guard
-- in 0001 refuses to start on a database that already carries this schema
-- without the baseline stamp, so this chain only ever runs against an empty
-- database or against one it built itself. Every statement below is written to
-- be correct on a populated table anyway — the UPDATE folds `official` into
-- `member`, and the constraints are added after it — but on the databases this
-- chain is allowed to touch that UPDATE matches zero rows. It is here so the
-- file is honest about the ordering, not because there is data to rescue.
--
-- ## What an adopter can rename without writing SQL
--
-- Capability slugs are NOT enumerated here. `members.capabilities` is
-- constrained on shape only — lowercase identifiers, no duplicates, no NULLs —
-- and `has_capability()` compares whatever string it is handed. Adding,
-- dropping or renaming a capability is therefore a change to `lib/roles.ts` and
-- nothing more.
--
-- The one exception is a slug this file writes down by hand, and there is
-- exactly one: `evaluator`, in `evaluations_select_capability_or_subject` at the
-- bottom. `__tests__/unit/config/roles.test.ts` parses this file and fails if a
-- slug it names has left `lib/roles.ts`, so renaming it breaks a test that
-- points here instead of silently un-matching the policy.
--
-- Structural roles are enumerated, in `members_role_structural_check`. Renaming
-- one of those three is a migration. The same test asserts that constraint and
-- `STRUCTURAL_ROLES` in `lib/roles.ts` list the same three names.
--
-- Display labels live in `lib/roles.ts` behind `NEXT_PUBLIC_ROLE_LABEL_*` and
-- `NEXT_PUBLIC_CAPABILITY_LABEL_*`. Nothing in SQL reads them.
--
-- Re-run safety: ADD COLUMN IF NOT EXISTS, catalog-checked constraints,
-- CREATE OR REPLACE on every function, DROP-then-CREATE on every policy.
-- =============================================================================

-- --- capabilities column ----------------------------------------------------

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS capabilities TEXT[] NOT NULL DEFAULT '{}'::text[];

-- GIN so `capabilities @> ARRAY['evaluator']` and the `= ANY` form in
-- has_capability() can use an index once the roster is large enough for the
-- planner to bother.
CREATE INDEX IF NOT EXISTS idx_members_capabilities
  ON public.members USING GIN (capabilities);

-- --- fold `official` into `member` -----------------------------------------
--
-- No-op on the empty database this chain targets; see the header. Runs before
-- the CHECK constraint is added so the ordering is right if it ever does match.
UPDATE public.members
   SET role = 'member'
 WHERE role IS NOT NULL
   AND LOWER(role) = 'official';

ALTER TABLE public.members ALTER COLUMN role SET DEFAULT 'member';

-- --- constraints ------------------------------------------------------------
--
-- Structural role is now a closed set. Case-insensitive to match the helpers,
-- which have always compared with LOWER() because some older rows were seeded
-- 'Admin'. NULL is permitted and means "not yet assigned"; the helpers below
-- read NULL as no privilege, and `members.role` has a DEFAULT so the normal
-- insert path never produces one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_role_structural_check'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_role_structural_check
      CHECK (role IS NULL OR LOWER(role) IN ('member', 'executive', 'admin'));
  END IF;
END $$;

-- Shape of a capability list. Deliberately not a membership test: the set of
-- capabilities is the adopter's to change in config, and pinning it here would
-- turn every such change into a migration. What is pinned is that the array
-- holds distinct lowercase identifiers and no NULLs, so `has_capability` can
-- compare without normalising and a typo cannot masquerade as a grant.
--
-- A CHECK cannot contain a subquery, and counting distinct elements needs one,
-- so the test lives in an IMMUTABLE function. `search_path` is pinned for the
-- usual reason; `unnest` and `cardinality` are resolved out of pg_catalog.
CREATE OR REPLACE FUNCTION public.capabilities_are_wellformed(caps TEXT[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT caps IS NULL
      OR (
        array_position(caps, NULL) IS NULL
        AND cardinality(caps) = (SELECT COUNT(DISTINCT c) FROM unnest(caps) AS c)
        AND NOT EXISTS (
          SELECT 1 FROM unnest(caps) AS c WHERE c !~ '^[a-z][a-z0-9_]{0,63}$'
        )
      );
$$;

COMMENT ON FUNCTION public.capabilities_are_wellformed(TEXT[]) IS
  'Shape check for members.capabilities: distinct lowercase identifiers, no NULL elements. Deliberately does not enumerate the valid capabilities — that list is config, see lib/roles.ts.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_capabilities_shape_check'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_capabilities_shape_check
      CHECK (public.capabilities_are_wellformed(capabilities));
  END IF;
END $$;

-- --- helpers ----------------------------------------------------------------
--
-- `structural_role()` is now the only function in the schema that reads
-- `members.role`. `is_admin` and `is_admin_or_executive` keep their names,
-- signatures and meaning — policies in 0004 through 0013 call them and must
-- keep working — but are re-expressed on top of it, so there is one place that
-- knows how the column is spelled and one place to change when the ladder does.
--
-- SECURITY DEFINER is load-bearing for the same reason it was in 0003: a policy
-- on `members` has to consult `members` to answer, and a plain function would
-- recurse into the policy that called it.

CREATE OR REPLACE FUNCTION public.structural_role(uid uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT LOWER(m.role)
    FROM public.members m
   WHERE m.user_id = uid
   LIMIT 1;
$$;

-- Both helpers must return false — not NULL — for a caller with no members row
-- and for anon, whose auth.uid() is NULL. `structural_role()` returns NULL in
-- both cases, and `NULL = 'admin'` and `NULL IN (...)` are both NULL, which a
-- USING clause treats as "no row" but which would poison a NOT. The 0003
-- versions got this for free from EXISTS; expressing them over a value instead
-- means coalescing at the boundary rather than relying on the caller's context.
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(public.structural_role(uid) = 'admin', false);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_executive(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(public.structural_role(uid) IN ('admin', 'executive'), false);
$$;

-- The capability side. Generic over the slug on purpose — see the header on
-- what an adopter can rename.
CREATE OR REPLACE FUNCTION public.has_capability(uid uuid, cap text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.members m,
           LATERAL unnest(m.capabilities) AS c
     WHERE m.user_id = uid
       AND LOWER(c) = LOWER(cap)
  );
$$;

REVOKE ALL ON FUNCTION public.structural_role(uuid)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_capability(uuid, text)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(uuid)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_or_executive(uuid)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capabilities_are_wellformed(TEXT[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.structural_role(uuid)       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_capability(uuid, text)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_executive(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.capabilities_are_wellformed(TEXT[]) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.structural_role(uuid) IS
  'The caller''s rung on the org ladder, lowercased: member | executive | admin, or NULL when they have no members row. The only function in this schema that reads members.role.';
COMMENT ON FUNCTION public.has_capability(uuid, text) IS
  'True when the auth user holds the named capability grant. Generic over the slug — the capability list is config (lib/roles.ts), not schema.';
COMMENT ON FUNCTION public.is_admin(uuid) IS
  'True when the caller''s structural role is admin. Now a thin wrapper over structural_role(); kept because policies in 0004-0013 call it by name.';
COMMENT ON FUNCTION public.is_admin_or_executive(uuid) IS
  'True when the caller''s structural role is admin or executive. Thin wrapper over structural_role(); kept because policies in 0004-0013 call it by name.';

-- --- privilege-column guard, extended --------------------------------------
--
-- Supersedes the version in 0004. `capabilities` is now exactly as privileged
-- as `role` — a member who could append 'evaluator' to their own array would
-- read every evaluation in the association, which is the hole this whole file
-- exists to close — so it gets the same treatment.
--
-- `authenticated` still holds no UPDATE grant on `members` at all (0002), so
-- this remains the second barrier rather than the only one. It is here for the
-- day someone re-grants UPDATE to support self-service profile editing, which
-- is exactly the change that would otherwise reopen it.
--
-- Still deliberately NOT security definer: it reads `current_user` to tell a
-- PostgREST session from the trusted write path, and inside a definer function
-- `current_user` is the owner, which disables the check entirely.
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
    -- Claiming a row for yourself is fine; claiming it at a privileged role, or
    -- with any capability already attached, is the same escalation as the
    -- UPDATE one step earlier.
    IF NEW.role IS NOT NULL AND LOWER(NEW.role) IN ('admin', 'executive') THEN
      RAISE EXCEPTION
        'members.role cannot be set to % by the member themselves', NEW.role
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.capabilities IS NOT NULL AND cardinality(NEW.capabilities) > 0 THEN
      RAISE EXCEPTION 'members.capabilities can only be granted by an admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'members.role can only be changed by an admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.capabilities IS DISTINCT FROM OLD.capabilities THEN
    RAISE EXCEPTION 'members.capabilities can only be changed by an admin'
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
  'Backstop for members RLS: an unprivileged PostgREST session cannot set or change members.role, members.capabilities or members.user_id, even on its own row. service_role and the migration owner are unaffected.';

-- --- evaluations, re-keyed on the capability -------------------------------
--
-- 0006 gave read access to the subject of the evaluation plus admins and
-- executives, and left evaluators to netlify/functions/evaluations.ts, which
-- gates every read on ['admin','executive','evaluator'] holding the service-role
-- key. That function check is real and it works. What it is not is enforceable:
-- it is one `if` in one file, and anything that reaches PostgREST with an
-- evaluator's JWT instead of going through the function — a direct query, a
-- second client, a future page that reads the table straight — got the 0006
-- answer, which is "not your evaluation, no row".
--
-- Now both layers say the same thing and the database is the one that means it.
DROP POLICY IF EXISTS "evaluations_select_subject_or_admin" ON public.evaluations;
DROP POLICY IF EXISTS "evaluations_select_capability_or_subject" ON public.evaluations;
CREATE POLICY "evaluations_select_capability_or_subject" ON public.evaluations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = evaluations.member_id
        AND m.user_id = auth.uid()
    )
    OR public.is_admin_or_executive(auth.uid())
    OR public.has_capability(auth.uid(), 'evaluator')
  );

-- Writing an evaluation is the evaluator's job by definition, so the create
-- side follows the same union the function layer uses. Editing and deleting
-- stay with admins and executives: an evaluator amending their own report is a
-- narrower rule than a policy can express without joining the author back to
-- the caller, and netlify/functions/evaluations.ts already implements exactly
-- that carve-out. This policy is the floor, not the whole rule.
DROP POLICY IF EXISTS "evaluations_insert_capability_or_admin" ON public.evaluations;
CREATE POLICY "evaluations_insert_capability_or_admin" ON public.evaluations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_executive(auth.uid())
    OR public.has_capability(auth.uid(), 'evaluator')
  );

-- Unchanged from 0006, restated so this file shows the whole matrix rather than
-- half of it. FOR ALL would otherwise still be covering INSERT alongside the
-- policy above, which is fine — permissive policies OR — but reading 0006 and
-- 0015 side by side should not require working that out.
DROP POLICY IF EXISTS "evaluations_modify_admin" ON public.evaluations;
CREATE POLICY "evaluations_modify_admin" ON public.evaluations
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_executive(auth.uid()))
  WITH CHECK (public.is_admin_or_executive(auth.uid()));

-- --- documentation ----------------------------------------------------------

COMMENT ON COLUMN public.members.role IS
  'Structural role: member | executive | admin. Ordered, mutually exclusive, one per person. Constrained by members_role_structural_check and read only through public.structural_role(). ''official'' is the retired spelling of ''member''.';
COMMENT ON COLUMN public.members.capabilities IS
  'Capability grants: unordered lowercase slugs (evaluator, scheduler, instructor, assignor, mentor) saying what this person may do, independently of their structural role. The valid set is config — lib/roles.ts — not schema; only the shape is constrained here.';
COMMENT ON TABLE public.evaluations IS
  'Officiating evaluation reports. Readable by the official evaluated, by admins and executives, and by anyone holding the evaluator capability. Writable by admins, executives and evaluators; editable and deletable by admins and executives.';
