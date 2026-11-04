-- Priority 1 (urgent) to 3 (default). The worker takes priority 1 first, then the oldest.
alter table public.tickets
  add column priority smallint not null default 3 check (priority between 1 and 3);

create index tickets_queue_idx on public.tickets (priority, created_at) where status = 'queued';

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
     select id from public.tickets
      where status = 'queued'
      order by priority, created_at
      limit 1
      for update skip locked
   )
  returning *;
$$;
