-- Keep Telegram destinations and the admin reset password out of public/app settings.
-- Telegram token/chat ID values are encrypted with pgcrypto and exposed only
-- through SECURITY DEFINER functions with narrow return values.

create extension if not exists pgcrypto;

create table if not exists app_private_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_private_settings enable row level security;

do $$
declare
  v_password text;
  v_salt text := encode(gen_random_bytes(16), 'hex');
  v_default_hash jsonb := '{"salt":"98a211a38700a6209f5d4a64e7e73f7c","hash":"27c1e5492885091df7c929c48235bee1ec56ccc28c0e6dd98da3559c8b3601db"}'::jsonb;
begin
  if not exists (select 1 from app_private_settings where key = 'system_reset_password_hash') then
    select value #>> '{}' into v_password
    from app_settings
    where key = 'system_reset_password';

    insert into app_private_settings (key, value)
    values (
      'system_reset_password_hash',
      case
        when coalesce(v_password, '') <> ''
          then jsonb_build_object('salt', v_salt, 'hash', encode(digest(v_password || v_salt, 'sha256'), 'hex'))
        else v_default_hash
      end
    );
  end if;
end $$;

insert into app_private_settings (key, value)
select 'telegram_secret_key', to_jsonb(encode(gen_random_bytes(32), 'hex'))
where not exists (select 1 from app_private_settings where key = 'telegram_secret_key');

create table if not exists telegram_region_secrets (
  region text primary key check (btrim(region) <> ''),
  bot_token_ciphertext bytea not null,
  chat_id_ciphertext bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references admins(id)
);

alter table telegram_region_secrets enable row level security;

do $$
declare
  v_secret_key text;
  v_config jsonb;
  v_region text;
  v_entry jsonb;
  v_bot_token text;
  v_chat_id text;
begin
  select value #>> '{}' into v_secret_key
  from app_private_settings
  where key = 'telegram_secret_key';

  select value into v_config
  from app_settings
  where key = 'telegram_region_config';

  if coalesce(v_secret_key, '') <> '' and jsonb_typeof(v_config) = 'object' then
    for v_region, v_entry in select key, value from jsonb_each(v_config)
    loop
      v_bot_token := btrim(coalesce(v_entry ->> 'bot_token', ''));
      v_chat_id := btrim(coalesce(v_entry ->> 'chat_id', ''));

      if btrim(v_region) <> '' and v_bot_token <> '' and v_chat_id <> '' then
        insert into telegram_region_secrets (region, bot_token_ciphertext, chat_id_ciphertext)
        values (
          btrim(v_region),
          pgp_sym_encrypt(v_bot_token, v_secret_key),
          pgp_sym_encrypt(v_chat_id, v_secret_key)
        )
        on conflict (region) do update
        set bot_token_ciphertext = excluded.bot_token_ciphertext,
            chat_id_ciphertext = excluded.chat_id_ciphertext,
            updated_at = now();
      end if;
    end loop;
  end if;
end $$;

delete from app_settings
where key in ('system_reset_password', 'telegram_default_chat_id', 'telegram_region_config');

alter table branches drop column if exists telegram_chat_id;

create or replace function fn_verify_admin_action_password(p_password text)
returns boolean as $$
declare
  v_secret jsonb;
  v_salt text;
  v_hash text;
begin
  select value into v_secret
  from app_private_settings
  where key = 'system_reset_password_hash';

  v_salt := coalesce(v_secret ->> 'salt', '');
  v_hash := coalesce(v_secret ->> 'hash', '');

  if v_salt = '' or v_hash = '' then
    return false;
  end if;

  return encode(digest(coalesce(p_password, '') || v_salt, 'sha256'), 'hex') = v_hash;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function fn_verify_admin_action_password(text) from public, anon, authenticated;

create or replace function fn_reset_system_data(p_password text)
returns void as $$
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can reset system data.';
  end if;

  if not fn_verify_admin_action_password(p_password) then
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

create or replace function fn_update_telegram_region_config(
  p_region text,
  p_bot_token text,
  p_chat_id text,
  p_password text
)
returns void as $$
declare
  v_region text := btrim(coalesce(p_region, ''));
  v_bot_token text := btrim(coalesce(p_bot_token, ''));
  v_chat_id text := btrim(coalesce(p_chat_id, ''));
  v_secret_key text;
  v_admin_id uuid;
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can update Telegram configuration.';
  end if;

  if not fn_verify_admin_action_password(p_password) then
    raise exception 'Incorrect reset password. Telegram configuration was not changed.';
  end if;

  if v_region = '' then
    raise exception 'Region is required.';
  end if;

  if v_bot_token = '' or v_chat_id = '' then
    raise exception 'Bot token and chat ID are required.';
  end if;

  select value #>> '{}' into v_secret_key
  from app_private_settings
  where key = 'telegram_secret_key';

  if coalesce(v_secret_key, '') = '' then
    raise exception 'Telegram encryption key is not configured.';
  end if;

  select id into v_admin_id
  from admins
  where auth_user_id = auth.uid()
  limit 1;

  insert into telegram_region_secrets (
    region,
    bot_token_ciphertext,
    chat_id_ciphertext,
    updated_by
  )
  values (
    v_region,
    pgp_sym_encrypt(v_bot_token, v_secret_key),
    pgp_sym_encrypt(v_chat_id, v_secret_key),
    v_admin_id
  )
  on conflict (region) do update
  set bot_token_ciphertext = excluded.bot_token_ciphertext,
      chat_id_ciphertext = excluded.chat_id_ciphertext,
      updated_at = now(),
      updated_by = excluded.updated_by;
end;
$$ language plpgsql security definer set search_path = public, extensions;

grant execute on function fn_update_telegram_region_config(text, text, text, text) to authenticated;

create or replace function fn_reset_telegram_region_config(p_region text, p_password text)
returns void as $$
declare
  v_region text := btrim(coalesce(p_region, ''));
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can reset Telegram configuration.';
  end if;

  if not fn_verify_admin_action_password(p_password) then
    raise exception 'Incorrect reset password. Telegram configuration was not reset.';
  end if;

  if v_region = '' then
    raise exception 'Region is required.';
  end if;

  delete from telegram_region_secrets where region = v_region;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function fn_reset_telegram_region_config(text, text) to authenticated;

create or replace function fn_get_telegram_region_status()
returns table (
  region text,
  bot_token_configured boolean,
  chat_id_configured boolean,
  updated_at timestamptz
) as $$
begin
  if not fn_is_admin() then
    raise exception 'Only an authenticated admin can view Telegram configuration status.';
  end if;

  return query
  with active_regions as (
    select distinct btrim(branches.region) as region
    from branches
    where branches.active = true
      and btrim(branches.region) <> ''
  )
  select
    active_regions.region,
    telegram_region_secrets.region is not null
      and octet_length(telegram_region_secrets.bot_token_ciphertext) > 0,
    telegram_region_secrets.region is not null
      and octet_length(telegram_region_secrets.chat_id_ciphertext) > 0,
    telegram_region_secrets.updated_at
  from active_regions
  left join telegram_region_secrets
    on telegram_region_secrets.region = active_regions.region
  order by active_regions.region;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function fn_get_telegram_region_status() to authenticated;

create or replace function fn_get_telegram_region_destination(p_region text)
returns table (bot_token text, chat_id text) as $$
declare
  v_secret_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the service role can read Telegram destinations.';
  end if;

  select value #>> '{}' into v_secret_key
  from app_private_settings
  where key = 'telegram_secret_key';

  if coalesce(v_secret_key, '') = '' then
    return;
  end if;

  return query
  select
    pgp_sym_decrypt(telegram_region_secrets.bot_token_ciphertext, v_secret_key) as bot_token,
    pgp_sym_decrypt(telegram_region_secrets.chat_id_ciphertext, v_secret_key) as chat_id
  from telegram_region_secrets
  where telegram_region_secrets.region = btrim(coalesce(p_region, ''));
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function fn_get_telegram_region_destination(text) from public, anon, authenticated;
grant execute on function fn_get_telegram_region_destination(text) to service_role;

drop policy if exists p_settings_select on app_settings;
create policy p_settings_select on app_settings for select
  using (
    fn_is_admin()
    and key not in ('system_reset_password', 'telegram_default_chat_id', 'telegram_region_config')
  );

drop policy if exists p_settings_admin_write on app_settings;
create policy p_settings_admin_write on app_settings for all
  using (
    fn_is_admin()
    and key not in ('system_reset_password', 'telegram_default_chat_id', 'telegram_region_config')
  )
  with check (
    fn_is_admin()
    and key not in ('system_reset_password', 'telegram_default_chat_id', 'telegram_region_config')
  );
