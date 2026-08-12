-- =============================================================================
-- 0014 — Storage buckets and their RLS policies
-- =============================================================================
-- The other twelve files in this chain lock down `public`. This one does the
-- same job for `storage.objects`, and it creates the buckets so an adopter does
-- not have to click them into existence before uploads work.
--
-- Read the posture table below before changing anything here. A storage policy
-- nobody can explain is a storage policy nobody will maintain, and the whole
-- reason this file exists is that the buckets used to be a hand-written setup
-- step with no written-down access model at all.
--
-- ---------------------------------------------------------------------------
-- WHAT "PUBLIC" MEANS, BECAUSE IT IS NOT WHAT IT SOUNDS LIKE
-- ---------------------------------------------------------------------------
-- A bucket marked public is served by storage-api's `/object/public/<bucket>/…`
-- route without a JWT and WITHOUT CONSULTING RLS AT ALL. Policies on
-- `storage.objects` do not gate that route; `storage.buckets.public` is the only
-- switch. So "public = true" means "anyone who has the URL can fetch the bytes,
-- forever, no session required". It does not mean "anyone can enumerate the
-- bucket" — `list()` and the authenticated `/object/<bucket>/…` route both go
-- through the SELECT policies below, and this file deliberately grants SELECT to
-- no anonymous caller anywhere. An outsider who is handed one email-image URL
-- gets that one image, not the index.
--
-- The corollary is the reason the four document buckets are private: for them
-- there is no URL you can hand out that works without a session, so RLS is the
-- whole access model rather than a second opinion.
--
-- ---------------------------------------------------------------------------
-- THE BUCKETS, AND WHY EACH ONE IS WHAT IT IS
-- ---------------------------------------------------------------------------
-- The list is derived from the code, not from the docs. `lib/fileUpload.ts`
-- (browser, user JWT, subject to these policies) routes to five buckets;
-- `netlify/functions/upload-file.ts` (service role, bypasses these policies)
-- routes to four of the same five. `evaluations` is reachable only from the
-- browser path, which makes it the one bucket where these policies are the only
-- thing standing between a member and someone else's file.
--
--   email-images       PUBLIC read, admin/executive write.
--                      Images embedded in outgoing mail. The recipient opens
--                      that mail in Gmail or Outlook with no Supabase session
--                      and no anon key, so a private bucket here is a broken
--                      image in every message the association sends. Public is
--                      not a convenience here, it is the requirement. Write is
--                      admin/executive because only they compose mail.
--
--   portal-resources   PRIVATE. Any member reads, any member writes, uploader
--                      or admin/executive edits and deletes.
--                      The shared document library. Every signed-in member is
--                      meant to see the whole shelf, which is why SELECT is not
--                      owner-scoped. Write is open to any member because
--                      upload-file.ts already treats this bucket as the
--                      catch-all any authenticated user may post to; the policy
--                      matches that instead of contradicting it. Editing and
--                      deleting narrow to the uploader so one member cannot
--                      quietly replace another's document.
--
--                      Known and deliberate: `resources.access_level` gates the
--                      ROW, not the object. Object keys are bare
--                      `<timestamp>-<name>` with nothing tying them back to a
--                      resource id, so a policy here cannot honour that column.
--                      Anything that genuinely must be narrower than
--                      "members-only" needs a signed URL minted by a function
--                      that has read the row first — see the README.
--
--   newsletters        PRIVATE. Any member reads, admin/executive writes.
--                      Member-only publication, edited by the executive.
--
--   training-materials PRIVATE. Any member reads, admin/executive writes.
--                      Clinic and course material. Same shape as newsletters.
--
--   evaluations        PRIVATE. Uploader or admin/executive reads; any member
--                      may upload; uploader or admin/executive edits and
--                      deletes.
--                      The one owner-scoped bucket. INSERT is open to any
--                      authenticated caller on purpose: the evaluator flow in
--                      `app/portal/evaluations/page.tsx` runs on the browser
--                      client, and the `evaluator` role it depends on exists
--                      only in the function layer — `is_admin_or_executive()`
--                      has never heard of it. Restricting INSERT to
--                      admin/executive would lock evaluators out of their own
--                      workflow. Opening INSERT costs nothing an attacker wants,
--                      because a member who uploads can only ever read back what
--                      they uploaded.
--
--                      Known and deliberate, and it is an asymmetry: the
--                      `evaluations` TABLE lets an official read the evaluations
--                      written ABOUT them. This bucket does not — object
--                      ownership records who uploaded the file, and nothing in
--                      the object key says who it is about. Closing that gap
--                      means a path convention (`<member_uuid>/<file>`) written
--                      by the upload path first; inventing one here that the
--                      application does not produce would be a policy that
--                      matches nothing.
--
-- ---------------------------------------------------------------------------
-- HOW THIS FILE STAYS HONEST
-- ---------------------------------------------------------------------------
-- Every privilege check goes through `public.is_admin_or_executive()` from 0003,
-- the same SECURITY DEFINER helper the table policies use. That is the point:
-- storage and rows ask one function the same question, so they cannot drift
-- apart when the role model grows. Nothing in this file reads `members.role`
-- directly.
--
-- Ownership is keyed on `storage.objects.owner_id`, the text column storage-api
-- stamps from the uploader's JWT. (`owner` is its legacy uuid twin; current
-- storage-api writes both, and Supabase's own documentation has moved to
-- `owner_id`.) A client cannot choose either value, which is why the INSERT
-- policies assert only the bucket and not the owner — there is nothing to
-- forge.
--
-- `service_role` carries BYPASSRLS, so none of this applies to the Netlify
-- functions. `netlify/functions/upload-file.ts` keeps its own role check and
-- remains the only enforcement on that path. These policies are what protects
-- the browser path, and the safety net for the day someone flips a bucket
-- public.
--
-- Re-run safety: buckets are INSERT … ON CONFLICT DO UPDATE, policies are
-- DROP POLICY IF EXISTS before every CREATE POLICY. Re-applying the chain is a
-- no-op. The DO UPDATE is deliberate and it means this file — not the dashboard
-- — decides whether a bucket is public: flip `portal-resources` to public by
-- hand and the next `db push` flips it back. If you need a different posture,
-- change it here.
--
-- Empty-database-only, like the rest of the chain, and enforced in 0001. This
-- file adds nothing to `public`, so the preflight guard's table list in 0001 is
-- still complete and still correct.
-- =============================================================================

-- --- buckets -----------------------------------------------------------------
--
-- file_size_limit is a real backstop, not decoration. The 25 MB ceiling in
-- `lib/fileUpload.ts` is client-side JavaScript and anyone can skip it; this one
-- is enforced by storage-api. 26214400 matches that stated ceiling. The
-- service-role path in upload-file.ts caps itself lower, at 10 MB, and is
-- unaffected.
--
-- allowed_mime_types is left NULL on purpose. upload-file.ts already checks the
-- declared MIME against the file extension and sniffs PDF magic bytes, and
-- lib/fileUpload.ts carries its own extension allowlist. A third list here would
-- drift out of step with those two and surface as an upload that fails with no
-- explanation the application can give.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('email-images',       'email-images',       TRUE,  26214400, NULL),
  ('portal-resources',   'portal-resources',   FALSE, 26214400, NULL),
  ('newsletters',        'newsletters',        FALSE, 26214400, NULL),
  ('training-materials', 'training-materials', FALSE, 26214400, NULL),
  ('evaluations',        'evaluations',        FALSE, 26214400, NULL)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- --- email-images ------------------------------------------------------------
-- Bytes are world-readable through the public route by design. The SELECT policy
-- exists so the portal's own editor can list what it has uploaded; anon is
-- absent from it so the outside world cannot walk the bucket.

DROP POLICY IF EXISTS "email_images_select_authenticated" ON storage.objects;
CREATE POLICY "email_images_select_authenticated" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'email-images');

DROP POLICY IF EXISTS "email_images_insert_admin_exec" ON storage.objects;
CREATE POLICY "email_images_insert_admin_exec" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'email-images'
    AND public.is_admin_or_executive(auth.uid())
  );

DROP POLICY IF EXISTS "email_images_update_admin_exec" ON storage.objects;
CREATE POLICY "email_images_update_admin_exec" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'email-images'
    AND public.is_admin_or_executive(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'email-images'
    AND public.is_admin_or_executive(auth.uid())
  );

DROP POLICY IF EXISTS "email_images_delete_admin_exec" ON storage.objects;
CREATE POLICY "email_images_delete_admin_exec" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'email-images'
    AND public.is_admin_or_executive(auth.uid())
  );

-- --- portal-resources --------------------------------------------------------
-- The shared shelf: every member reads all of it, every member may add to it,
-- only the uploader (or an admin/executive) may change or remove an item.

DROP POLICY IF EXISTS "portal_resources_select_authenticated" ON storage.objects;
CREATE POLICY "portal_resources_select_authenticated" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'portal-resources');

DROP POLICY IF EXISTS "portal_resources_insert_authenticated" ON storage.objects;
CREATE POLICY "portal_resources_insert_authenticated" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'portal-resources');

DROP POLICY IF EXISTS "portal_resources_update_owner_or_admin" ON storage.objects;
CREATE POLICY "portal_resources_update_owner_or_admin" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'portal-resources'
    AND (owner_id = auth.uid()::text OR public.is_admin_or_executive(auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'portal-resources'
    AND (owner_id = auth.uid()::text OR public.is_admin_or_executive(auth.uid()))
  );

DROP POLICY IF EXISTS "portal_resources_delete_owner_or_admin" ON storage.objects;
CREATE POLICY "portal_resources_delete_owner_or_admin" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'portal-resources'
    AND (owner_id = auth.uid()::text OR public.is_admin_or_executive(auth.uid()))
  );

-- --- newsletters -------------------------------------------------------------

DROP POLICY IF EXISTS "newsletters_select_authenticated" ON storage.objects;
CREATE POLICY "newsletters_select_authenticated" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'newsletters');

DROP POLICY IF EXISTS "newsletters_insert_admin_exec" ON storage.objects;
CREATE POLICY "newsletters_insert_admin_exec" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'newsletters'
    AND public.is_admin_or_executive(auth.uid())
  );

DROP POLICY IF EXISTS "newsletters_update_admin_exec" ON storage.objects;
CREATE POLICY "newsletters_update_admin_exec" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'newsletters'
    AND public.is_admin_or_executive(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'newsletters'
    AND public.is_admin_or_executive(auth.uid())
  );

DROP POLICY IF EXISTS "newsletters_delete_admin_exec" ON storage.objects;
CREATE POLICY "newsletters_delete_admin_exec" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'newsletters'
    AND public.is_admin_or_executive(auth.uid())
  );

-- --- training-materials ------------------------------------------------------

DROP POLICY IF EXISTS "training_materials_select_authenticated" ON storage.objects;
CREATE POLICY "training_materials_select_authenticated" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'training-materials');

DROP POLICY IF EXISTS "training_materials_insert_admin_exec" ON storage.objects;
CREATE POLICY "training_materials_insert_admin_exec" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'training-materials'
    AND public.is_admin_or_executive(auth.uid())
  );

DROP POLICY IF EXISTS "training_materials_update_admin_exec" ON storage.objects;
CREATE POLICY "training_materials_update_admin_exec" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'training-materials'
    AND public.is_admin_or_executive(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'training-materials'
    AND public.is_admin_or_executive(auth.uid())
  );

DROP POLICY IF EXISTS "training_materials_delete_admin_exec" ON storage.objects;
CREATE POLICY "training_materials_delete_admin_exec" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'training-materials'
    AND public.is_admin_or_executive(auth.uid())
  );

-- --- evaluations -------------------------------------------------------------
-- The owner-scoped bucket. A member reaches the files they uploaded and no
-- others; admins and executives reach all of them.

DROP POLICY IF EXISTS "evaluations_select_owner_or_admin" ON storage.objects;
CREATE POLICY "evaluations_select_owner_or_admin" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'evaluations'
    AND (owner_id = auth.uid()::text OR public.is_admin_or_executive(auth.uid()))
  );

DROP POLICY IF EXISTS "evaluations_insert_authenticated" ON storage.objects;
CREATE POLICY "evaluations_insert_authenticated" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'evaluations');

DROP POLICY IF EXISTS "evaluations_update_owner_or_admin" ON storage.objects;
CREATE POLICY "evaluations_update_owner_or_admin" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'evaluations'
    AND (owner_id = auth.uid()::text OR public.is_admin_or_executive(auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'evaluations'
    AND (owner_id = auth.uid()::text OR public.is_admin_or_executive(auth.uid()))
  );

DROP POLICY IF EXISTS "evaluations_delete_owner_or_admin" ON storage.objects;
CREATE POLICY "evaluations_delete_owner_or_admin" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'evaluations'
    AND (owner_id = auth.uid()::text OR public.is_admin_or_executive(auth.uid()))
  );

-- --- storage.buckets ---------------------------------------------------------
-- Left with RLS on and no policies, which is the Supabase default and means no
-- browser caller can enumerate or alter the bucket list. Nothing in the
-- application needs it: `SupabaseStorageAdapter.ensureBucket()` in
-- lib/storage/supabase.ts calls listBuckets()/createBucket(), but that adapter
-- has no importers and the buckets are created above anyway. If you wire it up,
-- do not open storage.buckets to do it — creating buckets from the browser is
-- not something this application should be able to do.
