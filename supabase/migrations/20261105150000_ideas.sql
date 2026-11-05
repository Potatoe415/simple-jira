-- Ideas: tickets saved for later. The worker only claims 'queued' tickets, so an idea is never developed
-- until the owner starts it (status idea -> queued).
alter table public.tickets drop constraint tickets_status_check;
alter table public.tickets add constraint tickets_status_check check (
  status in ('idea', 'queued', 'running', 'blocked', 'verifying', 'delivered', 'merged', 'failed', 'cancelled')
);
