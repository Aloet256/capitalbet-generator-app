-- CapitalBet live Telegram messages.
-- Run this once in Supabase SQL Editor.
-- Replace PASTE_BOT_TOKEN_HERE with your Telegram bot token before running.

create extension if not exists pg_net;

insert into app_settings (key, value)
values ('telegram_default_chat_id', '"-1003743501704"'::jsonb)
on conflict (key) do update set value = excluded.value;

create or replace function app_send_telegram(p_text text)
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_safe_text text;
  v_lines text[];
  v_title text;
  v_body text := '';
  v_formatted text;
begin
  v_safe_text := replace(replace(replace(coalesce(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  v_lines := regexp_split_to_array(v_safe_text, E'\n');
  v_title := upper(coalesce(v_lines[1], 'CapitalBet Entry'));

  if coalesce(array_length(v_lines, 1), 0) > 1 then
    v_body := array_to_string(v_lines[2:array_length(v_lines, 1)], E'\n');
  end if;

  v_formatted :=
    '<b>' || to_char(now() at time zone 'Africa/Kampala', 'DD Mon YYYY') || '</b>' ||
    E'\n\n' ||
    '<b>' || v_title || '</b>' ||
    case when nullif(v_body, '') is null then '' else E'\n\n' || v_body end;

  perform net.http_post(
    url := 'https://api.telegram.org/bot8878810134:AAHIL1jmRsJV4_fuIJm_CSj89VJDye7y41Q/sendMessage',
    body := jsonb_build_object(
      'chat_id', '-1003743501704',
      'text', v_formatted,
      'parse_mode', 'HTML',
      'disable_web_page_preview', true
    ),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

create or replace function app_branch_label(p_branch_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select name || ' (' || region || ')' from branches where id = p_branch_id),
    'Unknown branch'
  );
$$;

create or replace function trg_telegram_device_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app_send_telegram(
    '🖥️ Device Approval Request' || E'\n' ||
    '🏢 Branch: ' || app_branch_label(new.branch_id) || E'\n' ||
    '📟 Device: ' || coalesce(new.device_label, '-') || E'\n' ||
    '⏰ Requested: ' || to_char(new.requested_at at time zone 'Africa/Kampala', 'YYYY-MM-DD HH24:MI')
  );
  return new;
end;
$$;

create or replace function trg_telegram_device_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_title := case new.status
    when 'approved' then '✅ Device Approved'
    when 'revoked' then '🚫 Device Revoked'
    else '♻️ Device Status Changed'
  end;

  perform app_send_telegram(
    v_title || E'\n' ||
    '🏢 Branch: ' || app_branch_label(new.branch_id) || E'\n' ||
    '📟 Device: ' || coalesce(new.device_label, '-')
  );
  return new;
end;
$$;

create or replace function trg_telegram_power_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app_send_telegram(
    '🔌 Power Outage Started' || E'\n' ||
    '🏢 Branch: ' || app_branch_label(new.branch_id) || E'\n' ||
    '⏰ Started: ' || to_char(new.started_at at time zone 'Africa/Kampala', 'YYYY-MM-DD HH24:MI') || E'\n' ||
    '📝 Notes: ' || coalesce(new.notes, '-')
  );
  return new;
end;
$$;

create or replace function trg_telegram_power_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.ended_at is null and new.ended_at is not null then
    perform app_send_telegram(
      '💡 Power Restored' || E'\n' ||
      '🏢 Branch: ' || app_branch_label(new.branch_id) || E'\n' ||
      '⏰ Started: ' || to_char(new.started_at at time zone 'Africa/Kampala', 'YYYY-MM-DD HH24:MI') || E'\n' ||
      '✅ Restored: ' || to_char(new.ended_at at time zone 'Africa/Kampala', 'YYYY-MM-DD HH24:MI') || E'\n' ||
      '⏱️ Generator runtime: ' || coalesce(new.duration_minutes::text, '-') || ' min'
    );
  end if;
  return new;
end;
$$;

create or replace function trg_telegram_fuel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app_send_telegram(
    '⛽ Fuel Refill Entered' || E'\n' ||
    '🏢 Branch: ' || app_branch_label(new.branch_id) || E'\n' ||
    '📅 Date: ' || new.refill_date || E'\n' ||
    '🛢️ Litres: ' || new.litres || E'\n' ||
    '💰 Cost: UGX ' || new.cost || E'\n' ||
    '👤 Authorized by: ' || new.authorized_by || E'\n' ||
    '📝 Remarks: ' || coalesce(new.remarks, '-')
  );
  return new;
end;
$$;

create or replace function trg_telegram_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app_send_telegram(
    '🔧 Generator Service Entered' || E'\n' ||
    '🏢 Branch: ' || app_branch_label(new.branch_id) || E'\n' ||
    '📅 Service date: ' || new.service_date || E'\n' ||
    '🗓️ Next service: ' || new.next_service_date || E'\n' ||
    '👷 Technician: ' || new.technician_name || E'\n' ||
    '📞 Phone: ' || new.technician_phone || E'\n' ||
    '🏢 Company: ' || coalesce(new.company, '-') || E'\n' ||
    '🛠️ Items/repaired done: ' || coalesce(nullif(concat_ws(' / ', nullif(new.items_replaced, ''), nullif(new.repairs_done, '')), ''), '-') || E'\n' ||
    '💰 Cost: UGX ' || coalesce(new.cost::text, '-') || E'\n' ||
    '🧾 Work done: ' || new.work_done || E'\n' ||
    '📝 Remarks: ' || coalesce(new.remarks, '-')
  );
  return new;
end;
$$;

create or replace function trg_telegram_repair()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app_send_telegram(
    '🛠️ Repair Record Entered' || E'\n' ||
    '🏢 Branch: ' || app_branch_label(new.branch_id) || E'\n' ||
    '📅 Date: ' || new.repair_date || E'\n' ||
    '🏷️ Category: ' || new.category || E'\n' ||
    '🧾 Description: ' || new.description || E'\n' ||
    '💰 Cost: UGX ' || coalesce(new.cost::text, '-') || E'\n' ||
    '👤 Handled by: ' || coalesce(new.handled_by, '-') || E'\n' ||
    '📝 Remarks: ' || coalesce(new.remarks, '-')
  );
  return new;
end;
$$;

create or replace function trg_telegram_dstv()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app_send_telegram(
    '📺 DSTV Subscription Entered' || E'\n' ||
    '🏢 Branch: ' || app_branch_label(new.branch_id) || E'\n' ||
    '📅 Date: ' || new.subscription_date || E'\n' ||
    '🗓️ Renewal: ' || new.renewal_date || E'\n' ||
    '📦 Package: ' || new.package || E'\n' ||
    '💳 Smart card: ' || new.smart_card_number || E'\n' ||
    '💰 Amount: UGX ' || new.amount || E'\n' ||
    '🧾 Receipt: ' || coalesce(new.receipt_number, '-') || E'\n' ||
    '📝 Remarks: ' || coalesce(new.remarks, '-')
  );
  return new;
end;
$$;

create or replace function trg_telegram_yaka()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app_send_telegram(
    '⚡ Yaka Purchase Entered' || E'\n' ||
    '🏢 Branch: ' || app_branch_label(new.branch_id) || E'\n' ||
    '📅 Date: ' || new.purchase_date || E'\n' ||
    '🗓️ Expected reload: ' || new.expected_reload_date || E'\n' ||
    '🔢 Meter: ' || new.meter_number || E'\n' ||
    '⚡ Units: ' || new.units || E'\n' ||
    '💰 Amount: UGX ' || new.amount || E'\n' ||
    '🧾 Receipt: ' || coalesce(new.receipt_number, '-') || E'\n' ||
    '📝 Remarks: ' || coalesce(new.remarks, '-')
  );
  return new;
end;
$$;

drop trigger if exists tg_telegram_device_insert on devices;
create trigger tg_telegram_device_insert
after insert on devices
for each row execute function trg_telegram_device_insert();

drop trigger if exists tg_telegram_device_status on devices;
create trigger tg_telegram_device_status
after update of status on devices
for each row execute function trg_telegram_device_status();

drop trigger if exists tg_telegram_power_insert on power_sessions;
create trigger tg_telegram_power_insert
after insert on power_sessions
for each row execute function trg_telegram_power_insert();

drop trigger if exists tg_telegram_power_update on power_sessions;
create trigger tg_telegram_power_update
after update of ended_at on power_sessions
for each row execute function trg_telegram_power_update();

drop trigger if exists tg_telegram_fuel on fuel_refills;
create trigger tg_telegram_fuel
after insert on fuel_refills
for each row execute function trg_telegram_fuel();

drop trigger if exists tg_telegram_service on services;
create trigger tg_telegram_service
after insert on services
for each row execute function trg_telegram_service();

drop trigger if exists tg_telegram_repair on repairs;
create trigger tg_telegram_repair
after insert on repairs
for each row execute function trg_telegram_repair();

drop trigger if exists tg_telegram_dstv on dstv_subscriptions;
create trigger tg_telegram_dstv
after insert on dstv_subscriptions
for each row execute function trg_telegram_dstv();

drop trigger if exists tg_telegram_yaka on yaka_purchases;
create trigger tg_telegram_yaka
after insert on yaka_purchases
for each row execute function trg_telegram_yaka();

select app_send_telegram('✅ CapitalBet Telegram setup complete. Live messages are now enabled.');
