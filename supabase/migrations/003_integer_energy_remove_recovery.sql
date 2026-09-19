begin;

-- Canonicalize the retired schedule type before installing the final constraint.
update public.activities
set schedule_type = 'flexible'
where schedule_type = 'recovery';

-- Use explicit, stable constraint names while also accounting for the automatic
-- names created by migration 001. Dropping both sets keeps reruns convergent.
alter table public.activities
  drop constraint if exists activities_schedule_type_check,
  drop constraint if exists activities_schedule_type_allowed;

alter table public.profiles
  drop constraint if exists profiles_default_energy_check,
  drop constraint if exists profiles_default_energy_range;

alter table public.daily_checkins
  drop constraint if exists daily_checkins_energy_level_check,
  drop constraint if exists daily_checkins_energy_level_range;

alter table public.activities
  drop constraint if exists activities_expected_impact_check,
  drop constraint if exists activities_expected_impact_range,
  drop constraint if exists activities_actual_energy_after_check,
  drop constraint if exists activities_actual_energy_after_range;

-- smallint guarantees integer storage; USING makes the migration safe for a
-- compatible legacy numeric column while preserving already-valid values.
alter table public.profiles
  alter column default_energy type smallint using default_energy::smallint,
  alter column default_energy set default 70;

alter table public.daily_checkins
  alter column energy_level type smallint using energy_level::smallint;

alter table public.activities
  alter column expected_impact type smallint using expected_impact::smallint,
  alter column actual_energy_after type smallint using actual_energy_after::smallint;

alter table public.activities
  add constraint activities_schedule_type_allowed
  check (schedule_type in ('fixed', 'flexible')) not valid;

alter table public.profiles
  add constraint profiles_default_energy_range
  check (default_energy between 0 and 100) not valid;

alter table public.daily_checkins
  add constraint daily_checkins_energy_level_range
  check (energy_level between 0 and 100) not valid;

alter table public.activities
  add constraint activities_expected_impact_range
  check (expected_impact between -50 and 50) not valid,
  add constraint activities_actual_energy_after_range
  check (actual_energy_after is null or actual_energy_after between 0 and 100) not valid;

alter table public.activities validate constraint activities_schedule_type_allowed;
alter table public.profiles validate constraint profiles_default_energy_range;
alter table public.daily_checkins validate constraint daily_checkins_energy_level_range;
alter table public.activities validate constraint activities_expected_impact_range;
alter table public.activities validate constraint activities_actual_energy_after_range;

commit;
