-- Project > task > sub-task (decision 0003). A ticket with sub-tasks is a container: the worker never claims it,
-- and its status is rolled up from its sub-tasks. Two levels at most (enforced in packages/core).

-- Status of a parent from its sub-tasks. Ideas are ignored; cancelled ones count only when all are cancelled.
create or replace function public.ticket_rollup_status(p_parent uuid)
returns text
language sql
stable
set search_path = ''
as $$
  with c as (
    select status from public.tickets where parent_id = p_parent and status <> 'idea'
  ), live as (
    select status from c where status <> 'cancelled'
  )
  select case
    when not exists (select 1 from c) then 'idea'
    when not exists (select 1 from live) then 'cancelled'
    when exists (select 1 from live where status = 'blocked') then 'blocked'
    when exists (select 1 from live where status in ('running', 'verifying')) then 'running'
    when exists (select 1 from live where status = 'queued') then
      case when exists (select 1 from live where status <> 'queued') then 'running' else 'queued' end
    when exists (select 1 from live where status = 'failed') then 'failed'
    when not exists (select 1 from live where status <> 'merged') then 'merged'
    else 'delivered'
  end;
$$;

-- Any status write on a parent (owner action, worker restart...) is replaced by the rolled-up status.
create or replace function public.tickets_parent_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.tickets where parent_id = new.id) then
    new.status := public.ticket_rollup_status(new.id);
    if new.status in ('delivered', 'merged', 'failed', 'cancelled') then
      new.finished_at := coalesce(new.finished_at, now());
    else
      new.finished_at := null;
    end if;
  end if;
  return new;
end;
$$;

-- A sub-task changed, appeared, moved or was deleted: recompute its parent(s).
create or replace function public.tickets_rollup_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parents uuid[];
begin
  if tg_op = 'INSERT' then
    v_parents := array[new.parent_id];
  elsif tg_op = 'DELETE' then
    v_parents := array[old.parent_id];
  else
    v_parents := array[old.parent_id, new.parent_id];
  end if;
  update public.tickets t
     set status = public.ticket_rollup_status(t.id)
   where t.id = any (v_parents)
     and exists (select 1 from public.tickets c where c.parent_id = t.id)
     and t.status is distinct from public.ticket_rollup_status(t.id);
  return null;
end;
$$;

drop trigger if exists tickets_parent_status on public.tickets;
create trigger tickets_parent_status before update of status on public.tickets
  for each row execute function public.tickets_parent_status();

drop trigger if exists tickets_rollup_parent on public.tickets;
create trigger tickets_rollup_parent after insert or delete or update of status, parent_id on public.tickets
  for each row execute function public.tickets_rollup_parent();

-- Existing tasks with sub-tasks take their rolled-up status (the before-update trigger computes it).
-- One the worker is running right now is left alone: it finishes its run first.
update public.tickets t
   set status = t.status
 where exists (select 1 from public.tickets c where c.parent_id = t.id)
   and t.status not in ('running', 'verifying');

-- Same queue as before, minus containers: their work happens in the sub-tasks.
create or replace function public.claim_next_ticket()
returns setof public.tickets
language sql
set search_path = ''
as $$
  update public.tickets
     set status = 'running',
         started_at = coalesce(started_at, now()),
         error = null
   where id = (
     select t.id from public.tickets t
      where t.status = 'queued'
        and not exists (select 1 from public.tickets c where c.parent_id = t.id)
        and not exists (
          select 1 from public.tickets b
           where b.id = any (coalesce(t.blocked_by, '{}'))
             and b.status not in ('delivered', 'merged')
        )
      order by t.priority, t.created_at
      limit 1
      for update skip locked
   )
  returning *;
$$;

revoke execute on function public.claim_next_ticket() from public, anon, authenticated;
grant execute on function public.claim_next_ticket() to service_role;
revoke execute on function public.ticket_rollup_status(uuid) from public, anon, authenticated;
grant execute on function public.ticket_rollup_status(uuid) to service_role;
revoke execute on function public.tickets_parent_status() from public, anon, authenticated;
revoke execute on function public.tickets_rollup_parent() from public, anon, authenticated;
