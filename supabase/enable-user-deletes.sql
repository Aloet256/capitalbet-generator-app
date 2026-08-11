-- Run this in the Supabase SQL Editor for the live project.
-- Branch users can delete entries only through fn_delete_branch_entry, after
-- entering the delete password. Direct table deletes stay admin-only.

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

drop policy if exists p_power_delete_admin on power_sessions;
create policy p_power_delete_admin on power_sessions for delete using (fn_is_admin());

drop policy if exists p_fuel_delete_admin on fuel_refills;
create policy p_fuel_delete_admin on fuel_refills for delete using (fn_is_admin());

drop policy if exists p_services_delete_admin on services;
create policy p_services_delete_admin on services for delete using (fn_is_admin());

drop policy if exists p_repairs_delete_admin on repairs;
create policy p_repairs_delete_admin on repairs for delete using (fn_is_admin());

drop policy if exists p_dstv_delete_admin on dstv_subscriptions;
create policy p_dstv_delete_admin on dstv_subscriptions for delete using (fn_is_admin());

drop policy if exists p_yaka_delete_admin on yaka_purchases;
create policy p_yaka_delete_admin on yaka_purchases for delete using (fn_is_admin());
