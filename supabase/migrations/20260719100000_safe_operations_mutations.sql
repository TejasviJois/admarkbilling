-- Atomic entity-level mutation for the legacy operations_data aggregate.
-- No caller can replace the payload or an array wholesale. Deletes are explicit IDs,
-- and updated_at is used as the optimistic-concurrency token.

create or replace function public.mutate_operations_data(
  p_expected_updated_at timestamptz,
  p_upserts jsonb default '{}'::jsonb,
  p_deletes jsonb default '{}'::jsonb,
  p_sets jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  is_conflict boolean,
  result_payload jsonb,
  result_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_updated_at timestamptz;
  v_next_updated_at timestamptz;
  v_key text;
  v_items jsonb;
  v_item jsonb;
  v_ids jsonb;
  v_id text;
  v_array jsonb;
  v_allowed_entity_keys constant text[] := array[
    'projects', 'partnerships', 'expenses', 'leads', 'assets',
    'fixedMonthlyExpenses', 'clients', 'contacts', 'payments', 'transactions',
    'founders', 'notifications', 'scheduleEvents', 'valuationSnapshots',
    'valuationAudit'
  ];
  v_allowed_scalar_keys constant text[] := array[
    'financialBaseline', 'valuationSettings', 'migrationApplied', 'migrationDate',
    'groundZeroApplied', 'blxRepairApplied', 'neRepairApplied'
  ];
begin
  select payload, updated_at
    into v_payload, v_updated_at
    from public.operations_data
   where id = 'default'
   for update;

  if not found then
    raise exception 'operations_data/default does not exist';
  end if;

  if p_expected_updated_at is null or v_updated_at <> p_expected_updated_at then
    return query select false, true, v_payload, v_updated_at;
    return;
  end if;

  for v_key, v_items in select key, value from jsonb_each(coalesce(p_upserts, '{}'::jsonb))
  loop
    if not (v_key = any(v_allowed_entity_keys)) then
      raise exception 'Unsupported operations entity key: %', v_key;
    end if;
    if jsonb_typeof(v_items) <> 'array' then
      raise exception 'Upserts for % must be an array', v_key;
    end if;

    v_array := case
      when jsonb_typeof(v_payload -> v_key) = 'array' then v_payload -> v_key
      else '[]'::jsonb
    end;

    for v_item in select value from jsonb_array_elements(v_items)
    loop
      v_id := v_item ->> 'id';
      if v_id is null or v_id = '' then
        raise exception 'Every % upsert requires an id', v_key;
      end if;
      select coalesce(jsonb_agg(existing_item), '[]'::jsonb)
        into v_array
        from jsonb_array_elements(v_array) existing_item
       where existing_item ->> 'id' <> v_id;
      v_array := v_array || jsonb_build_array(v_item);
    end loop;
    v_payload := jsonb_set(v_payload, array[v_key], v_array, true);
  end loop;

  for v_key, v_ids in select key, value from jsonb_each(coalesce(p_deletes, '{}'::jsonb))
  loop
    if not (v_key = any(v_allowed_entity_keys)) then
      raise exception 'Unsupported operations entity key: %', v_key;
    end if;
    if jsonb_typeof(v_ids) <> 'array' then
      raise exception 'Deletes for % must be an array of IDs', v_key;
    end if;

    v_array := case
      when jsonb_typeof(v_payload -> v_key) = 'array' then v_payload -> v_key
      else '[]'::jsonb
    end;
    select coalesce(jsonb_agg(existing_item), '[]'::jsonb)
      into v_array
      from jsonb_array_elements(v_array) existing_item
     where not (existing_item ->> 'id' in (
       select jsonb_array_elements_text(v_ids)
     ));
    v_payload := jsonb_set(v_payload, array[v_key], v_array, true);
  end loop;

  for v_key, v_item in select key, value from jsonb_each(coalesce(p_sets, '{}'::jsonb))
  loop
    if not (v_key = any(v_allowed_scalar_keys)) then
      raise exception 'Unsupported operations scalar key: %', v_key;
    end if;
    v_payload := jsonb_set(v_payload, array[v_key], v_item, true);
  end loop;

  v_next_updated_at := clock_timestamp();
  update public.operations_data
     set payload = v_payload,
         updated_at = v_next_updated_at
   where id = 'default';

  return query select true, false, v_payload, v_next_updated_at;
end;
$$;

revoke all on function public.mutate_operations_data(timestamptz, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_operations_data(timestamptz, jsonb, jsonb, jsonb)
  to service_role;

create or replace function public.mutate_operations_aux_data(
  p_row_id text,
  p_expected_updated_at timestamptz,
  p_entity_key text,
  p_upserts jsonb default '[]'::jsonb,
  p_deletes jsonb default '[]'::jsonb
)
returns table (
  success boolean,
  is_conflict boolean,
  result_payload jsonb,
  result_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_updated_at timestamptz;
  v_next_updated_at timestamptz;
  v_item jsonb;
  v_id text;
  v_array jsonb;
begin
  if not (
    (p_row_id = 'documents' and p_entity_key in ('agreements', 'archiveDocuments'))
    or (p_row_id = 'activity_logs' and p_entity_key = 'entries')
  ) then
    raise exception 'Unsupported auxiliary operations entity: %.%', p_row_id, p_entity_key;
  end if;
  if jsonb_typeof(p_upserts) <> 'array' or jsonb_typeof(p_deletes) <> 'array' then
    raise exception 'Auxiliary upserts/deletes must be arrays';
  end if;

  select payload, updated_at
    into v_payload, v_updated_at
    from public.operations_data
   where id = p_row_id
   for update;
  if not found then
    raise exception 'operations_data/% does not exist', p_row_id;
  end if;

  if p_expected_updated_at is null or v_updated_at <> p_expected_updated_at then
    return query select false, true, v_payload, v_updated_at;
    return;
  end if;

  v_array := case
    when jsonb_typeof(v_payload -> p_entity_key) = 'array' then v_payload -> p_entity_key
    else '[]'::jsonb
  end;
  for v_item in select value from jsonb_array_elements(p_upserts)
  loop
    v_id := v_item ->> 'id';
    if v_id is null or v_id = '' then
      raise exception 'Every %.% upsert requires an id', p_row_id, p_entity_key;
    end if;
    select coalesce(jsonb_agg(existing_item), '[]'::jsonb)
      into v_array
      from jsonb_array_elements(v_array) existing_item
     where existing_item ->> 'id' <> v_id;
    v_array := v_array || jsonb_build_array(v_item);
  end loop;

  select coalesce(jsonb_agg(existing_item), '[]'::jsonb)
    into v_array
    from jsonb_array_elements(v_array) existing_item
   where not (existing_item ->> 'id' in (
     select jsonb_array_elements_text(p_deletes)
   ));
  v_payload := jsonb_set(v_payload, array[p_entity_key], v_array, true);
  v_next_updated_at := clock_timestamp();

  update public.operations_data
     set payload = v_payload,
         updated_at = v_next_updated_at
   where id = p_row_id;

  return query select true, false, v_payload, v_next_updated_at;
end;
$$;

revoke all on function public.mutate_operations_aux_data(text, timestamptz, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_operations_aux_data(text, timestamptz, text, jsonb, jsonb)
  to service_role;
