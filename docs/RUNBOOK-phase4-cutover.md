# Phase 4 cutover runbook (operator steps)

The Phase 4 code changes are committed, but three items require actions **outside
the repo** (deploys, a pg_cron schedule with a secret, and Apps Script trigger
edits). They are ordered so sync is never interrupted. Nothing here is destructive
to data except where noted; each step is reversible.

Prerequisites: Supabase CLI logged in, project ref `nhyunnnmdcmojvkxrbpl`, and the
secrets already listed in `docs/SECRETS.md`.

---

## 1. Deploy the relocated `wallet-ingest` function

`wallet-ingest` moved into the deployable tree (`supabase/functions/wallet-ingest/`)
and now emits canonical categories. Deploy it so the new source is live:

```bash
supabase functions deploy wallet-ingest --project-ref nhyunnnmdcmojvkxrbpl
```

No secret changes needed — it still reads `WALLET_WEBHOOK_SECRET` / `OSLIFE_USER_ID`.
The MacroDroid webhook URL is unchanged. Also redeploy `payments-sheet-ingest`
(its default category casing was fixed):

```bash
supabase functions deploy payments-sheet-ingest --project-ref nhyunnnmdcmojvkxrbpl
```

## 2. Normalise existing `finance_tx` category values

Migration `20260703120000_normalize_finance_categories.sql` backfills the old
lowercase rows to the canonical taxonomy. It is idempotent. Apply it the same way
as other migrations:

```bash
supabase db push --project-ref nhyunnnmdcmojvkxrbpl
```

(Or paste the file's contents into the Supabase SQL Editor.) Verify:

```sql
select category, count(*) from public.finance_tx group by 1 order by 2 desc;
-- expect only capitalized categories (+ 'Uncategorized'); no 'groceries'/'fuel'/'other'
```

## 3. Schedule `notion-sync` via pg_cron (replaces the Apps Script sync)

`notion-sync` already accepts a `SYNC_SECRET` bearer (see the file header). Set the
secret and schedule it, mirroring how `notify-tick` is scheduled (per
`docs/SECRETS.md` §7). The `cron.schedule` call embeds the secret, so — like the
notify-tick job — it is **run once by hand in the SQL Editor, never committed**:

```sql
-- run in the Supabase SQL Editor
select cron.schedule(
  'notion-sync',
  '*/15 * * * *',                       -- same cadence the Apps Script trigger used
  $$ select net.http_post(
       url    := 'https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/notion-sync',
       headers:= jsonb_build_object('Authorization', 'Bearer <SYNC_SECRET>'),
       body   := '{}'::jsonb
     ) $$
);
```

Set the function secret first: `supabase secrets set SYNC_SECRET=<random> --project-ref nhyunnnmdcmojvkxrbpl`.

Confirm one scheduled run writes rows (check `projects`/`clients` updated_at, or the
function logs) **before** proceeding to step 4.

## 4. Retire the duplicate sync in `Code.gs` (only after step 3 is confirmed)

`integrations/apps-script/Code.gs` still contains `syncNotion()` / `syncClients()`
plus their Notion mini-client and 15-minute trigger — a second, independent writer
to the same `projects`/`clients` tables. This is the drift hazard the audit called
out. Once the pg_cron job in step 3 is confirmed running:

1. In the Apps Script project, delete the time-based triggers for `syncNotion` and
   `syncClients` (Triggers panel).
2. Remove those functions (and the Notion helpers they use) from `Code.gs`, keeping
   the sheet-reader half (health/payments/screentime) which is **not** duplicated.
3. Re-paste the trimmed `Code.gs`.

> This step is intentionally **not** applied to the repo's `Code.gs` yet: deleting
> the sync code there before the cron job is live would let a re-paste silently stop
> Notion sync. Do the deletion as part of this cutover, or ask for it as a follow-up
> commit once step 3 is verified.

Rollback for the whole cutover: `select cron.unschedule('notion-sync');` and
re-enable the Apps Script triggers.
