-- SUPERSEDED by supabase/storage_setup.sql. DO NOT RUN.
--
-- Kept for history only. The policies below are named as if they check
-- ownership but only check bucket_id, so re-running this file would let any
-- signed-in user delete or overwrite any other user's photos - RLS policies are
-- OR'd together, so these override the folder scoping in storage_setup.sql.
-- Use storage_setup.sql instead; it drops these and creates correct ones.

-- Create the storage buckets the app uploads to.
-- Run this in the Supabase SQL editor (Database -> SQL editor -> New query).

insert into storage.buckets (id, name, public)
values ('sighting-photos', 'sighting-photos', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

-- Allow authenticated users to upload to sighting-photos.
drop policy if exists "Authenticated can upload sighting photos" on storage.objects;
create policy "Authenticated can upload sighting photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'sighting-photos');

-- Allow anyone to read sighting photos (bucket is public, this is for completeness).
drop policy if exists "Public can read sighting photos" on storage.objects;
create policy "Public can read sighting photos"
  on storage.objects for select
  to public
  using (bucket_id = 'sighting-photos');

-- Allow users to delete their own sighting photos (path starts with their user id).
drop policy if exists "Users can delete own sighting photos" on storage.objects;
create policy "Users can delete own sighting photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'sighting-photos');

-- Avatars bucket policies.
drop policy if exists "Authenticated can upload avatars" on storage.objects;
create policy "Authenticated can upload avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "Public can read avatars" on storage.objects;
create policy "Public can read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "Users can update own avatars" on storage.objects;
create policy "Users can update own avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "Users can delete own avatars" on storage.objects;
create policy "Users can delete own avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars');
