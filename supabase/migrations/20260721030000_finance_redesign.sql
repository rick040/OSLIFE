-- Finance screen redesign: owned-holdings tracker, manual balance checkpoints,
-- and manually-entered bills (payments gets iban/payment_link/note so a bill
-- can be added by hand instead of only arriving via the payments-sheet sync).

-- ── Investment holdings (scoped tracker — only what's actually owned) ────────
create table if not exists investment_holdings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  ticker         text not null,
  name           text,
  shares         numeric(14,4) not null,
  cost_basis     numeric(12,4) not null,
  currency       text not null default 'EUR',
  purchase_date  date not null,
  notes          text
);
alter table investment_holdings enable row level security;
create policy "owner" on investment_holdings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Manual balance checkpoints (fixes running-balance drift) ─────────────────
create table if not exists balance_checkpoints (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  amount      numeric(12,2) not null,
  as_of       date not null,
  note        text,
  created_at  timestamptz not null default now()
);
alter table balance_checkpoints enable row level security;
create policy "owner" on balance_checkpoints for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Payments: support manually-added bills ───────────────────────────────────
-- (the table already has a `notes` column from 0001_init.sql, unused by the
-- frontend until now — fetchPayments/createPaymentRow start mapping it below)
alter table payments
  add column if not exists iban          text,
  add column if not exists payment_link  text;
