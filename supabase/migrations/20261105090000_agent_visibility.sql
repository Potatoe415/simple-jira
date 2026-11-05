-- Agent visibility: live journal, owner comments, project memory, per-ticket model/effort,
-- sub-tickets and dependencies, notifications, browser check.
-- Idempotent and additive: safe to paste twice. Old workers keep working (they only use the old columns and kinds).

-- ticket_events already exists (id, ticket_id, kind, message, created_at): `message` is the event body.
alter table public.ticket_events add column if not exists meta jsonb;

alter table public.ticket_events drop constraint if exists ticket_events_kind_check;
alter table public.ticket_events add constraint ticket_events_kind_check check (
  kind in (
    'status', 'agent', 'tool', 'verify', 'error', 'info',
    'plan', 'message', 'comment', 'question', 'owner_comment', 'pr', 'check', 'browser'
  )
);

create index if not exists ticket_events_ticket_created_idx on public.ticket_events (ticket_id, created_at);
create index if not exists ticket_events_owner_comment_idx on public.ticket_events (ticket_id, id)
  where kind = 'owner_comment';

-- Durable learnings per project, injected into every TASK.md of that project.
create table if not exists public.project_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  key text not null check (length(key) between 1 and 100),
  body text not null check (length(body) <= 2000),
  updated_at timestamptz not null default now(),
  unique (project_id, key)
);

create index if not exists project_memory_project_idx on public.project_memory (project_id, updated_at);

alter table public.tickets
  add column if not exists model text check (model is null or model ~ '^[A-Za-z0-9][A-Za-z0-9._\[\]-]{0,63}$'),
  add column if not exists effort text check (effort is null or effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  add column if not exists parent_id uuid references public.tickets (id) on delete set null,
  add column if not exists blocked_by uuid[],
  add column if not exists check_paths text[] not null default '{}',
  add column if not exists comment_cursor bigint not null default 0;

create index if not exists tickets_parent_idx on public.tickets (parent_id) where parent_id is not null;

alter table public.projects
  add column if not exists default_model text
    check (default_model is null or default_model ~ '^[A-Za-z0-9][A-Za-z0-9._\[\]-]{0,63}$'),
  add column if not exists default_effort text
    check (default_effort is null or default_effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  add column if not exists notify_url text,
  add column if not exists browser_check boolean not null default true;

alter table public.project_memory enable row level security;
revoke all on public.project_memory from anon, authenticated;
grant all on public.project_memory to service_role;

-- Take the most urgent, oldest queued ticket whose blockers are all delivered or merged.
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

-- Private bucket for browser-check screenshots (served through signed URLs only).
insert into storage.buckets (id, name, public)
values ('ticket-screens', 'ticket-screens', false)
on conflict (id) do nothing;
