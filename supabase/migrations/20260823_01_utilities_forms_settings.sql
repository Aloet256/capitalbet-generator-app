-- Utilities and repair form cleanup.
-- - Store fixed DSTV/Yaka numbers once per branch.
-- - Keep DSTV package prices admin-configurable.
-- - Remove receipt/repair remarks fields from new operational history.

insert into app_settings (key, value)
values ('dstv_package_prices', '{"Access":49000,"Family":76000,"Compact":120000,"Compact Plus":185000,"Premium":320000}'::jsonb)
on conflict (key) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'repair_category'::regtype
      and enumlabel = 'TV'
  ) then
    alter type repair_category add value 'TV';
  end if;

  if not exists (
    select 1 from pg_enum
    where enumtypid = 'repair_category'::regtype
      and enumlabel = 'Electricity'
  ) then
    alter type repair_category add value 'Electricity';
  end if;

  if not exists (
    select 1 from pg_enum
    where enumtypid = 'repair_category'::regtype
      and enumlabel = 'Printer'
  ) then
    alter type repair_category add value 'Printer';
  end if;

  if not exists (
    select 1 from pg_enum
    where enumtypid = 'repair_category'::regtype
      and enumlabel = 'Computer'
  ) then
    alter type repair_category add value 'Computer';
  end if;
end $$;

create table if not exists branch_utility_settings (
  branch_id uuid primary key references branches(id) on delete cascade,
  dstv_smart_card_number text,
  yaka_meter_number text,
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);

alter table branch_utility_settings enable row level security;

insert into branch_utility_settings (branch_id, dstv_smart_card_number, yaka_meter_number)
select
  branches.id,
  dstv.smart_card_number,
  yaka.meter_number
from branches
left join lateral (
  select smart_card_number
  from dstv_subscriptions
  where dstv_subscriptions.branch_id = branches.id
  order by subscription_date desc, created_at desc
  limit 1
) dstv on true
left join lateral (
  select meter_number
  from yaka_purchases
  where yaka_purchases.branch_id = branches.id
  order by purchase_date desc, created_at desc
  limit 1
) yaka on true
where dstv.smart_card_number is not null
   or yaka.meter_number is not null
on conflict (branch_id) do update
set dstv_smart_card_number = coalesce(nullif(branch_utility_settings.dstv_smart_card_number, ''), excluded.dstv_smart_card_number),
    yaka_meter_number = coalesce(nullif(branch_utility_settings.yaka_meter_number, ''), excluded.yaka_meter_number),
    updated_at = now();

alter table repairs drop column if exists handled_by;
alter table repairs drop column if exists remarks;
alter table dstv_subscriptions drop column if exists receipt_number;
alter table yaka_purchases drop column if exists receipt_number;

create or replace function fn_touch_settings() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_branch_utility_settings on branch_utility_settings;
create trigger trg_touch_branch_utility_settings
before update on branch_utility_settings
for each row execute function fn_touch_settings();

drop policy if exists p_settings_service_defaults_select on app_settings;
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

drop policy if exists p_branch_utility_select on branch_utility_settings;
create policy p_branch_utility_select on branch_utility_settings for select
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id));

drop policy if exists p_branch_utility_insert on branch_utility_settings;
create policy p_branch_utility_insert on branch_utility_settings for insert
  with check (fn_is_admin() or fn_device_approved_for_branch(branch_id));

drop policy if exists p_branch_utility_update on branch_utility_settings;
create policy p_branch_utility_update on branch_utility_settings for update
  using (fn_is_admin() or fn_device_approved_for_branch(branch_id))
  with check (fn_is_admin() or fn_device_approved_for_branch(branch_id));
