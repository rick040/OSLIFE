-- ── Kennisbank: categorize learnings ─────────────────────────────────────────
-- Rick wants braindump-derived insights sorted into a fixed taxonomy (life
-- lessons, ways of living, business systems, business practices, ways to
-- implement things, dog/pet stuff) instead of just free-form tags, so the
-- Kennisbank can be filtered by kind of learning and confirmed entries can be
-- folded into HEYRA's permanent "Geleerd" memory (heyra_memory) with the right
-- label. Must match LEARNING_CATEGORIES in braindump-ingest/index.ts and
-- FactCategory in src/heyra/learning.ts.

alter table wiki_entries
  add column if not exists category text
    check (category is null or category in (
      'life_lesson', 'way_of_living', 'business_system', 'business_practice', 'implementation', 'pet'
    ));
