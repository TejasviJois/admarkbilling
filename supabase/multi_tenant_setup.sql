-- =============================================================================
-- Admark Billing — Multi-Tenant Migration Script
-- Adds organizations table and organization_id scopes to existing data structures.
-- =============================================================================

begin;

-- Create organizations table
create table if not exists public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- Seed default organization
insert into public.organizations (id, name)
values ('org-admark-digitals', 'Admark Digitals')
on conflict (id) do nothing;

-- Add organization_id columns to existing tables
alter table public.invoices 
  add column if not exists organization_id text references public.organizations(id) default 'org-admark-digitals';

alter table public.company_settings 
  add column if not exists organization_id text references public.organizations(id) default 'org-admark-digitals';

alter table public.operations_data 
  add column if not exists organization_id text references public.organizations(id) default 'org-admark-digitals';

-- Index organization_id for performance
create index if not exists invoices_organization_id_idx on public.invoices (organization_id);
create index if not exists company_settings_organization_id_idx on public.company_settings (organization_id);
create index if not exists operations_data_organization_id_idx on public.operations_data (organization_id);

commit;
