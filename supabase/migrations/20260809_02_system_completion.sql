-- CapitalBet system completion migration
-- Run this ONCE if the original schema.sql was already applied to your project.
-- Fresh projects should run the updated supabase/schema.sql instead.




-- The source branch list contains repeated numeric reference codes, so code must not be unique.
alter table branches drop constraint if exists branches_code_key;
create index if not exists idx_branches_code on branches(code);

-- Keep only one live assignment before adding the stronger unique index.
with ranked as (
  select id,
         row_number() over (
           partition by branch_id
           order by (status = 'approved') desc, requested_at desc
         ) as rn
  from devices
  where status in ('pending', 'approved')
)
update devices
set status = 'revoked', decided_at = coalesce(decided_at, now())
where id in (select id from ranked where rn > 1);

drop index if exists uq_one_approved_device_per_branch;
create unique index if not exists uq_one_live_device_per_branch
  on devices(branch_id) where (status in ('pending', 'approved'));

update app_settings set value = '5'::jsonb where key = 'service_reminder_days';
delete from app_settings where key = 'yaka_low_units_threshold';
insert into app_settings (key, value) values ('yaka_reminder_days', '3'::jsonb)
on conflict (key) do nothing;

alter table yaka_purchases
  add column if not exists expected_reload_date date
  generated always as (((purchase_date + interval '1 month')::date)) stored;
create index if not exists idx_yaka_reload_due on yaka_purchases(expected_reload_date);

create or replace function fn_current_device_fingerprint() returns text as $$
  select coalesce(
    (nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-device-fingerprint'),
    ''
  );
$$ language sql stable;




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

create or replace function fn_prevent_device_reassignment() returns trigger as $$
begin
  if new.branch_id is distinct from old.branch_id then
    raise exception 'A device cannot be reassigned to a different branch';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_device_reassignment on devices;
create trigger trg_prevent_device_reassignment
before update on devices
for each row execute function fn_prevent_device_reassignment();

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

drop trigger if exists trg_yaka_reload_schedule on yaka_purchases;
create trigger trg_yaka_reload_schedule
after insert on yaka_purchases
for each row execute function fn_yaka_reload_schedule();

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

drop trigger if exists trg_power_stamp_device on power_sessions;
drop trigger if exists trg_fuel_stamp_device on fuel_refills;
drop trigger if exists trg_service_stamp_device on services;
drop trigger if exists trg_repair_stamp_device on repairs;
drop trigger if exists trg_dstv_stamp_device on dstv_subscriptions;
drop trigger if exists trg_yaka_stamp_device on yaka_purchases;
create trigger trg_power_stamp_device before insert on power_sessions for each row execute function fn_stamp_created_by_device();
create trigger trg_fuel_stamp_device before insert on fuel_refills for each row execute function fn_stamp_created_by_device();
create trigger trg_service_stamp_device before insert on services for each row execute function fn_stamp_created_by_device();
create trigger trg_repair_stamp_device before insert on repairs for each row execute function fn_stamp_created_by_device();
create trigger trg_dstv_stamp_device before insert on dstv_subscriptions for each row execute function fn_stamp_created_by_device();
create trigger trg_yaka_stamp_device before insert on yaka_purchases for each row execute function fn_stamp_created_by_device();

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

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_power_audit on power_sessions;
drop trigger if exists trg_fuel_audit on fuel_refills;
drop trigger if exists trg_service_audit on services;
drop trigger if exists trg_repair_audit on repairs;
drop trigger if exists trg_dstv_audit on dstv_subscriptions;
drop trigger if exists trg_yaka_audit on yaka_purchases;
create trigger trg_power_audit after insert or update or delete on power_sessions for each row execute function fn_audit_operational_change();
create trigger trg_fuel_audit after insert or update or delete on fuel_refills for each row execute function fn_audit_operational_change();
create trigger trg_service_audit after insert or update or delete on services for each row execute function fn_audit_operational_change();
create trigger trg_repair_audit after insert or update or delete on repairs for each row execute function fn_audit_operational_change();
create trigger trg_dstv_audit after insert or update or delete on dstv_subscriptions for each row execute function fn_audit_operational_change();
create trigger trg_yaka_audit after insert or update or delete on yaka_purchases for each row execute function fn_audit_operational_change();

-- Strengthen RLS: anon devices may only create their own fingerprint row.
drop policy if exists p_devices_insert_self on devices;
create policy p_devices_insert_self on devices for insert
  with check (
    status = 'pending'
    and device_fingerprint = fn_current_device_fingerprint()
  );

-- Notifications and audit rows are created by SECURITY DEFINER triggers or the
-- service-role Edge Function; anonymous callers must not be able to forge them.
drop policy if exists p_notifications_insert on notifications;
drop policy if exists p_notifications_insert_admin on notifications;
create policy p_notifications_insert_admin on notifications for insert
  with check (fn_is_admin());
drop policy if exists p_audit_insert on audit_logs;

-- Admin-only delete rights for corrections. Branch devices remain append/update
-- only according to the existing operational policies.
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

-- Tighten branch/settings reads now that the picker uses a safe RPC.
drop policy if exists p_branches_select on branches;
create policy p_branches_select on branches for select
  using (
    fn_is_admin() or exists (
      select 1 from devices
      where devices.branch_id = branches.id
        and devices.device_fingerprint = fn_current_device_fingerprint()
    )
  );

drop policy if exists p_settings_select on app_settings;
create policy p_settings_select on app_settings for select using (fn_is_admin());

