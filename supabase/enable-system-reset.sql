-- Run once in the Supabase SQL Editor to enable Admin Settings -> Reset System Data.
-- The reset password is stored as a salted hash in private settings.

create extension if not exists pgcrypto;

create table if not exists app_private_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_private_settings enable row level security;

insert into app_private_settings (key, value)
values (
  'system_reset_password_hash',
  '{"salt":"98a211a38700a6209f5d4a64e7e73f7c","hash":"27c1e5492885091df7c929c48235bee1ec56ccc28c0e6dd98da3559c8b3601db"}'::jsonb
)
on conflict (key) do nothing;

delete from app_settings
where key = 'system_reset_password';

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
