-- =============================================================================
-- 0006 — evaluations
-- =============================================================================
-- Officiating evaluation reports. Each row names the official evaluated and
-- links to a PDF, so the old `FOR SELECT USING (true)` handed every evaluation
-- in the association to anyone holding the anon key.
--
-- Read: the official the evaluation is about, plus admins and executives.
-- Write: admins and executives.
--
-- The `evaluator` role gets no direct grant here. netlify/functions/evaluations
-- lets evaluators read and create through the service role, and encoding a
-- second, narrower definition of "evaluator" in SQL now would fork the role
-- model. The role helpers in 0003 are the seam for that.
--
-- 0015 takes that seam. Once `evaluator` is a capability grant rather than a
-- rung on the structural ladder, `has_capability(auth.uid(), 'evaluator')`
-- expresses it without forking anything, and the select policy below is
-- replaced by `evaluations_select_capability_or_subject`. The rules this file
-- states are the ones in force between here and 0015; read 0015 for the final
-- matrix.
--
-- Re-run safety: IF NOT EXISTS on table and indexes, DROP-then-CREATE on policies
-- and triggers.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.evaluations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id        UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  evaluator_id     UUID REFERENCES public.members(id) ON DELETE SET NULL,
  evaluation_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  file_url         TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  title            TEXT,
  notes            TEXT,
  activity_id      UUID REFERENCES public.member_activities(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_member_id    ON public.evaluations(member_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluator_id ON public.evaluations(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_date         ON public.evaluations(evaluation_date DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_activity_id  ON public.evaluations(activity_id);

DROP TRIGGER IF EXISTS trg_evaluations_updated_at ON public.evaluations;
CREATE TRIGGER trg_evaluations_updated_at
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.evaluations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.evaluations TO authenticated;
GRANT ALL ON TABLE public.evaluations TO service_role;

DROP POLICY IF EXISTS "Allow users to read own evaluations" ON public.evaluations;

DROP POLICY IF EXISTS "evaluations_select_subject_or_admin" ON public.evaluations;
CREATE POLICY "evaluations_select_subject_or_admin" ON public.evaluations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = evaluations.member_id
        AND m.user_id = auth.uid()
    )
    OR public.is_admin_or_executive(auth.uid())
  );

DROP POLICY IF EXISTS "evaluations_modify_admin" ON public.evaluations;
CREATE POLICY "evaluations_modify_admin" ON public.evaluations
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_executive(auth.uid()))
  WITH CHECK (public.is_admin_or_executive(auth.uid()));

COMMENT ON TABLE public.evaluations IS
  'Officiating evaluation reports. Visible to the official evaluated, plus admins and executives.';
