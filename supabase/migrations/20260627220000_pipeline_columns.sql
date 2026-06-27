-- finance_tx: add domain + wallet metadata columns
alter table finance_tx
  add column if not exists domain          text default 'personal',
  add column if not exists source          text default 'manual',
  add column if not exists paid_at         timestamptz,
  add column if not exists payment_method  text default 'unknown';

-- spotify_history: add enrichment columns written by spotify_poll.py
alter table spotify_history
  add column if not exists ms_played   integer default 0,
  add column if not exists popularity  integer default 0,
  add column if not exists explicit    boolean default false,
  add column if not exists source      text default 'spotify_api';

-- payments table: for Apps Script syncPayments (expected invoices / calendar events)
create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  payee        text not null,
  amount       numeric(12,2) not null,
  due          date,
  direction    text not null default 'outgoing',
  status       text not null default 'open',
  domain       text default 'personal',
  source       text default 'manual',
  external_id  text,
  notes        text,
  unique (user_id, source, external_id)
);
alter table payments enable row level security;
create policy "owner" on payments for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
