-- 049_default_currency_bdt.sql
-- Set BDT as default currency for accounts and deals.

ALTER TABLE accounts ALTER COLUMN default_currency SET DEFAULT 'BDT';
UPDATE accounts SET default_currency = 'BDT' WHERE default_currency = 'USD' OR default_currency IS NULL;

ALTER TABLE deals ALTER COLUMN currency SET DEFAULT 'BDT';
UPDATE deals SET currency = 'BDT' WHERE currency = 'USD' OR currency IS NULL;
