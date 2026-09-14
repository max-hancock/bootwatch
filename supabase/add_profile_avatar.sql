-- PARTIALLY SUPERSEDED: everything below touching Storage (the `avatars` bucket
-- config and its storage.objects policies) now lives in
-- supabase/storage_setup.sql. The profiles.avatar_url column added here is not
-- superseded, and is part of the schema baseline.
--
-- Same problem as storage_sighting_photos_policies.sql: this file drops only its
-- own policy names, so the permissive avatar update/delete policies from
-- create_storage_buckets.sql survived alongside it.

-- Run in Supabase SQL Editor.
-- Adds optional profile photos. Image bytes live in a public Storage bucket
-- named `avatars`; the public URL is stored on profiles.avatar_url.
--
-- IMPORTANT: before running this migration, create the bucket in the Dashboard:
--   Storage → New bucket → name: avatars → Public bucket: ON
-- (Policies below scope writes to each user's own folder.)

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL of the user''s profile photo in the `avatars` storage bucket. Nullable; optional feature.';

-- Bucket-level guardrails. Keeping the cap at 2 MB and the mime whitelist
-- tight means a compromised client can't upload a 40 MB GIF or a non-image
-- blob with a faked content-type. The app also enforces this client-side so
-- users get a friendly message before the upload round-trip.
--
-- 2 MB in bytes: 2 * 1024 * 1024 = 2097152.
update storage.buckets
set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/gif'
  ]
where id = 'avatars';

-- Storage RLS for bucket `avatars`.
-- App uploads to path: {auth.uid()}/{timestamp}.{ext}
-- Anyone can read (required for getPublicUrl to render images in the feed),
-- but only the owning user can write/update/delete within their folder.

drop policy if exists "Authenticated upload avatar in own folder" on storage.objects;
drop policy if exists "Authenticated update own avatar" on storage.objects;
drop policy if exists "Authenticated delete own avatar" on storage.objects;
drop policy if exists "Public read avatars" on storage.objects;

create policy "Authenticated upload avatar in own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Authenticated update own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Authenticated delete own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Public read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');
