-- simple-jira: projects registry, ticket queue, blocking questions, event log.
-- All access goes through server code using the secret key (service_role).
-- RLS is enabled with no policies, so anon/authenticated get nothing.

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text not null,
  aliases text[] not null default '{}',
  description text not null default '',
  local_path text not null,
  repo text not null check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  default_branch text not null default 'main',
  setup_commands text[] not null default '{}',
  verify_commands text[] not null default '{}',
  env_files text[] not null default '{}',
  agent_instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  project_id uuid references public.projects (id) on delete restrict,
  type text not null check (type in ('fix', 'feature', 'new_project')),
  title text not null check (length(title) between 1 and 200),
  description text not null,
  new_project jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'blocked', 'verifying', 'delivered', 'failed', 'cancelled')),
  source text not null default 'dashboard' check (source in ('mcp', 'dashboard')),
  session_id text,
  branch text,
  worktree_path text,
  pr_url text,
  summary text,
  error text,
  verify_attempts int not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint tickets_project_or_new check (
    (type = 'new_project' and new_project is not null)
    or (type <> 'new_project' and project_id is not null)
  )
);

create index tickets_status_created_idx on public.tickets (status, created_at);
create index tickets_project_idx on public.tickets (project_id);

create trigger tickets_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  question text not null,
  options text[] not null default '{}',
  answer text,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  forwarded_at timestamptz
);

create index questions_ticket_idx on public.questions (ticket_id);
create index questions_open_idx on public.questions (created_at) where answer is null;

create table public.ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  kind text not null check (kind in ('status', 'agent', 'tool', 'verify', 'error', 'info')),
  message text not null,
  created_at timestamptz not null default now()
);

create index ticket_events_ticket_idx on public.ticket_events (ticket_id, id);

create table public.worker_status (
  id text primary key,
  hostname text not null,
  current_ticket_id uuid references public.tickets (id) on delete set null,
  last_seen_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.tickets enable row level security;
alter table public.questions enable row level security;
alter table public.ticket_events enable row level security;
alter table public.worker_status enable row level security;

revoke all on public.projects, public.tickets, public.questions, public.ticket_events, public.worker_status
  from anon, authenticated;
grant all on public.projects, public.tickets, public.questions, public.ticket_events, public.worker_status
  to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Atomically take the oldest queued ticket.
create function public.claim_next_ticket()
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
      order by created_at
      limit 1
      for update skip locked
   )
  returning *;
$$;

-- Record an answer and requeue the ticket once no question is left open.
create function public.answer_question(p_question_id uuid, p_answer text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_ticket uuid;
begin
  if coalesce(trim(p_answer), '') = '' then
    raise exception 'answer is empty';
  end if;

  update public.questions
     set answer = trim(p_answer), answered_at = now()
   where id = p_question_id and answer is null
  returning ticket_id into v_ticket;

  if v_ticket is null then
    raise exception 'question not found or already answered';
  end if;

  insert into public.ticket_events (ticket_id, kind, message)
  values (v_ticket, 'info', 'Réponse : ' || trim(p_answer));

  update public.tickets
     set status = 'queued'
   where id = v_ticket
     and status = 'blocked'
     and not exists (
       select 1 from public.questions where ticket_id = v_ticket and answer is null
     );

  return v_ticket;
end;
$$;

revoke execute on function public.claim_next_ticket() from public, anon, authenticated;
revoke execute on function public.answer_question(uuid, text) from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.claim_next_ticket() to service_role;
grant execute on function public.answer_question(uuid, text) to service_role;
