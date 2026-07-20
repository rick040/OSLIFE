# Phase 4 cutover runbook (operator steps)

Historical record of the Phase 4 rollout. Steps 1–2 (wallet-ingest relocation,
finance category normalization) were completed and are kept for reference. Steps
3–4 (the Notion cutover) were superseded — see below — since Notion was removed
entirely rather than migrated to a pg_cron-scheduled sync.

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

## 3–4. Notion cutover — superseded by full removal

Steps 3–4 originally scheduled `notion-sync` via `pg_cron` and then retired the
duplicate `Code.gs` writer once that cron was confirmed. That plan is moot: the
Notion integration was removed entirely instead of migrated.

- `notion-sync`, `notion-mutate`, `notion-hq` edge functions deleted from the repo
  and the live Supabase project.
- `Code.gs`'s `syncNotion()`/`syncClients()` (plus their Notion mini-client and
  15-minute triggers) removed — the CRM (`projects`/`clients`) is now in-app only.
- `NOTION_TOKEN` / `NOTION_DB_ID` / `NOTION_CLIENTS_DB_ID` / `SYNC_SECRET` are no
  longer used anywhere; safe to delete from Supabase secrets and Apps Script
  Script Properties whenever convenient.
- If you still have the old `syncNotion`/`syncClients` time-based triggers
  registered in the Apps Script project, delete them from the Triggers panel —
  the functions they pointed to no longer exist in the re-pasted `Code.gs`.

Rollback isn't applicable — there's nothing left running to unschedule.
