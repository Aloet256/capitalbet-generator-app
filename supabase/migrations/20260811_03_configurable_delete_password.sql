-- Make branch-entry deletion use an admin-configured password in app_settings.
-- Set app_settings.branch_delete_password from the admin settings page or SQL.
-- If the setting is missing or empty, branch-entry deletion is disabled.

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
