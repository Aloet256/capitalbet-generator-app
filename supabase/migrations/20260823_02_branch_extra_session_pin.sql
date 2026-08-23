-- Allow multiple approved computers per branch, with an admin-managed PIN for
-- extra branch sessions.

drop index if exists uq_one_live_device_per_branch;

create or replace function fn_verify_branch_access_pin(p_pin text)
returns boolean as $$
declare
  v_secret jsonb;
  v_salt text;
  v_hash text;
begin
  select value into v_secret
  from app_private_settings
  where key = 'branch_extra_session_pin_hash';

  v_salt := coalesce(v_secret ->> 'salt', '');
  v_hash := coalesce(v_secret ->> 'hash', '');

  if v_salt = '' or v_hash = '' then
    return false;
  end if;

  return encode(digest(coalesce(p_pin, '') || v_salt, 'sha256'), 'hex') = v_hash;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function fn_verify_branch_access_pin(text) from public, anon, authenticated;

create or replace function fn_request_branch_device(
  p_branch_id uuid,
  p_device_label text,
  p_access_pin text default ''
)
returns table (device_status device_status) as $$
declare
  v_fingerprint text := fn_current_device_fingerprint();
  v_existing_device devices%rowtype;
  v_has_live_device boolean;
  v_next_status device_status := 'pending';
begin
  if coalesce(v_fingerprint, '') = '' then
    raise exception 'This browser could not be identified. Refresh and try again.';
  end if;

  select * into v_existing_device
  from devices
  where device_fingerprint = v_fingerprint
  limit 1;

  if found then
    if v_existing_device.branch_id <> p_branch_id then
      raise exception 'This computer is already assigned to another branch. Contact an administrator.';
    end if;

    return query select v_existing_device.status;
    return;
  end if;

  if not exists (select 1 from branches where id = p_branch_id and active = true) then
    raise exception 'This branch is not available.';
  end if;

  select exists (
    select 1
    from devices
    where branch_id = p_branch_id
      and status in ('pending', 'approved')
  ) into v_has_live_device;

  if v_has_live_device then
    if not fn_verify_branch_access_pin(p_access_pin) then
      raise exception 'Incorrect branch access PIN. Ask an admin for the current PIN.';
    end if;
    v_next_status := 'approved';
  end if;

  insert into devices (device_fingerprint, branch_id, device_label, status, decided_at)
  values (
    v_fingerprint,
    p_branch_id,
    nullif(btrim(coalesce(p_device_label, '')), ''),
    v_next_status,
    case when v_next_status = 'approved' then now() else null end
  );

  return query select v_next_status;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function fn_request_branch_device(uuid, text, text) to anon, authenticated;

create or replace function fn_update_branch_access_pin(p_pin text, p_password text)
returns void as $$
declare
  v_pin text := btrim(coalesce(p_pin, ''));
  v_salt text := encode(gen_random_bytes(16), 'hex');
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can update the branch access PIN.';
  end if;

  if not fn_verify_admin_action_password(p_password) then
    raise exception 'Incorrect reset password. Branch access PIN was not changed.';
  end if;

  if length(v_pin) < 4 then
    raise exception 'Branch access PIN must be at least 4 characters.';
  end if;

  insert into app_private_settings (key, value)
  values (
    'branch_extra_session_pin_hash',
    jsonb_build_object('salt', v_salt, 'hash', encode(digest(v_pin || v_salt, 'sha256'), 'hex'))
  )
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
end;
$$ language plpgsql security definer set search_path = public, extensions;

grant execute on function fn_update_branch_access_pin(text, text) to authenticated;
