alter table if exists admark.team_members
  add column if not exists employee_code text;

create unique index if not exists team_members_org_employee_code_key
  on admark.team_members (organization_id, employee_code)
  where employee_code is not null and deleted_at is null;
