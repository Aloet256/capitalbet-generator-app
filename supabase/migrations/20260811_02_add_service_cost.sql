-- Add branch-entered service details captured below the one-click servicing button.

alter table services
  add column if not exists cost numeric(12,2) check (cost is null or cost >= 0),
  add column if not exists items_replaced text,
  add column if not exists repairs_done text;
