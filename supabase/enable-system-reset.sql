-- Run this once in the Supabase SQL Editor to enable Admin Settings -> Reset System Data.
-- Default reset password: wendy456. Change it later from Admin Settings if needed.

insert into app_settings (key, value)
values ('system_reset_password', '"wendy456"')
on conflict (key) do nothing;

create or replace function fn_reset_system_data(p_password text)
returns void as $$
declare
  v_reset_password text;
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can reset system data.';
  end if;

  select value #>> '{}' into v_reset_password
  from app_settings
  where key = 'system_reset_password';

  if coalesce(v_reset_password, '') = '' or coalesce(p_password, '') <> v_reset_password then
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
