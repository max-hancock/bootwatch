-- ════════════════════════════════════════════════════════════════════════════
-- 2026-11-02 — Report a photo; hide it automatically after 2 reports
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY
--   Sighting photos and profile photos are public (feed, Ranks, profile
--   cards). App Store guideline 1.2 expects users to be able to report
--   objectionable content, and the developer to act on it.
--
-- HOW IT WORKS
--   * The app calls report_photo('sighting' | 'avatar', <id>, <reason>).
--   * One report per person per photo. You can't report your own photo.
--     At most 20 reports per person per day.
--   * When 2 different people have reported the same photo, it is hidden
--     right away: the sighting's photo_url (or the profile's avatar_url) is
--     set to NULL, and the photo's URL is saved in public.hidden_photos with
--     review = 'pending'. The image file itself is NOT deleted, so it can be
--     reviewed and, if it was fine, restored.
--   * A hidden profile photo can't be put back by its owner (they can upload
--     a different one). A photo you restore is never auto-hidden again.
--   * Reviewing: see supabase/MODERATION.md.
--
-- WHAT THIS DOES
--   Adds tables photo_reports and hidden_photos (no client access: RLS on,
--   no policies), the report_photo() function for signed-in users, the
--   restore_hidden_photo() function (SQL editor only), and one trigger on
--   public.profiles.
--
-- ADDS ONLY. NOTHING IS DELETED OR DROPPED. Existing sightings and profiles are
-- not touched until someone reports a photo.
--
-- REQUIRES public.sighting_authors
-- (2026-10-04_hide_anonymous_sighting_authors.sql).
--
-- Run it in one go with nothing highlighted. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.sighting_authors') is null then
    raise exception
      'public.sighting_authors does not exist. Run 2026-10-04_hide_anonymous_sighting_authors.sql first. Nothing was changed.';
  end if;
end $$;

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.photo_reports (
  id bigserial primary key,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('sighting', 'avatar')),
  sighting_id uuid references public.sightings (id) on delete set null,
  -- Whose photo it is (the sighting's author, or the profile owner).
  owner_id uuid references auth.users (id) on delete set null,
  photo_url text not null,
  reason text not null check (reason in ('inappropriate', 'personal_info', 'not_relevant', 'other')),
  created_at timestamptz not null default now(),
  unique (reporter_id, photo_url)
);

create index if not exists photo_reports_url_idx on public.photo_reports (photo_url);
create index if not exists photo_reports_reporter_created_idx
  on public.photo_reports (reporter_id, created_at desc);

comment on table public.photo_reports is
  'One row per user report of a photo. Written only by report_photo(). See supabase/MODERATION.md.';

create table if not exists public.hidden_photos (
  photo_url text primary key,
  kind text not null check (kind in ('sighting', 'avatar')),
  sighting_id uuid references public.sightings (id) on delete set null,
  owner_id uuid references auth.users (id) on delete set null,
  report_count integer not null,
  hidden_at timestamptz not null default now(),
  -- pending: hidden, waiting for review. removed: you agreed and deleted the
  -- file. restored: you put it back; it will not be auto-hidden again.
  review text not null default 'pending' check (review in ('pending', 'removed', 'restored')),
  reviewed_at timestamptz
);

comment on table public.hidden_photos is
  'Photos hidden after reports, waiting for review. See supabase/MODERATION.md.';

-- No policies: the app can't read or write these tables directly.
alter table public.photo_reports enable row level security;
alter table public.hidden_photos enable row level security;

-- ─── report_photo() ─────────────────────────────────────────────────────────
-- Returns 'reported', 'hidden' (this report hid it), 'already_reported', or
-- 'gone' (no photo there any more). Errors carry a hint the app can read.
create or replace function public.report_photo(p_kind text, p_target uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  url text;
  v_owner uuid;
  sid uuid;
  recent integer;
  reporters integer;
begin
  if uid is null then
    raise exception 'Sign in to report a photo.' using hint = 'not_signed_in';
  end if;
  if p_reason is null or p_reason not in ('inappropriate', 'personal_info', 'not_relevant', 'other') then
    raise exception 'Unknown report reason.' using hint = 'bad_request';
  end if;

  if p_kind = 'sighting' then
    select s.photo_url, a.user_id into url, v_owner
    from public.sightings s
    left join public.sighting_authors a on a.sighting_id = s.id
    where s.id = p_target;
    sid := p_target;
  elsif p_kind = 'avatar' then
    select p.avatar_url, p.id into url, v_owner
    from public.profiles p
    where p.id = p_target;
  else
    raise exception 'Unknown photo type.' using hint = 'bad_request';
  end if;

  if url is null then
    return 'gone';
  end if;
  if v_owner = uid then
    raise exception 'You can''t report your own photo.' using hint = 'own_photo';
  end if;

  select count(*) into recent
  from public.photo_reports
  where reporter_id = uid and created_at > now() - interval '24 hours';
  if recent >= 20 then
    raise exception 'You''ve reported a lot of photos today. Try again tomorrow.' using hint = 'rate_limited';
  end if;

  insert into public.photo_reports (reporter_id, kind, sighting_id, owner_id, photo_url, reason)
  values (uid, p_kind, sid, v_owner, url, p_reason)
  on conflict (reporter_id, photo_url) do nothing;
  if not found then
    return 'already_reported';
  end if;

  select count(distinct reporter_id) into reporters
  from public.photo_reports
  where photo_url = url;

  -- Already hidden, or restored after review: leave it as it is.
  if reporters < 2 or exists (select 1 from public.hidden_photos h where h.photo_url = url) then
    return 'reported';
  end if;

  insert into public.hidden_photos (photo_url, kind, sighting_id, owner_id, report_count)
  values (url, p_kind, sid, v_owner, reporters)
  on conflict (photo_url) do nothing;
  if not found then
    return 'reported'; -- another report hid it at the same moment
  end if;

  if p_kind = 'sighting' then
    update public.sightings set photo_url = null where id = sid and photo_url = url;
  else
    update public.profiles set avatar_url = null where id = v_owner and avatar_url = url;
  end if;

  return 'hidden';
end;
$$;

revoke all on function public.report_photo(text, uuid, text) from public, anon;
grant execute on function public.report_photo(text, uuid, text) to authenticated;

-- ─── Owners can't put a hidden profile photo back ───────────────────────────
create or replace function public.profiles_block_hidden_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.avatar_url is not null
     and new.avatar_url is distinct from old.avatar_url
     and exists (
       select 1 from public.hidden_photos h
       where h.photo_url = new.avatar_url and h.review <> 'restored'
     ) then
    raise exception 'This photo was removed after reports. Please choose a different one.'
      using hint = 'photo_hidden';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_block_hidden_avatar on public.profiles;
create trigger profiles_block_hidden_avatar
  before update of avatar_url on public.profiles
  for each row execute function public.profiles_block_hidden_avatar();

-- ─── restore_hidden_photo() — for you, in the SQL editor ────────────────────
-- Puts a hidden photo back (if its sighting still exists, or the profile has
-- no newer photo) and marks it 'restored' so it is never auto-hidden again.
create or replace function public.restore_hidden_photo(p_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.hidden_photos%rowtype;
begin
  select * into h from public.hidden_photos where photo_url = p_url;
  if not found then
    return 'not found';
  end if;

  update public.hidden_photos
  set review = 'restored', reviewed_at = now()
  where photo_url = p_url;

  if h.kind = 'sighting' and h.sighting_id is not null then
    update public.sightings set photo_url = p_url where id = h.sighting_id and photo_url is null;
  elsif h.kind = 'avatar' and h.owner_id is not null then
    update public.profiles set avatar_url = p_url where id = h.owner_id and avatar_url is null;
  end if;

  return 'restored';
end;
$$;

revoke all on function public.restore_hidden_photo(text) from public, anon, authenticated;

commit;
