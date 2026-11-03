-- ════════════════════════════════════════════════════════════════════════════
-- 2026-11-02 — Photo reports: two fixes from the v2.0 security review
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. A hidden profile photo could be put back by adding "?anything" to its
--    URL, because the check compared exact URLs. Now URLs are compared without
--    their query string or #fragment (same file = same photo), everywhere:
--    the profile trigger, report counting, and the "already hidden" check.
--
-- 2. Two brand-new accounts could hide any photo. Now only reporters whose
--    account is at least 7 days old count towards the automatic hide.
--    Reports from newer accounts are still saved, so you see them when you
--    review (supabase/MODERATION.md), but they don't hide anything.
--
-- WHAT THIS DOES
--   Adds one helper function, photo_url_key(), and replaces report_photo()
--   and profiles_block_hidden_avatar() with fixed versions. Same names and
--   arguments, so the app needs no change.
--
-- NOTHING IS DELETED OR DROPPED. No rows are changed.
--
-- REQUIRES 2026-11-02_photo_reports.sql.
--
-- Run it in one go with nothing highlighted. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.photo_reports') is null or to_regclass('public.hidden_photos') is null then
    raise exception
      'Photo report tables are missing. Run 2026-11-02_photo_reports.sql first. Nothing was changed.';
  end if;
end $$;

-- The URL without ?query or #fragment: two URLs with the same key are the same file.
create or replace function public.photo_url_key(p_url text)
returns text
language sql
immutable
as $$ select regexp_replace(p_url, '[?#].*$', '') $$;

create index if not exists photo_reports_url_key_idx on public.photo_reports (public.photo_url_key(photo_url));
create index if not exists hidden_photos_url_key_idx on public.hidden_photos (public.photo_url_key(photo_url));

-- ─── report_photo(): same as before, plus fixes 1 and 2 ─────────────────────
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

  -- One report per person per file, whatever query string the URL carries.
  if exists (
    select 1 from public.photo_reports r
    where r.reporter_id = uid and public.photo_url_key(r.photo_url) = public.photo_url_key(url)
  ) then
    return 'already_reported';
  end if;

  insert into public.photo_reports (reporter_id, kind, sighting_id, owner_id, photo_url, reason)
  values (uid, p_kind, sid, v_owner, url, p_reason)
  on conflict (reporter_id, photo_url) do nothing;
  if not found then
    return 'already_reported';
  end if;

  -- Fix 2: only established accounts (7+ days old) count towards hiding.
  select count(distinct r.reporter_id) into reporters
  from public.photo_reports r
  join auth.users u on u.id = r.reporter_id
  where public.photo_url_key(r.photo_url) = public.photo_url_key(url)
    and u.created_at < now() - interval '7 days';

  -- Already hidden, or restored after review: leave it as it is.
  if reporters < 2 or exists (
    select 1 from public.hidden_photos h
    where public.photo_url_key(h.photo_url) = public.photo_url_key(url)
  ) then
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

-- ─── Fix 1: block a hidden profile photo even with a different ?query ───────
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
       where public.photo_url_key(h.photo_url) = public.photo_url_key(new.avatar_url)
         and h.review <> 'restored'
     ) then
    raise exception 'This photo was removed after reports. Please choose a different one.'
      using hint = 'photo_hidden';
  end if;
  return new;
end;
$$;

commit;
