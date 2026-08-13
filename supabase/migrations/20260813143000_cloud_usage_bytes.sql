-- Live Settings usage meter: database size + file storage bytes.
-- Service role only — not exposed to anon/authenticated clients.

create or replace function public.cloud_usage_bytes()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, auth, pg_catalog
as $$
declare
  db_bytes bigint;
  file_bytes bigint;
  user_count integer;
begin
  db_bytes := pg_database_size(current_database());
  select coalesce(sum((metadata->>'size')::bigint), 0)
    into file_bytes
    from storage.objects;
  select count(*)::integer into user_count from auth.users;
  return jsonb_build_object(
    'database_bytes', db_bytes,
    'storage_bytes', file_bytes,
    'auth_users', user_count
  );
end;
$$;

revoke all on function public.cloud_usage_bytes() from public;
revoke all on function public.cloud_usage_bytes() from anon, authenticated;
grant execute on function public.cloud_usage_bytes() to service_role;

notify pgrst, 'reload schema';
