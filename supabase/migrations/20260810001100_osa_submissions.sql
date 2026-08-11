-- =============================================================================
-- 0011 — osa_submissions
-- =============================================================================
-- Officiating Services Agreement requests from organisations booking officials.
-- Rows carry a billing contact, an event contact and their phone numbers, so
-- reads are admin-only.
--
-- Multi-event support (submission_group_id, event_index, exhibition_games) was a
-- follow-up migration in the old chain; it is part of the table definition here.
--
-- Re-run safety: IF NOT EXISTS on table and indexes, DROP-then-CREATE on policies
-- and triggers.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.osa_submissions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at                  TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Requesting organisation
  organization_name           TEXT NOT NULL,

  -- Billing contact
  billing_contact_name        TEXT NOT NULL,
  billing_email               TEXT NOT NULL,
  billing_phone               TEXT,
  billing_address             TEXT,
  billing_city                TEXT,
  billing_province            TEXT,
  billing_postal_code         TEXT,

  -- Event contact
  event_contact_name          TEXT NOT NULL,
  event_contact_email         TEXT NOT NULL,
  event_contact_phone         TEXT,

  -- 'Exhibition Game(s)' | 'League' | 'Tournament'
  event_type                  TEXT NOT NULL,

  -- League
  league_name                 TEXT,
  league_start_date           DATE,
  league_end_date             DATE,
  league_days_of_week         TEXT,
  league_player_gender        TEXT,
  league_level_of_play        TEXT,

  -- Exhibition
  exhibition_game_location    TEXT,
  exhibition_number_of_games  INTEGER,
  exhibition_game_date        DATE,
  exhibition_start_time       TEXT,
  exhibition_player_gender    TEXT,
  exhibition_level_of_play    TEXT,
  exhibition_games            JSONB,

  -- Tournament
  tournament_name             TEXT,
  tournament_start_date       DATE,
  tournament_end_date         DATE,
  tournament_number_of_games  INTEGER,
  tournament_player_gender    TEXT,
  tournament_level_of_play    TEXT,

  -- Common
  discipline_policy           TEXT,
  agreement                   TEXT,

  -- Multi-event submissions
  submission_group_id         UUID,
  event_index                 INTEGER DEFAULT 1,

  -- Admin tracking
  status                      TEXT DEFAULT 'new' NOT NULL,
  notes                       TEXT,

  submission_time             TIMESTAMPTZ,
  emails_sent                 JSONB DEFAULT '{}'::jsonb,
  raw_form_data               JSONB
);

CREATE INDEX IF NOT EXISTS idx_osa_submissions_created_at   ON public.osa_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_osa_submissions_organization ON public.osa_submissions(organization_name);
CREATE INDEX IF NOT EXISTS idx_osa_submissions_event_type   ON public.osa_submissions(event_type);
CREATE INDEX IF NOT EXISTS idx_osa_submissions_status       ON public.osa_submissions(status);
CREATE INDEX IF NOT EXISTS idx_osa_submissions_contact      ON public.osa_submissions(event_contact_email);
CREATE INDEX IF NOT EXISTS idx_osa_submissions_status_date  ON public.osa_submissions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_osa_submissions_group_id     ON public.osa_submissions(submission_group_id);
CREATE INDEX IF NOT EXISTS idx_osa_submissions_group_order  ON public.osa_submissions(submission_group_id, event_index);

DROP TRIGGER IF EXISTS trg_osa_submissions_updated_at ON public.osa_submissions;
CREATE TRIGGER trg_osa_submissions_updated_at
  BEFORE UPDATE ON public.osa_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.osa_submissions ENABLE ROW LEVEL SECURITY;

-- No INSERT or DELETE for signed-in users: submissions arrive through the public
-- form on service_role, and nothing in the portal removes them.
REVOKE ALL ON TABLE public.osa_submissions FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.osa_submissions TO authenticated;
GRANT ALL ON TABLE public.osa_submissions TO service_role;

DROP POLICY IF EXISTS "Service role full access on osa_submissions" ON public.osa_submissions;
DROP POLICY IF EXISTS "Admins can view osa_submissions"             ON public.osa_submissions;
DROP POLICY IF EXISTS "Admins can update osa_submissions"           ON public.osa_submissions;

DROP POLICY IF EXISTS "osa_submissions_select_admin" ON public.osa_submissions;
CREATE POLICY "osa_submissions_select_admin" ON public.osa_submissions
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Admins amend status and notes; the submissions themselves arrive through the
-- public form, which posts via service_role.
DROP POLICY IF EXISTS "osa_submissions_update_admin" ON public.osa_submissions;
CREATE POLICY "osa_submissions_update_admin" ON public.osa_submissions
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

COMMENT ON TABLE public.osa_submissions IS
  'Officiating Services Agreement requests. Readable and amendable by admins; inserted through service_role.';
COMMENT ON COLUMN public.osa_submissions.submission_group_id IS
  'Links events submitted together on one form. NULL for single-event submissions.';
COMMENT ON COLUMN public.osa_submissions.event_index IS
  'Order within a multi-event submission. Always 1 for single-event submissions.';
COMMENT ON COLUMN public.osa_submissions.exhibition_games IS
  'Exhibition events with several games: array of {date, time, games}.';
COMMENT ON COLUMN public.osa_submissions.status IS
  'Expected values: new | contacted | scheduled | completed | cancelled.';
