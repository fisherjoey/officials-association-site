-- =============================================================================
-- 0010 — app_logs, audit_logs
-- =============================================================================
-- Operational logs and the compliance audit trail.
--
-- Both tables previously carried `FOR INSERT WITH CHECK (true)`, which let
-- anyone holding the anon key write rows — including forged audit entries
-- attributing actions to other people. Every real writer goes through
-- service_role (lib/logger.ts and netlify/functions/client-logs.ts both post
-- with the service key, and client log submissions are relayed by that function
-- rather than written from the browser), and service_role bypasses RLS. So the
-- insert policies are gone and neither table accepts writes from anon or
-- authenticated.
--
-- Re-run safety: IF NOT EXISTS on tables and indexes, DROP-then-CREATE on
-- policies, CREATE OR REPLACE on the cleanup function.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  level          TEXT NOT NULL CHECK (level IN ('ERROR', 'WARN', 'INFO')),
  source         TEXT NOT NULL CHECK (source IN ('server', 'client')),
  category       TEXT NOT NULL,
  function_name  TEXT,
  action         TEXT NOT NULL,
  message        TEXT NOT NULL,
  user_id        TEXT,
  user_email     TEXT,
  request_id     TEXT,
  metadata       JSONB DEFAULT '{}'::jsonb,
  error_name     TEXT,
  error_message  TEXT,
  error_stack    TEXT,
  ip_address     TEXT,
  user_agent     TEXT
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  action             TEXT NOT NULL,
  entity_type        TEXT NOT NULL,
  entity_id          TEXT,
  actor_id           TEXT NOT NULL,
  actor_email        TEXT NOT NULL,
  actor_role         TEXT,
  actor_ip           TEXT,
  target_user_id     TEXT,
  target_user_email  TEXT,
  old_values         JSONB,
  new_values         JSONB,
  description        TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_logs_timestamp       ON public.app_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level           ON public.app_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_category        ON public.app_logs(category);
CREATE INDEX IF NOT EXISTS idx_app_logs_source          ON public.app_logs(source);
CREATE INDEX IF NOT EXISTS idx_app_logs_user_email      ON public.app_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_app_logs_function_name   ON public.app_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_app_logs_action          ON public.app_logs(action);
CREATE INDEX IF NOT EXISTS idx_app_logs_level_timestamp ON public.app_logs(level, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp         ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action            ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type       ON public.audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity            ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email       ON public.audit_logs(actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_email      ON public.audit_logs(target_user_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_timestamp  ON public.audit_logs(entity_type, entity_id, timestamp DESC);

ALTER TABLE public.app_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT only. Writing is a service_role privilege, enforced by the grant as
-- well as by the absence of an INSERT policy.
REVOKE ALL ON TABLE public.app_logs   FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;
GRANT SELECT ON TABLE public.app_logs   TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.app_logs   TO service_role;
GRANT ALL ON TABLE public.audit_logs TO service_role;

-- Superseded: the two "Allow ... inserts" policies were the forgery hole.
DROP POLICY IF EXISTS "Allow log inserts"          ON public.app_logs;
DROP POLICY IF EXISTS "Allow audit inserts"        ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can view app logs"   ON public.app_logs;
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

DROP POLICY IF EXISTS "app_logs_select_admin" ON public.app_logs;
CREATE POLICY "app_logs_select_admin" ON public.app_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Retention. Called on a schedule; see netlify/functions/scheduled-log-cleanup.
CREATE OR REPLACE FUNCTION public.cleanup_old_logs(
  app_logs_days   INTEGER DEFAULT 30,
  audit_logs_days INTEGER DEFAULT 365
)
RETURNS TABLE(app_logs_deleted BIGINT, audit_logs_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_count   BIGINT;
  audit_count BIGINT;
BEGIN
  DELETE FROM public.app_logs
  WHERE timestamp < NOW() - (app_logs_days || ' days')::INTERVAL;
  GET DIAGNOSTICS app_count = ROW_COUNT;

  DELETE FROM public.audit_logs
  WHERE timestamp < NOW() - (audit_logs_days || ' days')::INTERVAL;
  GET DIAGNOSTICS audit_count = ROW_COUNT;

  RETURN QUERY SELECT app_count, audit_count;
END;
$$;

-- SECURITY DEFINER plus a public grant would be a delete-anything primitive.
REVOKE ALL ON FUNCTION public.cleanup_old_logs(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_logs(INTEGER, INTEGER) TO service_role;

COMMENT ON TABLE public.app_logs IS
  'Operational logs. Readable by admins, written only through service_role. Retention handled by cleanup_old_logs().';
COMMENT ON TABLE public.audit_logs IS
  'Audit trail. Readable by admins, written only through service_role, never updated or deleted by any other role.';
