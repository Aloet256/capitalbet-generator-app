-- CapitalBet system completion migration, step 1.
-- Keep this as a separate migration so PostgreSQL commits the new enum value before it is used.

alter type notification_type add value if not exists 'yaka_reload_due';
