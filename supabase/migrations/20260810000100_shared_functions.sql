-- =============================================================================
-- 0001 — Preflight guard, baseline stamp, shared functions
-- =============================================================================
-- READ THIS BEFORE RUNNING THE CHAIN.
--
-- This chain is a squashed baseline and it targets an EMPTY database: a new
-- Supabase project, a local `supabase start`, or a scratch project. It is the
-- whole schema as of 20260810, and it replaces the unordered pile of .sql files
-- that came before it.
--
-- That is a contract, and the preflight block below enforces it instead of
-- describing it. If `public` already holds tables this chain creates and the
-- baseline stamp is absent, this file raises before it has created, altered or
-- dropped anything. It is the first file in the chain, so nothing else has run
-- either: the database is left exactly as it was — same tables, same policies,
-- same grants. There is no partially applied state to reason about, which is the
-- whole point of putting the check here.
--
-- Why refuse rather than try. `CREATE TABLE IF NOT EXISTS` skips a table that
-- already exists no matter how different its shape is, so on a database carrying
-- the pre-20260810 schema the tables keep their old columns while the indexes,
-- policies and grants in these files expect the new ones. The run then dies
-- somewhere in the middle, and where it dies depends on which of the old .sql
-- files that particular deployment ever happened to run — the constraint in
-- 0002 on one, a missing column in 0005 on another. The CLI applies each file in
-- its own transaction and rolls back nothing that already committed, so every
-- one of those stopping points leaves a different half-built schema behind. That
-- set has no useful bound, so this chain does not try to bound it; it declines
-- to start. Upgrading an existing database is that database's own migration,
-- written against its own shape, and is not a template's job.
--
-- If the guard fires: restore the database from backup and stay where you are,
-- or create a fresh database, run this chain against it, and move the data
-- across. Do not hand-patch the old database to get past the check.
--
-- Re-run safety is a separate and narrower property, and the chain does have it:
-- applying this chain twice to the SAME database is a no-op, not an error. The
-- IF NOT EXISTS guards, the catalog-checked constraints and the DROP-then-CREATE
-- policy blocks are what buy that. The preflight has to let that case through,
-- so it does not fire on "`members` exists" — it fires on "`members` exists and
-- the baseline stamp does not". The stamp is written here, in the first file, so
-- any database this chain has ever begun on carries it and re-running is always
-- allowed; a database that got its tables from the old .sql files never does.
--
-- The legacy `DROP POLICY IF EXISTS` blocks in 0004 through 0012 are defence in
-- depth behind this guard and nothing more. They are no-ops on the empty
-- database the chain targets, and on a legacy database they never execute at
-- all, because the guard stops the run here in 0001. They are kept because they
-- cost nothing and keep those files uniform. They are not what makes anything
-- safe — refusing to start is.
--
-- ---------------------------------------------------------------------------
-- After the preflight, this file holds only helpers that depend on nothing, so
-- every later migration can assume they exist.
--
-- Re-run safety: CREATE OR REPLACE.
-- =============================================================================

-- --- preflight: this chain runs on an empty database or not at all -----------
--
-- Runs before any DDL in the chain. `pg_tables` rather than
-- `information_schema.tables` so the check sees every table regardless of who
-- owns it. The list is the 25 tables this chain creates; the pre-20260810 .sql
-- files create the same names, so any deployment of the old schema trips at
-- least one of them, whichever subset of those files it ever ran.
DO $$
DECLARE
  found_tables TEXT[];
BEGIN
  SELECT array_agg(tablename ORDER BY tablename)
    INTO found_tables
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename = ANY (ARRAY[
       'announcements',      'app_logs',              'audit_logs',
       'calendar_events',    'contact_submissions',   'email_history',
       'evaluations',        'executive_team',        'invite_tokens',
       'member_activities',  'members',               'newsletters',
       'officials',          'osa_submissions',       'public_news',
       'public_pages',       'public_resources',      'public_training_events',
       'resources',          'rule_modifications',    'scheduler_updates',
       'stat_game_imports',  'stat_games',            'stat_manual_entries',
       'stat_org_mappings'
     ]);

  -- Nothing of ours is here. Empty database: exactly what this chain is for.
  IF found_tables IS NULL THEN
    RETURN;
  END IF;

  -- The tables are here, so the question is who put them here. The stamp below
  -- is written by this file on the first run, before any other file has created
  -- anything, which makes its presence equivalent to "this chain has begun on
  -- this database". Present: re-apply, which must stay a no-op. Absent: the
  -- tables came from somewhere else.
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'schema_baseline_version'
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION USING
    MESSAGE = format(
      'Refusing to migrate: schema "public" already holds %s of the %s tables this chain creates (%s), and carries no 20260810 baseline stamp. That is a database on the pre-20260810 schema. This chain is a squashed baseline for an EMPTY database and cannot upgrade an existing one.',
      cardinality(found_tables),
      25,
      array_to_string(found_tables, ', ')
    ),
    DETAIL = 'Nothing was changed. This is the first file in the chain and it raised before creating, altering or dropping anything, so the tables, policies and grants are exactly as they were.',
    HINT = 'To keep this database: restore it from backup and stay on the pre-20260810 .sql files. To move to this baseline: create a fresh database, apply this chain to it, then copy the data across. Do not hand-patch this database to get past this check.';
END $$;

-- --- baseline stamp ----------------------------------------------------------
-- Read by the preflight above and by nothing else. It exists so that "this
-- database already has our tables" can be told apart from "this database has
-- someone else's tables of the same name": the first is a re-apply and is fine,
-- the second is the case the guard exists to stop. Written here, in the first
-- file, so a run that fails partway through a LATER file on an otherwise empty
-- database can still be re-run — the stamp is already down.
--
-- Deliberately not a table: it would otherwise need its own RLS posture and
-- would show up in every audit of the 25. No caller in the application uses it,
-- so it is granted to nobody but `service_role`.
CREATE OR REPLACE FUNCTION public.schema_baseline_version()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '20260810'::text;
$$;

REVOKE ALL ON FUNCTION public.schema_baseline_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schema_baseline_version() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schema_baseline_version() TO service_role;

COMMENT ON FUNCTION public.schema_baseline_version() IS
  'Marks this database as one the 20260810 baseline chain built. Read by the preflight guard in 0001 to tell a re-apply apart from a foreign schema wearing the same table names. Not used by the application.';

-- --- shared helpers ----------------------------------------------------------

-- Generic BEFORE UPDATE trigger function. Every table in this schema that
-- carries an `updated_at` column hangs a trigger off this one function rather
-- than defining its own per-table copy.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column() IS
  'BEFORE UPDATE trigger function: stamps updated_at with NOW().';
