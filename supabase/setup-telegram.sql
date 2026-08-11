-- Sets the default Telegram group/channel used by reminder and live-entry messages.
-- Keep the bot token in Supabase Edge Function secrets, not in SQL or frontend code.

insert into app_settings (key, value)
values ('telegram_default_chat_id', '"-1003743501704"'::jsonb)
on conflict (key) do update set value = excluded.value;
