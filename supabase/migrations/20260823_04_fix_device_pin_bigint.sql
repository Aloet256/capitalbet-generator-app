-- Fix random PIN generation for extra branch sessions. Postgres can evaluate
-- integer multiplication before assignment, so cast random bytes to bigint
-- before combining them into a 32-bit number.

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
      get_byte(v_pin_bytes, 0)::bigint * 16777216
      + get_byte(v_pin_bytes, 1)::bigint * 65536
      + get_byte(v_pin_bytes, 2)::bigint * 256
      + get_byte(v_pin_bytes, 3)::bigint
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
