# Pending for production

Everything below has been run on the **dev** project but **not yet on
production**. Run it when the app update that needs it ships, in the order
listed. Tick items off (or delete them) as they are done on production, and
add new ones here whenever something is run on dev only.

Production project ref: `jrorzmwsqxynwbmuqsoq` (from
`scripts/clone-schema-to-dev.ps1`; confirm before deploying).

## How to run each SQL file

1. Open the file from this folder and copy the **whole** file.
2. Paste it into the production SQL editor.
3. Click in the editor so **nothing is highlighted**, then press Run once.
   Each file is a single transaction: if it errors, nothing is changed.

## Order

Run these top to bottom. Each file checks that the ones it depends on have
already run, and aborts with a clear message if not.

| # | What | Type | Notes |
|---|------|------|-------|
| 1 | `2026-10-04_add_sighting_reactions.sql` | SQL | Reactions table and counters. Adds only. |
| 2 | `2026-10-05_reaction_emoji_and_reactor_list.sql` | SQL | Extra emoji and the "who reacted" list. Adds only. |
| 3 | `2026-10-06_leaderboard_and_user_stats.sql` | SQL | Points, monthly and all-time leaderboards, profile stats. Read-only functions. Use the current file: it was edited after it was first run on dev (scoring changed to 100 per report / 25 per reaction, all-time board added). |
| 4 | `2026-10-06_one_custom_emoji_per_user.sql` | SQL | **Deletes rows**: surplus custom-emoji reactions. Expected to remove 0 on production. Prints how many it removed. |
| 5 | `2026-10-08_reaction_notifications.sql` | SQL | Dedup table and the profile on/off switch for reaction notifications. Adds only. |
| 6 | `notify-reaction` | Edge function | `npx supabase functions deploy notify-reaction --project-ref jrorzmwsqxynwbmuqsoq`. Leave **Verify JWT on**. Deploy after #5. |
| 7 | `2026-10-26_sighting_rate_limit.sql` | SQL | Posting limits. Takes effect for every app version immediately, including the current App Store build. |

## Check afterwards

Run in the production SQL editor; every number should match the comment.

```sql
select
  to_regclass('public.sighting_reactions') is not null       as reactions_table,      -- true
  to_regclass('public.reaction_notifications') is not null   as notify_dedup_table,   -- true
  exists (select 1 from pg_proc where proname = 'leaderboard_all_time') as leaderboards, -- true
  exists (select 1 from pg_trigger where tgname = 'sightings_rate_limit') as rate_limit,  -- true
  (select count(*) from public.sightings
     where is_anonymous is true and user_id is not null)     as anon_exposed;         -- 0
```

## Already on production

For the record, so nothing is run twice:

- `2026-10-04_hide_anonymous_sighting_authors.sql`
- `2026-10-04_anonymous_sighting_photo_paths.sql`
- `notify-sighting` edge function (sighting_authors lookup)
