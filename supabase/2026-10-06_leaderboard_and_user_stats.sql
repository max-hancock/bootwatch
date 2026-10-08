-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-06 — Points, monthly leaderboard, and per-user stats
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS DOES
--   Adds four read-only functions. No tables, columns, rows or policies are
--   created, changed or deleted, and nothing is stored: scores are calculated
--   from existing sightings every time they are asked for.
--
--   1. report_points(sighting)   — points one report is worth.
--   2. leaderboard(limit, months_ago) — ranked users for a calendar month.
--   3. leaderboard_all_time(limit)    — ranked users over all time. Nothing is
--      ever reset: the monthly board is just a view of one month's reports.
--   4. user_report_stats(user_id)     — the numbers behind a profile card.
--
-- SCORING (change the numbers in report_points and nowhere else in SQL; the
-- "How points work" text in src/screens/LeaderboardScreen.tsx should match)
--   100  for posting a report
--   + 25 for each reaction it receives ("Thanks", "Saw it too" or any emoji;
--        all reactions are worth the same)
--   Posting is worth the most; reactions are the bonus for a report other
--   people found useful.
--
-- ANONYMOUS REPORTS
--   The leaderboard and public profile numbers count ONLY reports posted under
--   the user's name (sightings.user_id is not null). Anonymous reports never
--   move a public score, so nobody can work out who posted one by watching the
--   board. A user's own private totals (anonymous included) are returned by
--   user_report_stats only when they ask about themselves.
--
-- MONTHS are calendar months in America/Boise time, by the report's date.
--
-- All of them run with the caller's own permissions (SECURITY INVOKER): they can
-- only read what that user could already read.
--
-- REQUIRES the reactions migrations (thanks_count, seen_count, emoji_counts on
-- sightings) and public.sighting_authors.
--
-- Run it in one go with nothing highlighted. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sightings' and column_name = 'emoji_counts'
  ) then
    raise exception
      'sightings.emoji_counts does not exist. Run the reactions migrations first. Nothing was changed.';
  end if;
end $$;

-- ─── 1. Points for one report ───────────────────────────────────────────────
create or replace function public.report_points(s public.sightings)
returns integer
language sql
stable
set search_path = public
as $$
  select (
    100
    + 25 * (
      s.seen_count
      + s.thanks_count
      + coalesce((select sum(e.value::integer) from jsonb_each_text(s.emoji_counts) e), 0)
    )
  )::integer;
$$;

-- ─── 2. Monthly leaderboard ─────────────────────────────────────────────────
-- p_months_ago: 0 = current month, 1 = last month, ...
create or replace function public.leaderboard(
  p_limit integer default 50,
  p_months_ago integer default 0
)
returns table (
  place bigint,
  user_id uuid,
  display_name text,
  avatar_color text,
  avatar_url text,
  points bigint,
  reports bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', now() at time zone 'America/Boise')
        - make_interval(months => greatest(coalesce(p_months_ago, 0), 0)) as start_local
  ),
  win as (
    select
      start_local at time zone 'America/Boise' as start_at,
      (start_local + interval '1 month') at time zone 'America/Boise' as end_at
    from bounds
  ),
  scored as (
    select
      s.user_id,
      sum(public.report_points(s))::bigint as points,
      count(*)::bigint as reports
    from public.sightings s, win w
    where s.user_id is not null
      and s.created_at >= w.start_at
      and s.created_at < w.end_at
    group by s.user_id
  )
  select
    rank() over (order by sc.points desc, sc.reports desc) as place,
    sc.user_id,
    coalesce(p.display_name, 'Anonymous') as display_name,
    p.avatar_color,
    p.avatar_url,
    sc.points,
    sc.reports
  from scored sc
  left join public.profiles p on p.id = sc.user_id
  order by 1, 3
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- ─── 3. All-time leaderboard ────────────────────────────────────────────────
create or replace function public.leaderboard_all_time(
  p_limit integer default 50
)
returns table (
  place bigint,
  user_id uuid,
  display_name text,
  avatar_color text,
  avatar_url text,
  points bigint,
  reports bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with scored as (
    select
      s.user_id,
      sum(public.report_points(s))::bigint as points,
      count(*)::bigint as reports
    from public.sightings s
    where s.user_id is not null
    group by s.user_id
  )
  select
    rank() over (order by sc.points desc, sc.reports desc) as place,
    sc.user_id,
    coalesce(p.display_name, 'Anonymous') as display_name,
    p.avatar_color,
    p.avatar_url,
    sc.points,
    sc.reports
  from scored sc
  left join public.profiles p on p.id = sc.user_id
  order by 1, 3
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- ─── 4. Stats for a profile card ────────────────────────────────────────────
-- "private" is null unless the caller is asking about themselves; it then
-- includes their anonymous reports (read through sighting_authors, where RLS
-- only ever returns the caller's own rows).
create or replace function public.user_report_stats(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with win as (
    select
      date_trunc('month', now() at time zone 'America/Boise') at time zone 'America/Boise' as start_at
  ),
  named as (
    select s.created_at, s.complex_id, s.thanks_count, s.seen_count, public.report_points(s) as pts
    from public.sightings s
    where s.user_id = p_user_id
  ),
  mine as (
    select s.is_anonymous, public.report_points(s) as pts
    from public.sightings s
    join public.sighting_authors a on a.sighting_id = s.id
    where a.user_id = p_user_id
      and p_user_id = auth.uid()
  )
  select jsonb_build_object(
    'user_id', p_user_id,
    'display_name', (select p.display_name from public.profiles p where p.id = p_user_id),
    'avatar_color', (select p.avatar_color from public.profiles p where p.id = p_user_id),
    'avatar_url', (select p.avatar_url from public.profiles p where p.id = p_user_id),
    'member_since', (select p.created_at from public.profiles p where p.id = p_user_id),
    'month', jsonb_build_object(
      'points', coalesce((select sum(n.pts) from named n, win w where n.created_at >= w.start_at), 0),
      'reports', (select count(*) from named n, win w where n.created_at >= w.start_at),
      'place', (select l.place from public.leaderboard(100, 0) l where l.user_id = p_user_id)
    ),
    'all_time', jsonb_build_object(
      'points', coalesce((select sum(n.pts) from named n), 0),
      'place', (select l.place from public.leaderboard_all_time(100) l where l.user_id = p_user_id),
      'reports', (select count(*) from named n),
      'thanks', coalesce((select sum(n.thanks_count) from named n), 0),
      'confirmations', coalesce((select sum(n.seen_count) from named n), 0)
    ),
    'top_complex_id', (
      select n.complex_id
      from named n
      group by n.complex_id
      order by count(*) desc, max(n.created_at) desc
      limit 1
    ),
    'private', case
      when p_user_id = auth.uid() then jsonb_build_object(
        'reports', (select count(*) from mine),
        'anonymous_reports', (select count(*) from mine m where m.is_anonymous is true),
        'points', coalesce((select sum(m.pts) from mine m), 0)
      )
      else null
    end
  );
$$;

-- Signed-in users only.
revoke all on function public.report_points(public.sightings) from public, anon;
revoke all on function public.leaderboard(integer, integer) from public, anon;
revoke all on function public.leaderboard_all_time(integer) from public, anon;
revoke all on function public.user_report_stats(uuid) from public, anon;
grant execute on function public.report_points(public.sightings) to authenticated;
grant execute on function public.leaderboard(integer, integer) to authenticated;
grant execute on function public.leaderboard_all_time(integer) to authenticated;
grant execute on function public.user_report_stats(uuid) to authenticated;

commit;
