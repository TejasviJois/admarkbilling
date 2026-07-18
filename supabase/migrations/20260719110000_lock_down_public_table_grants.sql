-- Harden legacy public tables: revoke broad anon/authenticated DML and enable RLS.
-- App access continues through the service_role server (TanStack server fns).
-- Safe to re-run.

begin;

revoke all on table public.invoices from anon, authenticated;
revoke all on table public.company_settings from anon, authenticated;
revoke all on table public.operations_data from anon, authenticated;

grant select, insert, update, delete on table public.invoices to service_role;
grant select, insert, update, delete on table public.company_settings to service_role;
grant select, insert, update, delete on table public.operations_data to service_role;

alter table public.invoices enable row level security;
alter table public.company_settings enable row level security;
alter table public.operations_data enable row level security;

-- No policies for anon/authenticated → only service_role (bypasses RLS) can DML.
-- Keep existing mutate_* RPC execute grants on service_role only.

commit;
