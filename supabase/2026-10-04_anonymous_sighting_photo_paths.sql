-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-04 — Anonymous sighting photos: stop putting the user id in the URL
-- ════════════════════════════════════════════════════════════════════════════
--
-- THE PROBLEM
--   Sighting photos are uploaded to sighting-photos/<user id>/<file>, and the
--   public photo URL is stored on the sighting. For an anonymous post that URL
--   gives away the poster's user id.
--
-- WHAT THIS DOES
--   Adds two storage policies so the app can upload anonymous photos to
--   sighting-photos/anon/<random name> instead, and so the uploader (and only
--   the uploader) can delete them. Ownership is tracked by storage itself
--   (storage.objects.owner_id), not by the path.
--
-- Adds policies only. NOTHING IS DELETED, MOVED OR CHANGED. Existing policies
-- and existing photos are untouched.
--
-- NOT COVERED HERE
--   Photos already attached to existing anonymous sightings keep their old
--   URLs (with the user id in the path) until they are moved. That needs a
--   one-off script with the service role key; it is not done by this file.
--
-- ORDER
--   Run this BEFORE shipping the app update that uploads to anon/. Without
--   these policies that upload is rejected and the report posts with no photo.
--
-- NOTE
--   supabase/storage_setup.sql drops every policy mentioning 'sighting-photos'
--   before recreating its own. If that file is ever re-run, re-run this one
--   after it.
--
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists "Authenticated upload anonymous sighting photos" on storage.objects;
create policy "Authenticated upload anonymous sighting photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sighting-photos'
    and (storage.foldername(name))[1] = 'anon'
  );

drop policy if exists "Authenticated delete own anonymous sighting photos" on storage.objects;
create policy "Authenticated delete own anonymous sighting photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sighting-photos'
    and (storage.foldername(name))[1] = 'anon'
    and owner_id = auth.uid()::text
  );

commit;
