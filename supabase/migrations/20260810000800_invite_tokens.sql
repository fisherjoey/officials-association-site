-- =============================================================================
-- 0008 — invite_tokens
-- =============================================================================
-- Long-lived proxy invites. Clicking one mints a fresh Supabase magic link, so
-- the token itself never expires — it is spent, not timed out.
--
-- "At most one unspent invite per email" is enforced by a partial unique index,
-- not a UNIQUE(email, used_at) constraint. Postgres treats NULLs as distinct, so
-- the old constraint permitted unlimited (email, NULL) rows and enforced nothing.
--
-- Re-run safety: IF NOT EXISTS on table and indexes, DROP-then-CREATE on
-- policies. Empty-database-only, like the rest of the
-- chain, and enforced there — see the preflight guard in 0001.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.invite_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT UNIQUE NOT NULL,
  email       TEXT NOT NULL,
  name        TEXT,
  role        TEXT DEFAULT 'official',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  UUID,
  used_at     TIMESTAMPTZ
);

-- Deleting the admin who issued an invite must not fail or take the invite with
-- it, so the attribution is severed instead. The catalog check is only so that
-- re-applying this chain to the same database is a no-op; ADD CONSTRAINT has no
-- IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invite_tokens_created_by_fkey'
      AND conrelid = 'public.invite_tokens'::regclass
  ) THEN
    ALTER TABLE public.invite_tokens
      ADD CONSTRAINT invite_tokens_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Superseded: UNIQUE (email, used_at) enforced nothing, because NULL != NULL.
ALTER TABLE public.invite_tokens
  DROP CONSTRAINT IF EXISTS unique_active_token_per_email;

CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON public.invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_email ON public.invite_tokens(email);

CREATE UNIQUE INDEX IF NOT EXISTS invite_tokens_active_email_idx
  ON public.invite_tokens(email)
  WHERE used_at IS NULL;

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.invite_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invite_tokens TO authenticated;
GRANT ALL ON TABLE public.invite_tokens TO service_role;

DROP POLICY IF EXISTS "Admins can manage invite tokens" ON public.invite_tokens;
DROP POLICY IF EXISTS "Service role full access"        ON public.invite_tokens;

DROP POLICY IF EXISTS "invite_tokens_admin_all" ON public.invite_tokens;
CREATE POLICY "invite_tokens_admin_all" ON public.invite_tokens
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

COMMENT ON TABLE public.invite_tokens IS
  'Proxy invite tokens. Spent rather than expired; at most one unspent token per email.';
