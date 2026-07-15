-- OSLIFE · client/vendor research fetching (Agent-Reach-inspired, scoped to
-- plain web pages only — no login-walled platform scraping). Caches a short
-- "what does this company/person do" note against a client's website_url so
-- enrich-client (Claude + the shared webpage fetch helper) never looks the
-- same site up twice.

alter table clients
  add column if not exists research_note text,
  add column if not exists researched_at timestamptz;
