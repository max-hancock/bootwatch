-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-06 — Limit: one custom emoji per person per sighting
-- ════════════════════════════════════════════════════════════════════════════
--
-- THE RULE
--   On any one sighting a person may leave: "Thanks", "Saw it too", and at
--   most ONE of the extra emoji (goat, cry, ...). Picking a different emoji in
--   the app replaces their previous one.
--
-- WHAT THIS DOES
--   1. *** DELETES ROWS *** from public.sighting_reactions — but only surplus
--      custom-emoji reactions: where one person left several custom emoji on
--      the same sighting, their MOST RECENT one is kept and the older ones are
--      removed. This is intentional: the unique index in step 2 cannot be
--      created while those duplicates exist. "Thanks" and "Saw it too" rows are
--      never deleted. The counter trigger lowers sightings.emoji_counts to
--      match automatically.
--
--      Expected impact: on production, none (the custom emoji feature has not
--      shipped to users yet). On dev, whatever was added while testing. The
--      script prints how many rows it removed.
--
--   2. Adds a unique index so the database itself rejects a second custom
--      emoji from the same person on the same sighting.
--
-- NO TABLES OR COLUMNS ARE DROPPED. Sightings themselves are not touched.
--
-- REQUIRES 2026-10-05_reaction_emoji_and_reactor_list.sql to have been run.
--
-- Run it in one go with nothing highlighted: it is a single transaction and
-- only takes effect at the final "commit;".
-- Safe to re-run (a second run removes nothing).
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.sighting_reactions') is null then
    raise exception
      'public.sighting_reactions does not exist. Run the earlier reactions migrations first. Nothing was changed.';
  end if;
end $$;

-- ─── 1. Remove surplus custom emoji (keep each person's most recent) ────────
do $$
declare
  removed integer;
begin
  with ranked as (
    select
      sighting_id,
      user_id,
      kind,
      row_number() over (
        partition by sighting_id, user_id
        order by created_at desc, kind
      ) as rn
    from public.sighting_reactions
    where kind not in ('thanks', 'seen')
  )
  delete from public.sighting_reactions r
  using ranked
  where ranked.rn > 1
    and r.sighting_id = ranked.sighting_id
    and r.user_id = ranked.user_id
    and r.kind = ranked.kind;

  get diagnostics removed = row_count;
  raise notice 'surplus custom emoji reactions removed: %', removed;
end $$;

-- ─── 2. Enforce the limit ───────────────────────────────────────────────────
create unique index if not exists sighting_reactions_one_custom_emoji_idx
  on public.sighting_reactions (sighting_id, user_id)
  where kind not in ('thanks', 'seen');

commit;
