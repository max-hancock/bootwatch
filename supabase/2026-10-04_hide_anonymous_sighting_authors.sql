-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-04 — Stop exposing who posted anonymous sightings
-- ════════════════════════════════════════════════════════════════════════════
--
-- THE PROBLEM
--   public.sightings is readable by everyone (policy "Sightings are viewable by
--   everyone"), and that includes the user_id column. "Post anonymously" only
--   hid the name on screen; anyone with the app's public key could read the
--   poster's user id straight from the API and look up their profile.
--
-- WHAT THIS DOES
--   1. Creates public.sighting_authors: a private record of who posted each
--      sighting. A user can read only their own rows.
--   2. Copies the author of every existing sighting into it.
--   3. From now on, anonymous sightings are stored with user_id = NULL. The
--      real author lives only in sighting_authors.
--   4. Lets users delete their own sightings via sighting_authors (so deleting
--      an anonymous post still works).
--   5. *** DATA CHANGE *** Sets user_id = NULL on every EXISTING anonymous
--      sighting. Nothing is lost: step 2 copied the author first, and step 5
--      refuses to run if any author is missing from sighting_authors. Named
--      (non-anonymous) sightings are not touched.
--
-- NO ROWS ARE DELETED. NO TABLES OR COLUMNS ARE DROPPED.
--
-- BEFORE YOU RUN THIS — ORDER MATTERS
--   a. Deploy the updated notify-sighting edge function FIRST. The old function
--      checks sightings.user_id to confirm the caller is the reporter; once
--      anonymous rows have user_id = NULL it would answer 403 and anonymous
--      reports would stop sending push alerts. The updated function reads
--      sighting_authors and falls back to user_id, so it is safe to deploy
--      before this script.
--   b. Run this on the DEV project first and post one named and one anonymous
--      report to confirm both work.
--   c. Then run on production.
--
-- EFFECT ON USERS STILL ON THE OLD APP CODE
--   Posting, viewing and alerts keep working. The one visible change: the
--   delete (trash) button will not show on a user's own ANONYMOUS posts until
--   they receive the app update that reads sighting_authors.
--
-- Safe to re-run: every step is idempotent.
-- Runs in one transaction: if anything fails, nothing is changed.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Private authorship table ────────────────────────────────────────────
create table if not exists public.sighting_authors (
  sighting_id uuid primary key references public.sightings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.sighting_authors is
  'Private: who posted each sighting. sightings.user_id is NULL for anonymous posts, so this is the source of truth for ownership. Readable only by the author.';

create index if not exists sighting_authors_user_id_idx
  on public.sighting_authors (user_id);

alter table public.sighting_authors enable row level security;

-- Clients may only read (their own rows). Writes happen in the trigger below.
revoke all on public.sighting_authors from anon, authenticated;
grant select on public.sighting_authors to authenticated;

drop policy if exists "Users read own sighting authorship" on public.sighting_authors;
create policy "Users read own sighting authorship"
  on public.sighting_authors for select
  to authenticated
  using (user_id = auth.uid());

-- ─── 2. Backfill authors for every existing sighting ────────────────────────
insert into public.sighting_authors (sighting_id, user_id, created_at)
select s.id, s.user_id, s.created_at
from public.sightings s
where s.user_id is not null
on conflict (sighting_id) do nothing;

-- ─── 3. New sightings: record the author privately, blank it if anonymous ───
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

drop trigger if exists sightings_before_insert on public.sightings;
create trigger sightings_before_insert
  before insert on public.sightings
  for each row execute function public.sightings_before_insert();

-- SECURITY DEFINER because clients have no insert rights on sighting_authors.
-- The author always comes from the caller's JWT, never from the row.
create or replace function public.sightings_record_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into public.sighting_authors (sighting_id, user_id)
    values (new.id, auth.uid())
    on conflict (sighting_id) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists sightings_record_author on public.sightings;
create trigger sightings_record_author
  after insert on public.sightings
  for each row execute function public.sightings_record_author();

-- Insert policy: a row is either the caller's own, or anonymous with no author.
drop policy if exists "Authenticated users insert own sightings" on public.sightings;
create policy "Authenticated users insert own sightings"
  on public.sightings for insert
  with check (
    auth.role() = 'authenticated'
    and (
      user_id = auth.uid()
      or (is_anonymous is true and user_id is null)
    )
  );

-- ─── 4. Delete your own sightings, including anonymous ones ─────────────────
drop policy if exists "Authenticated users delete own sightings" on public.sightings;
create policy "Authenticated users delete own sightings"
  on public.sightings for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.sighting_authors a
      where a.sighting_id = sightings.id
        and a.user_id = auth.uid()
    )
  );

-- ─── 5. DATA CHANGE: blank user_id on existing anonymous sightings ──────────
-- Guard: abort (and roll back everything above) if any sighting's author did
-- not make it into sighting_authors. Without this, blanking user_id would
-- orphan the post from its author for good.
do $$
declare
  missing int;
begin
  select count(*) into missing
  from public.sightings s
  where s.user_id is not null
    and not exists (
      select 1 from public.sighting_authors a where a.sighting_id = s.id
    );
  if missing > 0 then
    raise exception
      'Aborting: % sighting(s) have a user_id but no sighting_authors row. Nothing was changed.',
      missing;
  end if;
end $$;

update public.sightings
set user_id = null
where is_anonymous is true
  and user_id is not null;

-- ─── 6. Report what happened ────────────────────────────────────────────────
do $$
declare
  authors int;
  still_exposed int;
begin
  select count(*) into authors from public.sighting_authors;
  select count(*) into still_exposed
  from public.sightings
  where is_anonymous is true and user_id is not null;
  raise notice 'sighting_authors rows: %', authors;
  raise notice 'anonymous sightings still carrying user_id (must be 0): %', still_exposed;
  if still_exposed > 0 then
    raise exception 'Aborting: % anonymous sighting(s) still expose user_id. Nothing was changed.', still_exposed;
  end if;
end $$;

commit;
