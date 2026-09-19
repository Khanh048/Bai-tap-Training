begin;

alter table public.todos
  add column if not exists activity_id uuid null;

-- Do not infer links for legacy rows: only newly linked todos receive a value.
alter table public.todos
  drop constraint if exists todos_activity_id_fkey;
alter table public.todos
  add constraint todos_activity_id_fkey
  foreign key (activity_id) references public.activities(id) on delete set null;

create unique index if not exists todos_user_activity_unique_idx
  on public.todos(user_id, activity_id)
  where activity_id is not null;

create or replace function public.ensure_todo_activity_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.activity_id is not null and not exists (
    select 1 from public.activities
    where id = new.activity_id and user_id = new.user_id
  ) then
    raise exception 'Todo and linked activity must have the same owner';
  end if;
  return new;
end;
$$;

drop trigger if exists todos_ensure_activity_owner on public.todos;
create trigger todos_ensure_activity_owner
before insert or update of user_id, activity_id on public.todos
for each row execute function public.ensure_todo_activity_owner();

create or replace function public.delete_linked_todo(p_todo_id uuid, p_activity_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  deleted_todo_count integer;
  deleted_activity_count integer;
begin
  delete from public.todos
  where id = p_todo_id and activity_id = p_activity_id and user_id = auth.uid();
  get diagnostics deleted_todo_count = row_count;
  if deleted_todo_count <> 1 then
    raise exception 'Linked Todo not found';
  end if;

  delete from public.activities
  where id = p_activity_id and user_id = auth.uid();
  get diagnostics deleted_activity_count = row_count;
  if deleted_activity_count <> 1 then
    raise exception 'Linked activity not found';
  end if;
end;
$$;

revoke all on function public.delete_linked_todo(uuid, uuid) from public, anon;
grant execute on function public.delete_linked_todo(uuid, uuid) to authenticated;

commit;
