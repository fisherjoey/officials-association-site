-- =============================================================================
-- 0016 — One rule for an evaluation, applied to the row and to the file
-- =============================================================================
-- Closes the asymmetry 0014 documented and 0015 widened: the `evaluations`
-- TABLE and the `evaluations` BUCKET disagreed about who may read a report, and
-- the portal renders its download button from the table's answer.
--
--   evaluations_select_capability_or_subject (0015) gave the ROW to the official
--   the evaluation is about, to admins and executives, and to anyone holding the
--   `evaluator` capability.
--
--   evaluations_select_owner_or_admin (0014) gave the OBJECT to whoever uploaded
--   it, plus admins and executives.
--
-- Two of the readers the table admits — the official the report is about, and
-- any evaluator who did not upload it — therefore saw a View and a Download
-- button and got "We couldn't open that file" when they pressed either. Proved
-- against a live stack: `createSignedUrl` answered `Object not found` for both,
-- because a mint runs the same SELECT policy a download runs.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A JOIN AND NOT A PATH CONVENTION
-- ---------------------------------------------------------------------------
-- 0014's header said closing the subject half needed a `<member_uuid>/<file>`
-- key convention written by the upload path first, because "nothing in the
-- object key says who it is about". That is true of the key and it is the wrong
-- direction to look. The link between an object and the evaluation it belongs to
-- already exists — `evaluations.file_url` holds
-- `storage://evaluations/<object key>`, written by `lib/fileUpload.ts` — it just
-- points from the row to the object rather than from the object to the row. A
-- policy on `storage.objects` can follow it backwards: it knows `name`, and
-- `name` is what the reference in the row is built from.
--
-- So no key changes shape here, and there is no data migration. Existing objects
-- keep their `<timestamp>-<filename>` keys and existing rows keep their
-- `file_url` values. An adopter who has already been running the portal gets the
-- fix by applying this file and nothing else.
--
-- The reason to prefer the join is not only that it is cheaper. A path
-- convention re-states the access rule in a second place — the storage policy
-- would spell out "subject, or admin, or evaluator" in its own words, and the
-- next change to the table policy would silently not reach it. That is exactly
-- how 0014 and 0015 drifted apart in the first place. Here there is one
-- predicate, `public.can_read_evaluation()`, and both policies call it. They
-- cannot disagree again without someone editing the function they share.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS WIDENS, SAID PLAINLY
-- ---------------------------------------------------------------------------
-- Every holder of the `evaluator` capability can now open the FILE for every
-- evaluation that has a row, not just the ones they uploaded. That is not a side
-- effect, it is the point: they could already read every such ROW under 0015,
-- including its title and notes, and a report whose attachment they cannot open
-- is a listing of other people's work with the substance withheld. The grant is
-- the capability, and an admin is the only one who can hand it out — the guard
-- trigger in 0015 refuses a self-grant.
--
-- What does NOT widen:
--   * An object in the bucket with no `evaluations` row pointing at it stays
--     owner-only. Uploads happen before the row is created, and a member may
--     upload to this bucket (0014 keeps INSERT open so evaluators, who are not
--     admins, can do their job) — so an unreferenced object is somebody's
--     scratch upload, and it keeps 0014's guarantee that a member who uploads
--     can only ever read back what they uploaded.
--   * INSERT, UPDATE and DELETE are untouched. Changing or removing an
--     evaluation file is still the uploader or an admin/executive. Reading a
--     colleague's report does not mean being able to replace it.
--   * Nothing outside the `evaluations` bucket. The other four policies in 0014
--     stand exactly as written.
--
-- ---------------------------------------------------------------------------
-- COST
-- ---------------------------------------------------------------------------
-- The storage policy now does an indexed lookup on `evaluations` per object
-- considered, and only after the two cheap checks (owner, admin) have failed.
-- `idx_evaluations_object_key` below is what keeps that a lookup rather than a
-- scan. In the shape that matters — `createSignedUrl` on one object — it is one
-- row.
--
-- Re-run safety: CREATE OR REPLACE on every function, IF NOT EXISTS on the
-- index, DROP-then-CREATE on every policy. Applying the chain twice is a no-op.
-- This file adds no tables, so the preflight guard's list in 0001 is still
-- complete.
-- =============================================================================

-- --- the one predicate ------------------------------------------------------
--
-- "May this caller read the evaluation of this member?" — lifted verbatim out of
-- `evaluations_select_capability_or_subject` in 0015 so that the row policy and
-- the object policy below are the same sentence rather than two translations of
-- it.
--
-- SECURITY DEFINER for the reason every helper in 0003 and 0015 is: it consults
-- `public.members`, which carries its own policies, and the answer must not
-- depend on whether the caller can see the row it is derived from. It reads only
-- `m.user_id = uid`, so a caller can never learn anything here about a member
-- other than themselves.
--
-- COALESCE at the boundary because anon's `auth.uid()` is NULL and NULL is not
-- false — the same trap 0015 documents on `is_admin()`.
CREATE OR REPLACE FUNCTION public.can_read_evaluation(uid uuid, subject_member_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1 FROM public.members m
       WHERE m.id = subject_member_id
         AND m.user_id = uid
    )
    OR public.is_admin_or_executive(uid)
    OR public.has_capability(uid, 'evaluator'),
    false
  );
$$;

COMMENT ON FUNCTION public.can_read_evaluation(uuid, uuid) IS
  'May this auth user read the evaluation written about this member? The single definition behind both evaluations_select_capability_or_subject on public.evaluations and evaluations_select_row_readers_or_owner on storage.objects — change it here and both move together.';

-- --- reading the object key back out of a stored reference ------------------
--
-- `lib/storageRefs.ts` in SQL, narrowed to this bucket. Two shapes are
-- recognised, matching `parseStorageRef()` exactly:
--
--   storage://evaluations/<key>                        what uploads write now
--   …/storage/v1/object/{public,sign,authenticated}/evaluations/<key>
--                                                      rows written before
--                                                      signed downloads landed
--
-- Anything else — an empty column, a pasted external link, a reference into a
-- different bucket — yields NULL, which the lookup below treats as "no match".
--
-- No percent-decoding, and that is a statement about the keys rather than a
-- shortcut. `lib/fileUpload.ts` builds every key as `<timestamp>-<name>` with
-- `[^a-zA-Z0-9.-]` replaced by `_`, so a key cannot contain a character a URL
-- would have escaped. If that sanitiser ever loosens, this function has to
-- decode and the test that pins the round trip is the one that will say so.
CREATE OR REPLACE FUNCTION public.evaluation_object_key(file_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN file_url IS NULL THEN NULL
    WHEN file_url LIKE 'storage://evaluations/%'
      THEN NULLIF(substring(file_url from length('storage://evaluations/') + 1), '')
    ELSE substring(
           file_url
           from '/storage/v1/object/(?:public|sign|authenticated)/evaluations/([^?#]+)'
         )
  END;
$$;

COMMENT ON FUNCTION public.evaluation_object_key(text) IS
  'The storage.objects.name an evaluations.file_url points at, or NULL when it points somewhere else. The SQL half of parseStorageRef() in lib/storageRefs.ts.';

-- Expression index so the storage policy's lookup is a probe, not a scan of
-- every evaluation in the association.
CREATE INDEX IF NOT EXISTS idx_evaluations_object_key
  ON public.evaluations (public.evaluation_object_key(file_url));

-- --- the object side of the join --------------------------------------------
--
-- Deliberately SECURITY DEFINER: it has to see every evaluation row to answer
-- "is there one pointing at this object", and then applies
-- `can_read_evaluation()` to decide. Leaving it to the caller's own RLS would
-- work today by accident — the row policy asks the same question — and would
-- become wrong the moment the row policy grew a condition about something other
-- than readability. It returns a boolean and never a row, so nothing leaks
-- through it either way.
CREATE OR REPLACE FUNCTION public.can_read_evaluation_object(uid uuid, object_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.evaluations e
     WHERE public.evaluation_object_key(e.file_url) = object_key
       AND public.can_read_evaluation(uid, e.member_id)
  );
$$;

COMMENT ON FUNCTION public.can_read_evaluation_object(uuid, text) IS
  'May this auth user read the file behind this key in the evaluations bucket? True when some evaluation row points at the object and can_read_evaluation() says yes for that row.';

REVOKE ALL ON FUNCTION public.can_read_evaluation(uuid, uuid)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_evaluation_object(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluation_object_key(text)            FROM PUBLIC;

-- `authenticated` needs EXECUTE because a policy expression runs as the role
-- that tripped it, and storage-api evaluates these under `SET ROLE authenticated`
-- exactly as PostgREST does.
GRANT EXECUTE ON FUNCTION public.can_read_evaluation(uuid, uuid)        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_evaluation_object(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluation_object_key(text)            TO anon, authenticated, service_role;

-- --- the row policy, re-expressed over the shared predicate -----------------
--
-- Same name and the same answer as 0015's version, so every reference to it
-- still points at the right thing. What changes is that the rule now lives in
-- one function instead of inline here, which is what lets the object policy
-- below be the same rule rather than a copy of it.
DROP POLICY IF EXISTS "evaluations_select_capability_or_subject" ON public.evaluations;
CREATE POLICY "evaluations_select_capability_or_subject" ON public.evaluations
  FOR SELECT
  TO authenticated
  USING (public.can_read_evaluation(auth.uid(), evaluations.member_id));

-- --- the object policy ------------------------------------------------------
--
-- Supersedes `evaluations_select_owner_or_admin` from 0014. Three ways in, in
-- the order they are cheapest to answer:
--
--   owner_id            the uploader, unchanged from 0014. Kept so an evaluator
--                       can read back what they just uploaded in the moment
--                       before the row exists.
--   is_admin_or_executive  unchanged from 0014.
--   can_read_evaluation_object  new: whoever the row lets in.
--
-- The old policy is dropped by name rather than left alongside this one.
-- Permissive policies OR together, so leaving it would not change the answer —
-- but it would leave two policies on one bucket, and a reader would have to work
-- out that one is a subset of the other.
DROP POLICY IF EXISTS "evaluations_select_owner_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "evaluations_select_row_readers_or_owner" ON storage.objects;
CREATE POLICY "evaluations_select_row_readers_or_owner" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'evaluations'
    AND (
      owner_id = auth.uid()::text
      OR public.is_admin_or_executive(auth.uid())
      OR public.can_read_evaluation_object(auth.uid(), name)
    )
  );

COMMENT ON TABLE public.evaluations IS
  'Officiating evaluation reports. Readable — row AND attachment — by the official evaluated, by admins and executives, and by anyone holding the evaluator capability. Writable by admins, executives and evaluators; editable and deletable by admins and executives.';
