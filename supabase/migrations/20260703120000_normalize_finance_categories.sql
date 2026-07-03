-- Normalise historical finance_tx.category values to the canonical taxonomy.
--
-- Two ingestion paths historically wrote lowercase, off-taxonomy category
-- strings that the frontend (which keys CATEGORY_DOMAIN by the exact,
-- capitalized TX_CATEGORIES) never matched:
--   * wallet-ingest        — 'groceries' / 'takeout' / 'fuel' / 'software' / 'other'
--   * payments-sheet-ingest — defaulted to 'other'
-- Both source functions now emit canonical values; this backfills the rows
-- they already wrote. Idempotent: after the first run the WHERE clauses no
-- longer match, and it is a no-op on a fresh (empty) database.
--
-- 'fuel' was never a real category — wallet used it for fuel stations, which
-- the ABN CSV guesser maps to 'Convenience', so we follow that decision.
-- Rows already canonical (or 'Uncategorized') are left untouched.

update public.finance_tx set category = 'Groceries'     where category = 'groceries';
update public.finance_tx set category = 'Takeout'       where category = 'takeout';
update public.finance_tx set category = 'Convenience'   where category in ('convenience', 'fuel');
update public.finance_tx set category = 'Transport'     where category = 'transport';
update public.finance_tx set category = 'Software'      where category = 'software';
update public.finance_tx set category = 'Subscriptions' where category = 'subscriptions';
update public.finance_tx set category = 'Dog'           where category = 'dog';
update public.finance_tx set category = 'Health'        where category = 'health';
update public.finance_tx set category = 'Shopping'      where category = 'shopping';
update public.finance_tx set category = 'Entertainment' where category = 'entertainment';
update public.finance_tx set category = 'Utilities'     where category = 'utilities';
update public.finance_tx set category = 'Housing'       where category = 'housing';
update public.finance_tx set category = 'Gear'          where category = 'gear';
update public.finance_tx set category = 'Cash'          where category = 'cash';
update public.finance_tx set category = 'Fees'          where category = 'fees';
update public.finance_tx set category = 'Taxes'         where category = 'taxes';
update public.finance_tx set category = 'Other'         where category = 'other';
