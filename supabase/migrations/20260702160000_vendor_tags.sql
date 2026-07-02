-- ── Vendor tag cache (auto-categorisation memory) ─────────────────────────────
-- The durable "learn once, reuse forever" layer for transaction categorisation.
-- When a new bank transaction shows up for a merchant HEYRA has never seen, a
-- Haiku call (with web search) figures out what kind of business it is and which
-- category/domain it belongs to. That verdict is stored here keyed by a
-- normalised vendor name, so the SECOND time "Albert Heijn" appears it's tagged
-- instantly from cache — no repeat lookup, no repeat cost.
--
-- Rick can also edit any tag by hand (category / domain / free-text info); a
-- hand-edited tag is marked source='manual' and is never overwritten by the AI.
-- Same per-user RLS + realtime shape as heyra_memory / brain_state.

create table if not exists vendor_tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  vendor_key  text not null,            -- normalised merchant name (lookup key)
  vendor_name text not null default '', -- last seen human-readable merchant
  category    text not null default 'Other',
  domain      text not null default 'personal',
  info        text default '',          -- what the vendor is (from web search) + notes
  source      text not null default 'ai', -- 'ai' | 'manual' | 'rule'
  confidence  numeric(3,2) default 0.5, -- 0..1
  updated_at  timestamptz default now(),
  unique (user_id, vendor_key)
);

alter table vendor_tags enable row level security;
create policy "owner" on vendor_tags for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Realtime so a tag learned/edited on one device shows up on another.
alter table vendor_tags replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vendor_tags'
  ) then
    execute 'alter publication supabase_realtime add table vendor_tags';
  end if;
end $$;

-- Per-transaction free-text note ("add more info" on a single transaction).
-- Distinct from vendor_tags.info (which is per-vendor and shared across rows).
alter table finance_tx
  add column if not exists note text default '';
