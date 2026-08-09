# Fiverr client/project intake pipeline

Automates the "new Fiverr message → logged → (if it's a new project) drafted proposal +
Telegram review" loop on top of the existing native CRM (`clients` / `projects` /
`client_messages` / `project_invoices`). Runs entirely server-side — two Supabase Edge
Functions on `pg_cron`, same pattern as `notify-tick` — so it doesn't depend on any
machine being on. For setup steps, see `docs/SECRETS.md` §9. This file explains how it
works and how to tune it later.

## Flow

```
Gmail (Fiverr notification emails)
  │  syncGmail() in integrations/apps-script/Code.gs, every 15 min, Rick's own Google account
  ▼
gmail_messages  (label "fiverr-logged")
  │  fiverr-poll edge function, pg_cron every 3 min
  │    - extracts Fiverr username from the subject
  │    - matches a client via clients.aliases
  │    - if matched + has an active (non-archived, non-done) project → attaches to it, done
  │    - otherwise → inserts with project_id = NULL (this IS the buffer)
  ▼
client_messages  (channel='fiverr', source='gmail_sync', project_id NULL = unassigned)
  │  fiverr-process-intake edge function, pg_cron every 5 min
  │    - groups unassigned messages by contact_key
  │    - only processes a group once its newest message is 30+ min old (debounce)
  │    - asks Claude to draft: title, deliverable packages, pricing, a client reply
  │    - creates/updates the client, creates a project (status='draft')
  │    - calls the Apps Script Web App to generate the proposal/invoice Google Doc
  │    - creates a draft project_invoices row, re-points the buffered messages
  ▼
Telegram (your bot) — one message per new project with everything to review
```

## Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260809130000_fiverr_intake.sql` | `service_packages` table + `project_invoices.document_url` column |
| `supabase/functions/fiverr-poll/index.ts` | Step A — mirror Fiverr gmail messages into `client_messages` |
| `supabase/functions/fiverr-process-intake/index.ts` | Step B — debounce, draft, create client/project/invoice/doc, notify |
| `integrations/apps-script/Code.gs` (`doPost` / `createProposalDoc_`) | Generates the proposal Google Doc from the PRJCT template, under your own Google account |
| `docs/SECRETS.md` §9 | One-time setup checklist (secrets, Web App deploy) |

## Conventions reused (not invented)

Checked the live data before adding anything — nothing new was introduced where an
existing convention already covered it:

- **Fiverr username per client** → `clients.aliases` (already used this way for
  `to2bi9`, `rosie_bel09`, `noortjeqff`, etc.) — no new column.
- **Dedup key** → the existing unique index on `client_messages(user_id, source, external_id)`,
  with `source='gmail_sync'`, `external_id` = the Gmail message id. Same values the one-off
  historical Fiverr backfill already used.
- **"Active project"** → `projects.archived = false AND status <> 'done'` (there's no
  `completed`/`archived` status value in this schema — `archived` is a separate boolean,
  and `'done'` is the real terminal status).
- **`status='draft'`** on new projects is a new *value* in an existing free-text column
  (no enum, no migration needed) — never auto-promoted to `'active'`.
- **`document_url`** on `project_invoices` follows the same plain-nullable-URL shape as
  `projects.notion_url` / `clients.notion_url`.

## Tuning it later

- **Pricing reference** — `service_packages` (name, description, default_specs,
  unit, default_unit_price, active). Add/edit rows directly (Table Editor or SQL); the
  drafting prompt checks this table first and only estimates (flagged in the Telegram
  message) when nothing matches. No redeploy needed — it's read live on every run.
- **Debounce window** — `DEBOUNCE_MINUTES` constant at the top of
  `supabase/functions/fiverr-process-intake/index.ts` (default 30). Edit and redeploy:
  `supabase functions deploy fiverr-process-intake --project-ref nhyunnnmdcmojvkxrbpl`.
- **Poll/process cadence** — the `pg_cron` schedules (`oslife-fiverr-poll` */3,
  `oslife-fiverr-process-intake` */5). Change via
  `select cron.alter_job(job_id, schedule := '*/2 * * * *');` (find `job_id` with
  `select jobid, jobname from cron.job;`).
- **Username-extraction patterns** — `USERNAME_PATTERNS` in `fiverr-poll/index.ts`. Fiverr's
  notification subject wording drifts occasionally; add a pattern if a real subject stops
  matching (check `NOISE_SUBJECT_RE` too — it's the marketing/digest-email skip list).
- **Model** — both this pipeline and the rest of OSLIFE's AI calls use
  `claude-haiku-4-5-20251001` (`_shared/anthropic.ts`) for cost consistency. Swap the
  `model` field in `fiverr-process-intake`'s Anthropic call if you want a stronger model on
  the drafting step specifically.

## Known limitations

- **The Knab payment link in the generated doc is inherited from the template and is
  NOT regenerated per invoice.** Betaalverzoek links are single-use and amount-specific —
  you still have to create a fresh one in the Knab app and paste it into the doc before
  sending. Everything else in the doc is generated correctly per-project.
- **"A new brief is waiting for you" / "invited to their brief" emails carry no username**
  in the subject — these fall back to a `fiverr-thread:<id>` grouping key instead of the
  real username. The drafting step still works (it reads the full message body), but the
  client won't auto-match an existing `clients` row by alias in this case — expect a
  Telegram notification even if you already know this client, and merge manually if so.
- **Doc generation failure is non-fatal** — if the Apps Script Web App secrets aren't set
  yet (or the deployment is stale), the project/invoice are still created; the Telegram
  message says the doc wasn't generated so you know to check it.
- **Gmail body truncation** — Apps Script caps synced email bodies at 20,000 characters.
  If a buffered message hits that cap, the Telegram notification flags it explicitly
  rather than silently drafting off a cut-off brief.

## Monitoring / troubleshooting

```sql
-- Did the cron jobs actually run, and did they error?
select jobid, jobname, status, return_message, start_time
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname like 'oslife-fiverr%')
order by start_time desc limit 20;

-- What's currently buffered (unassigned), and how old is the newest message per group?
select contact_key, count(*), max(ts) as newest, now() - max(ts) as age
from client_messages
where channel = 'fiverr' and direction = 'in' and project_id is null
group by contact_key order by newest desc;
```

Edge function logs: Supabase dashboard → Edge Functions → `fiverr-poll` /
`fiverr-process-intake` → Logs (or `mcp__Supabase__get_logs` with `service: "edge-function"`
from an assistant session with Supabase access).
