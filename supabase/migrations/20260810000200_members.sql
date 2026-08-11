-- =============================================================================
-- 0002 — members, member_activities
-- =============================================================================
-- The member roster. Every row holds personal data: name, email, phone, home
-- address and an emergency contact. RLS is turned on in this file and NO policy
-- is created here, which under Postgres means deny-all for the `anon` and
-- `authenticated` roles. The read/write policies arrive in 0004, once the role
-- helpers of 0003 exist to express them.
--
-- The ordering matters and is the reason this chain was rebuilt: `user_id` is
-- the column every later policy in the schema keys off, so it is part of the
-- table definition rather than something bolted on afterwards.
--
-- `service_role` bypasses RLS entirely; the Netlify Functions are the write
-- path and authorise callers themselves (see netlify/functions/_shared/handler).
--
-- Re-run safety: IF NOT EXISTS everywhere; the FK is added behind a catalog
-- check. Empty-database-only, like the rest of the
-- chain, and enforced there — see the preflight guard in 0001.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.members (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Supabase Auth linkage. Nullable: a member can be on the roster before they
  -- have ever signed in, and the FK below nulls this out when the auth user is
  -- deleted rather than orphaning or cascading away the roster row.
  user_id                  UUID UNIQUE,

  -- Legacy Netlify Identity id, kept so historical rows stay resolvable.
  netlify_user_id          TEXT UNIQUE,

  -- Core profile
  name                     TEXT NOT NULL,
  email                    TEXT UNIQUE NOT NULL,
  phone                    TEXT,
  certification_level      TEXT,
  rank                     INTEGER,
  status                   TEXT DEFAULT 'active',
  role                     TEXT DEFAULT 'official',

  -- Contact details
  address                  TEXT,
  city                     TEXT,
  province                 TEXT,
  postal_code              TEXT,
  emergency_contact_name   TEXT,
  emergency_contact_phone  TEXT,

  -- Free-form per-association fields
  custom_fields            JSONB DEFAULT '{}'::jsonb,
  notes                    TEXT,

  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Deleting an auth user must not delete the roster row or fail outright, so the
-- link is severed instead. The catalog check is only so that re-applying this
-- chain to the same database is a no-op; ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_user_id_fkey'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_members_user_id         ON public.members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_netlify_user_id ON public.members(netlify_user_id);
CREATE INDEX IF NOT EXISTS idx_members_email           ON public.members(email);
CREATE INDEX IF NOT EXISTS idx_members_status          ON public.members(status);

-- Attendance, games worked, training, certifications.
CREATE TABLE IF NOT EXISTS public.member_activities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      UUID REFERENCES public.members(id) ON DELETE CASCADE,
  activity_type  TEXT NOT NULL,
  activity_date  DATE NOT NULL,
  activity_data  JSONB DEFAULT '{}'::jsonb,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_activities_member_id ON public.member_activities(member_id);
CREATE INDEX IF NOT EXISTS idx_member_activities_date      ON public.member_activities(activity_date);

DROP TRIGGER IF EXISTS trg_members_updated_at ON public.members;
CREATE TRIGGER trg_members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Closed until 0004 says otherwise.
ALTER TABLE public.members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_activities  ENABLE ROW LEVEL SECURITY;

-- Table privileges are granted explicitly rather than inherited from whatever
-- default privileges happen to be configured on the target database. Two
-- reasons: a chain that depends on ambient defaults produces a different schema
-- on a fresh project than on the one it was developed against, and `anon` is
-- denied SELECT outright here — so even a future policy mistake cannot expose
-- the roster to an unauthenticated caller. RLS narrows what these roles see;
-- the grants bound what they could ever see.
REVOKE ALL ON TABLE public.members           FROM anon, authenticated;
REVOKE ALL ON TABLE public.member_activities FROM anon, authenticated;

-- `authenticated` gets SELECT and nothing more on `members`. Every write to the
-- roster in this application goes through a Netlify Function on `service_role`
-- — there is no direct client write anywhere in app/, components/, contexts/,
-- hooks/ or lib/ — so the write grants bought nothing and cost a privilege
-- escalation: with table-wide UPDATE, a member's own session could PATCH its own
-- row and set `role = 'admin'`, after which `is_admin()` is true everywhere and
-- every admin-only table in the schema opens. Withholding the grant is the
-- barrier; the column guard in 0004 is the second one, for the day someone
-- re-grants UPDATE to support self-service profile editing.
GRANT SELECT                          ON TABLE public.members           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE public.member_activities TO authenticated;

GRANT ALL ON TABLE public.members           TO service_role;
GRANT ALL ON TABLE public.member_activities TO service_role;

COMMENT ON TABLE  public.members IS
  'Member roster. Holds personal data — read access is restricted to the member themselves plus admins and executives (see 0004).';
COMMENT ON COLUMN public.members.user_id IS
  'auth.users.id for this member. NULL until they first sign in, and nulled again if the auth user is deleted.';
COMMENT ON COLUMN public.members.netlify_user_id IS
  'DEPRECATED. Legacy Netlify Identity id, retained so historical rows stay resolvable.';
COMMENT ON COLUMN public.members.role IS
  'Structural role: official | executive | admin | evaluator | mentor. Compared case-insensitively by the role helpers in 0003.';
COMMENT ON TABLE  public.member_activities IS
  'Per-member activity log. Visible to the member it belongs to, plus admins and executives.';
COMMENT ON COLUMN public.member_activities.activity_type IS
  'Expected values: meeting | training | game | certification | other. No DB-level CHECK — the handler enforces the contract at the boundary.';
