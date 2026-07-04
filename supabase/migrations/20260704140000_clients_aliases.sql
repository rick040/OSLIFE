-- In-app, Notion-free client attribution for the inbox.
-- `aliases` holds sender email addresses and/or company domains that map an
-- incoming Gmail message to this client. It's learned entirely within OSLIFE
-- (the "Koppel aan klant" action in Berichten), so client<->email matching no
-- longer depends on Notion carrying the email.
alter table public.clients
  add column if not exists aliases text[] not null default '{}';
