-- Admark OS relational schema.
-- Legacy public.operations_data, public.company_settings and public.invoices
-- intentionally remain untouched as migration backups.

begin;

create extension if not exists pgcrypto;
create schema if not exists admark;

grant usage on schema admark to service_role;

create or replace function admark.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists admark.organizations (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint organizations_slug_key unique (slug),
  constraint organizations_legacy_id_key unique (legacy_id)
);

create table if not exists admark.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  name text not null,
  tagline text,
  logo_url text,
  signature_url text,
  gst_number text,
  pan_number text,
  udyam_number text,
  udyam_document_url text,
  address text,
  email text,
  phone text,
  website text,
  authorized_name text,
  bank_name text,
  account_name text,
  account_number text,
  ifsc text,
  branch text,
  upi text,
  legal_information text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint companies_organization_key unique (organization_id),
  constraint companies_org_id_key unique (organization_id, id)
);

create table if not exists admark.settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  invoice_prefix text,
  next_invoice_number bigint not null default 1 check (next_invoice_number > 0),
  default_payment_terms text,
  default_remarks text,
  default_payment_mode text,
  opening_balance numeric(18,2),
  opening_balance_as_of date,
  application_preferences jsonb not null default '{}'::jsonb,
  feature_toggles jsonb not null default '{}'::jsonb,
  user_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint settings_organization_key unique (organization_id),
  constraint settings_org_id_key unique (organization_id, id)
);

create table if not exists admark.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  parent_client_id uuid,
  company_name text not null,
  contact_person text,
  phone text,
  email text,
  gst_number text,
  pan_number text,
  billing_address text,
  shipping_address text,
  website text,
  industry text,
  client_since date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint clients_org_id_key unique (organization_id, id),
  constraint clients_org_legacy_key unique (organization_id, legacy_id),
  constraint clients_parent_fk foreign key (organization_id, parent_client_id)
    references admark.clients(organization_id, id) on delete restrict
);

create table if not exists admark.team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  name text not null,
  email text,
  phone text,
  role text not null check (role in ('founder', 'employee', 'intern', 'advisor', 'partner')),
  job_title text,
  join_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  base_monthly_salary numeric(18,2) check (base_monthly_salary is null or base_monthly_salary >= 0),
  monthly_bonus_limit numeric(18,2) check (monthly_bonus_limit is null or monthly_bonus_limit >= 0),
  salary_start_date date,
  salary_due_day smallint check (salary_due_day between 1 and 31),
  founder_share_percentage numeric(7,4)
    check (founder_share_percentage is null or founder_share_percentage between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint team_members_org_id_key unique (organization_id, id),
  constraint team_members_org_legacy_key unique (organization_id, legacy_id)
);

create table if not exists admark.partnerships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  name text not null,
  contact_name text,
  phone text,
  email text,
  partnership_type text,
  opportunity_type text,
  status text not null default 'prospect' check (status in ('active', 'inactive', 'prospect')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint partnerships_org_id_key unique (organization_id, id),
  constraint partnerships_org_legacy_key unique (organization_id, legacy_id)
);

create table if not exists admark.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  converted_client_id uuid,
  source_partnership_id uuid,
  assigned_team_member_id uuid,
  company_name text not null,
  contact_person text,
  email text,
  phone text,
  status text not null default 'new_lead'
    check (status in ('new_lead', 'contacted', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'won', 'lost')),
  source text,
  expected_revenue numeric(18,2) check (expected_revenue is null or expected_revenue >= 0),
  probability numeric(5,2) check (probability is null or probability between 0 and 100),
  expected_closing_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint leads_org_id_key unique (organization_id, id),
  constraint leads_org_legacy_key unique (organization_id, legacy_id),
  constraint leads_client_fk foreign key (organization_id, converted_client_id)
    references admark.clients(organization_id, id) on delete restrict,
  constraint leads_partnership_fk foreign key (organization_id, source_partnership_id)
    references admark.partnerships(organization_id, id) on delete restrict,
  constraint leads_assignee_fk foreign key (organization_id, assigned_team_member_id)
    references admark.team_members(organization_id, id) on delete restrict
);

create table if not exists admark.agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  client_id uuid,
  title text not null,
  legacy_counterparty_name text,
  agreement_type text not null default 'agreement',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'signed', 'expired', 'cancelled')),
  one_time_amount numeric(18,2) check (one_time_amount is null or one_time_amount >= 0),
  recurring_amount numeric(18,2) check (recurring_amount is null or recurring_amount >= 0),
  recurring_start_date date,
  recurring_end_date date,
  recurring_months integer check (recurring_months is null or recurring_months > 0),
  signed_date date,
  expiry_date date,
  notes text,
  migration_review_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agreements_org_id_key unique (organization_id, id),
  constraint agreements_org_legacy_key unique (organization_id, legacy_id),
  constraint agreements_client_fk foreign key (organization_id, client_id)
    references admark.clients(organization_id, id) on delete restrict,
  constraint agreements_recurring_dates_check
    check (recurring_end_date is null or recurring_start_date is null or recurring_end_date >= recurring_start_date)
);

create table if not exists admark.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  client_id uuid not null,
  agreement_id uuid,
  display_name text not null,
  project_type text,
  status text not null default 'planning'
    check (status in ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  start_date date,
  end_date date,
  deadline date,
  budget numeric(18,2) check (budget is null or budget >= 0),
  estimated_cost numeric(18,2) check (estimated_cost is null or estimated_cost >= 0),
  contract_value numeric(18,2) check (contract_value is null or contract_value >= 0),
  upfront_amount numeric(18,2) check (upfront_amount is null or upfront_amount >= 0),
  maintenance_amount numeric(18,2) check (maintenance_amount is null or maintenance_amount >= 0),
  maintenance_months integer check (maintenance_months is null or maintenance_months > 0),
  monthly_amount numeric(18,2) check (monthly_amount is null or monthly_amount >= 0),
  monthly_months integer check (monthly_months is null or monthly_months > 0),
  monthly_start_date date,
  monthly_end_date date,
  historical_received numeric(18,2) not null default 0 check (historical_received >= 0),
  historical_outstanding numeric(18,2) check (historical_outstanding is null or historical_outstanding >= 0),
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint projects_org_id_key unique (organization_id, id),
  constraint projects_org_legacy_key unique (organization_id, legacy_id),
  constraint projects_client_fk foreign key (organization_id, client_id)
    references admark.clients(organization_id, id) on delete restrict,
  constraint projects_agreement_fk foreign key (organization_id, agreement_id)
    references admark.agreements(organization_id, id) on delete set null
);

create table if not exists admark.project_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  project_id uuid not null,
  team_member_id uuid not null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint project_assignments_org_id_key unique (organization_id, id),
  constraint project_assignments_project_fk foreign key (organization_id, project_id)
    references admark.projects(organization_id, id) on delete cascade,
  constraint project_assignments_member_fk foreign key (organization_id, team_member_id)
    references admark.team_members(organization_id, id) on delete restrict,
  constraint project_assignments_dates_check check (ended_at is null or ended_at >= assigned_at)
);

create unique index if not exists project_assignments_active_key
  on admark.project_assignments (organization_id, project_id, team_member_id)
  where deleted_at is null and ended_at is null;

create table if not exists admark.project_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  project_id uuid not null,
  assigned_team_member_id uuid,
  name text not null,
  description text,
  position integer not null default 0 check (position >= 0),
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'delayed')),
  payment_trigger boolean not null default false,
  completed_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint project_milestones_org_id_key unique (organization_id, id),
  constraint project_milestones_org_legacy_key unique (organization_id, legacy_id),
  constraint project_milestones_project_fk foreign key (organization_id, project_id)
    references admark.projects(organization_id, id) on delete cascade,
  constraint project_milestones_member_fk foreign key (organization_id, assigned_team_member_id)
    references admark.team_members(organization_id, id) on delete restrict
);

create table if not exists admark.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  client_id uuid not null,
  project_id uuid,
  agreement_id uuid,
  number text not null,
  invoice_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'generated', 'sent', 'viewed', 'partially_paid', 'paid', 'cancelled', 'overdue')),
  client_name_snapshot text not null,
  client_business_type_snapshot text,
  client_address_snapshot text,
  client_contact_snapshot text,
  client_phone_snapshot text,
  client_email_snapshot text,
  client_gstin_snapshot text,
  company_snapshot jsonb not null default '{}'::jsonb,
  advance numeric(18,2) not null default 0 check (advance >= 0),
  tax_percent numeric(7,4) not null default 0 check (tax_percent >= 0),
  remarks text,
  payment_terms text,
  payment_mode text,
  payment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint invoices_org_id_key unique (organization_id, id),
  constraint invoices_org_legacy_key unique (organization_id, legacy_id),
  constraint invoices_org_number_key unique (organization_id, number),
  constraint invoices_client_fk foreign key (organization_id, client_id)
    references admark.clients(organization_id, id) on delete restrict,
  constraint invoices_project_fk foreign key (organization_id, project_id)
    references admark.projects(organization_id, id) on delete restrict,
  constraint invoices_agreement_fk foreign key (organization_id, agreement_id)
    references admark.agreements(organization_id, id) on delete restrict
);

create table if not exists admark.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  invoice_id uuid not null,
  project_id uuid,
  description text not null,
  quantity numeric(18,4) not null check (quantity >= 0),
  rate numeric(18,2) not null check (rate >= 0),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint invoice_lines_org_id_key unique (organization_id, id),
  constraint invoice_lines_org_legacy_key unique (organization_id, legacy_id),
  constraint invoice_lines_invoice_fk foreign key (organization_id, invoice_id)
    references admark.invoices(organization_id, id) on delete cascade,
  constraint invoice_lines_project_fk foreign key (organization_id, project_id)
    references admark.projects(organization_id, id) on delete restrict
);

create table if not exists admark.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  label text not null,
  payee text,
  amount_per_month numeric(18,2) not null check (amount_per_month > 0),
  expense_type text not null default 'other'
    check (expense_type in ('emi', 'rent', 'subscription', 'utility', 'other')),
  start_date date not null,
  total_months integer check (total_months is null or total_months > 0),
  reminder_day smallint check (reminder_day between 1 and 31),
  paid_months text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint recurring_expenses_org_id_key unique (organization_id, id),
  constraint recurring_expenses_org_legacy_key unique (organization_id, legacy_id)
);

create table if not exists admark.salaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  team_member_id uuid not null,
  salary_month text not null check (salary_month ~ '^[0-9]{4}-[0-9]{2}$'),
  base_amount numeric(18,2) not null check (base_amount >= 0),
  bonus_amount numeric(18,2) not null default 0 check (bonus_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'partial', 'paid', 'waived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint salaries_org_id_key unique (organization_id, id),
  constraint salaries_org_legacy_key unique (organization_id, legacy_id),
  constraint salaries_member_month_key unique (organization_id, team_member_id, salary_month),
  constraint salaries_member_fk foreign key (organization_id, team_member_id)
    references admark.team_members(organization_id, id) on delete restrict
);

create table if not exists admark.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  client_id uuid,
  project_id uuid,
  partnership_id uuid,
  team_member_id uuid,
  recurring_expense_id uuid,
  label text not null,
  amount numeric(18,2) not null check (amount >= 0),
  expense_date date not null,
  category text,
  status text not null default 'paid' check (status in ('pending', 'partial', 'paid', 'cancelled')),
  gst_amount numeric(18,2) check (gst_amount is null or gst_amount >= 0),
  payee text,
  notes text,
  historical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint expenses_org_id_key unique (organization_id, id),
  constraint expenses_org_legacy_key unique (organization_id, legacy_id),
  constraint expenses_client_fk foreign key (organization_id, client_id)
    references admark.clients(organization_id, id) on delete restrict,
  constraint expenses_project_fk foreign key (organization_id, project_id)
    references admark.projects(organization_id, id) on delete restrict,
  constraint expenses_partnership_fk foreign key (organization_id, partnership_id)
    references admark.partnerships(organization_id, id) on delete restrict,
  constraint expenses_member_fk foreign key (organization_id, team_member_id)
    references admark.team_members(organization_id, id) on delete restrict,
  constraint expenses_recurring_fk foreign key (organization_id, recurring_expense_id)
    references admark.recurring_expenses(organization_id, id) on delete restrict
);

create table if not exists admark.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  client_id uuid,
  project_id uuid,
  invoice_id uuid,
  team_member_id uuid,
  expense_id uuid,
  salary_id uuid,
  recurring_expense_id uuid,
  transaction_type text not null
    check (transaction_type in ('client_payment', 'founder_investment', 'founder_withdrawal', 'expense', 'refund', 'internal_transfer', 'adjustment')),
  transaction_date date not null,
  amount numeric(18,2) not null check (amount <> 0),
  description text not null,
  category text,
  payment_method text,
  vendor text,
  gst_amount numeric(18,2),
  notes text,
  payroll_month text check (payroll_month is null or payroll_month ~ '^[0-9]{4}-[0-9]{2}$'),
  salary_base_amount numeric(18,2) check (salary_base_amount is null or salary_base_amount >= 0),
  salary_bonus_amount numeric(18,2) check (salary_bonus_amount is null or salary_bonus_amount >= 0),
  created_by text,
  historical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transactions_org_id_key unique (organization_id, id),
  constraint transactions_org_legacy_key unique (organization_id, legacy_id),
  constraint transactions_client_fk foreign key (organization_id, client_id)
    references admark.clients(organization_id, id) on delete restrict,
  constraint transactions_project_fk foreign key (organization_id, project_id)
    references admark.projects(organization_id, id) on delete restrict,
  constraint transactions_invoice_fk foreign key (organization_id, invoice_id)
    references admark.invoices(organization_id, id) on delete restrict,
  constraint transactions_member_fk foreign key (organization_id, team_member_id)
    references admark.team_members(organization_id, id) on delete restrict,
  constraint transactions_expense_fk foreign key (organization_id, expense_id)
    references admark.expenses(organization_id, id) on delete restrict,
  constraint transactions_salary_fk foreign key (organization_id, salary_id)
    references admark.salaries(organization_id, id) on delete restrict,
  constraint transactions_recurring_expense_fk foreign key (organization_id, recurring_expense_id)
    references admark.recurring_expenses(organization_id, id) on delete restrict
);

create table if not exists admark.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  transaction_id uuid,
  client_id uuid not null,
  invoice_id uuid,
  project_id uuid,
  amount numeric(18,2) not null check (amount <> 0),
  payment_date date not null,
  payment_method text,
  reference_number text,
  external_transaction_id text,
  notes text,
  historical boolean not null default false,
  recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint payments_org_id_key unique (organization_id, id),
  constraint payments_org_legacy_key unique (organization_id, legacy_id),
  constraint payments_transaction_key unique (organization_id, transaction_id),
  constraint payments_transaction_fk foreign key (organization_id, transaction_id)
    references admark.transactions(organization_id, id) on delete restrict,
  constraint payments_client_fk foreign key (organization_id, client_id)
    references admark.clients(organization_id, id) on delete restrict,
  constraint payments_invoice_fk foreign key (organization_id, invoice_id)
    references admark.invoices(organization_id, id) on delete restrict,
  constraint payments_project_fk foreign key (organization_id, project_id)
    references admark.projects(organization_id, id) on delete restrict
);

create table if not exists admark.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  company_id uuid,
  client_id uuid,
  project_id uuid,
  agreement_id uuid,
  invoice_id uuid,
  transaction_id uuid,
  partnership_id uuid,
  title text not null,
  document_type text not null default 'other',
  file_url text,
  external_url text,
  file_name text,
  mime_type text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint documents_org_id_key unique (organization_id, id),
  constraint documents_org_legacy_key unique (organization_id, legacy_id),
  constraint documents_has_location_check check (file_url is not null or external_url is not null),
  constraint documents_single_owner_check check (
    num_nonnulls(company_id, client_id, project_id, agreement_id, invoice_id, transaction_id, partnership_id) = 1
  ),
  constraint documents_company_fk foreign key (organization_id, company_id)
    references admark.companies(organization_id, id) on delete restrict,
  constraint documents_client_fk foreign key (organization_id, client_id)
    references admark.clients(organization_id, id) on delete restrict,
  constraint documents_project_fk foreign key (organization_id, project_id)
    references admark.projects(organization_id, id) on delete restrict,
  constraint documents_agreement_fk foreign key (organization_id, agreement_id)
    references admark.agreements(organization_id, id) on delete restrict,
  constraint documents_invoice_fk foreign key (organization_id, invoice_id)
    references admark.invoices(organization_id, id) on delete restrict,
  constraint documents_transaction_fk foreign key (organization_id, transaction_id)
    references admark.transactions(organization_id, id) on delete restrict,
  constraint documents_partnership_fk foreign key (organization_id, partnership_id)
    references admark.partnerships(organization_id, id) on delete restrict
);

create table if not exists admark.calendar (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  client_id uuid,
  lead_id uuid,
  project_id uuid,
  team_member_id uuid,
  title text not null,
  calendar_type text not null check (calendar_type in ('meeting', 'call', 'reminder')),
  event_date date not null,
  start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  attendees text,
  location text,
  meeting_url text,
  notes text,
  reminder_minutes integer not null default 30 check (reminder_minutes >= 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint calendar_org_id_key unique (organization_id, id),
  constraint calendar_org_legacy_key unique (organization_id, legacy_id),
  constraint calendar_client_fk foreign key (organization_id, client_id)
    references admark.clients(organization_id, id) on delete restrict,
  constraint calendar_lead_fk foreign key (organization_id, lead_id)
    references admark.leads(organization_id, id) on delete restrict,
  constraint calendar_project_fk foreign key (organization_id, project_id)
    references admark.projects(organization_id, id) on delete restrict,
  constraint calendar_member_fk foreign key (organization_id, team_member_id)
    references admark.team_members(organization_id, id) on delete restrict
);

create table if not exists admark.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  title text not null,
  message text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  read boolean not null default false,
  occurred_at timestamptz not null default now(),
  related_module text,
  source_type text,
  source_legacy_id text,
  action_url text,
  action_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint notifications_org_id_key unique (organization_id, id),
  constraint notifications_org_legacy_key unique (organization_id, legacy_id)
);

create table if not exists admark.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  occurred_at timestamptz not null,
  entity_type text not null,
  action text not null,
  summary text not null,
  entity_legacy_id text,
  entity_name text,
  actor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint activity_logs_org_id_key unique (organization_id, id),
  constraint activity_logs_org_legacy_key unique (organization_id, legacy_id)
);

create table if not exists admark.valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  legacy_id text,
  valuation_date date not null,
  calculated_valuation numeric(18,2) not null,
  revenue numeric(18,2),
  assets numeric(18,2),
  profit numeric(18,2),
  growth numeric(12,4),
  net_worth numeric(18,2),
  enterprise_value numeric(18,2),
  note text,
  snapshot_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint valuation_snapshots_org_id_key unique (organization_id, id),
  constraint valuation_snapshots_org_legacy_key unique (organization_id, legacy_id)
);

-- Technical migration support, not product-domain entities.
create table if not exists admark.migration_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references admark.organizations(id) on delete restrict,
  migration_name text not null,
  status text not null check (status in ('running', 'completed', 'completed_with_issues', 'failed', 'rolled_back')),
  source_counts jsonb not null default '{}'::jsonb,
  target_counts jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admark.migration_issues (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null references admark.migration_runs(id) on delete cascade,
  organization_id uuid references admark.organizations(id) on delete restrict,
  source_collection text not null,
  source_id text,
  severity text not null check (severity in ('warning', 'error')),
  issue_code text not null,
  message text not null,
  source_record jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists admark.legacy_record_map (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete cascade,
  source_table text not null,
  source_collection text not null,
  legacy_id text not null,
  target_table text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  constraint legacy_record_map_key
    unique (organization_id, source_table, source_collection, legacy_id, target_table)
);

-- Query-path indexes. Partial indexes omit soft-deleted rows.
create index if not exists clients_active_idx on admark.clients (organization_id, status, company_name) where deleted_at is null;
create index if not exists leads_status_idx on admark.leads (organization_id, status, expected_closing_date) where deleted_at is null;
create index if not exists projects_status_idx on admark.projects (organization_id, status, client_id) where deleted_at is null;
create index if not exists projects_agreement_idx on admark.projects (organization_id, agreement_id) where agreement_id is not null and deleted_at is null;
create index if not exists agreements_client_idx on admark.agreements (organization_id, client_id, status) where deleted_at is null;
create index if not exists milestones_project_idx on admark.project_milestones (organization_id, project_id, status) where deleted_at is null;
create index if not exists invoices_date_idx on admark.invoices (organization_id, invoice_date desc) where deleted_at is null;
create index if not exists invoices_client_idx on admark.invoices (organization_id, client_id, status) where deleted_at is null;
create index if not exists invoice_lines_invoice_idx on admark.invoice_lines (organization_id, invoice_id, position) where deleted_at is null;
create index if not exists transactions_date_idx on admark.transactions (organization_id, transaction_date desc) where deleted_at is null;
create index if not exists transactions_type_idx on admark.transactions (organization_id, transaction_type, transaction_date desc) where deleted_at is null;
create index if not exists transactions_client_idx on admark.transactions (organization_id, client_id) where client_id is not null and deleted_at is null;
create index if not exists payments_invoice_idx on admark.payments (organization_id, invoice_id) where invoice_id is not null and deleted_at is null;
create index if not exists payments_project_idx on admark.payments (organization_id, project_id) where project_id is not null and deleted_at is null;
create index if not exists expenses_date_idx on admark.expenses (organization_id, expense_date desc) where deleted_at is null;
create index if not exists recurring_expenses_status_idx on admark.recurring_expenses (organization_id, status, start_date) where deleted_at is null;
create index if not exists salaries_month_idx on admark.salaries (organization_id, salary_month, status) where deleted_at is null;
create index if not exists documents_client_idx on admark.documents (organization_id, client_id) where client_id is not null and deleted_at is null;
create index if not exists documents_project_idx on admark.documents (organization_id, project_id) where project_id is not null and deleted_at is null;
create index if not exists calendar_date_idx on admark.calendar (organization_id, event_date, start_time) where deleted_at is null;
create index if not exists notifications_unread_idx on admark.notifications (organization_id, read, occurred_at desc) where deleted_at is null;
create index if not exists activity_logs_entity_idx on admark.activity_logs (organization_id, entity_type, occurred_at desc) where deleted_at is null;
create index if not exists valuation_snapshots_date_idx on admark.valuation_snapshots (organization_id, valuation_date desc) where deleted_at is null;
create index if not exists migration_issues_run_idx on admark.migration_issues (migration_run_id, severity);

-- Keep updated_at reliable across every mutable table.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'companies', 'settings', 'clients', 'team_members',
    'partnerships', 'leads', 'agreements', 'projects', 'project_assignments',
    'project_milestones', 'invoices', 'invoice_lines', 'recurring_expenses',
    'salaries', 'expenses', 'transactions', 'payments', 'documents', 'calendar',
    'notifications', 'activity_logs', 'valuation_snapshots', 'migration_runs'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on admark.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on admark.%I for each row execute function admark.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

-- Server-side access only. The service role bypasses RLS; browser roles receive no policy.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'companies', 'settings', 'clients', 'team_members',
    'partnerships', 'leads', 'agreements', 'projects', 'project_assignments',
    'project_milestones', 'invoices', 'invoice_lines', 'recurring_expenses',
    'salaries', 'expenses', 'transactions', 'payments', 'documents', 'calendar',
    'notifications', 'activity_logs', 'valuation_snapshots', 'migration_runs',
    'migration_issues', 'legacy_record_map'
  ]
  loop
    execute format('alter table admark.%I enable row level security', table_name);
    execute format('grant all on table admark.%I to service_role', table_name);
    execute format('revoke all on table admark.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

grant execute on function admark.set_updated_at() to service_role;

commit;
