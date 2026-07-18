-- Follow-up: allow pre-client discussion projects linked to a lead.
-- Existing migrated rows are left untouched (client_id stays populated).
-- Run manually in the Supabase SQL editor after exposing the admark schema.

begin;

-- Discussion projects may exist before a lead is converted into a client.
alter table admark.projects
  alter column client_id drop not null;

-- One primary project per lead for the CRM → Operations lifecycle.
alter table admark.projects
  add column if not exists lead_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_lead_fk'
      and conrelid = 'admark.projects'::regclass
  ) then
    alter table admark.projects
      add constraint projects_lead_fk
      foreign key (organization_id, lead_id)
      references admark.leads(organization_id, id)
      on delete restrict;
  end if;
end $$;

-- Enforce one non-deleted project per lead (multiple soft-deleted rows are fine).
create unique index if not exists projects_one_active_lead_idx
  on admark.projects (organization_id, lead_id)
  where lead_id is not null and deleted_at is null;

create index if not exists projects_lead_idx
  on admark.projects (organization_id, lead_id)
  where lead_id is not null and deleted_at is null;

commit;
