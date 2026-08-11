-- =============================================================================
-- 0009 — email_history
-- =============================================================================
-- Append-only record of everything the system has emailed. Rows hold recipient
-- addresses and full message bodies, so reading is admin-only and there is no
-- UPDATE or DELETE policy at all: RLS denies what it does not permit, which
-- makes the table immutable to every role except service_role.
--
-- Re-run safety: IF NOT EXISTS on table and indexes, DROP-then-CREATE on
-- policies. Empty-database-only, like the rest of the
-- chain, and enforced there — see the preflight guard in 0001.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  email_type        TEXT NOT NULL,

  sent_by_id        UUID,
  sent_by_email     TEXT,

  subject           TEXT NOT NULL,
  html_content      TEXT,
  recipient_count   INTEGER NOT NULL DEFAULT 1,
  recipient_list    JSONB,

  recipient_groups  JSONB,
  rank_filter       TEXT,

  recipient_email   TEXT,
  recipient_name    TEXT,

  status            TEXT DEFAULT 'sent' NOT NULL,
  error_message     TEXT,

  metadata          JSONB DEFAULT '{}'::jsonb
);

-- Deleting the sender must not block on their sent mail, and the history has to
-- survive them, so the attribution is severed instead. The catalog check is only
-- so that re-applying this chain to the same database is a no-op; ADD CONSTRAINT
-- has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_history_sent_by_id_fkey'
      AND conrelid = 'public.email_history'::regclass
  ) THEN
    ALTER TABLE public.email_history
      ADD CONSTRAINT email_history_sent_by_id_fkey
      FOREIGN KEY (sent_by_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_history_created_at      ON public.email_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_history_email_type      ON public.email_history(email_type);
CREATE INDEX IF NOT EXISTS idx_email_history_sent_by_email   ON public.email_history(sent_by_email);
CREATE INDEX IF NOT EXISTS idx_email_history_recipient_email ON public.email_history(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_history_status          ON public.email_history(status);
CREATE INDEX IF NOT EXISTS idx_email_history_type_date       ON public.email_history(email_type, created_at DESC);

ALTER TABLE public.email_history ENABLE ROW LEVEL SECURITY;

-- SELECT only, even before RLS narrows it to admins: the immutability of this
-- table should not rest on the absence of a policy alone.
REVOKE ALL ON TABLE public.email_history FROM anon, authenticated;
GRANT SELECT ON TABLE public.email_history TO authenticated;
GRANT ALL ON TABLE public.email_history TO service_role;

DROP POLICY IF EXISTS "Service role can insert email history" ON public.email_history;
DROP POLICY IF EXISTS "Service role can view email history"   ON public.email_history;
DROP POLICY IF EXISTS "Admins can view email history"         ON public.email_history;

DROP POLICY IF EXISTS "email_history_select_admin" ON public.email_history;
CREATE POLICY "email_history_select_admin" ON public.email_history
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

COMMENT ON TABLE public.email_history IS
  'Append-only record of sent email, for audit. Readable by admins; writable only through service_role.';
COMMENT ON COLUMN public.email_history.email_type IS
  'Expected values: bulk | invite | password_reset | welcome.';
