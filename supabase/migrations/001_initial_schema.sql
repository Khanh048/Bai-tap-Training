create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Bạn',
  default_energy smallint not null default 70 check (default_energy between 0 and 100 and default_energy % 5 = 0)
);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  checkin_date date not null,
  energy_level smallint not null check (energy_level between 0 and 100 and energy_level % 5 = 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  category text not null check (category in ('study','work','social','personal','rest')),
  schedule_type text not null check (schedule_type in ('fixed','flexible','recovery')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  expected_impact smallint not null default 0 check (expected_impact between -50 and 50 and expected_impact % 5 = 0),
  actual_energy_after smallint check (actual_energy_after between 0 and 100),
  status text not null default 'scheduled' check (status in ('scheduled','completed','skipped','cancelled')),
  note text not null default '',
  series_id uuid,
  recurrence text not null default 'none' check (recurrence in ('weekly','none')),
  occurrence_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- Upgrade databases that ran an older version of this idempotent migration.
alter table public.activities add column if not exists occurrence_index integer;

-- Clamp legacy cross-midnight activities to the final instant of their start
-- date in Vietnam. The exceptional last-microsecond start is moved back by one
-- microsecond so the existing ends_at > starts_at invariant remains valid.
with cross_midnight as (
  select
    id,
    starts_at,
    (
      date_trunc('day', starts_at at time zone 'Asia/Ho_Chi_Minh')
      + interval '1 day'
      - interval '1 microsecond'
    ) at time zone 'Asia/Ho_Chi_Minh' as vietnam_day_end
  from public.activities
  where (starts_at at time zone 'Asia/Ho_Chi_Minh')::date
    <> (ends_at at time zone 'Asia/Ho_Chi_Minh')::date
)
update public.activities as activity
set
  starts_at = least(cross_midnight.starts_at, cross_midnight.vietnam_day_end - interval '1 microsecond'),
  ends_at = cross_midnight.vietnam_day_end
from cross_midnight
where activity.id = cross_midnight.id;

alter table public.activities drop constraint if exists activities_same_vietnam_day;
alter table public.activities add constraint activities_same_vietnam_day check (
  (starts_at at time zone 'Asia/Ho_Chi_Minh')::date
  = (ends_at at time zone 'Asia/Ho_Chi_Minh')::date
);

-- Non-recurring rows never belong to a series. Repairing this before adding the
-- constraint keeps upgrades from older schemas repeatable.
update public.activities
set series_id = null, occurrence_index = 0
where recurrence = 'none'
  and (series_id is not null or occurrence_index is distinct from 0);

-- An orphaned weekly row cannot be safely associated with another occurrence,
-- so retain it as a one-occurrence series with its own immutable identity.
update public.activities
set series_id = gen_random_uuid(), occurrence_index = 0
where recurrence = 'weekly' and series_id is null;

-- Rank invalid legacy series deterministically. Occurrences beyond the product
-- limit are preserved as independent activities instead of blocking migration.
with invalid_series as (
  select user_id, series_id
  from public.activities
  where recurrence = 'weekly' and series_id is not null
  group by user_id, series_id
  having bool_or(occurrence_index is null or occurrence_index not between 0 and 11)
    or count(*) <> count(distinct occurrence_index)
    or count(*) > 12
),
ranked_occurrences as (
  select activity.id,
    row_number() over (
      partition by activity.user_id, activity.series_id
      order by activity.starts_at, activity.id
    ) as occurrence_number
  from public.activities as activity
  join invalid_series
    on invalid_series.user_id = activity.user_id
   and invalid_series.series_id = activity.series_id
)
update public.activities as activity
set
  recurrence = case when ranked_occurrences.occurrence_number > 12 then 'none' else 'weekly' end,
  series_id = case when ranked_occurrences.occurrence_number > 12 then null else activity.series_id end,
  occurrence_index = case when ranked_occurrences.occurrence_number > 12 then 0 else ranked_occurrences.occurrence_number - 1 end
from ranked_occurrences
where activity.id = ranked_occurrences.id;

alter table public.activities alter column occurrence_index set default 0;
alter table public.activities alter column occurrence_index set not null;

alter table public.activities drop constraint if exists activities_recurrence_integrity;
alter table public.activities add constraint activities_recurrence_integrity check (
  (recurrence = 'none' and series_id is null and occurrence_index = 0)
  or
  (recurrence = 'weekly' and series_id is not null and occurrence_index between 0 and 11)
);

-- Preserve measurements only for completed activities. A legacy completion
-- without a measurement is returned to scheduled rather than inventing data.
update public.activities
set actual_energy_after = null
where status <> 'completed' and actual_energy_after is not null;

update public.activities
set status = 'scheduled'
where status = 'completed' and actual_energy_after is null;

alter table public.activities drop constraint if exists activities_status_actual_consistency;
alter table public.activities add constraint activities_status_actual_consistency check (
  (status = 'completed' and actual_energy_after is not null)
  or
  (status <> 'completed' and actual_energy_after is null)
);

create index if not exists activities_user_starts_idx on public.activities(user_id, starts_at);
create index if not exists activities_user_ends_idx on public.activities(user_id, ends_at);
create index if not exists activities_user_time_range_idx on public.activities(user_id, starts_at, ends_at);
create index if not exists activities_user_series_idx on public.activities(user_id, series_id) where series_id is not null;
create unique index if not exists activities_user_series_occurrence_idx
  on public.activities(user_id, series_id, occurrence_index)
  where series_id is not null;
create index if not exists daily_checkins_user_date_idx on public.daily_checkins(user_id, checkin_date);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists daily_checkins_set_updated_at on public.daily_checkins;
create trigger daily_checkins_set_updated_at before update on public.daily_checkins
for each row execute function public.set_updated_at();

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at before update on public.activities
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Bạn'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill users created before the profile trigger existed. Safe to rerun.
insert into public.profiles (id, display_name, default_energy)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Bạn'
  ),
  70
from auth.users as users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.activities enable row level security;

-- Policies are recreated so the migration remains safe to run more than once.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "checkins_select_own" on public.daily_checkins;
drop policy if exists "checkins_insert_own" on public.daily_checkins;
drop policy if exists "checkins_update_own" on public.daily_checkins;
drop policy if exists "checkins_delete_own" on public.daily_checkins;
create policy "checkins_select_own" on public.daily_checkins for select using (auth.uid() = user_id);
create policy "checkins_insert_own" on public.daily_checkins for insert with check (auth.uid() = user_id);
create policy "checkins_update_own" on public.daily_checkins for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "checkins_delete_own" on public.daily_checkins for delete using (auth.uid() = user_id);

drop policy if exists "activities_select_own" on public.activities;
drop policy if exists "activities_insert_own" on public.activities;
drop policy if exists "activities_update_own" on public.activities;
drop policy if exists "activities_delete_own" on public.activities;
create policy "activities_select_own" on public.activities for select using (auth.uid() = user_id);
create policy "activities_insert_own" on public.activities for insert with check (auth.uid() = user_id);
create policy "activities_update_own" on public.activities for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "activities_delete_own" on public.activities for delete using (auth.uid() = user_id);

-- Explicit API privileges: anon has no data-table access; RLS still
-- enforces ownership for every operation granted to authenticated users.
revoke all privileges on table public.profiles, public.daily_checkins, public.activities from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.daily_checkins, public.activities to authenticated;
