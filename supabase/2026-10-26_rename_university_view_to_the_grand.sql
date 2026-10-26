-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-26 — Rename "University View" to "The Grand" in public.complexes
-- ════════════════════════════════════════════════════════════════════════════
--
-- THE PROBLEM
--   The complex was renamed in the app's data (src/data/rexburg-housing.json),
--   but the database row was never updated. Push notifications build their
--   text from the database (notify-sighting, notify-reaction), so users were
--   told "Booter spotted near University View!" for a complex that no longer
--   goes by that name. The app screens were already right: they use the app's
--   own data.
--
-- WHAT THIS DOES
--   *** DATA CHANGE *** Updates ONE row: the display name of the complex with
--   id 'university-view' becomes 'The Grand'. Nothing else changes. No rows are
--   deleted.
--
--   The id stays 'university-view' on purpose. It is an internal key that every
--   past report, saved complex and parking timer for this complex points to;
--   users never see it, and changing it would break those links.
--
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

begin;

update public.complexes
set name = 'The Grand'
where id = 'university-view'
  and name is distinct from 'The Grand';

do $$
declare
  current_name text;
begin
  select name into current_name from public.complexes where id = 'university-view';
  raise notice 'complex university-view is now named: %', coalesce(current_name, '(row not found)');
end $$;

commit;
