-- BootWatch Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url text,
  saved_complexes text[] default '{}',
  nearby_sighting_alerts boolean not null default true,
  display_name_change_history timestamptz[] not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Banned / reserved display-name patterns (edit from the dashboard as needed).
create table public.banned_display_name_patterns (
  id bigserial primary key,
  pattern text not null,
  kind text not null check (kind in ('exact', 'substring', 'regex')),
  reason text not null check (reason in ('reserved', 'impersonation', 'profanity', 'hate', 'harassment', 'other')),
  created_at timestamptz not null default now()
);

alter table public.banned_display_name_patterns enable row level security;
create policy "banned_patterns public read"
  on public.banned_display_name_patterns for select using (true);

-- Case-insensitive uniqueness on display_name (skipped for NULL values).
create unique index profiles_display_name_ci_unique
  on public.profiles (lower(display_name))
  where display_name is not null;

-- Normalize: strip invisibles, collapse whitespace, trim, NFKC-fold.
create or replace function public.normalize_display_name(raw text)
returns text
language plpgsql
immutable
as $$
declare
  s text := raw;
begin
  if s is null then return null; end if;
  begin
    s := normalize(s, nfkc);
  exception when others then
    null;
  end;
  s := regexp_replace(s, E'[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF]', '', 'g');
  s := regexp_replace(s, E'[\u0001-\u001F\u007F]', '', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := btrim(s);
  return s;
end;
$$;

-- Validate: normalize + enforce charset/length + banned-word check.
create or replace function public.validate_display_name(raw text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s text;
  lower_s text;
  bad record;
begin
  s := public.normalize_display_name(raw);

  if s is null or length(s) < 2 then
    raise exception 'display_name_too_short' using errcode = 'P0001';
  end if;
  if length(s) > 30 then
    raise exception 'display_name_too_long' using errcode = 'P0001';
  end if;
  if s !~ E'^[A-Za-z0-9 ''._\\-]+$' then
    raise exception 'display_name_invalid_characters' using errcode = 'P0001';
  end if;

  lower_s := lower(s);
  for bad in select pattern, kind, reason from public.banned_display_name_patterns loop
    if (bad.kind = 'exact'     and lower_s = lower(bad.pattern))
    or (bad.kind = 'substring' and position(lower(bad.pattern) in lower_s) > 0)
    or (bad.kind = 'regex'     and lower_s ~* bad.pattern)
    then
      if bad.reason in ('reserved', 'impersonation') then
        raise exception 'display_name_reserved' using errcode = 'P0001';
      else
        raise exception 'display_name_banned' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  return s;
end;
$$;

-- Combined BEFORE INSERT/UPDATE guard: validates + enforces 2-changes-per-7-days.
create or replace function public.profiles_display_name_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  recent_count int;
  kept timestamptz[];
begin
  if new.display_name is null then
    return new;
  end if;

  new.display_name := public.validate_display_name(new.display_name);

  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.display_name is not distinct from old.display_name then
    return new;
  end if;
  if old.display_name is null then
    return new;
  end if;

  select coalesce(array_agg(t order by t desc), '{}'::timestamptz[])
    into kept
  from unnest(coalesce(old.display_name_change_history, '{}'::timestamptz[])) as t
  where t > now() - interval '30 days';

  select coalesce(count(*), 0) into recent_count
  from unnest(kept) as t where t > now() - interval '7 days';

  if recent_count >= 2 then
    raise exception 'display_name_change_limit_reached'
      using errcode = 'P0001',
            hint = 'You can only change your display name 2 times per week.';
  end if;

  new.display_name_change_history := kept || now();
  return new;
end;
$$;

create trigger profiles_display_name_guard
  before insert or update of display_name on public.profiles
  for each row execute function public.profiles_display_name_guard();

-- Auto-create a profile when a user signs up. Falls back to a neutral
-- "User#####" handle instead of the email prefix to avoid leaking personal info.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  attempts int := 0;
begin
  candidate := coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name'
  );

  if candidate is not null then
    begin
      candidate := public.validate_display_name(candidate);
    exception when others then
      candidate := null;
    end;
  end if;

  if candidate is null then
    candidate := 'User' || lpad((floor(random() * 100000))::int::text, 5, '0');
  end if;

  while attempts < 5
    and exists(select 1 from public.profiles where lower(display_name) = lower(candidate))
  loop
    candidate := 'User' || lpad((floor(random() * 10000000))::int::text, 7, '0');
    attempts := attempts + 1;
  end loop;

  if exists(select 1 from public.profiles where lower(display_name) = lower(candidate)) then
    insert into public.profiles (id, display_name) values (new.id, null);
  else
    insert into public.profiles (id, display_name) values (new.id, candidate);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Complexes table
create table public.complexes (
  id text primary key,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  visitor_time_limit_minutes integer,
  booting_company text,
  signage_quality text default 'unknown' check (signage_quality in ('well-marked', 'moderate', 'sneaky', 'unknown')),
  risk_level text default 'unknown' check (risk_level in ('high', 'moderate', 'low', 'unknown')),
  notes text,
  created_at timestamptz default now()
);

-- 3. Sightings table (boot truck reports)
create table public.sightings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete set null,
  complex_id text references public.complexes(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  photo_url text,
  created_at timestamptz default now()
);

-- Indexes for common queries
create index sightings_complex_id_idx on public.sightings(complex_id);
create index sightings_created_at_idx on public.sightings(created_at desc);

-- 4. Row Level Security

-- Profiles: users can read all, update only their own
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Expo push tokens (not exposed via public profiles SELECT)
create table public.push_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

create policy "Users read own push token"
  on public.push_tokens for select using (auth.uid() = user_id);

create policy "Users insert own push token"
  on public.push_tokens for insert with check (auth.uid() = user_id);

create policy "Users update own push token"
  on public.push_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users delete own push token"
  on public.push_tokens for delete using (auth.uid() = user_id);

-- Complexes: everyone can read, only admins insert/update (we'll seed via SQL)
alter table public.complexes enable row level security;

create policy "Complexes are viewable by everyone"
  on public.complexes for select using (true);

-- Sightings: everyone can read, authenticated users can insert
alter table public.sightings enable row level security;

create policy "Sightings are viewable by everyone"
  on public.sightings for select using (true);

create policy "Authenticated users insert own sightings"
  on public.sightings for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

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

create trigger sightings_before_insert
  before insert on public.sightings
  for each row execute function public.sightings_before_insert();

-- 5. Enable Realtime on sightings
alter publication supabase_realtime add table public.sightings;

-- 6. Seed complex data
insert into public.complexes (id, name, address, latitude, longitude, visitor_time_limit_minutes, booting_company, signage_quality, risk_level, notes) values
  ('the-cove', 'The Cove', '398 S 2nd W, Rexburg, ID', 43.8225, -111.7915, 30, 'University Parking Enforcement', 'sneaky', 'high', 'Very aggressive enforcement, especially evenings and weekends.'),
  ('nauvoo-house', 'Nauvoo House', '321 S 3rd W, Rexburg, ID', 43.8218, -111.7928, 30, 'University Parking Enforcement', 'moderate', 'high', 'Frequent booting reports. Signage exists but is easy to miss.'),
  ('alpine-chalet', 'Alpine Chalet', '460 S 2nd W, Rexburg, ID', 43.8215, -111.7912, 60, 'University Parking Enforcement', 'well-marked', 'moderate', 'Longer time limit but still actively patrolled.'),
  ('university-view', 'The Grand', '280 S 1st W, Rexburg, ID', 43.8235, -111.7895, 30, 'University Parking Enforcement', 'sneaky', 'high', 'One of the most booted complexes in Rexburg.'),
  ('brookside', 'Brookside Village', '415 S 3rd W, Rexburg, ID', 43.8210, -111.7930, 45, 'Idaho Booting LLC', 'moderate', 'moderate', 'Moderate enforcement. Signs posted at lot entrances.'),
  ('mesa-falls', 'Mesa Falls', '520 S 2nd E, Rexburg, ID', 43.8200, -111.7870, 30, 'Idaho Booting LLC', 'sneaky', 'high', 'Small lot with limited visitor spots. Boots happen fast.'),
  ('hemming-village', 'Hemming Village', '316 Main St, Rexburg, ID', 43.8260, -111.7885, 120, null, 'well-marked', 'low', 'Downtown area with more relaxed parking enforcement.'),
  ('carriage-house', 'Carriage House', '230 S 2nd W, Rexburg, ID', 43.8240, -111.7910, 30, 'University Parking Enforcement', 'moderate', 'high', 'Close to campus, heavily patrolled.'),
  ('northpoint', 'Northpoint', '130 N 1st E, Rexburg, ID', 43.8280, -111.7880, 60, 'Idaho Booting LLC', 'well-marked', 'moderate', 'Clear signage. Enforcement is moderate.'),
  ('the-lodge', 'The Lodge', '485 S 1st E, Rexburg, ID', 43.8205, -111.7878, 30, 'University Parking Enforcement', 'sneaky', 'high', 'Tight parking lot. Boot trucks come through frequently.'),
  ('sunrise-village', 'Sunrise Village', '575 S 2nd W, Rexburg, ID', 43.8190, -111.7918, 45, 'Idaho Booting LLC', 'moderate', 'moderate', 'Somewhat removed from campus. Less frequent patrols.'),
  ('centennial', 'Centennial Apartments', '350 N 2nd E, Rexburg, ID', 43.8295, -111.7865, 90, null, 'well-marked', 'low', 'Generous time limits. Rarely see boot trucks here.');
