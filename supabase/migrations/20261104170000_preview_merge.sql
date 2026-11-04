-- Preview link and one-click merge to production from the dashboard.
alter table public.tickets
  add column preview_url text,
  add column merge_requested_at timestamptz,
  add column merged_at timestamptz;

alter table public.tickets drop constraint tickets_status_check;
alter table public.tickets add constraint tickets_status_check check (
  status in ('queued', 'running', 'blocked', 'verifying', 'delivered', 'merged', 'failed', 'cancelled')
);
