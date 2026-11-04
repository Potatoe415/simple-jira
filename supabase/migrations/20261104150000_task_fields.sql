-- Tickets carry a ready-to-run task (goal + steps), rendered into TASK.md by the worker.
alter table public.tickets
  add column slug text check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  add column goal text,
  add column steps text[] not null default '{}';

-- How the agent commits and pushes the feature branch for this project.
alter table public.projects
  add column ship_command text not null default '';
