-- Objects that live OUTSIDE the public schema, so `pg_dump --schema=public`
-- never captures them. Needed when standing up a fresh project (the dev clone,
-- or production rebuilt from scratch after a disaster).
--
-- Idempotent and non-destructive: safe to re-run.
--
-- Not covered here: storage buckets and storage.objects policies — those are
-- already idempotent in supabase/storage_setup.sql. Run that too.
-- (Not create_storage_buckets.sql, which storage_setup.sql supersedes.)

-- ─── 1. Profile auto-creation trigger (lives on auth.users) ─────────────────
-- public.handle_new_user() comes across in the public-schema dump, but the
-- trigger that fires it does not. Without this, signups produce no profile row
-- and the app has a user with no display name.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    raise exception 'public.handle_new_user() is missing — apply the public schema baseline first';
  end if;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── 2. Realtime publication membership (publications are cluster-level) ────
-- The feed's live updates depend on sightings being in supabase_realtime.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found — skipping realtime setup';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sightings'
  ) then
    execute 'alter publication supabase_realtime add table public.sightings';
    raise notice 'added public.sightings to supabase_realtime';
  else
    raise notice 'public.sightings already in supabase_realtime';
  end if;
end $$;
