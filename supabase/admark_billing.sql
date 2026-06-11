-- =============================================================================
-- Admark Billing — ONE FILE for Supabase SQL Editor (safe to run multiple times)
-- Creates tables, removes old RLS policies, disables RLS (service_role bypasses
-- RLS anyway; this avoids policy mistakes hiding rows), grants DML, seeds row.
-- =============================================================================

begin;

create table if not exists public.invoices (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_data (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists invoices_created_at_idx on public.invoices (created_at desc);

-- Clean up policies from older templates (names used in prior migration)
drop policy if exists "invoices_anon_all" on public.invoices;
drop policy if exists "invoices_authenticated_all" on public.invoices;
drop policy if exists "company_anon_all" on public.company_settings;
drop policy if exists "company_authenticated_all" on public.company_settings;
drop policy if exists "operations_anon_all" on public.operations_data;
drop policy if exists "operations_authenticated_all" on public.operations_data;

alter table public.invoices disable row level security;
alter table public.company_settings disable row level security;
alter table public.operations_data disable row level security;

-- Ensure API roles can read/write when not using service_role
grant usage on schema public to anon, authenticated, service_role;
grant all on table public.invoices to anon, authenticated, service_role;
grant all on table public.company_settings to anon, authenticated, service_role;
grant all on table public.operations_data to anon, authenticated, service_role;

insert into public.company_settings (id, payload)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.operations_data (id, payload)
values ('default', '{"projects":[],"partnerships":[],"expenses":[]}'::jsonb)
on conflict (id) do nothing;

insert into public.operations_data (id, payload)
values ('activity_logs', '{"entries":[]}'::jsonb)
on conflict (id) do nothing;

commit;

-- Verify (optional): should return one row for company and zero+ invoices
-- select * from public.company_settings;
-- select * from public.invoices order by created_at desc;
