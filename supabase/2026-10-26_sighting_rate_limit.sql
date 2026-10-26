-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-26 — Rate limit on posting sightings
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY
--   Reports earn leaderboard points (100 each), which makes spamming them
--   worth something. The limit is enforced here in the database, so it holds
--   no matter which app version, or which client, is posting.
--
-- THE LIMITS (per user, counting named and anonymous reports alike)
--   * The same kind of report at the same complex: once per 30 minutes.
--     ("Spotted a truck" then "I got booted" at one complex is still allowed.)
--   * Any reports: at most 4 per hour.
--   * Any reports: at most 12 per day (24 hours).
--   A boot truck often works through several lots in a row, so the hourly cap
--   leaves room for someone following one around.
--
--   To change them, edit the numbers in sightings_rate_limit() below and
--   re-run this file. The app shows the message raised here as-is.
--
-- WHAT THIS DOES
--   Adds one BEFORE INSERT trigger on public.sightings that rejects a report
--   over the limit with a friendly message. Inserts made without a signed-in
--   user (SQL editor, service role) are never limited.
--
-- ADDS ONLY. NOTHING IS DELETED, DROPPED OR CHANGED. Existing reports are not
-- touched.
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

-- Speeds up the "this user's recent reports" lookups below.
create index if not exists sighting_authors_user_created_idx
  on public.sighting_authors (user_id, created_at desc);

-- SECURITY DEFINER so the counts see every report the user has posted. It only
-- ever counts the caller's own reports (auth.uid()).
-- Times come from sighting_authors.created_at, the real insert time: a
-- sighting's own created_at can be backdated by the reporter.
create or replace function public.sightings_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  same_spot integer;
  last_hour integer;
  last_day integer;
begin
  if uid is null then
    return new;
  end if;

  select count(*) into same_spot
  from public.sighting_authors a
  join public.sightings s on s.id = a.sighting_id
  where a.user_id = uid
    and a.created_at > now() - interval '30 minutes'
    and s.complex_id = new.complex_id
    and coalesce(s.report_type, 'spotter') = coalesce(new.report_type, 'spotter');
  if same_spot >= 1 then
    raise exception 'You already reported this at this complex in the last 30 minutes. It''s still on the feed.'
      using hint = 'rate_limited';
  end if;

  select count(*) into last_hour
  from public.sighting_authors a
  where a.user_id = uid
    and a.created_at > now() - interval '1 hour';
  if last_hour >= 4 then
    raise exception 'You can post up to 4 reports an hour. Try again a little later.'
      using hint = 'rate_limited';
  end if;

  select count(*) into last_day
  from public.sighting_authors a
  where a.user_id = uid
    and a.created_at > now() - interval '24 hours';
  if last_day >= 12 then
    raise exception 'You''ve hit the limit of 12 reports a day. Thanks for looking out. Try again tomorrow.'
      using hint = 'rate_limited';
  end if;

  return new;
end;
$$;

drop trigger if exists sightings_rate_limit on public.sightings;
create trigger sightings_rate_limit
  before insert on public.sightings
  for each row execute function public.sightings_rate_limit();

commit;
