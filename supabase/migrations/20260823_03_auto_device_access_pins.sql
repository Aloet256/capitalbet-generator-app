-- Replace the shared branch extra-session PIN with one auto-generated PIN per
-- extra computer request.

alter table devices add column if not exists access_kind text;
update devices set access_kind = 'primary' where access_kind is null;
alter table devices alter column access_kind set default 'primary';
alter table devices alter column access_kind set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'devices_access_kind_check'
      and conrelid = 'devices'::regclass
  ) then
    alter table devices
      add constraint devices_access_kind_check check (access_kind in ('primary', 'extra_session'));
  end if;
end $$;

create table if not exists device_access_pins (
  device_id uuid primary key references devices(id) on delete cascade,
  pin_salt text not null,
  pin_hash text not null,
  pin_ciphertext bytea not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

alter table device_access_pins enable row level security;

drop policy if exists p_devices_insert_self on devices;
drop function if exists fn_request_branch_device(uuid, text, text);
drop function if exists fn_verify_branch_access_pin(text);
drop function if exists fn_update_branch_access_pin(text, text);

delete from app_private_settings
where key = 'branch_extra_session_pin_hash';

create or replace function fn_request_branch_device(
  p_branch_id uuid,
  p_device_label text
)
returns table (device_status device_status, access_kind text) as $$
declare
  v_fingerprint text := fn_current_device_fingerprint();
  v_existing_device devices%rowtype;
  v_has_live_device boolean;
  v_next_status device_status := 'pending';
  v_access_kind text := 'primary';
  v_device_id uuid;
  v_secret_key text;
  v_pin text;
  v_pin_salt text;
  v_pin_bytes bytea;
  v_pin_number bigint;
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

    return query select v_existing_device.status, v_existing_device.access_kind;
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
    v_access_kind := 'extra_session';
  end if;

  insert into devices (device_fingerprint, branch_id, device_label, status, access_kind)
  values (
    v_fingerprint,
    p_branch_id,
    nullif(btrim(coalesce(p_device_label, '')), ''),
    v_next_status,
    v_access_kind
  )
  returning id into v_device_id;

  if v_access_kind = 'extra_session' then
    select value #>> '{}' into v_secret_key
    from app_private_settings
    where key = 'telegram_secret_key';

    if coalesce(v_secret_key, '') = '' then
      raise exception 'PIN encryption key is not configured.';
    end if;

    v_pin_bytes := gen_random_bytes(4);
    v_pin_number := (
      get_byte(v_pin_bytes, 0) * 16777216
      + get_byte(v_pin_bytes, 1) * 65536
      + get_byte(v_pin_bytes, 2) * 256
      + get_byte(v_pin_bytes, 3)
    ) % 900000 + 100000;
    v_pin := v_pin_number::text;
    v_pin_salt := encode(gen_random_bytes(16), 'hex');

    insert into device_access_pins (device_id, pin_salt, pin_hash, pin_ciphertext)
    values (
      v_device_id,
      v_pin_salt,
      encode(digest(v_pin || v_pin_salt, 'sha256'), 'hex'),
      pgp_sym_encrypt(v_pin, v_secret_key)
    );
  end if;

  return query select v_next_status, v_access_kind;
end;
$$ language plpgsql security definer set search_path = public, extensions;

grant execute on function fn_request_branch_device(uuid, text) to anon, authenticated;

create or replace function fn_submit_branch_access_pin(p_pin text)
returns void as $$
declare
  v_fingerprint text := fn_current_device_fingerprint();
  v_device_id uuid;
  v_pin_salt text;
  v_pin_hash text;
begin
  if coalesce(v_fingerprint, '') = '' then
    raise exception 'This browser could not be identified. Refresh and try again.';
  end if;

  select devices.id, device_access_pins.pin_salt, device_access_pins.pin_hash
    into v_device_id, v_pin_salt, v_pin_hash
  from devices
  join device_access_pins on device_access_pins.device_id = devices.id
  where devices.device_fingerprint = v_fingerprint
    and devices.status = 'pending'
    and devices.access_kind = 'extra_session'
    and device_access_pins.used_at is null
  limit 1;

  if v_device_id is null then
    raise exception 'No pending extra-session PIN request was found for this computer.';
  end if;

  if encode(digest(coalesce(p_pin, '') || v_pin_salt, 'sha256'), 'hex') <> v_pin_hash then
    raise exception 'Incorrect branch access PIN.';
  end if;

  update devices
  set status = 'approved',
      decided_at = now()
  where id = v_device_id;

  update device_access_pins
  set used_at = now()
  where device_id = v_device_id;
end;
$$ language plpgsql security definer set search_path = public, extensions;

grant execute on function fn_submit_branch_access_pin(text) to anon, authenticated;

create or replace function fn_get_admin_device_requests()
returns table (
  id uuid,
  device_fingerprint text,
  branch_id uuid,
  status device_status,
  access_kind text,
  device_label text,
  requested_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  last_seen_at timestamptz,
  branch_name text,
  branch_region text,
  branch_code text,
  access_pin text
) as $$
declare
  v_secret_key text;
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can view device requests.';
  end if;

  select value #>> '{}' into v_secret_key
  from app_private_settings
  where key = 'telegram_secret_key';

  return query
  select
    devices.id,
    devices.device_fingerprint,
    devices.branch_id,
    devices.status,
    devices.access_kind,
    devices.device_label,
    devices.requested_at,
    devices.decided_at,
    devices.decided_by,
    devices.last_seen_at,
    branches.name,
    branches.region,
    branches.code,
    case
      when devices.status = 'pending'
        and devices.access_kind = 'extra_session'
        and device_access_pins.used_at is null
        and coalesce(v_secret_key, '') <> ''
      then pgp_sym_decrypt(device_access_pins.pin_ciphertext, v_secret_key)
      else null
    end as access_pin
  from devices
  left join branches on branches.id = devices.branch_id
  left join device_access_pins on device_access_pins.device_id = devices.id
  order by devices.requested_at desc;
end;
$$ language plpgsql security definer set search_path = public, extensions;

grant execute on function fn_get_admin_device_requests() to authenticated;
