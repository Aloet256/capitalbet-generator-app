-- Configure the one-click generator service button.
-- Existing projects should run this after the 20260809 migrations.

insert into app_settings (key, value) values
  ('generator_service_technician_name', '"Mr Kawesi"'::jsonb),
  ('generator_service_technician_phone', '"N/A"'::jsonb),
  ('generator_service_company', '""'::jsonb),
  ('generator_service_work_done', '"Servicing Generator"'::jsonb),
  ('generator_service_remarks', '"Servicing Generator"'::jsonb)
on conflict (key) do nothing;

alter table services
  alter column service_date set default current_date;

drop policy if exists p_settings_service_defaults_select on app_settings;
create policy p_settings_service_defaults_select on app_settings for select
  using (
    key in (
      'generator_service_technician_name',
      'generator_service_technician_phone',
      'generator_service_company',
      'generator_service_work_done',
      'generator_service_remarks'
    )
    and exists (
      select 1 from devices
      where devices.status = 'approved'
        and devices.device_fingerprint = fn_current_device_fingerprint()
    )
  );
