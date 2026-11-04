-- "Mets direct en prod": merge the PR as soon as it is delivered.
alter table public.tickets add column auto_merge boolean not null default false;
