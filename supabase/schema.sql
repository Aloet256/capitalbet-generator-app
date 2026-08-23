-- =========================================================
-- CapitalBet Branch Utility & Generator Management
-- Supabase schema: tables, constraints, RLS, functions, triggers
-- =========================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------
create type device_status as enum ('pending', 'approved', 'revoked');
create type dstv_package as enum ('Access', 'Family', 'Compact', 'Compact Plus', 'Premium');
create type notification_type as enum (
  'service_due', 'dstv_renewal', 'yaka_low', 'yaka_reload_due', 'device_request',
  'power_outage_ongoing', 'fuel_low', 'system'
);
create type notification_channel as enum ('in_app', 'telegram', 'both');

-- ---------------------------------------------------------
-- BRANCHES
-- ---------------------------------------------------------
create table branches (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  region text not null check (btrim(region) <> ''),
  code text, -- legacy/reference value from the branch list; not necessarily unique
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_branches_region on branches(region);
create index idx_branches_code on branches(code);

-- ---------------------------------------------------------
-- DEVICES  (branch device lock + admin approval workflow)
-- ---------------------------------------------------------
create table devices (
  id uuid primary key default uuid_generate_v4(),
  device_fingerprint text not null unique, -- generated client-side, stored in localStorage
  branch_id uuid not null references branches(id) on delete cascade,
  status device_status not null default 'pending',
  device_label text, -- e.g. "Chrome on Windows - Front Desk"
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid, -- admin id
  last_seen_at timestamptz not null default now(),
  unique (device_fingerprint, branch_id)
);

create index idx_devices_branch on devices(branch_id);
create index idx_devices_status on devices(status);

-- Only one live assignment (pending or approved) per branch. A second
-- computer cannot even request a branch until an admin revokes the old
-- assignment. Revoked computers remain permanently tied to their original
-- branch because device_fingerprint itself is globally unique.
create unique index uq_one_live_device_per_branch
  on devices(branch_id) where (status in ('pending', 'approved'));

-- ---------------------------------------------------------
-- ADMINS
-- ---------------------------------------------------------
create table admins (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- SETTINGS (admin configurable: reminder intervals etc.)
-- ---------------------------------------------------------
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);

insert into app_settings (key, value) values
  ('service_reminder_days', '5'),
  ('dstv_reminder_days', '5'),
  ('yaka_reminder_days', '3'),
  ('fuel_price_per_litre', '6500'),
  ('dstv_package_prices', '{"Access":49000,"Family":76000,"Compact":120000,"Compact Plus":185000,"Premium":320000}'::jsonb),
  ('generator_service_technician_name', '"Mr Kawesi"'),
  ('generator_service_technician_phone', '"N/A"'),
  ('generator_service_company', '""'),
  ('generator_service_work_done', '"Servicing Generator"'),
  ('generator_service_remarks', '"Servicing Generator"');

create table app_private_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_private_settings (key, value) values
  (
    'system_reset_password_hash',
    '{"salt":"98a211a38700a6209f5d4a64e7e73f7c","hash":"27c1e5492885091df7c929c48235bee1ec56ccc28c0e6dd98da3559c8b3601db"}'::jsonb
  ),
  ('telegram_secret_key', to_jsonb(encode(gen_random_bytes(32), 'hex')));

create table telegram_region_secrets (
  region text primary key check (btrim(region) <> ''),
  bot_token_ciphertext bytea not null,
  chat_id_ciphertext bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);

create table branch_utility_settings (
  branch_id uuid primary key references branches(id) on delete cascade,
  dstv_smart_card_number text,
  yaka_meter_number text,
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);

-- ---------------------------------------------------------
-- POWER SESSIONS (outage tracking: power off -> power back)
-- ---------------------------------------------------------
create table power_sessions (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references branches(id) on delete cascade,
  session_date date not null default current_date,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer generated always as (
    case when ended_at is not null
      then greatest(0, round(extract(epoch from (ended_at - started_at)) / 60))::int
      else null end
  ) stored,
  is_ongoing boolean not null default true,
  notes text,
  created_by_device uuid references devices(id),
  created_at timestamptz not null default now()
);

create index idx_power_sessions_branch_date on power_sessions(branch_id, session_date);
create unique index uq_one_ongoing_session_per_branch
  on power_sessions(branch_id) where (is_ongoing = true);

-- ---------------------------------------------------------
-- FUEL REFILLS
-- ---------------------------------------------------------
create table fuel_refills (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references branches(id) on delete cascade,
  refill_date date not null default current_date,
  cost numeric(12,2) not null check (cost >= 0),
  litres numeric(8,2) not null check (litres > 0),
  authorized_by text not null,
  remarks text,
  created_by_device uuid references devices(id),
  created_at timestamptz not null default now()
);

create index idx_fuel_branch_date on fuel_refills(branch_id, refill_date);

-- ---------------------------------------------------------
-- SERVICING
-- ---------------------------------------------------------
create table services (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references branches(id) on delete cascade,
  service_date date not null default current_date,
  next_service_date date generated always as (((service_date + interval '25 days')::date)) stored,
  technician_name text not null,
  technician_phone text not null,
  company text,
  cost numeric(12,2) check (cost is null or cost >= 0),
  items_replaced text,
  repairs_done text,
  work_done text not null,
  remarks text,
  reminder_sent boolean not null default false,
  created_by_device uuid references devices(id),
  created_at timestamptz not null default now()
);

create index idx_services_branch_date on services(branch_id, service_date);
create index idx_services_next_due on services(next_service_date);

-- ---------------------------------------------------------
-- REPAIRS (categorized history, no reminders)
-- ---------------------------------------------------------
create type repair_category as enum (
  'Generator', 'TV', 'Electricity', 'Printer', 'Computer'
);

create table repairs (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references branches(id) on delete cascade,
  repair_date date not null default current_date,
  category repair_category not null,
  description text not null,
  cost numeric(12,2) check (cost >= 0),
  created_by_device uuid references devices(id),
  created_at timestamptz not null default now()
);

create index idx_repairs_branch_date on repairs(branch_id, repair_date);

-- ---------------------------------------------------------
-- DSTV SUBSCRIPTIONS
-- ---------------------------------------------------------
create table dstv_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references branches(id) on delete cascade,
  subscription_date date not null,
  renewal_date date generated always as (((subscription_date + interval '1 month')::date)) stored,
  smart_card_number text not null,
  package dstv_package not null,
  amount numeric(12,2) not null check (amount >= 0),
  remarks text,
  reminder_sent boolean not null default false,
  created_by_device uuid references devices(id),
  created_at timestamptz not null default now()
);

create index idx_dstv_branch_date on dstv_subscriptions(branch_id, subscription_date);

-- ---------------------------------------------------------
-- YAKA (electricity tokens)
-- ---------------------------------------------------------
create table yaka_purchases (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references branches(id) on delete cascade,
  purchase_date date not null default current_date,
  meter_number text not null,
  units numeric(10,2) not null check (units >= 0),
  amount numeric(12,2) not null check (amount >= 0),
  expected_reload_date date generated always as (((purchase_date + interval '1 month')::date)) stored,
  remarks text,
  reminder_sent boolean not null default false,
  created_by_device uuid references devices(id),
  created_at timestamptz not null default now()
);

create index idx_yaka_branch_date on yaka_purchases(branch_id, purchase_date);
create index idx_yaka_reload_due on yaka_purchases(expected_reload_date);

-- ---------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  type notification_type not null,
  channel notification_channel not null default 'in_app',
  title text not null,
  message text not null,
  is_read boolean not null default false,
  telegram_sent boolean not null default false,
  telegram_sent_at timestamptz,
  related_table text,
  related_id uuid,
  created_at timestamptz not null default now()
);

create index idx_notifications_branch on notifications(branch_id, created_at desc);
create index idx_notifications_unread on notifications(is_read) where is_read = false;

-- ---------------------------------------------------------
-- AUDIT LOGS
-- ---------------------------------------------------------
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_type text not null check (actor_type in ('branch_device', 'admin', 'system')),
  actor_id uuid,
  branch_id uuid references branches(id),
  action text not null,
  table_name text,
  record_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_branch on audit_logs(branch_id, created_at desc);

-- =========================================================
-- FUNCTIONS & TRIGGERS
-- =========================================================

-- Auto-generate notification + reminder when a service is inserted/updated
create or replace function fn_service_reminder() returns trigger as $$
begin
  insert into notifications (branch_id, type, channel, title, message, related_table, related_id)
  values (
    new.branch_id, 'service_due', 'both',
    'Next service due',
    'Next generator service is due on ' || to_char(new.next_service_date, 'DD Mon YYYY') || '.',
    'services', new.id
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_service_reminder
after insert on services
for each row execute function fn_service_reminder();

-- Auto notification for DSTV renewal
create or replace function fn_dstv_reminder() returns trigger as $$
begin
  insert into notifications (branch_id, type, channel, title, message, related_table, related_id)
  values (
    new.branch_id, 'dstv_renewal', 'both',
    'DSTV renewal scheduled',
    'DSTV (' || new.package || ') renews on ' || to_char(new.renewal_date, 'DD Mon YYYY') || '.',
    'dstv_subscriptions', new.id
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_dstv_reminder
after insert on dstv_subscriptions
for each row execute function fn_dstv_reminder();

-- Yaka is normally loaded to cover a full month. Record the expected reload
-- date immediately so the branch can see the schedule; Telegram is sent later
-- by the Edge Function when it enters the configured reminder window.
create or replace function fn_yaka_reload_schedule() returns trigger as $$
begin
  insert into notifications (branch_id, type, channel, title, message, related_table, related_id)
  values (
    new.branch_id, 'yaka_reload_due', 'in_app',
    'Next Yaka reload scheduled',
    'The next expected Yaka reload is ' || to_char(new.expected_reload_date, 'DD Mon YYYY') || '.',
    'yaka_purchases', new.id
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_yaka_reload_schedule
after insert on yaka_purchases
for each row execute function fn_yaka_reload_schedule();

-- Close power session -> stamp is_ongoing = false when ended_at set
create or replace function fn_power_session_close() returns trigger as $$
begin
  if new.ended_at is not null then
    new.is_ongoing := false;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_power_session_close
before update on power_sessions
for each row execute function fn_power_session_close();

-- updated_at helper for app_settings
create or replace function fn_touch_settings() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_touch_settings
before update on app_settings
for each row execute function fn_touch_settings();

create trigger trg_touch_branch_utility_settings
before update on branch_utility_settings
for each row execute function fn_touch_settings();

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
-- Design:
--  * Branch devices connect with the ANON key. They identify themselves by
--    passing device_fingerprint via the app; enforcement of "my branch only"
--    happens primarily in the app layer PLUS a header-based Postgres setting
--    (request.jwt.claims are not available for anon devices, so branch writes
--    are validated through the `device_fingerprint` + `status = approved`
--    check embedded in policies below).
--  * Admins authenticate via Supabase Auth and get full access.
--
-- NOTE: Because branch "login" has no Supabase Auth session, public reads are
-- limited to the branch picker and shared settings. Operational SELECT/INSERT/
-- UPDATE access requires an APPROVED device row matching the target branch and
-- the fingerprint supplied in the request
-- (checked via the `x-device-fingerprint` header, read using
-- current_setting('request.headers', true)). Supabase automatically exposes
-- request headers this way when using PostgREST.

create or replace function fn_current_device_fingerprint() returns text as $$
  select coalesce(
    (nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-device-fingerprint'),
    ''
  );
$$ language sql stable;

create or replace function fn_is_admin() returns boolean as $$
  select exists (
    select 1 from admins where auth_user_id = auth.uid()
  );
$$ language sql stable security definer;

create or replace function fn_device_approved_for_branch(p_branch uuid) returns boolean as $$
  select exists (
    select 1 from devices
    where branch_id = p_branch
      and status = 'approved'
      and device_fingerprint = fn_current_device_fingerprint()
  );
$$ language sql stable security definer;

-- Safe public branch-availability lookup. It reveals only whether a branch is
-- already reserved, never the device fingerprint or admin details.


-- Public branch picker endpoint. It deliberately excludes Telegram chat IDs,
-- timestamps and device details while still exposing availability.
create or replace function get_branch_selection_list()
returns table (branch_id uuid, name text, region text, code text, device_locked boolean) as $$
  select b.id, b.name, b.region, b.code, exists (
    select 1 from devices d
    where d.branch_id = b.id and d.status in ('pending', 'approved')
  )
  from branches b
  where b.active = true
  order by b.region, b.name;
$$ language sql stable security definer set search_path = public;

grant execute on function get_branch_selection_list() to anon, authenticated;

create or replace function fn_delete_branch_entry(p_table text, p_id uuid, p_password text)
returns void as $$
declare
  v_branch_id uuid;
  v_delete_password text;
begin
  select value #>> '{}' into v_delete_password
  from app_settings
  where key = 'branch_delete_password';

  if coalesce(v_delete_password, '') = '' or coalesce(p_password, '') <> v_delete_password then
    raise exception 'Incorrect password. Entry was not deleted.';
  end if;

  case p_table
    when 'power_sessions' then
      select branch_id into v_branch_id from power_sessions where id = p_id;
    when 'fuel_refills' then
      select branch_id into v_branch_id from fuel_refills where id = p_id;
    when 'services' then
      select branch_id into v_branch_id from services where id = p_id;
    when 'repairs' then
      select branch_id into v_branch_id from repairs where id = p_id;
    when 'dstv_subscriptions' then
      select branch_id into v_branch_id from dstv_subscriptions where id = p_id;
    when 'yaka_purchases' then
      select branch_id into v_branch_id from yaka_purchases where id = p_id;
    else
      raise exception 'This entry type cannot be deleted.';
  end case;

  if v_branch_id is null then
    raise exception 'Entry was not found.';
  end if;

  if not (fn_is_admin() or fn_device_approved_for_branch(v_branch_id)) then
    raise exception 'This device is not allowed to delete this branch entry.';
  end if;

  case p_table
    when 'power_sessions' then
      delete from power_sessions where id = p_id;
    when 'fuel_refills' then
      delete from fuel_refills where id = p_id;
    when 'services' then
      delete from services where id = p_id;
    when 'repairs' then
      delete from repairs where id = p_id;
    when 'dstv_subscriptions' then
      delete from dstv_subscriptions where id = p_id;
    when 'yaka_purchases' then
      delete from yaka_purchases where id = p_id;
  end case;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function fn_delete_branch_entry(text, uuid, text) to anon, authenticated;

create or replace function fn_verify_admin_action_password(p_password text)
returns boolean as $$
declare
  v_secret jsonb;
  v_salt text;
  v_hash text;
begin
  select value into v_secret
  from app_private_settings
  where key = 'system_reset_password_hash';

  v_salt := coalesce(v_secret ->> 'salt', '');
  v_hash := coalesce(v_secret ->> 'hash', '');

  if v_salt = '' or v_hash = '' then
    return false;
  end if;

  return encode(digest(coalesce(p_password, '') || v_salt, 'sha256'), 'hex') = v_hash;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function fn_verify_admin_action_password(text) from public, anon, authenticated;

create or replace function fn_reset_system_data(p_password text)
returns void as $$
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can reset system data.';
  end if;

  if not fn_verify_admin_action_password(p_password) then
    raise exception 'Incorrect reset password. System data was not reset.';
  end if;

  delete from power_sessions where true;
  delete from fuel_refills where true;
  delete from services where true;
  delete from repairs where true;
  delete from dstv_subscriptions where true;
  delete from yaka_purchases where true;
  delete from notifications where true;
  delete from audit_logs where true;
  delete from devices where true;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function fn_reset_system_data(text) to authenticated;

create or replace function fn_update_telegram_region_config(
  p_region text,
  p_bot_token text,
  p_chat_id text,
  p_password text
)
returns void as $$
declare
  v_region text := btrim(coalesce(p_region, ''));
  v_bot_token text := btrim(coalesce(p_bot_token, ''));
  v_chat_id text := btrim(coalesce(p_chat_id, ''));
  v_secret_key text;
  v_admin_id uuid;
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can update Telegram configuration.';
  end if;

  if not fn_verify_admin_action_password(p_password) then
    raise exception 'Incorrect reset password. Telegram configuration was not changed.';
  end if;

  if v_region = '' then
    raise exception 'Region is required.';
  end if;

  if v_bot_token = '' or v_chat_id = '' then
    raise exception 'Bot token and chat ID are required.';
  end if;

  select value #>> '{}' into v_secret_key
  from app_private_settings
  where key = 'telegram_secret_key';

  if coalesce(v_secret_key, '') = '' then
    raise exception 'Telegram encryption key is not configured.';
  end if;

  select id into v_admin_id
  from admins
  where auth_user_id = auth.uid()
  limit 1;

  insert into telegram_region_secrets (
    region,
    bot_token_ciphertext,
    chat_id_ciphertext,
    updated_by
  )
  values (
    v_region,
    pgp_sym_encrypt(v_bot_token, v_secret_key),
    pgp_sym_encrypt(v_chat_id, v_secret_key),
    v_admin_id
  )
  on conflict (region) do update
  set bot_token_ciphertext = excluded.bot_token_ciphertext,
      chat_id_ciphertext = excluded.chat_id_ciphertext,
      updated_at = now(),
      updated_by = excluded.updated_by;
end;
$$ language plpgsql security definer set search_path = public, extensions;

grant execute on function fn_update_telegram_region_config(text, text, text, text) to authenticated;

create or replace function fn_reset_telegram_region_config(p_region text, p_password text)
returns void as $$
declare
  v_region text := btrim(coalesce(p_region, ''));
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can reset Telegram configuration.';
  end if;

  if not fn_verify_admin_action_password(p_password) then
    raise exception 'Incorrect reset password. Telegram configuration was not reset.';
  end if;

  if v_region = '' then
    raise exception 'Region is required.';
  end if;

  delete from telegram_region_secrets where region = v_region;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function fn_reset_telegram_region_config(text, text) to authenticated;

create or replace function fn_get_telegram_region_status()
returns table (
  region text,
  bot_token_configured boolean,
  chat_id_configured boolean,
  updated_at timestamptz
) as $$
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can view Telegram configuration status.';
  end if;

  return query
  with active_regions as (
    select distinct btrim(branches.region) as region
    from branches
    where branches.active = true
      and btrim(branches.region) <> ''
  )
  select
    active_regions.region,
    telegram_region_secrets.region is not null
      and octet_length(telegram_region_secrets.bot_token_ciphertext) > 0,
    telegram_region_secrets.region is not null
      and octet_length(telegram_region_secrets.chat_id_ciphertext) > 0,
    telegram_region_secrets.updated_at
  from active_regions
  left join telegram_region_secrets
    on telegram_region_secrets.region = active_regions.region
  order by active_regions.region;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function fn_get_telegram_region_status() to authenticated;

create or replace function fn_get_telegram_region_destination(p_region text)
returns table (bot_token text, chat_id text) as $$
declare
  v_secret_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the service role can read Telegram destinations.';
  end if;

  select value #>> '{}' into v_secret_key
  from app_private_settings
  where key = 'telegram_secret_key';

  if coalesce(v_secret_key, '') = '' then
    return;
  end if;

  return query
  select
    pgp_sym_decrypt(telegram_region_secrets.bot_token_ciphertext, v_secret_key) as bot_token,
    pgp_sym_decrypt(telegram_region_secrets.chat_id_ciphertext, v_secret_key) as chat_id
  from telegram_region_secrets
  where telegram_region_secrets.region = btrim(coalesce(p_region, ''));
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function fn_get_telegram_region_destination(text) from public, anon, authenticated;
grant execute on function fn_get_telegram_region_destination(text) to service_role;

-- A computer's branch_id is immutable after the device row is created. An
-- admin can revoke access to free the branch for a replacement computer, but
-- cannot move the old computer to a different branch.
create or replace function fn_prevent_device_reassignment() returns trigger as $$
begin
  if new.branch_id is distinct from old.branch_id then
    raise exception 'A device cannot be reassigned to a different branch';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_prevent_device_reassignment
before update on devices
for each row execute function fn_prevent_device_reassignment();

-- Stamp created_by_device automatically for branch-originated records.
create or replace function fn_stamp_created_by_device() returns trigger as $$
declare
  v_device_id uuid;
begin
  if new.created_by_device is null and not fn_is_admin() then
    select id into v_device_id
    from devices
    where branch_id = new.branch_id
      and status = 'approved'
      and device_fingerprint = fn_current_device_fingerprint()
    limit 1;
    new.created_by_device := v_device_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_power_stamp_device before insert on power_sessions for each row execute function fn_stamp_created_by_device();
create trigger trg_fuel_stamp_device before insert on fuel_refills for each row execute function fn_stamp_created_by_device();
create trigger trg_service_stamp_device before insert on services for each row execute function fn_stamp_created_by_device();
create trigger trg_repair_stamp_device before insert on repairs for each row execute function fn_stamp_created_by_device();
create trigger trg_dstv_stamp_device before insert on dstv_subscriptions for each row execute function fn_stamp_created_by_device();
create trigger trg_yaka_stamp_device before insert on yaka_purchases for each row execute function fn_stamp_created_by_device();

-- Central audit trail for all operational changes. Branch users cannot edit or
-- forge this table directly; trigger inserts run with definer privileges.
create or replace function fn_audit_operational_change() returns trigger as $$
declare
  v_branch_id uuid;
  v_record_id uuid;
  v_actor_type text;
  v_actor_id uuid;
  v_details jsonb;
begin
  if tg_op = 'DELETE' then
    v_branch_id := old.branch_id;
    v_record_id := old.id;
    v_details := jsonb_build_object('operation', tg_op, 'row', to_jsonb(old));
  else
    v_branch_id := new.branch_id;
    v_record_id := new.id;
    v_details := jsonb_build_object('operation', tg_op, 'row', to_jsonb(new));
  end if;

  if fn_is_admin() then
    v_actor_type := 'admin';
    select id into v_actor_id from admins where auth_user_id = auth.uid() limit 1;
  else
    v_actor_type := 'branch_device';
    select id into v_actor_id
    from devices
    where branch_id = v_branch_id
      and device_fingerprint = fn_current_device_fingerprint()
    limit 1;
  end if;

  insert into audit_logs (actor_type, actor_id, branch_id, action, table_name, record_id, details)
  values (v_actor_type, v_actor_id, v_branch_id, lower(tg_op), tg_table_name, v_record_id, v_details);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_power_audit after insert or update or delete on power_sessions for each row execute function fn_audit_operational_change();
create trigger trg_fuel_audit after insert or update or delete on fuel_refills for each row execute function fn_audit_operational_change();
create trigger trg_service_audit after insert or update or delete on services for each row execute function fn_audit_operational_change();
create trigger trg_repair_audit after insert or update or delete on repairs for each row execute function fn_audit_operational_change();
create trigger trg_dstv_audit after insert or update or delete on dstv_subscriptions for each row execute function fn_audit_operational_change();
create trigger trg_yaka_audit after insert or update or delete on yaka_purchases for each row execute function fn_audit_operational_change();

alter table branches enable row level security;
alter table devices enable row level security;
alter table admins enable row level security;
alter table app_settings enable row level security;
alter table app_private_settings enable row level security;
alter table telegram_region_secrets enable row level security;
alter table branch_utility_settings enable row level security;
alter table power_sessions enable row level security;
alter table fuel_refills enable row level security;
alter table services enable row level security;
alter table repairs enable row level security;
alter table dstv_subscriptions enable row level security;
alter table yaka_purchases enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

-- BRANCHES: admins can read all branch metadata. A branch computer can read
-- only its own assigned branch; the unauthenticated picker uses the safe RPC.
create policy p_branches_select on branches for select
  using (
    fn_is_admin() or exists (
      select 1 from devices
      where devices.branch_id = branches.id
        and devices.device_fingerprint = fn_current_device_fingerprint()
    )
  );
create policy p_branches_admin_write on branches for all using (fn_is_admin()) with check (fn_is_admin());

-- DEVICES: anyone can INSERT a pending request for themselves.
-- SELECT limited to admin or the row matching own fingerprint (so a device can
-- poll its own approval status).
create policy p_devices_insert_self on devices for insert
  with check (
    status = 'pending'
    and device_fingerprint = fn_current_device_fingerprint()
  );

create policy p_devices_select_self_or_admin on devices for select
  using (fn_is_admin() or device_fingerprint = fn_current_device_fingerprint());

create policy p_devices_admin_update on devices for update
  using (fn_is_admin()) with check (fn_is_admin());

create policy p_devices_admin_delete on devices for delete
  using (fn_is_admin());

-- ADMINS: only visible/manageable by other admins
create policy p_admins_select on admins for select using (fn_is_admin());
create policy p_admins_update_self on admins for update
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- APP SETTINGS are admin-only in the frontend. Private reset/Telegram secrets
-- live outside this table and are reachable only through SECURITY DEFINER RPCs.
create policy p_settings_select on app_settings for select
  using (
    fn_is_admin()
    and key not in ('system_reset_password', 'telegram_default_chat_id', 'telegram_region_config')
  );
create policy p_settings_service_defaults_select on app_settings for select
  using (
    key in (
      'generator_service_technician_name',
      'generator_service_technician_phone',
      'generator_service_company',
      'generator_service_work_done',
      'generator_service_remarks',
      'dstv_package_prices'
    )
    and exists (
      select 1 from devices
      where devices.status = 'approved'
        and devices.device_fingerprint = fn_current_device_fingerprint()
    )
  );
create policy p_settings_admin_write on app_settings for all
  using (
    fn_is_admin()
    and key not in ('system_reset_password', 'telegram_default_chat_id', 'telegram_region_config')
  )
  with check (
    fn_is_admin()
    and key not in ('system_reset_password', 'telegram_default_chat_id', 'telegram_region_config')
  );

create policy p_branch_utility_select on branch_utility_settings for select
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));

create policy p_branch_utility_insert on branch_utility_settings for insert
  with check (fn_is_admin() or fn_device_approved_for_branch(branch_id));

create policy p_branch_utility_update on branch_utility_settings for update
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id))
  with check (fn_is_admin() or fn_device_approved_for_branch(branch_id));

-- Generic pattern applied to all operational tables:
--   SELECT: admin OR approved device of that branch (branch dashboards only
--           need their own branch's data; admin needs all)
--   INSERT/UPDATE: admin OR approved device of that branch
create policy p_power_select on power_sessions for select
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_power_write on power_sessions for insert
  with check (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_power_update on power_sessions for update
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_power_delete_admin on power_sessions for delete using (fn_is_admin());

create policy p_fuel_select on fuel_refills for select
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_fuel_write on fuel_refills for insert
  with check (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_fuel_delete_admin on fuel_refills for delete using (fn_is_admin());

create policy p_services_select on services for select
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_services_write on services for insert
  with check (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_services_update on services for update
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_services_delete_admin on services for delete using (fn_is_admin());

create policy p_repairs_select on repairs for select
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_repairs_write on repairs for insert
  with check (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_repairs_delete_admin on repairs for delete using (fn_is_admin());

create policy p_dstv_select on dstv_subscriptions for select
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_dstv_write on dstv_subscriptions for insert
  with check (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_dstv_update on dstv_subscriptions for update
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_dstv_delete_admin on dstv_subscriptions for delete using (fn_is_admin());

create policy p_yaka_select on yaka_purchases for select
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_yaka_write on yaka_purchases for insert
  with check (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_yaka_update on yaka_purchases for update
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_yaka_delete_admin on yaka_purchases for delete using (fn_is_admin());

create policy p_notifications_select on notifications for select
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_notifications_update on notifications for update
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));
create policy p_notifications_insert_admin on notifications for insert
  with check (fn_is_admin()); -- triggers use SECURITY DEFINER; Edge Function uses service role

create policy p_audit_select on audit_logs for select using (fn_is_admin());

-- Enable live UI updates for admin and branch dashboards.
do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'branches',
    'devices',
    'power_sessions',
    'fuel_refills',
    'services',
    'repairs',
    'dstv_subscriptions',
    'yaka_purchases',
    'notifications',
    'audit_logs'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach table_name in array realtime_tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
