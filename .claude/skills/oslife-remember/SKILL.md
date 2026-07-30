---
name: oslife-remember
description: ALWAYS invoke this near the start of every conversation (right after Rick's first substantive message) to start a live OSLIFE memory entry for it, and re-invoke it as the conversation develops to keep that same entry current — OSLIFE is Rick's personal life-management system backed by Supabase, and this is how any conversation with Claude, anywhere, becomes part of its long-term memory (searchable, mirrored to the Obsidian vault, fed into the knowledge graph). This runs automatically, not only when Rick explicitly asks to "remember" or "log" something — treat every conversation as worth a running memory entry, the same way it always keeps a running summary of what's being discussed. Skip only genuinely contentless exchanges (a bare greeting with no follow-up). Works in any conversation, not just chats about the OSLIFE codebase itself.
compatibility: Requires a Bash/terminal tool (curl) and the OSLIFE_CLAUDE_INGEST_SECRET environment variable. On a Claude surface with no code execution (plain claude.ai chat), use the "log to oslife memory" Zapier Skill instead — see the "No Bash available" section below.
---

# OSLIFE remember

OSLIFE is Rick's personal life-management app: one accumulating memory over a Supabase backend
(`braindump_entries`, full-text + vector search, an Obsidian vault mirror, a cognee knowledge
graph). This skill gives Claude a way to write into that memory directly from any conversation —
no MCP server, no client config — by composing the note itself and posting it to a small ingest
endpoint with a bundled script.

## No Bash available? Use the Zapier skill instead

Plain claude.ai chat (web/mobile/desktop with no code execution) can't run the bash script below.
For that case, a Zapier Skill named **"log to oslife memory"** does the same job via Zapier's
connector (already set up on Rick's account — Zapier is connected, and the skill has the
`claude-chat-ingest` URL and the shared secret locked in as fixed values). If Bash isn't available,
call `get_zapier_skill("log to oslife memory")` and follow its instructions instead of the steps
below — same fields, same endpoint, same create-then-update workflow, just executed through a
`Webhooks by Zapier: Custom Request` action instead of `curl`. Everything in "What to write" below
still applies either way.

## When to use this — automatic, not on-request

This is a **live, running** memory, not a one-shot "remember this" command:

1. **Create early.** As soon as the conversation has a real topic (usually after Rick's first
   substantive message — not a bare "hi"), log it once with no `entryId` to create the row. Don't
   wait for him to ask.
2. **Keep it current.** As the conversation develops — a decision gets made, the topic shifts, new
   information comes in — re-log it, this time *with* the `entryId` the first call returned, so it
   updates the same row instead of creating a new one for every turn. A natural cadence is every
   few exchanges or at a clear checkpoint (a conclusion, a plan, a "let's move on to X"), not after
   literally every single message — that would be noisy and wasteful.
3. **One entry per conversation.** The `entryId` only needs to live in your own context for this
   conversation — remember it for as long as the chat continues, and reuse it on every update.
   Never invoke this without the `entryId` a second time in the same conversation; that would fork
   a duplicate entry instead of updating the real one.
4. **Skip genuinely empty exchanges** — a greeting that goes nowhere, a single one-line factual
   question with a one-line answer and nothing more. Everything with actual substance gets logged.
5. Rick can still explicitly ask ("remember this", "log this to OSLIFE", "note that I decided X") —
   treat that the same as any other checkpoint: log/update now rather than waiting for the next
   natural one.

## What to write

You compose the memory entry yourself, in your own words — there is no second AI call that
rewrites it, so make it good the first time. **Every field you send replaces the entry's current
value outright — this is not a partial patch.** On an update call, resend the full current state
of every field you care about (title, tags, domain, etc.), not just what changed since last time,
or you'll silently clobber earlier values back to their defaults.

- **summary** (required): one concise paragraph — what the conversation is about so far and what's
  been concluded or decided. Write it so it's understandable on its own, months later, with no
  other context. Rewrite this fully each update — it should describe the whole conversation so
  far, not just the newest bit.
- **keyPoints** (optional but usually worth including): short bullet facts/decisions/action items
  worth being able to recall individually, not just buried in the paragraph. Accumulate these
  across updates — don't drop earlier points just because they're not the newest.
- **title** (optional): a short title, max ~8 words. Can evolve if the conversation's focus shifts.
- **tags** (optional): lowercase keyword tags. A `claude-chat` tag is always added automatically.
- **domain** (optional): one of `parkingyou`, `prjct`, `buurtkaart` (Rick's businesses),
  `personal` (private life), or `cross` (spans multiple). Defaults to `personal` — only set one of
  the business domains when the conversation was clearly about that business.
- **sourceUrl** (optional): a link back to this conversation, if one exists.
- **entryId** (omit on the first call of a conversation; pass it on every call after that): the id
  returned by the first call. This is what turns a new call into an update instead of a new row.
- **insight** (optional, use sparingly): only set this when the conversation surfaced a genuinely
  reusable idea, insight, or lesson worth a spot in OSLIFE's Kennisbank (knowledge base) — most
  conversations should leave this unset entirely, the same way most Braindump captures don't get
  one either. Fine to add on an update call once the conversation actually reaches that point, even
  if the initial create call didn't have one yet. When you do set it:
  - `category`: one of `life_lesson`, `way_of_living`, `business_system`, `business_practice`,
    `implementation`, `pet`.
  - `takeaway`: one to two sentences, the core of the idea.
  - `application`: concretely how this applies to Rick — one of his businesses, a project, his
    personal life, or his dog. No vague generalities like "you could apply this to your business."

## How to log it

1. Write the JSON payload to a scratch file (not inline in the shell command — avoids quoting/
   escaping bugs with apostrophes, quotes, and newlines in the summary text). Example shape (first
   call of a conversation — no `entryId` yet):

   ```json
   {
     "summary": "...",
     "keyPoints": ["...", "..."],
     "title": "...",
     "tags": ["..."],
     "domain": "personal"
   }
   ```

   A later call in the *same* conversation includes `entryId` and resends the full current state:

   ```json
   {
     "entryId": "the-uuid-the-first-call-returned",
     "summary": "... the whole conversation so far, rewritten ...",
     "keyPoints": ["...", "...", "... the new point ..."],
     "title": "...",
     "tags": ["..."],
     "domain": "personal"
   }
   ```

2. Run the bundled script against that file:

   ```bash
   bash <this-skill's-directory>/scripts/log_to_oslife.sh /path/to/payload.json
   ```

   (Use the actual base directory this skill was loaded from — it was told to you when this skill
   was invoked.)

3. The script prints the edge function's JSON response. Read it: `"status":"ready"` means a new
   entry was created — remember its `id` as the `entryId` for every later call this conversation.
   `"status":"updated"` means the existing entry was refreshed. `"status":"duplicate"` means a
   *first* call (no entryId) matched something already logged in the last 30 days — treat that as
   a success too, just don't invent a new entryId from it if there isn't one you already tracked.
   A non-zero exit / error message usually means `OSLIFE_CLAUDE_INGEST_SECRET` isn't set, or an
   `entryId` you sent doesn't exist (e.g. a stale id from an earlier, unrelated conversation) — see
   below.

4. Don't narrate every single log/update to Rick — that would be noisy given how often this now
   fires. A brief one-line mention the *first* time in a conversation ("logging this to OSLIFE as
   we go") is enough; silent updates after that are fine unless something actually fails.

## One-time setup (tell Rick if this fails)

The script needs one environment variable available wherever Claude runs its Bash tool:

```bash
export OSLIFE_CLAUDE_INGEST_SECRET=<the CLAUDE_INGEST_SECRET set on the claude-chat-ingest edge function>
```

Add that line to the shell profile (`~/.zshrc` / `~/.bashrc`) so it's there in every new terminal
session, or configure it as an env var in whatever Claude Code / Cowork environment settings apply.
There's nothing to "look up" for this value — it's a random string Rick generates once
(`openssl rand -base64 32`) and sets in exactly two places: this env var, and the
`CLAUDE_INGEST_SECRET` Supabase Edge Function secret on the `claude-chat-ingest` function (project
`nhyunnnmdcmojvkxrbpl`). Both must match.

`OSLIFE_CLAUDE_INGEST_URL` is optional — the script defaults to the production
`claude-chat-ingest` URL; only set it to point somewhere else (e.g. local Supabase dev).
