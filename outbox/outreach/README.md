# Outreach outbox (working branch: `outreach-outbox`)

Scratch data exchange between the two unattended Outreach Routines and the interactive
session that syncs everything into Supabase/Gmail. Exists because MCP connector calls
(Supabase/Gmail/Drive) require an interactive approval tap that a fresh unattended
Routine session can never provide — see the PR/conversation history for the full story.
Both Routines touch **only plain files in this repo** — `git`, `Read`, `Write`, no
connectors, no approval prompts, ever.

Rick (interactively) periodically pulls this branch, syncs the JSON below into Supabase,
creates real Gmail drafts, then can clear out `results/`/`drafts/`/`targets/` (or just
leave them — the routines skip anything that already has an output file).

## Files Routine 1 (content generation) reads

- `ideas.json` — array of business ideas to generate outreach assets for:
  `{id, title, overview, domain, markdown, tags, feasibility_reasoning, customer_analysis, created_at}`.
  Refreshed by Rick/the syncing session whenever a new idea is elaborated — Routine 1
  never queries Supabase itself.

## Files Routine 1 writes

- `results/<ideaId>.json` — one per idea, once generated:
  ```json
  {
    "ideaId": "...",
    "outreachIdentity": "short persona name + one-liner",
    "campaignPlan": {"goal": "...", "targetAudience": "...", "keyMessage": "...", "channels": [{"name": "...", "angle": "..."}], "timeline": "...", "budget": null, "kpis": ["..."]},
    "contentCreation": {"pieces": [{"channel": "...", "title": "...", "body": "...", "cta": null}]},
    "emailSequence": {"steps": [{"step": 1, "daysAfterPrevious": 0, "subject": "...", "body": "...", "goal": "..."}]},
    "generatedAt": "ISO timestamp"
  }
  ```
  Routine 1 **skips any idea that already has a `results/<id>.json` file** — that's how
  re-runs avoid redoing work instead of checking Supabase status columns.

## Files Routine 2 (segmentation + draft outreach) reads

- `ideas.json` — same file as above, for target-audience context.
- `results/*.json` — only ideas with a results file are eligible for outreach (their
  `emailSequence` is the template to personalize).
- `leads.json` — array of local-business leads (synced from the Google Sheet by Rick,
  not read live by the Routine): `{id, businessName, contactName, email, phone, website, sector, notes}`.
- `targets/*.json` — existing selections, so it never re-selects the same
  (idea, lead) pair twice.

## Files Routine 2 writes

- `targets/<ideaId>__<leadId>.json` — one per selected pairing:
  `{"ideaId": "...", "leadId": "...", "fitScore": 0-100, "fitReasoning": "one sentence", "status": "selected"}`.
  At most 8 new ones per idea per run (small batches on purpose).
- `drafts/<ideaId>__<leadId>__step1.json` — one per email to draft (draft-only, never
  sent — Routine 2 never touches Gmail):
  `{"ideaId": "...", "leadId": "...", "step": 1, "to": "lead@example.com", "subject": "...", "body": "...", "generatedAt": "ISO timestamp"}`.
  Skip (leave at `targets` status `selected`, no draft file) any lead with no email.

## Workflow (both routines)

1. `git fetch origin outreach-outbox && git checkout outreach-outbox && git pull` (or
   clone fresh onto this branch) at the start of the run.
2. Read the relevant files above with the `Read` tool.
3. Do the generation work (try the relevant skill first, fall back to writing it
   yourself — see each Routine's own prompt for specifics).
4. Write new files with the `Write` tool.
5. `git add outbox/outreach && git commit -m "..." && git push origin outreach-outbox`.
6. Report a one-line summary of what was written. Never touch any Supabase/Gmail/Drive
   connector tool — if one appears in your tool list, don't use it for this task.
