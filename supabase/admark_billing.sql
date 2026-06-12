-- =============================================================================
-- Admark Billing — ONE FILE for Supabase SQL Editor (safe to run multiple times)
-- Creates tables, storage bucket, removes old RLS policies, disables RLS
-- (service_role bypasses RLS anyway), grants DML, seeds rows.
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
create index if not exists operations_data_updated_at_idx on public.operations_data (updated_at desc);

-- ---------------------------------------------------------------------------
-- Storage bucket for logos, signatures, payment proofs, agreements, PDFs
-- Public read — uploads go through the app server (service role).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admark-files',
  'admark-files',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

insert into public.operations_data (id, payload)
values ('documents', '{"agreements":[]}'::jsonb)
on conflict (id) do nothing;

commit;

-- Verify (optional):
-- select id from public.company_settings;
-- select id from storage.buckets where id = 'admark-files';
-- select id, updated_at from public.operations_data order by updated_at desc;
