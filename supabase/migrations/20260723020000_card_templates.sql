-- OSLIFE · HEYRA card templates — caches which EXTRA fields (beyond the fixed
-- baseline in proposeAction.ts's buildFields()) recur for a given action kind,
-- so a value Rick keeps mentioning for "mark_invoice_paid" (say, a discount)
-- gets a proper field on every future card instead of only ever surfacing
-- ad-hoc, one card at a time. Only the field SHAPE is cached (key/label/type)
-- — never a value — matching the same "no data, no invented series" honesty
-- rule the rest of heyra/cards.ts follows. One row per (user, action kind).

create table if not exists card_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  template_key  text not null,              -- matches ActionCard.templateKey (today: the ActionKind itself)
  kind          text not null,
  layout        jsonb not null default '{"extraFields": []}',  -- {extraFields: [{key,label,type,seenCount}]}
  use_count     int not null default 0,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  unique (user_id, template_key)
);

alter table card_templates enable row level security;
create policy "owner" on card_templates for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
