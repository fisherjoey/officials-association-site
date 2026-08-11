-- =============================================================================
-- 0003 — Role helpers
-- =============================================================================
-- Every RLS policy in this schema that needs to know "is the caller privileged"
-- calls one of these two functions. Nothing else in the chain reads
-- `members.role` directly, so this file is the single place to change when the
-- role model grows capability flags.
--
-- SECURITY DEFINER is load-bearing: policies on `members` have to consult
-- `members` to answer the question, and a plain function would recurse into the
-- very policy that called it. `SET search_path = public` pins name resolution so
-- a caller cannot shadow `members` with a temp table.
--
-- The comparison is LOWER()'d because the application writes lowercase roles
-- while some older rows were seeded with 'Admin'. A case-sensitive check here is
-- a policy that silently matches nothing, which fails open on any table whose
-- only other policy is permissive.
--
-- Re-run safety: CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = uid
      AND LOWER(role) = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_executive(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = uid
      AND LOWER(role) IN ('admin', 'executive')
  );
$$;

-- An unauthenticated caller has auth.uid() = NULL. EXISTS over `user_id = NULL`
-- is false rather than NULL, so both helpers return false for anon — which is
-- what every USING clause downstream relies on.
REVOKE ALL ON FUNCTION public.is_admin(uuid)              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_or_executive(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_executive(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'True when the auth user owns a members row whose role is admin (case-insensitive). Extension point for the role model.';
COMMENT ON FUNCTION public.is_admin_or_executive(uuid) IS
  'True when the auth user owns a members row whose role is admin or executive (case-insensitive). Extension point for the role model.';
