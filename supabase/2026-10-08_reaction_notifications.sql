-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-08 — Push notifications when someone reacts to your report
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS DOES
--   1. Creates public.reaction_notifications: one row per (sighting, reactor),
--      written the first time that person's reaction is announced to the
--      poster. It is what stops repeat notifications: the same person adding a
--      second reaction, or removing and re-adding one, finds their row already
--      there and nothing is sent. Only the notify-reaction edge function
--      (service role) reads or writes it; app users have no access.
--   2. Adds profiles.reaction_alerts (default true): the user's on/off switch
--      for these notifications, shown in Profile → Notifications.
--
-- ADDS ONLY. NOTHING IS DELETED, DROPPED OR CHANGED. Existing profiles get
-- reaction_alerts = true.
--
-- ALSO NEEDED (not SQL): deploy the notify-reaction edge function, with
-- "Verify JWT" left ON:
--   npx supabase functions deploy notify-reaction --project-ref <ref>
--
-- REQUIRES the reactions migrations and public.sighting_authors.
--
-- Run it in one go with nothing highlighted. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.sighting_reactions') is null then
    raise exception
      'public.sighting_reactions does not exist. Run the reactions migrations first. Nothing was changed.';
  end if;
end $$;

-- ─── 1. Who has already been announced to the poster ────────────────────────
create table if not exists public.reaction_notifications (
  sighting_id uuid not null references public.sightings (id) on delete cascade,
  reactor_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sighting_id, reactor_id)
);

comment on table public.reaction_notifications is
  'One row per (sighting, reactor) once that reactor has been announced to the poster. Dedup for the notify-reaction edge function; service role only.';

-- RLS on with no policies: no access for app users. The edge function uses the
-- service role, which bypasses RLS.
alter table public.reaction_notifications enable row level security;
revoke all on public.reaction_notifications from anon, authenticated;

-- ─── 2. Per-user switch ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists reaction_alerts boolean not null default true;

commit;
