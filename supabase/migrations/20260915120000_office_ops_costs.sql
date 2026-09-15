-- Office & Ops: renewal metadata on recurring expenses + project commissions.
-- Safe to apply after 20260718120000_create_admark_relational_schema.sql.

alter table if exists admark.recurring_expenses
  add column if not exists next_due_date date,
  add column if not exists billing_cycle text
    check (billing_cycle is null or billing_cycle in ('monthly', 'yearly')),
  add column if not exists vendor text;

create table if not exists admark.project_commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete cascade,
  legacy_id text not null,
  project_id uuid references admark.projects(id) on delete set null,
  label text,
  status text not null default 'planned'
    check (status in ('planned', 'partial', 'paid')),
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint project_commissions_org_legacy_key unique (organization_id, legacy_id)
);

create table if not exists admark.project_commission_splits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete cascade,
  commission_id uuid not null,
  legacy_id text not null,
  person_name text not null,
  team_member_id uuid,
  amount numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint project_commission_splits_org_legacy_key unique (organization_id, legacy_id)
);

create index if not exists project_commissions_org_idx
  on admark.project_commissions (organization_id)
  where deleted_at is null;

create index if not exists project_commission_splits_commission_idx
  on admark.project_commission_splits (organization_id, commission_id)
  where deleted_at is null;
