-- Authoritative Storage setup for BootWatch: buckets + storage.objects RLS.
--
-- Supersedes three earlier files, each of which now carries a pointer here:
--   create_storage_buckets.sql
--   storage_sighting_photos_policies.sql
--   add_profile_avatar.sql
--
-- ─── Why this file exists ───────────────────────────────────────────────────
-- Those three ran in sequence against production and each created its own
-- policies. The two newer ones drop policies only by *their own* names, so the
-- oldest file's policies survived alongside them. Postgres RLS policies are
-- permissive and OR'd together, so a policy that checks only bucket_id defeats
-- the folder scoping in the newer ones. create_storage_buckets.sql created:
--
--   create policy "Users can delete own sighting photos"
--     on storage.objects for delete to authenticated
--     using (bucket_id = 'sighting-photos');
--
-- which, despite the name, lets any signed-in user delete anyone's photo. The
-- avatar update/delete policies in that file have the same flaw.
--
-- So this file *resets* policy state for both buckets rather than patching it:
-- it drops every policy on storage.objects that references either bucket -
-- including any created from the Dashboard that no SQL file knows about - then
-- recreates a single correct, folder-scoped set.
--
-- Idempotent. Safe to re-run.
--
-- ─── Runs as one transaction, on purpose ────────────────────────────────────
-- This file drops the existing policies before recreating them. Without the
-- begin/commit below, each statement would autocommit and there would be a
-- window - short, but against a live app - where these buckets had no policies
-- at all, so every upload and delete would be denied. Wrapping it also means a
-- failure part-way through rolls back instead of leaving production with the
-- old policies dropped and the new ones missing.
--
-- ─── What the folder scoping relies on ──────────────────────────────────────
-- Both upload paths begin with the uploader's user id, so
-- (storage.foldername(name))[1] is the owner:
--   sighting-photos  src/components/ReportSightingModal.tsx
--                    `${user.id}/${Date.now()}.${ext}`
--   avatars          src/screens/ProfileScreen.tsx
--                    `${userId}/avatar-${Date.now()}.${ext}`
-- Changing either path without changing these policies will break uploads.

begin;

-- ─── 1. Buckets ─────────────────────────────────────────────────────────────
-- Both are public because the feed and profiles render images via getPublicUrl.
-- Read access is therefore intentionally open; writes are locked to the owner.

-- sighting-photos: no size cap or mime whitelist, which mirrors production.
-- Set explicitly rather than left alone so a clone matches production exactly.
-- Adding caps here is worth doing but is a behaviour change that could reject
-- real uploads, so it belongs in its own change tested against dev first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sighting-photos', 'sighting-photos', true, null, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- avatars: 2 MB cap (2 * 1024 * 1024) and an image-only whitelist, so a
-- bypassed client cannot upload a 40 MB GIF or a non-image with a faked
-- content-type. src/screens/ProfileScreen.tsx enforces the same cap client-side
-- (AVATAR_MAX_BYTES) purely so users get a friendly message first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─── 2. Clear existing policies for these two buckets ───────────────────────
-- Matching on the policy body rather than a hardcoded name list catches the
-- legacy names from all three superseded files plus anything added by hand.
--
-- Note the patterns are 'sighting-photos' and 'avatars' exactly. The unused
-- 'sighting-photo' (singular) bucket in production is deliberately left alone,
-- and does not match '%sighting-photos%'.
do $$
declare
  p record;
  n int := 0;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%sighting-photos%'
        or coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%avatars%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
    raise notice 'dropped storage policy: %', p.policyname;
    n := n + 1;
  end loop;
  raise notice 'dropped % storage policy(ies) for sighting-photos/avatars', n;
end $$;

-- ─── 3. sighting-photos policies ────────────────────────────────────────────

create policy "Authenticated upload sighting photos in own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sighting-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Authenticated update own sighting photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'sighting-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'sighting-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner-only delete. useSightings.removePhotoIfOwned strips the path after
-- '/sighting-photos/', so the leading folder is still the owner's id.
create policy "Authenticated delete own sighting photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sighting-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Required for getPublicUrl to render photos in the feed.
create policy "Public read sighting photos"
  on storage.objects for select
  using (bucket_id = 'sighting-photos');

-- ─── 4. avatars policies ────────────────────────────────────────────────────

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

commit;

-- ─── Sanity checks ──────────────────────────────────────────────────────────
-- Expect 8 rows, and every non-SELECT policy scoped by storage.foldername:
--
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   order by policyname;
--
-- Expect avatars capped at 2097152 with 5 mime types, sighting-photos uncapped:
--
--   select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets
--   where id in ('sighting-photos', 'avatars')
--   order by id;
