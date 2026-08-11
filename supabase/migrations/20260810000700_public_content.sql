-- =============================================================================
-- 0007 — Public website content
-- =============================================================================
-- public_news, public_training_events, public_resources, public_pages,
-- officials, executive_team.
--
-- These are the only tables in the schema an anonymous visitor may read, and
-- only their active rows. Writing used to be `USING (auth.role() =
-- 'authenticated')`, which meant any signed-in member could delete the entire
-- public website; it is now restricted to the same roles the Netlify handlers
-- require.
--
-- Re-run safety: IF NOT EXISTS on tables and indexes, DROP-then-CREATE on
-- policies and triggers, seeds guarded so a re-run inserts nothing.
-- =============================================================================

-- --- public_news -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.public_news (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  published_date  TIMESTAMPTZ NOT NULL,
  author          TEXT NOT NULL,
  image_url       TEXT,
  excerpt         TEXT NOT NULL,
  body            TEXT NOT NULL,
  featured        BOOLEAN DEFAULT false,
  tags            TEXT[],
  active          BOOLEAN DEFAULT true,
  priority        INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_news_slug           ON public.public_news(slug);
CREATE INDEX IF NOT EXISTS idx_public_news_active         ON public.public_news(active);
CREATE INDEX IF NOT EXISTS idx_public_news_published_date ON public.public_news(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_public_news_featured       ON public.public_news(featured) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_public_news_tags           ON public.public_news USING GIN(tags);

-- --- public_training_events ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.public_training_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                  TEXT NOT NULL,
  slug                   TEXT UNIQUE NOT NULL,
  event_date             TIMESTAMPTZ NOT NULL,
  start_time             TEXT NOT NULL,
  end_time               TEXT NOT NULL,
  location               TEXT NOT NULL,
  event_type             TEXT NOT NULL CHECK (event_type IN ('workshop', 'certification', 'refresher', 'meeting')),
  description            TEXT NOT NULL,
  registration_link      TEXT,
  max_participants       INTEGER,
  current_registrations  INTEGER DEFAULT 0,
  instructor             TEXT,
  requirements           TEXT,
  active                 BOOLEAN DEFAULT true,
  priority               INTEGER DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_slug       ON public.public_training_events(slug);
CREATE INDEX IF NOT EXISTS idx_training_active     ON public.public_training_events(active);
CREATE INDEX IF NOT EXISTS idx_training_event_date ON public.public_training_events(event_date);
CREATE INDEX IF NOT EXISTS idx_training_type       ON public.public_training_events(event_type);

-- --- public_resources ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.public_resources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('Rulebooks', 'Forms', 'Training Materials', 'Policies', 'Guides')),
  description   TEXT NOT NULL,
  file_url      TEXT,
  external_link TEXT,
  last_updated  TIMESTAMPTZ NOT NULL,
  access_level  TEXT DEFAULT 'public' CHECK (access_level IN ('public', 'members', 'officials')),
  active        BOOLEAN DEFAULT true,
  featured      BOOLEAN DEFAULT false,
  priority      INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_resources_slug     ON public.public_resources(slug);
CREATE INDEX IF NOT EXISTS idx_public_resources_active   ON public.public_resources(active);
CREATE INDEX IF NOT EXISTS idx_public_resources_category ON public.public_resources(category);
CREATE INDEX IF NOT EXISTS idx_public_resources_featured ON public.public_resources(featured) WHERE active = true;

COMMENT ON COLUMN public.public_resources.access_level IS
  'Only rows with access_level = ''public'' are readable anonymously; the rest require a session.';

-- --- public_pages ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.public_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_name         TEXT UNIQUE NOT NULL,
  title             TEXT NOT NULL,
  content           JSONB NOT NULL,
  meta_description  TEXT,
  last_edited_by    TEXT,
  active            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_pages_name   ON public.public_pages(page_name);
CREATE INDEX IF NOT EXISTS idx_public_pages_active ON public.public_pages(active);

COMMENT ON COLUMN public.public_pages.content IS
  'JSONB; the shape varies by page_name. See types/publicContent.ts.';

-- --- officials -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.officials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  level             INTEGER CHECK (level BETWEEN 1 AND 5),
  photo_url         TEXT,
  bio               TEXT,
  years_experience  TEXT,
  email             TEXT,
  availability      TEXT,
  certifications    TEXT[],
  active            BOOLEAN DEFAULT true,
  priority          INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_officials_active ON public.officials(active);
CREATE INDEX IF NOT EXISTS idx_officials_level  ON public.officials(level);
CREATE INDEX IF NOT EXISTS idx_officials_name   ON public.officials(name);

-- --- executive_team --------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.executive_team (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  position    TEXT NOT NULL,
  email       TEXT NOT NULL,
  image_url   TEXT,
  bio         TEXT,
  active      BOOLEAN DEFAULT true,
  priority    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_executive_team_active   ON public.executive_team(active);
CREATE INDEX IF NOT EXISTS idx_executive_team_priority ON public.executive_team(priority DESC);

-- --- updated_at triggers ---------------------------------------------------

DROP TRIGGER IF EXISTS trg_public_news_updated_at ON public.public_news;
CREATE TRIGGER trg_public_news_updated_at
  BEFORE UPDATE ON public.public_news
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_public_training_events_updated_at ON public.public_training_events;
CREATE TRIGGER trg_public_training_events_updated_at
  BEFORE UPDATE ON public.public_training_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_public_resources_updated_at ON public.public_resources;
CREATE TRIGGER trg_public_resources_updated_at
  BEFORE UPDATE ON public.public_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_public_pages_updated_at ON public.public_pages;
CREATE TRIGGER trg_public_pages_updated_at
  BEFORE UPDATE ON public.public_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_officials_updated_at ON public.officials;
CREATE TRIGGER trg_officials_updated_at
  BEFORE UPDATE ON public.officials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_executive_team_updated_at ON public.executive_team;
CREATE TRIGGER trg_executive_team_updated_at
  BEFORE UPDATE ON public.executive_team
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --- Row Level Security ----------------------------------------------------

ALTER TABLE public.public_news            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_training_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_resources       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_pages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officials              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_team         ENABLE ROW LEVEL SECURITY;

-- These six are the only tables in the schema where `anon` holds SELECT at all,
-- and the policies above narrow that to active rows. Granted explicitly so a
-- fresh project does not depend on the target database's default privileges.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public_news', 'public_training_events', 'public_resources',
    'public_pages', 'officials', 'executive_team'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- Superseded policies. `Authenticated can manage X` is the one that let any
-- signed-in member wipe the public site.
DROP POLICY IF EXISTS "Authenticated can manage news"      ON public.public_news;
DROP POLICY IF EXISTS "Authenticated can manage training"  ON public.public_training_events;
DROP POLICY IF EXISTS "Authenticated can manage resources" ON public.public_resources;
DROP POLICY IF EXISTS "Authenticated can manage pages"     ON public.public_pages;
DROP POLICY IF EXISTS "Authenticated can manage officials" ON public.officials;
DROP POLICY IF EXISTS "Public can view active news"        ON public.public_news;
DROP POLICY IF EXISTS "Public can view active training"    ON public.public_training_events;
DROP POLICY IF EXISTS "Public can view public resources"   ON public.public_resources;
DROP POLICY IF EXISTS "Public can view active pages"       ON public.public_pages;
DROP POLICY IF EXISTS "Public can view active officials"   ON public.officials;
DROP POLICY IF EXISTS "Anyone can view active executive members" ON public.executive_team;
DROP POLICY IF EXISTS "Service role can manage executive team"   ON public.executive_team;

-- Anonymous read of active rows only.
DROP POLICY IF EXISTS "public_news_select_active" ON public.public_news;
CREATE POLICY "public_news_select_active" ON public.public_news
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "public_training_events_select_active" ON public.public_training_events;
CREATE POLICY "public_training_events_select_active" ON public.public_training_events
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "public_resources_select_active" ON public.public_resources;
CREATE POLICY "public_resources_select_active" ON public.public_resources
  FOR SELECT USING (active = true AND access_level = 'public');

DROP POLICY IF EXISTS "public_pages_select_active" ON public.public_pages;
CREATE POLICY "public_pages_select_active" ON public.public_pages
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "officials_select_active" ON public.officials;
CREATE POLICY "officials_select_active" ON public.officials
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "executive_team_select_active" ON public.executive_team;
CREATE POLICY "executive_team_select_active" ON public.executive_team
  FOR SELECT USING (active = true);

-- Writes: admin or executive, matching the Netlify handlers.
DROP POLICY IF EXISTS "public_news_modify_admin" ON public.public_news;
CREATE POLICY "public_news_modify_admin" ON public.public_news
  FOR ALL TO authenticated
  USING (public.is_admin_or_executive(auth.uid()))
  WITH CHECK (public.is_admin_or_executive(auth.uid()));

DROP POLICY IF EXISTS "public_training_events_modify_admin" ON public.public_training_events;
CREATE POLICY "public_training_events_modify_admin" ON public.public_training_events
  FOR ALL TO authenticated
  USING (public.is_admin_or_executive(auth.uid()))
  WITH CHECK (public.is_admin_or_executive(auth.uid()));

DROP POLICY IF EXISTS "public_resources_modify_admin" ON public.public_resources;
CREATE POLICY "public_resources_modify_admin" ON public.public_resources
  FOR ALL TO authenticated
  USING (public.is_admin_or_executive(auth.uid()))
  WITH CHECK (public.is_admin_or_executive(auth.uid()));

-- public_pages and executive_team are admin-only, matching
-- netlify/functions/public-pages.ts and executive-team.ts.
DROP POLICY IF EXISTS "public_pages_modify_admin" ON public.public_pages;
CREATE POLICY "public_pages_modify_admin" ON public.public_pages
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "officials_modify_admin" ON public.officials;
CREATE POLICY "officials_modify_admin" ON public.officials
  FOR ALL TO authenticated
  USING (public.is_admin_or_executive(auth.uid()))
  WITH CHECK (public.is_admin_or_executive(auth.uid()));

DROP POLICY IF EXISTS "executive_team_modify_admin" ON public.executive_team;
CREATE POLICY "executive_team_modify_admin" ON public.executive_team
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- --- Seeds -----------------------------------------------------------------
-- Placeholder rows so a fresh install renders something. Replace them through
-- the portal; do not commit real names or addresses back into this file.

INSERT INTO public.executive_team (name, position, email, priority, active)
SELECT * FROM (VALUES
  ('Placeholder President',      'President',      'president@example.org',      100, true),
  ('Placeholder Vice President', 'Vice President', 'vicepresident@example.org',   95, true),
  ('Placeholder Treasurer',      'Treasurer',      'treasurer@example.org',       90, true),
  ('Placeholder Secretary',      'Secretary',      'secretary@example.org',       85, true)
) AS seed(name, position, email, priority, active)
WHERE NOT EXISTS (SELECT 1 FROM public.executive_team);

INSERT INTO public.public_pages (page_name, title, content, active)
VALUES
  (
    'home',
    'Officials Association',
    '{
      "heroTitle": "Officials Association",
      "heroSubtitle": "Edit this copy from the admin portal.",
      "stats": [
        {"label": "Active Officials", "value": "0"},
        {"label": "Games Per Season", "value": "0"},
        {"label": "Years of Service", "value": "0"}
      ],
      "aboutSection": "<h1>Welcome</h1><p>Placeholder home page copy. Replace it from the admin portal.</p>"
    }'::jsonb,
    true
  ),
  (
    'about',
    'About',
    '{
      "body": "<h1>About</h1><p>Placeholder about page copy. Replace it from the admin portal.</p>"
    }'::jsonb,
    true
  )
ON CONFLICT (page_name) DO NOTHING;

COMMENT ON TABLE public.public_news            IS 'News articles shown on the public website.';
COMMENT ON TABLE public.public_training_events IS 'Training events and workshops shown on the public website.';
COMMENT ON TABLE public.public_resources       IS 'Rulebooks, forms and guides published to the public website.';
COMMENT ON TABLE public.public_pages           IS 'Editable static pages. Seeded with placeholder copy.';
COMMENT ON TABLE public.officials              IS 'Officials directory shown on the public website.';
COMMENT ON TABLE public.executive_team         IS 'Executive listing shown on the public website. Seeded with placeholder people.';
