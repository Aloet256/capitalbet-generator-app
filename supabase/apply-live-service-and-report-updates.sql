-- Run this once in the Supabase SQL Editor for the live CapitalBet project.
-- It adds the fields used by the branch Servicing screen.

alter table services
  add column if not exists cost numeric(12,2) check (cost is null or cost >= 0),
  add column if not exists items_replaced text,
  add column if not exists repairs_done text;
