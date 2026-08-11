-- Run once in Supabase SQL Editor before using region-based Telegram routing.
-- The actual region bot tokens and chat IDs are edited in Admin Settings.

update branches
set region = 'Unassigned Region'
where btrim(coalesce(region, '')) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'branches_region_required'
      and conrelid = 'branches'::regclass
  ) then
    alter table branches
      add constraint branches_region_required check (btrim(region) <> '');
  end if;
end $$;

insert into app_settings (key, value)
values ('telegram_region_config', '{}'::jsonb)
on conflict (key) do nothing;

-- Region routing is handled by Supabase Edge Functions. Disable the older
-- database-trigger Telegram path if it was installed, because it used one
-- global destination instead of branch-region routing.
drop trigger if exists tg_telegram_device_insert on devices;
drop trigger if exists tg_telegram_device_status on devices;
drop trigger if exists tg_telegram_power_insert on power_sessions;
drop trigger if exists tg_telegram_power_update on power_sessions;
drop trigger if exists tg_telegram_fuel on fuel_refills;
drop trigger if exists tg_telegram_service on services;
drop trigger if exists tg_telegram_repair on repairs;
drop trigger if exists tg_telegram_dstv on dstv_subscriptions;
drop trigger if exists tg_telegram_yaka on yaka_purchases;
