-- OSLIFE · HEYRA conversation persistence.
--
-- HEYRA is the most heavily engineered subsystem in the app (~6,700 lines
-- across ~25 modules: a context registry, RAG, embeddings, a knowledge graph,
-- action handlers) and the only one whose usage cannot be measured at all —
-- its entire durable trace was a single `heyra_memory` row of learned facts.
-- Conversations were held entirely in component state and lost on unmount.
--
-- Two consequences, both bad: the subsystem could not be evaluated (a design
-- principle from the field study says instrument before extending), and Rick
-- lost every exchange he had with it — including the ones worth keeping.
--
-- This records the transcript. It does not change how HEYRA behaves.
create table if not exists heyra_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  -- One id per mounted chat session, so an exchange can be read back as a
  -- conversation rather than a flat stream of unrelated turns.
  conversation_id uuid not null,
  role            text not null check (role in ('rick', 'heyra')),
  text            text not null,
  -- Which agent answered ('chat', 'planner', 'finance', …) — null for Rick's
  -- own turns. Free text: the agent roster changes faster than a constraint
  -- should.
  agent           text,
  created_at      timestamptz not null default now()
);

-- Reading a conversation back, and listing recent conversations.
create index if not exists heyra_messages_user_created_idx
  on heyra_messages (user_id, created_at desc);
create index if not exists heyra_messages_conversation_idx
  on heyra_messages (conversation_id, created_at);

alter table heyra_messages enable row level security;

create policy "owner" on heyra_messages for all to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
