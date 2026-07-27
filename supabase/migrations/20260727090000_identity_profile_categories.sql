-- ── Identity profile: restructure around the self-model interview ───────────
-- The Profile screen is rebuilt around Rick's own self-model interview
-- (src/selfModel.ts, 10 sections / 39 questions) and its own spec for what
-- the answers become:
--   - self/current  → `current`: 5 categories (values/workstyle/energy_mood/
--     decision_style/anti_patterns), each item a hypothesis (from the
--     interview) or confirmed (from real behavioral data or hand-entry).
--   - self/desired  → `desired`: 3 categories (identity_sketch/aspirations/
--     no_gos) — the north-star, not mirrored against current's category set.
--   - self/profile-seed.md → `legacy_notes` (renamed, not dropped, from the
--     old dream_md column) preserved verbatim, plus the new `interview` jsonb
--     column holding the same content split into per-question answers.
--   - the tensions list → `landscape.tensions`, alongside the existing
--     environment categories (people/habits/time/money/balance/focus/
--     environment).
--
-- `dream_md` already held Rick's real, substantial interview answers (a
-- genuine self-interview, not throwaway content) — renamed to `legacy_notes`
-- so it's preserved byte-for-byte; the app does a one-time, code-only
-- (no AI) deterministic split of that text into `interview.answers` on next
-- load (src/lib/supabase.ts:fetchIdentityProfile), so nothing has to be
-- retyped. `current`/`landscape` are fully regenerable on demand (that's
-- their whole design), so they're reset to their new empty shape rather than
-- remapped field-by-field. This migration was never applied in its earlier
-- draft form, so it's edited in place rather than superseded by a new one.
alter table identity_profile rename column dream_md to legacy_notes;
alter table identity_profile add column if not exists interview jsonb not null default '{"answers":{},"updatedAt":null}';
alter table identity_profile add column if not exists desired jsonb not null default '{"categories":{},"generatedAt":null}';
alter table identity_profile alter column current set default '{"categories":{},"generatedAt":null,"hypothesesAt":null}';
alter table identity_profile alter column landscape set default '{"categories":{},"tensions":[],"generatedAt":null}';

update identity_profile
   set current = '{"categories":{},"generatedAt":null,"hypothesesAt":null}',
       landscape = '{"categories":{},"tensions":[],"generatedAt":null}';
