-- Strategie HQ · Outreach — a fourth pipeline on business_ideas (after
-- elaboration, MVP plan, customer analysis): once an idea is elaborated, a
-- scheduled Claude Code Routine generates a campaign plan, content pieces and
-- an email sequence for it (same nullable/no-default column-triplet shape as
-- mvp_plan/customer_analysis — most ideas won't have run this yet), then a
-- second Routine matches it against Rick's local-business leads list and
-- drafts personalized cold emails. Everything here is Routine-written, not
-- edge-function-written — no emit_event/type_registry wiring, this isn't a
-- new "life domain", it's an operational pipeline the same shape as the
-- native CRM tables (client_messages etc. in 20260701120000_crm_native.sql).

alter table business_ideas
  add column if not exists campaign_plan_status    text check (campaign_plan_status is null or campaign_plan_status in ('pending','processing','ready','failed')),
  add column if not exists campaign_plan_error     text,
  add column if not exists campaign_plan           jsonb, -- {goal, targetAudience, keyMessage, channels:[{name,angle}], timeline, budget, kpis:[]}
  add column if not exists content_creation_status text check (content_creation_status is null or content_creation_status in ('pending','processing','ready','failed')),
  add column if not exists content_creation_error  text,
  add column if not exists content_creation        jsonb, -- {pieces:[{channel,title,body,cta}]}
  add column if not exists email_sequence_status   text check (email_sequence_status is null or email_sequence_status in ('pending','processing','ready','failed')),
  add column if not exists email_sequence_error    text,
  add column if not exists email_sequence          jsonb, -- {steps:[{step,daysAfterPrevious,subject,body,goal}]}
  add column if not exists outreach_identity       text;  -- display name/signature persona for this idea's cold emails; defaults to the idea title in the UI, editable

-- ── Leads: Rick's local-business list, synced in from a Google Sheet by the
-- outreach Routine (no separate Apps Script ingestion — the Routine reads the
-- sheet directly via the Drive connector and upserts here). ─────────────────
create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  business_name   text not null,
  contact_name    text,
  email           text,
  phone           text,
  website         text,
  sector          text,
  notes           text,
  source_row_key  text,                              -- dedup key from the sheet (e.g. sheet row id/hash)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table leads enable row level security;
create policy "owner" on leads for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter table leads replica identity full;
create unique index if not exists leads_dedup_idx on leads(user_id, source_row_key) where source_row_key is not null;
create index if not exists leads_user_created_idx on leads(user_id, created_at desc);

-- ── Outreach targets: one row per (business idea × lead) pairing the
-- segmentation step picked as a good fit. ───────────────────────────────────
create table if not exists outreach_targets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  business_idea_id  uuid references business_ideas(id) on delete cascade not null,
  lead_id           uuid references leads(id) on delete cascade not null,
  fit_score         int check (fit_score is null or (fit_score >= 0 and fit_score <= 100)),
  fit_reasoning     text,
  status            text not null default 'selected' check (status in ('selected','drafted','sent','replied','rejected')),
  created_at        timestamptz not null default now()
);
alter table outreach_targets enable row level security;
create policy "owner" on outreach_targets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter table outreach_targets replica identity full;
create unique index if not exists outreach_targets_dedup_idx on outreach_targets(business_idea_id, lead_id);
create index if not exists outreach_targets_idea_idx on outreach_targets(business_idea_id);
create index if not exists outreach_targets_lead_idx on outreach_targets(lead_id);

-- ── Outreach emails: one row per drafted/sent email for a target — a
-- sequence can have several. Reply detection matches gmail_thread_id against
-- gmail_messages.thread_id (already synced by Code.gs) rather than
-- re-ingesting anything. ─────────────────────────────────────────────────────
create table if not exists outreach_emails (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users not null,
  outreach_target_id  uuid references outreach_targets(id) on delete cascade not null,
  step_number         int not null default 1,
  subject             text not null,
  body                text not null,
  gmail_draft_id      text,
  gmail_thread_id     text,
  status              text not null default 'draft' check (status in ('draft','sent')),
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);
alter table outreach_emails enable row level security;
create policy "owner" on outreach_emails for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter table outreach_emails replica identity full;
create index if not exists outreach_emails_target_idx on outreach_emails(outreach_target_id);
create index if not exists outreach_emails_thread_idx on outreach_emails(gmail_thread_id) where gmail_thread_id is not null;

-- ── Realtime ─────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['leads','outreach_targets','outreach_emails'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
