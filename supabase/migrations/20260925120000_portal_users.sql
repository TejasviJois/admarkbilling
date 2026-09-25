-- Portal logins (admin / sales). App access remains via service_role server fns.
-- Safe to re-run.

begin;

create table if not exists admark.portal_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references admark.organizations(id) on delete restrict,
  username text not null,
  username_normalized text not null,
  password_hash text not null,
  role text not null check (role in ('admin', 'sales')),
  team_member_legacy_id text,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_users_org_username_key unique (organization_id, username_normalized)
);

create index if not exists portal_users_org_active_idx
  on admark.portal_users (organization_id, active);

revoke all on table admark.portal_users from anon, authenticated;
grant select, insert, update, delete on table admark.portal_users to service_role;

alter table admark.portal_users enable row level security;

commit;
