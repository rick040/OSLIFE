-- Fallback manual price for holdings whose ticker Stooq doesn't carry data for
-- (some European ETPs/ETNs — e.g. crypto ETPs on Xetra — aren't in its free feed).
-- Live quotes from stock-quote always take priority; this only fills the gap.
alter table investment_holdings
  add column if not exists manual_price     numeric(12,4),
  add column if not exists manual_price_at  date;
