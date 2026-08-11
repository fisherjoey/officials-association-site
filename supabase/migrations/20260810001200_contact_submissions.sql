-- =============================================================================
-- 0012 — contact_submissions
-- =============================================================================
-- Contact form messages from the public website, with the sender's name and
-- address, so reads are admin-only.
--
-- Attachments are stored as a JSONB array from the outset. The old chain
-- created a single `attachment_url TEXT` and migrated it to `attachment_urls`
-- JSONB in a later file; there is nothing to migrate in a schema that never had
-- the singular column.
--
-- Re-run safety: IF NOT EXISTS on table and indexes, DROP-then-CREATE on policies
-- and triggers.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  sender_name       TEXT NOT NULL,
  sender_email      TEXT NOT NULL,

  category          TEXT NOT NULL,
  category_label    TEXT NOT NULL,
  subject           TEXT NOT NULL,
  message           TEXT NOT NULL,

  recipient_email   TEXT NOT NULL,

  attachment_urls   JSONB,

  status            TEXT DEFAULT 'new' NOT NULL,
  notes             TEXT,

  email_history_id  UUID REFERENCES public.email_history(id)
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at   ON public.contact_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status       ON public.contact_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_category     ON public.contact_submissions(category);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_sender_email ON public.contact_submissions(sender_email);

DROP TRIGGER IF EXISTS trg_contact_submissions_updated_at ON public.contact_submissions;
CREATE TRIGGER trg_contact_submissions_updated_at
  BEFORE UPDATE ON public.contact_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- No INSERT or DELETE for signed-in users: messages arrive through the public
-- contact form on service_role, and nothing in the portal removes them.
REVOKE ALL ON TABLE public.contact_submissions FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.contact_submissions TO authenticated;
GRANT ALL ON TABLE public.contact_submissions TO service_role;

DROP POLICY IF EXISTS "Service role can insert contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Service role can view contact submissions"   ON public.contact_submissions;
DROP POLICY IF EXISTS "Service role can update contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Admins can view contact submissions"         ON public.contact_submissions;
DROP POLICY IF EXISTS "Admins can update contact submissions"       ON public.contact_submissions;

DROP POLICY IF EXISTS "contact_submissions_select_admin" ON public.contact_submissions;
CREATE POLICY "contact_submissions_select_admin" ON public.contact_submissions
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "contact_submissions_update_admin" ON public.contact_submissions;
CREATE POLICY "contact_submissions_update_admin" ON public.contact_submissions
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

COMMENT ON TABLE public.contact_submissions IS
  'Contact form messages from the public website. Readable and amendable by admins; inserted through service_role.';
COMMENT ON COLUMN public.contact_submissions.attachment_urls IS
  'JSONB array of attachment links.';
COMMENT ON COLUMN public.contact_submissions.status IS
  'Expected values: new | read | responded | archived.';
