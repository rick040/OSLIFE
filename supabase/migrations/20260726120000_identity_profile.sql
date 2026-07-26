-- ── Identity profile: huidig profiel / droomprofiel / landschap ─────────────
-- One owner-scoped row (same shape as heyra_memory) holding HEYRA's synthesized
-- read of "who Rick is right now" (current), the aspirational profile Rick
-- writes himself (dream_md, free-form markdown — filled in later), and the
-- environment/landscape that bridges the two (landscape). Distinct from
-- profile_facts (rule-derived, versioned facts feeding the inference engine):
-- this is a holistic, regenerate-on-demand synthesis, not an append-only log.
create table if not exists identity_profile (
  user_id     uuid primary key references auth.users on delete cascade,
  current     jsonb not null default '{"summary":"","traits":[],"strengths":[],"weaknesses":[],"accelerators":[],"generatedAt":null}',
  dream_md    text not null default '',
  landscape   jsonb not null default '{"summary":"","people":[],"habits":[],"environment":[],"generatedAt":null}',
  updated_at  timestamptz not null default now()
);
alter table identity_profile enable row level security;
create policy "owner" on identity_profile for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
