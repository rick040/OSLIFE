-- Inbox usability expansion: full body + AI summary/takeaways/reminders on
-- gmail_messages, plus the thread_id the sync never actually captured (the
-- "Open in Gmail" link has been silently dead since it relies on this).
alter table gmail_messages
  add column if not exists thread_id text,
  add column if not exists body text,
  add column if not exists ai_summary text,
  add column if not exists ai_takeaways jsonb not null default '[]'::jsonb,
  add column if not exists ai_reminders jsonb not null default '[]'::jsonb,
  add column if not exists ai_summarized_at timestamptz;
