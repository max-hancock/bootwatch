-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-05 — Extra emoji reactions + "who reacted" list for the poster
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS DOES
--   1. Allows a fixed set of extra emoji reactions (goat, cry, laugh, ...) in
--      addition to 'thanks' and 'seen'. The set is enforced here, so a client
--      cannot store arbitrary text as a reaction. To add an emoji later, add
--      its key to the list in section 1 AND to src/utils/reactions.ts.
--   2. Adds sightings.emoji_counts (jsonb, e.g. {"goat": 2}) for the public
--      totals of those extra emoji. thanks_count / seen_count are unchanged.
--   3. Updates the counter trigger to maintain emoji_counts.
--   4. Adds sighting_reactors(sighting_id): returns the display names of the
--      people who reacted, but ONLY when the caller is the person who posted
--      that sighting. Everyone else gets an empty list.
--
-- PRIVACY NOTE
--   After this, reacting to a report shows your display name and avatar to the
--   person who posted it (not to anyone else). The poster stays unknown to the
--   reactor if they posted anonymously.
--
-- ADDS ONLY. NO ROWS ARE DELETED AND NO EXISTING DATA IS CHANGED. The one
-- "drop" below replaces the check constraint on sighting_reactions.kind with a
-- wider one; every existing row ('thanks' / 'seen') still satisfies it.
--
-- REQUIRES 2026-10-04_add_sighting_reactions.sql to have been run first.
--
-- Run it in one go with nothing highlighted: it is a single transaction and
-- only takes effect at the final "commit;".
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.sighting_reactions') is null then
    raise exception
      'public.sighting_reactions does not exist. Run 2026-10-04_add_sighting_reactions.sql first. Nothing was changed.';
  end if;
end $$;

-- ─── 1. Allowed reaction kinds ──────────────────────────────────────────────
-- Replaces the original two-value check with the wider list. Not data loss:
-- a constraint is being widened, no rows are touched.
alter table public.sighting_reactions
  drop constraint if exists sighting_reactions_kind_check;

alter table public.sighting_reactions
  add constraint sighting_reactions_kind_check check (
    kind in (
      'thanks', 'seen',
      'goat', 'cry', 'laugh', 'fire', 'skull', 'salute',
      'clap', 'heart', 'rage', 'siren', 'crown', 'hundred'
    )
  );

-- ─── 2. Public totals for the extra emoji ───────────────────────────────────
alter table public.sightings
  add column if not exists emoji_counts jsonb not null default '{}'::jsonb;

-- ─── 3. Counter trigger: thanks/seen in their columns, the rest in jsonb ────
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

  if r.kind in ('thanks', 'seen') then
    update public.sightings
    set
      thanks_count = greatest(thanks_count + case when r.kind = 'thanks' then d else 0 end, 0),
      seen_count   = greatest(seen_count   + case when r.kind = 'seen'   then d else 0 end, 0)
    where id = r.sighting_id;
  else
    -- Keys that reach zero are removed so the feed never shows an emoji with 0.
    update public.sightings
    set emoji_counts =
      case
        when coalesce((emoji_counts ->> r.kind)::integer, 0) + d <= 0
          then emoji_counts - r.kind
        else jsonb_set(
          emoji_counts,
          array[r.kind],
          to_jsonb(coalesce((emoji_counts ->> r.kind)::integer, 0) + d)
        )
      end
    where id = r.sighting_id;
  end if;

  return null;
end;
$$;

-- New sightings always start with no reactions (client cannot supply counts).
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
  new.emoji_counts := '{}'::jsonb;
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

-- ─── 4. Who reacted — visible to the poster only ────────────────────────────
-- SECURITY DEFINER because sighting_reactions rows are otherwise readable only
-- by the reactor. The author check is inside the query: for anyone who did not
-- post the sighting it returns zero rows.
create or replace function public.sighting_reactors(p_sighting_id uuid)
returns table (
  kind text,
  display_name text,
  avatar_color text,
  avatar_url text,
  reacted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.kind,
    coalesce(p.display_name, 'Someone') as display_name,
    p.avatar_color,
    p.avatar_url,
    r.created_at as reacted_at
  from public.sighting_reactions r
  left join public.profiles p on p.id = r.user_id
  where r.sighting_id = p_sighting_id
    and exists (
      select 1
      from public.sighting_authors a
      where a.sighting_id = p_sighting_id
        and a.user_id = auth.uid()
    )
  order by r.created_at desc;
$$;

comment on function public.sighting_reactors(uuid) is
  'Reactors (display name, avatar, kind) for a sighting. Returns rows only when the caller is the sighting''s author.';

revoke all on function public.sighting_reactors(uuid) from public, anon;
grant execute on function public.sighting_reactors(uuid) to authenticated;

commit;
