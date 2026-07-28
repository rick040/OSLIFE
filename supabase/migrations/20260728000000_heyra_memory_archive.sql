-- OSLIFE · heyra_memory archived facts — stop silently dropping evicted LearnedFacts.
--
-- learnedFacts (heyra_memory.facts) is capped at MAX_FACTS (60, see
-- src/heyra/learning.ts) and, once a new fact pushes the list past that cap,
-- silently drops the oldest one with no trace — exactly the "hard capped op
-- 60, stilzwijgend overschreven" shortcoming 20260724000000_pattern_engine_
-- profile.sql's header flags as a violation of this app's own principle 4
-- (never silently lose a confirmed fact; supersede, don't drop).
--
-- This does NOT migrate LearnedFact onto profile_facts's version/confirm-
-- gated model — that would force every "learn as we speak" fact through a
-- confirm step, undoing the whole point of frictionless background
-- learning. It just stops the silent loss: a fact evicted from the active
-- 60 moves to archived_facts instead of disappearing. Bounded, not infinite
-- retention (see ARCHIVE_CAP in src/lib/supabase.ts), but a lot more
-- headroom than "gone forever the moment a 61st fact arrives" — and now
-- there's an explicit, inspectable trail of what HEYRA used to know.

alter table heyra_memory add column if not exists archived_facts jsonb default '[]';
