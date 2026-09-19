begin;

create table if not exists public.activity_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  category text not null check (category in ('study','work','social','personal','rest')),
  schedule_type text not null default 'fixed' check (schedule_type = 'fixed'),
  anchor_starts_at timestamptz not null,
  anchor_ends_at timestamptz not null,
  expected_impact smallint not null default 0 check (expected_impact between -50 and 50),
  note text not null default '',
  ends_on date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (anchor_ends_at > anchor_starts_at),
  check ((anchor_starts_at at time zone 'Asia/Ho_Chi_Minh')::date = (anchor_ends_at at time zone 'Asia/Ho_Chi_Minh')::date),
  check (ends_on is null or ends_on >= (anchor_starts_at at time zone 'Asia/Ho_Chi_Minh')::date)
);

create table if not exists public.activity_series_exclusions (
  series_id uuid not null references public.activity_series(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurrence_index integer not null check (occurrence_index >= 0),
  created_at timestamptz not null default now(),
  primary key (series_id, occurrence_index)
);

-- Drop dependent owner foreign keys before replacing the referenced unique
-- constraint. This order is required when the migration is run again.
alter table public.activities drop constraint if exists activities_series_owner_fkey;
alter table public.activity_series_exclusions drop constraint if exists activity_series_exclusions_series_id_fkey;
alter table public.activity_series_exclusions drop constraint if exists activity_series_exclusions_owner_fkey;
alter table public.activity_series drop constraint if exists activity_series_user_id_id_key;
alter table public.activity_series add constraint activity_series_user_id_id_key unique (user_id, id);
alter table public.activity_series_exclusions add constraint activity_series_exclusions_owner_fkey
  foreign key (user_id, series_id) references public.activity_series(user_id, id) on delete cascade;

-- Weekly recurrence is now exclusive to fixed schedules. Existing weekly rows
-- represented an explicit recurrence choice, so retain the recurrence and
-- canonicalize their schedule type before building the master.
update public.activities set schedule_type = 'fixed' where recurrence = 'weekly';

-- Keep the UUID and materialized occurrence rows already stored by the legacy
-- model. Each row votes for the weekly grid obtained by subtracting its index;
-- the most common grid becomes canonical, so a separately moved occurrence
-- remains an override instead of shifting the master. Ties are deterministic.
-- Capture only masters inserted by this execution. On a rerun this table stays
-- empty, so lazy occurrences from series created after the first deployment are
-- never mistaken for deleted legacy occurrences.
create temporary table legacy_activity_series_backfilled (
  id uuid primary key,
  user_id uuid not null,
  max_occurrence_index integer not null
) on commit drop;

with legacy_candidates as (
  select
    activity.*,
    activity.starts_at - activity.occurrence_index * interval '7 days' as candidate_anchor_starts_at,
    activity.ends_at - activity.occurrence_index * interval '7 days' as candidate_anchor_ends_at,
    count(*) over (
      partition by activity.user_id, activity.series_id,
        activity.starts_at - activity.occurrence_index * interval '7 days',
        activity.ends_at - activity.occurrence_index * interval '7 days'
    ) as candidate_grid_count,
    max(activity.occurrence_index) over (
      partition by activity.user_id, activity.series_id
    ) as max_occurrence_index
  from public.activities as activity
  where activity.recurrence = 'weekly' and activity.series_id is not null
),
legacy_series as (
  select distinct on (candidate.user_id, candidate.series_id)
    candidate.user_id,
    candidate.series_id as id,
    candidate.title,
    candidate.category,
    candidate.candidate_anchor_starts_at as anchor_starts_at,
    candidate.candidate_anchor_ends_at as anchor_ends_at,
    candidate.expected_impact,
    candidate.note,
    candidate.max_occurrence_index,
    candidate.created_at,
    candidate.updated_at
  from legacy_candidates as candidate
  order by
    candidate.user_id,
    candidate.series_id,
    candidate.candidate_grid_count desc,
    candidate.candidate_anchor_starts_at,
    candidate.candidate_anchor_ends_at,
    candidate.occurrence_index,
    candidate.starts_at,
    candidate.id
),
inserted_legacy as (
  insert into public.activity_series (
    id, user_id, title, category, schedule_type, anchor_starts_at, anchor_ends_at,
    expected_impact, note, ends_on, created_at, updated_at
  )
  select
    legacy.id, legacy.user_id, legacy.title, legacy.category, 'fixed',
    legacy.anchor_starts_at, legacy.anchor_ends_at, legacy.expected_impact,
    legacy.note,
    (legacy.anchor_starts_at at time zone 'Asia/Ho_Chi_Minh')::date
      + legacy.max_occurrence_index * 7,
    legacy.created_at, legacy.updated_at
  from legacy_series as legacy
  on conflict (id) do nothing
  returning id, user_id
)
insert into legacy_activity_series_backfilled (id, user_id, max_occurrence_index)
select inserted.id, inserted.user_id, legacy.max_occurrence_index
from inserted_legacy as inserted
join legacy_series as legacy
  on legacy.user_id = inserted.user_id and legacy.id = inserted.id;

-- A legacy series may have an interior gap because one occurrence was deleted.
-- Record only missing indexes from zero through the observed maximum, and only
-- for legacy masters inserted immediately above.
insert into public.activity_series_exclusions (series_id, user_id, occurrence_index)
select series.id, series.user_id, expected.index
from legacy_activity_series_backfilled as series
cross join lateral generate_series(0, series.max_occurrence_index) as expected(index)
left join public.activities as occurrence
  on occurrence.user_id = series.user_id
 and occurrence.series_id = series.id
 and occurrence.occurrence_index = expected.index
where occurrence.id is null
on conflict (series_id, occurrence_index) do nothing;

-- Weekly indexes are mathematical offsets from the anchor and are no longer
-- capped at twelve. NULL series ids remain valid for standalone activities.
alter table public.activities drop constraint if exists activities_recurrence_integrity;
alter table public.activities add constraint activities_recurrence_integrity check (
  (recurrence = 'none' and series_id is null and occurrence_index = 0)
  or
  (recurrence = 'weekly' and series_id is not null and occurrence_index >= 0)
);

alter table public.activities drop constraint if exists activities_series_id_fkey;
alter table public.activities drop constraint if exists activities_series_owner_fkey;
alter table public.activities add constraint activities_series_owner_fkey
  foreign key (user_id, series_id) references public.activity_series(user_id, id) on delete cascade;

-- A non-partial unique index is intentionally used so PostgREST upsert can
-- infer this conflict target. PostgreSQL still allows multiple NULL series ids.
drop index if exists public.activities_user_series_occurrence_idx;
create unique index activities_user_series_occurrence_idx
  on public.activities(user_id, series_id, occurrence_index);

create index if not exists activity_series_user_anchor_idx
  on public.activity_series(user_id, anchor_starts_at);
create index if not exists activity_series_user_ends_idx
  on public.activity_series(user_id, ends_on);
create index if not exists activity_series_exclusions_user_series_idx
  on public.activity_series_exclusions(user_id, series_id, occurrence_index);

create or replace function public.ensure_activity_series_exclusion_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.activity_series
    where id = new.series_id and user_id = new.user_id
  ) then
    raise exception 'Series exclusion and series must have the same owner';
  end if;
  return new;
end;
$$;

drop trigger if exists activity_series_exclusions_ensure_owner on public.activity_series_exclusions;
create trigger activity_series_exclusions_ensure_owner
before insert or update of series_id, user_id on public.activity_series_exclusions
for each row execute function public.ensure_activity_series_exclusion_owner();

drop trigger if exists activity_series_set_updated_at on public.activity_series;
create trigger activity_series_set_updated_at before update on public.activity_series
for each row execute function public.set_updated_at();

-- Serialize lazy occurrence inserts with scoped mutations on the same master.
-- The current master boundary and exclusion are checked while holding its row
-- lock, so a stale client cannot recreate an occurrence after delete/prune.
create or replace function public.validate_activity_series_occurrence()
returns trigger language plpgsql set search_path = '' as $$
declare
  master public.activity_series%rowtype;
  occurrence_date date;
begin
  if new.series_id is null then return new; end if;

  select * into master from public.activity_series
  where id = new.series_id and user_id = new.user_id
  for update;
  if not found then raise exception 'Activity series not found or owned by another user'; end if;

  if exists (
    select 1 from public.activity_series_exclusions
    where series_id = new.series_id
      and user_id = new.user_id
      and occurrence_index = new.occurrence_index
  ) then
    raise exception 'Cannot materialize an excluded activity occurrence';
  end if;

  occurrence_date := ((master.anchor_starts_at + new.occurrence_index * interval '7 days') at time zone 'Asia/Ho_Chi_Minh')::date;
  if master.ends_on is not null and occurrence_date > master.ends_on then
    raise exception 'Cannot materialize an activity occurrence beyond the series end date';
  end if;
  return new;
end;
$$;

drop trigger if exists activities_validate_series_occurrence on public.activities;
create trigger activities_validate_series_occurrence
before insert or update of user_id, series_id, occurrence_index on public.activities
for each row execute function public.validate_activity_series_occurrence();

alter table public.activity_series enable row level security;
alter table public.activity_series_exclusions enable row level security;

drop policy if exists "activity_series_select_own" on public.activity_series;
drop policy if exists "activity_series_insert_own" on public.activity_series;
drop policy if exists "activity_series_update_own" on public.activity_series;
drop policy if exists "activity_series_delete_own" on public.activity_series;
create policy "activity_series_select_own" on public.activity_series for select using (auth.uid() = user_id);
create policy "activity_series_insert_own" on public.activity_series for insert with check (auth.uid() = user_id);
create policy "activity_series_update_own" on public.activity_series for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "activity_series_delete_own" on public.activity_series for delete using (auth.uid() = user_id);

drop policy if exists "activity_series_exclusions_select_own" on public.activity_series_exclusions;
drop policy if exists "activity_series_exclusions_insert_own" on public.activity_series_exclusions;
drop policy if exists "activity_series_exclusions_update_own" on public.activity_series_exclusions;
drop policy if exists "activity_series_exclusions_delete_own" on public.activity_series_exclusions;
create policy "activity_series_exclusions_select_own" on public.activity_series_exclusions for select using (auth.uid() = user_id);
create policy "activity_series_exclusions_insert_own" on public.activity_series_exclusions for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.activity_series where id = series_id and user_id = auth.uid()
  )
);
create policy "activity_series_exclusions_update_own" on public.activity_series_exclusions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "activity_series_exclusions_delete_own" on public.activity_series_exclusions for delete using (auth.uid() = user_id);

create or replace function public.delete_activity_scope(p_activity_id uuid, p_scope text)
returns void language plpgsql set search_path = '' as $$
declare
  source public.activities%rowtype;
  master public.activity_series%rowtype;
begin
  if p_scope not in ('single', 'future', 'all') then
    raise exception 'Invalid activity scope';
  end if;

  select * into source from public.activities
  where id = p_activity_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Activity not found'; end if;

  if source.series_id is null then
    delete from public.activities where id = source.id and user_id = auth.uid();
    return;
  end if;

  select * into master from public.activity_series
  where id = source.series_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Activity series not found'; end if;

  if p_scope = 'single' then
    insert into public.activity_series_exclusions (series_id, user_id, occurrence_index)
    values (master.id, auth.uid(), source.occurrence_index)
    on conflict (series_id, occurrence_index) do nothing;
    delete from public.activities where id = source.id and user_id = auth.uid();
  elsif p_scope = 'future' then
    if source.occurrence_index = 0 then
      delete from public.activity_series where id = master.id and user_id = auth.uid();
    else
      update public.activity_series
      set ends_on = ((master.anchor_starts_at + source.occurrence_index * interval '7 days') at time zone 'Asia/Ho_Chi_Minh')::date - 1
      where id = master.id and user_id = auth.uid();
      delete from public.activities
      where user_id = auth.uid() and series_id = master.id and occurrence_index >= source.occurrence_index;
      delete from public.activity_series_exclusions
      where user_id = auth.uid() and series_id = master.id and occurrence_index >= source.occurrence_index;
    end if;
  else
    delete from public.activity_series where id = master.id and user_id = auth.uid();
  end if;
end;
$$;

revoke all on function public.delete_activity_scope(uuid, text) from public, anon;
grant execute on function public.delete_activity_scope(uuid, text) to authenticated;

-- Create a recurring master and its first occurrence in one transaction.
create or replace function public.create_recurring_activity(p_draft jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  master public.activity_series%rowtype;
  created public.activities%rowtype;
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  ends_on_value date;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if coalesce(p_draft->>'schedule_type', '') <> 'fixed' or coalesce(p_draft->>'recurrence', '') <> 'weekly' then
    raise exception 'Recurring activities must use fixed weekly schedules';
  end if;

  starts_at_value := (p_draft->>'starts_at')::timestamptz;
  ends_at_value := (p_draft->>'ends_at')::timestamptz;
  ends_on_value := nullif(p_draft->>'recurrence_end_date', '')::date;
  if ends_at_value <= starts_at_value then raise exception 'Activity end must be after start'; end if;
  if (starts_at_value at time zone 'Asia/Ho_Chi_Minh')::date <> (ends_at_value at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Activity must start and end on the same Vietnam date';
  end if;
  if ends_on_value is not null and ends_on_value < (starts_at_value at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Recurrence end date must not be before the start date';
  end if;

  insert into public.activity_series (
    user_id, title, category, schedule_type, anchor_starts_at, anchor_ends_at,
    expected_impact, note, ends_on
  ) values (
    owner_id, p_draft->>'title', p_draft->>'category', 'fixed', starts_at_value, ends_at_value,
    (p_draft->>'expected_impact')::smallint, coalesce(p_draft->>'note', ''), ends_on_value
  ) returning * into master;

  insert into public.activities (
    user_id, title, category, schedule_type, starts_at, ends_at, expected_impact,
    actual_energy_after, status, note, series_id, recurrence, occurrence_index,
    overdue_acknowledged_at
  ) values (
    owner_id, master.title, master.category, 'fixed', master.anchor_starts_at, master.anchor_ends_at,
    master.expected_impact, null, 'scheduled', master.note, master.id, 'weekly', 0, null
  ) returning * into created;

  return to_jsonb(created) || jsonb_build_object('recurrence_end_date', master.ends_on);
end;
$$;

-- Apply every update that can touch a master, exclusions and occurrences in a
-- single database transaction. A plain standalone/single-row update may still
-- use PostgREST directly.
create or replace function public.update_activity_scope(
  p_activity_id uuid,
  p_changes jsonb,
  p_scope text
) returns void language plpgsql set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  source public.activities%rowtype;
  master public.activity_series%rowtype;
  new_master public.activity_series%rowtype;
  requested_schedule text;
  requested_recurrence text;
  requested_end date;
  effective_start timestamptz;
  effective_end timestamptz;
  start_delta interval;
  end_delta interval;
  final_index integer;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_scope not in ('single', 'future', 'all') then raise exception 'Invalid activity scope'; end if;
  if jsonb_typeof(p_changes) <> 'object' then raise exception 'Activity changes must be a JSON object'; end if;

  select * into source from public.activities
  where id = p_activity_id and user_id = owner_id
  for update;
  if not found then raise exception 'Activity not found'; end if;

  requested_schedule := case when p_changes ? 'schedule_type' then p_changes->>'schedule_type' else source.schedule_type end;
  requested_recurrence := case when p_changes ? 'recurrence' then p_changes->>'recurrence' else source.recurrence end;
  effective_start := case when p_changes ? 'starts_at' then (p_changes->>'starts_at')::timestamptz else source.starts_at end;
  effective_end := case when p_changes ? 'ends_at' then (p_changes->>'ends_at')::timestamptz else source.ends_at end;

  if requested_schedule not in ('fixed', 'flexible') then raise exception 'Invalid schedule type'; end if;
  if requested_recurrence not in ('none', 'weekly') then raise exception 'Invalid recurrence type'; end if;
  if effective_end <= effective_start then raise exception 'Activity end must be after start'; end if;
  if (effective_start at time zone 'Asia/Ho_Chi_Minh')::date <> (effective_end at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Activity must start and end on the same Vietnam date';
  end if;

  if source.series_id is null then
    if requested_schedule <> 'fixed' or requested_recurrence <> 'weekly' then
      raise exception 'This RPC is only required when a standalone activity becomes recurring';
    end if;
    requested_end := case when p_changes ? 'recurrence_end_date' then nullif(p_changes->>'recurrence_end_date', '')::date else null end;
    if requested_end is not null and requested_end < (effective_start at time zone 'Asia/Ho_Chi_Minh')::date then
      raise exception 'Recurrence end date must not be before the start date';
    end if;
    insert into public.activity_series (
      user_id, title, category, schedule_type, anchor_starts_at, anchor_ends_at,
      expected_impact, note, ends_on
    ) values (
      owner_id,
      case when p_changes ? 'title' then p_changes->>'title' else source.title end,
      case when p_changes ? 'category' then p_changes->>'category' else source.category end,
      'fixed', effective_start, effective_end,
      case when p_changes ? 'expected_impact' then (p_changes->>'expected_impact')::smallint else source.expected_impact end,
      case when p_changes ? 'note' then p_changes->>'note' else source.note end,
      requested_end
    ) returning * into new_master;
    update public.activities set
      title = new_master.title, category = new_master.category, schedule_type = 'fixed',
      starts_at = effective_start, ends_at = effective_end, expected_impact = new_master.expected_impact,
      actual_energy_after = case
        when p_changes ? 'actual_energy_after' then (p_changes->>'actual_energy_after')::smallint
        when p_changes ? 'status' and p_changes->>'status' <> 'completed' then null
        else source.actual_energy_after
      end,
      status = case when p_changes ? 'status' then p_changes->>'status' else source.status end,
      note = new_master.note, series_id = new_master.id, recurrence = 'weekly', occurrence_index = 0,
      overdue_acknowledged_at = case when p_changes ? 'overdue_acknowledged_at' then (p_changes->>'overdue_acknowledged_at')::timestamptz else source.overdue_acknowledged_at end
    where id = source.id and user_id = owner_id;
    return;
  end if;

  select * into master from public.activity_series
  where id = source.series_id and user_id = owner_id
  for update;
  if not found then raise exception 'Activity series not found'; end if;

  requested_end := case when p_changes ? 'recurrence_end_date' then nullif(p_changes->>'recurrence_end_date', '')::date else master.ends_on end;
  if p_scope = 'single' and p_changes ? 'recurrence_end_date' and requested_end is distinct from master.ends_on then
    raise exception 'Recurrence end date requires future or all scope';
  end if;

  start_delta := effective_start - source.starts_at;
  end_delta := effective_end - source.ends_at;

  if requested_schedule = 'flexible' or requested_recurrence = 'none' then
    if p_scope = 'single' then
      insert into public.activity_series_exclusions (series_id, user_id, occurrence_index)
      values (master.id, owner_id, source.occurrence_index)
      on conflict (series_id, occurrence_index) do nothing;
      update public.activities set
        title = case when p_changes ? 'title' then p_changes->>'title' else title end,
        category = case when p_changes ? 'category' then p_changes->>'category' else category end,
        schedule_type = requested_schedule, starts_at = effective_start, ends_at = effective_end,
        expected_impact = case when p_changes ? 'expected_impact' then (p_changes->>'expected_impact')::smallint else expected_impact end,
        actual_energy_after = case
        when p_changes ? 'actual_energy_after' then (p_changes->>'actual_energy_after')::smallint
        when p_changes ? 'status' and p_changes->>'status' <> 'completed' then null
        else actual_energy_after
      end,
        status = case when p_changes ? 'status' then p_changes->>'status' else status end,
        note = case when p_changes ? 'note' then p_changes->>'note' else note end,
        series_id = null, recurrence = 'none', occurrence_index = 0,
        overdue_acknowledged_at = case when p_changes ? 'overdue_acknowledged_at' then (p_changes->>'overdue_acknowledged_at')::timestamptz else overdue_acknowledged_at end
      where id = source.id and user_id = owner_id;
    elsif p_scope = 'future' then
      update public.activities set
        title = case when p_changes ? 'title' then p_changes->>'title' else title end,
        category = case when p_changes ? 'category' then p_changes->>'category' else category end,
        schedule_type = requested_schedule, starts_at = effective_start, ends_at = effective_end,
        expected_impact = case when p_changes ? 'expected_impact' then (p_changes->>'expected_impact')::smallint else expected_impact end,
        actual_energy_after = case
        when p_changes ? 'actual_energy_after' then (p_changes->>'actual_energy_after')::smallint
        when p_changes ? 'status' and p_changes->>'status' <> 'completed' then null
        else actual_energy_after
      end,
        status = case when p_changes ? 'status' then p_changes->>'status' else status end,
        note = case when p_changes ? 'note' then p_changes->>'note' else note end,
        series_id = null, recurrence = 'none', occurrence_index = 0,
        overdue_acknowledged_at = case when p_changes ? 'overdue_acknowledged_at' then (p_changes->>'overdue_acknowledged_at')::timestamptz else overdue_acknowledged_at end
      where id = source.id and user_id = owner_id;
      delete from public.activities
      where user_id = owner_id and series_id = master.id and occurrence_index > source.occurrence_index;
      if source.occurrence_index = 0 then
        delete from public.activity_series where id = master.id and user_id = owner_id;
      else
        update public.activity_series set ends_on = ((master.anchor_starts_at + source.occurrence_index * interval '7 days') at time zone 'Asia/Ho_Chi_Minh')::date - 1
        where id = master.id and user_id = owner_id;
        delete from public.activity_series_exclusions
        where user_id = owner_id and series_id = master.id and occurrence_index >= source.occurrence_index;
      end if;
    else
      update public.activities set
        title = case when p_changes ? 'title' then p_changes->>'title' else title end,
        category = case when p_changes ? 'category' then p_changes->>'category' else category end,
        schedule_type = requested_schedule,
        starts_at = starts_at + start_delta, ends_at = ends_at + end_delta,
        expected_impact = case when p_changes ? 'expected_impact' then (p_changes->>'expected_impact')::smallint else expected_impact end,
        actual_energy_after = case
        when p_changes ? 'actual_energy_after' then (p_changes->>'actual_energy_after')::smallint
        when p_changes ? 'status' and p_changes->>'status' <> 'completed' then null
        else actual_energy_after
      end,
        status = case when p_changes ? 'status' then p_changes->>'status' else status end,
        note = case when p_changes ? 'note' then p_changes->>'note' else note end,
        series_id = null, recurrence = 'none', occurrence_index = 0,
        overdue_acknowledged_at = case when p_changes ? 'overdue_acknowledged_at' then (p_changes->>'overdue_acknowledged_at')::timestamptz else overdue_acknowledged_at end
      where user_id = owner_id and series_id = master.id;
      delete from public.activity_series where id = master.id and user_id = owner_id;
    end if;
    return;
  end if;

  if requested_schedule <> 'fixed' or requested_recurrence <> 'weekly' then
    raise exception 'Recurring activities must use fixed weekly schedules';
  end if;

  if p_scope = 'single' then
    update public.activities set
      title = case when p_changes ? 'title' then p_changes->>'title' else title end,
      category = case when p_changes ? 'category' then p_changes->>'category' else category end,
      starts_at = effective_start, ends_at = effective_end,
      expected_impact = case when p_changes ? 'expected_impact' then (p_changes->>'expected_impact')::smallint else expected_impact end,
      actual_energy_after = case
        when p_changes ? 'actual_energy_after' then (p_changes->>'actual_energy_after')::smallint
        when p_changes ? 'status' and p_changes->>'status' <> 'completed' then null
        else actual_energy_after
      end,
      status = case when p_changes ? 'status' then p_changes->>'status' else status end,
      note = case when p_changes ? 'note' then p_changes->>'note' else note end,
      overdue_acknowledged_at = case when p_changes ? 'overdue_acknowledged_at' then (p_changes->>'overdue_acknowledged_at')::timestamptz else overdue_acknowledged_at end
    where id = source.id and user_id = owner_id;
    return;
  end if;

  if p_scope = 'future' then
    if requested_end is not null and requested_end < (effective_start at time zone 'Asia/Ho_Chi_Minh')::date then
      raise exception 'Recurrence end date must not be before the new branch start date';
    end if;
    insert into public.activity_series (
      user_id, title, category, schedule_type, anchor_starts_at, anchor_ends_at,
      expected_impact, note, ends_on
    ) values (
      owner_id,
      case when p_changes ? 'title' then p_changes->>'title' else source.title end,
      case when p_changes ? 'category' then p_changes->>'category' else source.category end,
      'fixed', effective_start, effective_end,
      case when p_changes ? 'expected_impact' then (p_changes->>'expected_impact')::smallint else source.expected_impact end,
      case when p_changes ? 'note' then p_changes->>'note' else source.note end,
      requested_end
    ) returning * into new_master;

    if new_master.ends_on is not null then
      final_index := floor(((new_master.ends_on - (new_master.anchor_starts_at at time zone 'Asia/Ho_Chi_Minh')::date)::numeric) / 7)::integer;
      delete from public.activities
      where user_id = owner_id
        and series_id = master.id
        and occurrence_index > source.occurrence_index + final_index;
      delete from public.activity_series_exclusions
      where user_id = owner_id
        and series_id = master.id
        and occurrence_index > source.occurrence_index + final_index;
    end if;

    update public.activities set
      title = case when p_changes ? 'title' then p_changes->>'title' else title end,
      category = case when p_changes ? 'category' then p_changes->>'category' else category end,
      starts_at = starts_at + start_delta, ends_at = ends_at + end_delta,
      expected_impact = case when p_changes ? 'expected_impact' then (p_changes->>'expected_impact')::smallint else expected_impact end,
      actual_energy_after = case
        when p_changes ? 'actual_energy_after' then (p_changes->>'actual_energy_after')::smallint
        when p_changes ? 'status' and p_changes->>'status' <> 'completed' then null
        else actual_energy_after
      end,
      status = case when p_changes ? 'status' then p_changes->>'status' else status end,
      note = case when p_changes ? 'note' then p_changes->>'note' else note end,
      series_id = new_master.id, recurrence = 'weekly',
      occurrence_index = occurrence_index - source.occurrence_index,
      overdue_acknowledged_at = case when p_changes ? 'overdue_acknowledged_at' then (p_changes->>'overdue_acknowledged_at')::timestamptz else overdue_acknowledged_at end
    where user_id = owner_id and series_id = master.id and occurrence_index >= source.occurrence_index;

    insert into public.activity_series_exclusions (series_id, user_id, occurrence_index)
    select new_master.id, owner_id, occurrence_index - source.occurrence_index
    from public.activity_series_exclusions
    where user_id = owner_id and series_id = master.id and occurrence_index >= source.occurrence_index
    on conflict (series_id, occurrence_index) do nothing;

    if new_master.ends_on is not null then
      final_index := floor(((new_master.ends_on - (new_master.anchor_starts_at at time zone 'Asia/Ho_Chi_Minh')::date)::numeric) / 7)::integer;
      delete from public.activities where user_id = owner_id and series_id = new_master.id and occurrence_index > final_index;
      delete from public.activity_series_exclusions where user_id = owner_id and series_id = new_master.id and occurrence_index > final_index;
    end if;

    if source.occurrence_index = 0 then
      delete from public.activity_series where id = master.id and user_id = owner_id;
    else
      update public.activity_series set ends_on = ((master.anchor_starts_at + source.occurrence_index * interval '7 days') at time zone 'Asia/Ho_Chi_Minh')::date - 1
      where id = master.id and user_id = owner_id;
      delete from public.activity_series_exclusions
      where user_id = owner_id and series_id = master.id and occurrence_index >= source.occurrence_index;
    end if;
    return;
  end if;

  -- all scope
  if requested_end is not null and requested_end < ((master.anchor_starts_at + start_delta) at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Recurrence end date must not be before the shifted series start date';
  end if;
  update public.activity_series set
    title = case when p_changes ? 'title' then p_changes->>'title' else title end,
    category = case when p_changes ? 'category' then p_changes->>'category' else category end,
    anchor_starts_at = anchor_starts_at + start_delta,
    anchor_ends_at = anchor_ends_at + end_delta,
    expected_impact = case when p_changes ? 'expected_impact' then (p_changes->>'expected_impact')::smallint else expected_impact end,
    note = case when p_changes ? 'note' then p_changes->>'note' else note end,
    ends_on = requested_end
  where id = master.id and user_id = owner_id
  returning * into master;

  update public.activities set
    title = case when p_changes ? 'title' then p_changes->>'title' else title end,
    category = case when p_changes ? 'category' then p_changes->>'category' else category end,
    starts_at = starts_at + start_delta, ends_at = ends_at + end_delta,
    expected_impact = case when p_changes ? 'expected_impact' then (p_changes->>'expected_impact')::smallint else expected_impact end,
    actual_energy_after = case
        when p_changes ? 'actual_energy_after' then (p_changes->>'actual_energy_after')::smallint
        when p_changes ? 'status' and p_changes->>'status' <> 'completed' then null
        else actual_energy_after
      end,
    status = case when p_changes ? 'status' then p_changes->>'status' else status end,
    note = case when p_changes ? 'note' then p_changes->>'note' else note end,
    overdue_acknowledged_at = case when p_changes ? 'overdue_acknowledged_at' then (p_changes->>'overdue_acknowledged_at')::timestamptz else overdue_acknowledged_at end
  where user_id = owner_id and series_id = master.id;

  if master.ends_on is not null then
    final_index := floor(((master.ends_on - (master.anchor_starts_at at time zone 'Asia/Ho_Chi_Minh')::date)::numeric) / 7)::integer;
    delete from public.activities where user_id = owner_id and series_id = master.id and occurrence_index > final_index;
    delete from public.activity_series_exclusions where user_id = owner_id and series_id = master.id and occurrence_index > final_index;
  end if;
end;
$$;

-- Delete a linked pair and apply recurrence scope inside the same transaction.
create or replace function public.delete_linked_activity_scope(
  p_todo_id uuid,
  p_activity_id uuid,
  p_scope text
) returns void language plpgsql set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  linked_activity_id uuid;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_scope not in ('single', 'future', 'all') then raise exception 'Invalid activity scope'; end if;

  select activity_id into linked_activity_id from public.todos
  where id = p_todo_id and user_id = owner_id
  for update;
  if not found or linked_activity_id is distinct from p_activity_id then
    raise exception 'Linked Todo and activity pair not found';
  end if;

  if not exists (select 1 from public.activities where id = p_activity_id and user_id = owner_id) then
    raise exception 'Linked activity not found';
  end if;
  delete from public.todos where id = p_todo_id and user_id = owner_id;
  perform public.delete_activity_scope(p_activity_id, p_scope);
end;
$$;

revoke all on function public.create_recurring_activity(jsonb) from public, anon;
revoke all on function public.update_activity_scope(uuid, jsonb, text) from public, anon;
revoke all on function public.delete_linked_activity_scope(uuid, uuid, text) from public, anon;
grant execute on function public.create_recurring_activity(jsonb) to authenticated;
grant execute on function public.update_activity_scope(uuid, jsonb, text) to authenticated;
grant execute on function public.delete_linked_activity_scope(uuid, uuid, text) to authenticated;

revoke all privileges on table public.activity_series, public.activity_series_exclusions from anon, authenticated;
grant select, insert, update, delete on table public.activity_series, public.activity_series_exclusions to authenticated;

commit;
