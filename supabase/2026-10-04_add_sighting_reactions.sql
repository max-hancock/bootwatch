-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-04 — Reactions on sightings ("Thanks" and "Saw it too")
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS DOES
--   1. Adds two counter columns to public.sightings: thanks_count, seen_count
--      (both start at 0). Existing rows get 0. Old app versions ignore them.
--   2. Creates public.sighting_reactions: one row per (sighting, user, kind).
--      A user can read, add and remove only their own reactions, and cannot
--      react to their own sighting. Who reacted is never public; only the
--      counts on the sighting are.
--   3. Keeps the counters in step with a trigger, so the app never sends a
--      count itself.
--   4. Replaces sightings_before_insert so a new sighting always starts at 0
--      (a client cannot post a sighting with made-up counts). It keeps the
--      anonymous-author behaviour from
--      2026-10-04_hide_anonymous_sighting_authors.sql.
--
-- ADDS ONLY. NOTHING IS DELETED OR DROPPED, AND NO EXISTING DATA IS CHANGED.
--
-- REQUIRES 2026-10-04_hide_anonymous_sighting_authors.sql to have been run
-- first (it creates public.sighting_authors, used here to stop self-reactions).
-- This script aborts with a clear message if it has not.
--
-- Run it in one go with nothing highlighted: it is a single transaction and
-- only takes effect at the final "commit;".
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.sighting_authors') is null then
    raise exception
      'public.sighting_authors does not exist. Run 2026-10-04_hide_anonymous_sighting_authors.sql first. Nothing was changed.';
  end if;
end $$;

-- ─── 1. Public counters on the sighting ─────────────────────────────────────
alter table public.sightings
  add column if not exists thanks_count integer not null default 0,
  add column if not exists seen_count integer not null default 0;

-- ─── 2. Reactions table (private: who reacted is not readable by others) ────
create table if not exists public.sighting_reactions (
  sighting_id uuid not null references public.sightings (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('thanks', 'seen')),
  created_at timestamptz not null default now(),
  primary key (sighting_id, user_id, kind)
);

comment on table public.sighting_reactions is
  'One row per (sighting, user, kind). Private per user; public totals live in sightings.thanks_count / seen_count.';

create index if not exists sighting_reactions_user_id_idx
  on public.sighting_reactions (user_id);

alter table public.sighting_reactions enable row level security;

revoke all on public.sighting_reactions from anon, authenticated;
grant select, insert, delete on public.sighting_reactions to authenticated;

drop policy if exists "Users read own reactions" on public.sighting_reactions;
create policy "Users read own reactions"
  on public.sighting_reactions for select
  to authenticated
  using (user_id = auth.uid());

-- No reacting to your own sighting (named or anonymous): reactions will feed
-- reputation points, so self-reactions would be free points.
drop policy if exists "Users react to others' sightings" on public.sighting_reactions;
create policy "Users react to others' sightings"
  on public.sighting_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and not exists (
      select 1
      from public.sighting_authors a
      where a.sighting_id = sighting_reactions.sighting_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists "Users remove own reactions" on public.sighting_reactions;
create policy "Users remove own reactions"
  on public.sighting_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- ─── 3. Keep the counters in step ───────────────────────────────────────────
-- SECURITY DEFINER because clients have no update rights on sightings.
create or replace function public.sighting_reactions_sync_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.sighting_reactions;
  d integer;
begin
  if tg_op = 'INSERT' then
    r := new;
    d := 1;
  else
    r := old;
    d := -1;
  end if;

  update public.sightings
  set
    thanks_count = greatest(thanks_count + case when r.kind = 'thanks' then d else 0 end, 0),
    seen_count   = greatest(seen_count   + case when r.kind = 'seen'   then d else 0 end, 0)
  where id = r.sighting_id;

  return null;
end;
$$;

drop trigger if exists sighting_reactions_sync_counts on public.sighting_reactions;
create trigger sighting_reactions_sync_counts
  after insert or delete on public.sighting_reactions
  for each row execute function public.sighting_reactions_sync_counts();

-- ─── 4. New sightings always start at zero ──────────────────────────────────
create or replace function public.sightings_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  n timestamptz := now();
begin
  new.user_id := auth.uid();
  -- Anonymous posts never carry the author on the publicly readable row.
  if coalesce(new.is_anonymous, false) then
    new.user_id := null;
  end if;
  -- Counters are owned by the reactions trigger, never by the client.
  new.thanks_count := 0;
  new.seen_count := 0;
  if new.created_at is null then
    new.created_at := n;
  elsif new.created_at > n + interval '5 minutes' then
    new.created_at := n;
  elsif new.created_at < n - interval '6 hours' then
    new.created_at := n;
  end if;
  return new;
end;
$$;

commit;
