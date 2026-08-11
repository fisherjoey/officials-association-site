-- =============================================================================
-- 0005 — Member portal content
-- =============================================================================
-- announcements, calendar_events, newsletters, rule_modifications,
-- scheduler_updates, resources.
--
-- These are the tables behind the signed-in portal. In the schema this baseline
-- replaces they carried `USING (true)` on SELECT, INSERT, UPDATE *and* DELETE,
-- so anyone holding the anon key could have emptied them. The policies below
-- match what the Netlify handlers already enforce at the boundary: read requires
-- a session, writing requires admin or executive.
--
-- `service_role` bypasses RLS, so the handlers keep working unchanged.
--
-- Re-run safety: IF NOT EXISTS on tables and indexes, DROP-then-CREATE on
-- policies and triggers. Empty-database-only, like the rest of the chain, and
-- enforced there — see the preflight guard in 0001.
-- =============================================================================

-- --- announcements ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  type        TEXT,
  category    TEXT DEFAULT 'general',
  priority    TEXT DEFAULT 'normal',
  author      TEXT,
  audience    TEXT[],
  date        TIMESTAMPTZ DEFAULT NOW(),
  expires     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_date    ON public.announcements(date DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_expires ON public.announcements(expires);

-- --- calendar_events -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'meeting',
  description         TEXT,
  location            TEXT,
  instructor          TEXT,
  max_participants    INTEGER,
  registration_link   TEXT,
  start_date          TIMESTAMPTZ NOT NULL,
  end_date            TIMESTAMPTZ NOT NULL,
  tournament_details  JSONB,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON public.calendar_events(start_date);

COMMENT ON COLUMN public.calendar_events.tournament_details IS
  'Tournament metadata: { school, divisions, levels, genders, multiLocation }.';

-- --- newsletters -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.newsletters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  date         DATE NOT NULL,
  description  TEXT,
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_size    BIGINT,
  is_featured  BOOLEAN DEFAULT false,
  uploaded_by  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_newsletters_date ON public.newsletters(date DESC);

-- --- rule_modifications ----------------------------------------------------
-- Two conflicting definitions of this table used to exist in the tree and which
-- one you got depended on which file happened to run first. This is the union:
-- `slug` for the adapter's lookup-by-slug path, `active` and `priority` for the
-- handler's filtering and ordering.

CREATE TABLE IF NOT EXISTS public.rule_modifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL,
  summary         TEXT,
  content         TEXT NOT NULL,
  approved_by     TEXT,
  effective_date  DATE,
  date            TIMESTAMPTZ DEFAULT NOW(),
  priority        INTEGER DEFAULT 0,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rule_modifications_slug     ON public.rule_modifications(slug);
CREATE INDEX IF NOT EXISTS idx_rule_modifications_category ON public.rule_modifications(category);
CREATE INDEX IF NOT EXISTS idx_rule_modifications_active   ON public.rule_modifications(active);
CREATE INDEX IF NOT EXISTS idx_rule_modifications_priority ON public.rule_modifications(priority DESC);

-- --- scheduler_updates -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.scheduler_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  author      TEXT DEFAULT 'Scheduler',
  date        TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_updates_date ON public.scheduler_updates(date DESC);

-- --- resources -------------------------------------------------------------
-- Portal resource library: uploaded files, external links, embedded video and
-- plain text entries. The table was referenced by netlify/functions/resources.ts
-- and lib/storage/supabase.ts but no file in the old chain ever created it.

CREATE TABLE IF NOT EXISTS public.resources (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT,
  resource_type  TEXT DEFAULT 'file',
  file_url       TEXT,
  file_name      TEXT,
  original_name  TEXT,
  file_size      BIGINT,
  mime_type      TEXT,
  bucket         TEXT,
  path           TEXT,
  access_level   TEXT DEFAULT 'public',
  is_featured    BOOLEAN DEFAULT false,
  active         BOOLEAN DEFAULT true,
  uploaded_by    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resources_category   ON public.resources(category);
CREATE INDEX IF NOT EXISTS idx_resources_type       ON public.resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_resources_bucket     ON public.resources(bucket);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON public.resources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_featured   ON public.resources(is_featured) WHERE active = true;

COMMENT ON COLUMN public.resources.resource_type IS
  'Expected values: file | link | video | text. No DB-level CHECK — the handler enforces the contract.';
COMMENT ON COLUMN public.resources.access_level IS
  'Audience hint used by the portal UI. Not a security boundary; RLS on this table is what restricts access.';

-- --- updated_at triggers ---------------------------------------------------

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_newsletters_updated_at ON public.newsletters;
CREATE TRIGGER trg_newsletters_updated_at
  BEFORE UPDATE ON public.newsletters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_rule_modifications_updated_at ON public.rule_modifications;
CREATE TRIGGER trg_rule_modifications_updated_at
  BEFORE UPDATE ON public.rule_modifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_scheduler_updates_updated_at ON public.scheduler_updates;
CREATE TRIGGER trg_scheduler_updates_updated_at
  BEFORE UPDATE ON public.scheduler_updates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_resources_updated_at ON public.resources;
CREATE TRIGGER trg_resources_updated_at
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --- Row Level Security ----------------------------------------------------

ALTER TABLE public.announcements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_modifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduler_updates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources           ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  legacy TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'announcements', 'calendar_events', 'newsletters',
    'rule_modifications', 'scheduler_updates', 'resources'
  ]
  LOOP
    -- Granted explicitly rather than inherited from the target database's
    -- default privileges, so a fresh project gets the same schema as the one
    -- this was developed against. `anon` gets nothing at all on portal tables.
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);

    -- Superseded permissive policies from the old per-table schema files. These
    -- are no-ops: the preflight guard in 0001 refuses to start on a database
    -- that carries them, so this file only ever runs where the names are absent.
    -- Kept as defence in depth — a surviving `USING (true)` would not compete
    -- with the tightened policy below, it would outvote it, since permissive
    -- policies OR together and pg_policies would still show both.
    FOREACH legacy IN ARRAY ARRAY['read', 'insert', 'update', 'delete']
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS "Public %s access for %s" ON public.%I', legacy, t, t
      );
    END LOOP;
    EXECUTE format('DROP POLICY IF EXISTS "Allow public read access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can read scheduler updates" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can manage scheduler updates" ON public.%I', t);

    -- Read requires a session. The anon key alone gets nothing.
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_authenticated" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_select_authenticated" ON public.%I FOR SELECT TO authenticated USING (true)', t, t
    );

    -- Writing is an administrative act.
    EXECUTE format('DROP POLICY IF EXISTS "%s_modify_admin" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_modify_admin" ON public.%I FOR ALL TO authenticated '
      'USING (public.is_admin_or_executive(auth.uid())) '
      'WITH CHECK (public.is_admin_or_executive(auth.uid()))', t, t
    );
  END LOOP;
END $$;
