-- Add an admin-only, password-confirmed reset for clearing operational data.
-- The frontend default is Wendy456, but admins can change this value in
-- app_settings from the Admin Settings page.

insert into app_settings (key, value)
values ('system_reset_password', '"Wendy456"')
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

  delete from power_sessions;
  delete from fuel_refills;
  delete from services;
  delete from repairs;
  delete from dstv_subscriptions;
  delete from yaka_purchases;
  delete from notifications;
  delete from audit_logs;
  delete from devices;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function fn_reset_system_data(text) to authenticated;
