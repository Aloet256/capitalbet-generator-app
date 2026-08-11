-- Run this in the Supabase SQL Editor for the live project.
-- It enables Supabase Realtime for the tables the admin/user screens watch.

do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'branches',
    'devices',
    'power_sessions',
    'fuel_refills',
    'services',
    'repairs',
    'dstv_subscriptions',
    'yaka_purchases',
    'notifications',
    'audit_logs'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach table_name in array realtime_tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
