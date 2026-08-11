-- =============================================================================
-- 0013 — Season statistics
-- =============================================================================
-- Game data ingested from assigning-system exports, behind /portal/statistics.
--
--   stat_game_imports    one row per uploaded file; file_hash makes a repeat
--                        upload of identical bytes a no-op
--   stat_games           one row per game, keyed by the assigner's game id
--   stat_org_mappings    billing name -> league or tournament classification
--   stat_manual_entries  active/ready head counts per period
--
-- stat_org_mappings ships empty. The old chain seeded it with the real
-- organisations of one association, which does not belong in a schema; an
-- unmapped billing name is surfaced in the admin "needs review" list and rolled
-- up under "Unclassified" rather than dropped, so an empty table degrades
-- gracefully.
--
-- Re-run safety: IF NOT EXISTS on tables and indexes, DROP-then-CREATE on policies
-- and triggers.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.stat_game_imports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  filename          TEXT NOT NULL,
  file_hash         TEXT NOT NULL,
  source            TEXT DEFAULT 'game_info' NOT NULL,
  season            TEXT NOT NULL,
  row_count         INTEGER DEFAULT 0 NOT NULL,
  game_count        INTEGER DEFAULT 0 NOT NULL,
  assignment_count  INTEGER DEFAULT 0 NOT NULL,
  inserted_count    INTEGER DEFAULT 0 NOT NULL,
  updated_count     INTEGER DEFAULT 0 NOT NULL,
  status            TEXT DEFAULT 'completed' NOT NULL,
  uploaded_by       UUID,
  uploaded_by_email TEXT,
  notes             TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stat_game_imports_hash       ON public.stat_game_imports(file_hash);
CREATE INDEX        IF NOT EXISTS idx_stat_game_imports_created_at ON public.stat_game_imports(created_at DESC);
CREATE INDEX        IF NOT EXISTS idx_stat_game_imports_season     ON public.stat_game_imports(season);

CREATE TABLE IF NOT EXISTS public.stat_games (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  game_id           BIGINT NOT NULL,
  season            TEXT NOT NULL,
  game_date         DATE,
  game_time         TEXT,
  status            TEXT DEFAULT 'Normal' NOT NULL,
  site_name         TEXT,
  sub_site_name     TEXT,
  bill_to_name      TEXT,
  sport_name        TEXT,
  level_name        TEXT,
  home_teams        TEXT,
  away_teams        TEXT,
  officials         JSONB DEFAULT '[]'::jsonb NOT NULL,
  assignment_count  INTEGER DEFAULT 0 NOT NULL,
  import_id         UUID REFERENCES public.stat_game_imports(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stat_games_game_id     ON public.stat_games(game_id);
CREATE INDEX        IF NOT EXISTS idx_stat_games_season      ON public.stat_games(season);
CREATE INDEX        IF NOT EXISTS idx_stat_games_season_date ON public.stat_games(season, game_date);
CREATE INDEX        IF NOT EXISTS idx_stat_games_bill_to     ON public.stat_games(bill_to_name);

CREATE TABLE IF NOT EXISTS public.stat_org_mappings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  bill_to_name  TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'league',
  category      TEXT,
  active        BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stat_org_mappings_bill_to ON public.stat_org_mappings(bill_to_name);

CREATE TABLE IF NOT EXISTS public.stat_manual_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  season            TEXT NOT NULL,
  period            TEXT NOT NULL DEFAULT 'ytd',
  active_officials  INTEGER,
  ready_officials   INTEGER,
  updated_by        UUID,
  updated_by_email  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stat_manual_entries_period ON public.stat_manual_entries(season, period);

DROP TRIGGER IF EXISTS trg_stat_game_imports_updated_at ON public.stat_game_imports;
CREATE TRIGGER trg_stat_game_imports_updated_at
  BEFORE UPDATE ON public.stat_game_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_stat_games_updated_at ON public.stat_games;
CREATE TRIGGER trg_stat_games_updated_at
  BEFORE UPDATE ON public.stat_games
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_stat_org_mappings_updated_at ON public.stat_org_mappings;
CREATE TRIGGER trg_stat_org_mappings_updated_at
  BEFORE UPDATE ON public.stat_org_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_stat_manual_entries_updated_at ON public.stat_manual_entries;
CREATE TRIGGER trg_stat_manual_entries_updated_at
  BEFORE UPDATE ON public.stat_manual_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Uploads run through Netlify Functions on service_role. Direct browser reads
-- require admin or executive.
ALTER TABLE public.stat_games          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stat_game_imports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stat_org_mappings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stat_manual_entries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stat_games', 'stat_game_imports', 'stat_org_mappings', 'stat_manual_entries'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_service_all" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_admin_all" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_admin_all" ON public.%I FOR ALL TO authenticated '
      'USING (public.is_admin_or_executive(auth.uid())) '
      'WITH CHECK (public.is_admin_or_executive(auth.uid()))', t, t
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.stat_games IS
  'One row per game, keyed by the assigning system''s game id. Feeds /portal/statistics.';
COMMENT ON TABLE public.stat_game_imports IS
  'One row per uploaded export; file_hash gives whole-file idempotency.';
COMMENT ON TABLE public.stat_org_mappings IS
  'Billing name to league or tournament classification. Ships empty; populate through the admin UI.';
COMMENT ON TABLE public.stat_manual_entries IS
  'Active and ready official head counts per period.';
COMMENT ON COLUMN public.stat_org_mappings.kind IS
  'Expected values: league | tournament | excluded.';
COMMENT ON COLUMN public.stat_manual_entries.period IS
  '''ytd'' or a YYYY-MM month.';
