-- ── Identity profile: restructure current/dream/landscape into categories ───
-- The Profile screen moves from narrative summaries + a handful of fixed
-- fields to a concrete, structured shape: each of current/dream/landscape is
-- now `{"categories": {<key>: string[]}, "generatedAt": ...}`, keyed by the
-- canonical categories in src/profile.ts (toolstack/habits/strengths/
-- weaknesses/interests/character/workstyle/communication/accelerators for a
-- persona; people/habits/time/money/balance/focus/environment for the
-- landscape) — never a paragraph, so current and dream read as directly
-- comparable versions of one persona.
--
-- dream_md held Rick's own hand-written free-form dream-profile text (a real,
-- substantial self-interview) — renamed (not dropped) to dream_notes so it's
-- preserved verbatim as the source material a new "dream" jsonb column can be
-- distilled from (heyra/identity.ts:synthesizeDreamProfile). current/landscape
-- are fully regenerable on demand (that's their whole design), so they're
-- simply reset to the new empty shape rather than remapped field-by-field —
-- one click on "Vernieuwen"/"Genereer landschap" repopulates them properly
-- bucketed under the new categories.
alter table identity_profile rename column dream_md to dream_notes;
alter table identity_profile add column if not exists dream jsonb not null default '{"categories":{},"generatedAt":null}';
alter table identity_profile alter column current set default '{"categories":{},"generatedAt":null}';
alter table identity_profile alter column landscape set default '{"categories":{},"generatedAt":null}';

update identity_profile
   set current = '{"categories":{},"generatedAt":null}',
       landscape = '{"categories":{},"generatedAt":null}';
