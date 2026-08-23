-- Run once in Supabase SQL Editor before using region-based Telegram routing.
-- Then apply supabase/migrations/20260811_06_private_telegram_secrets.sql.
-- Region bot tokens and chat IDs are edited in Admin Settings and stored
-- encrypted; do not put them in SQL or source files.

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
