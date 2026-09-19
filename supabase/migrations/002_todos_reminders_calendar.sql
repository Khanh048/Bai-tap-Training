alter table public.activities
  add column if not exists overdue_acknowledged_at timestamptz;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  scheduled_date date not null,
  due_at timestamptz,
  status text not null default 'pending',
  note text not null default '',
  completed_at timestamptz,
  overdue_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

update public.todos
set scheduled_date = coalesce(
  (due_at at time zone 'Asia/Ho_Chi_Minh')::date,
  (created_at at time zone 'Asia/Ho_Chi_Minh')::date
)
where scheduled_date is null;

alter table public.todos alter column scheduled_date set not null;

alter table public.todos drop constraint if exists todos_title_length;
alter table public.todos add constraint todos_title_length
  check (length(trim(title)) between 1 and 160);

alter table public.todos drop constraint if exists todos_status_allowed;
alter table public.todos add constraint todos_status_allowed
  check (status in ('pending', 'completed', 'cancelled'));

alter table public.todos drop constraint if exists todos_due_on_scheduled_vietnam_day;
alter table public.todos add constraint todos_due_on_scheduled_vietnam_day check (
  due_at is null
  or (due_at at time zone 'Asia/Ho_Chi_Minh')::date = scheduled_date
);

alter table public.todos drop constraint if exists todos_completed_timestamp_consistency;
alter table public.todos add constraint todos_completed_timestamp_consistency check (
  (status = 'completed' and completed_at is not null)
  or
  (status in ('pending', 'cancelled') and completed_at is null)
);

create index if not exists activities_user_unacknowledged_overdue_idx
  on public.activities(user_id, ends_at)
  where status = 'scheduled' and overdue_acknowledged_at is null;
create index if not exists todos_user_scheduled_date_idx
  on public.todos(user_id, scheduled_date);
create index if not exists todos_user_due_at_idx
  on public.todos(user_id, due_at)
  where due_at is not null;
create index if not exists todos_user_unacknowledged_overdue_idx
  on public.todos(user_id, due_at, scheduled_date)
  where status = 'pending' and overdue_acknowledged_at is null;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists todos_set_updated_at on public.todos;
create trigger todos_set_updated_at before update on public.todos
for each row execute function public.set_updated_at();

alter table public.todos enable row level security;

drop policy if exists "todos_select_own" on public.todos;
drop policy if exists "todos_insert_own" on public.todos;
drop policy if exists "todos_update_own" on public.todos;
drop policy if exists "todos_delete_own" on public.todos;
create policy "todos_select_own" on public.todos for select using (auth.uid() = user_id);
create policy "todos_insert_own" on public.todos for insert with check (auth.uid() = user_id);
create policy "todos_update_own" on public.todos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "todos_delete_own" on public.todos for delete using (auth.uid() = user_id);

revoke all privileges on table public.todos from anon, authenticated;
grant select, insert, update, delete on table public.todos to authenticated;
