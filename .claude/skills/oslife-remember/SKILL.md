---
name: oslife-remember
description: Logs a summary and key points of the current (or a recently discussed) conversation into OSLIFE — Rick's personal life-management system backed by Supabase — so it becomes part of his long-term memory and shows up in search, the Obsidian vault, and the knowledge graph. Use this whenever Rick asks Claude to "remember this", "log this to OSLIFE", "save this to my memory", "add this to my life OS", "put this in OSLIFE", or otherwise clearly wants a decision/plan/fact/insight from the conversation persisted beyond this chat — not for routine or throwaway exchanges. Works in any conversation, not just chats about the OSLIFE codebase itself.
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
below — same fields, same endpoint, just executed through a `Webhooks by Zapier: Custom Request`
action instead of `curl`. Everything in "What to write" above still applies either way.

## When to use this

Trigger on an explicit or clearly-implied request to persist something from the conversation into
OSLIFE — "remember this", "log this to OSLIFE", "save that to memory", "can you note that I
decided X". Don't trigger on every mention of the word "remember" in passing, and don't trigger
automatically at the start or end of a conversation — this is an on-request action, since Rick
decides what's worth keeping, not every exchange.

## What to write

You compose the memory entry yourself, in your own words — there is no second AI call that
rewrites it, so make it good the first time:

- **summary** (required): one concise paragraph — what the conversation was about and what was
  concluded or decided. Write it so it's understandable on its own, months later, with no other
  context.
- **keyPoints** (optional but usually worth including): short bullet facts/decisions/action items
  worth being able to recall individually, not just buried in the paragraph.
- **title** (optional): a short title, max ~8 words.
- **tags** (optional): lowercase keyword tags. A `claude-chat` tag is always added automatically.
- **domain** (optional): one of `parkingyou`, `prjct`, `buurtkaart` (Rick's businesses),
  `personal` (private life), or `cross` (spans multiple). Defaults to `personal` — only set one of
  the business domains when the conversation was clearly about that business.
- **sourceUrl** (optional): a link back to this conversation, if one exists.
- **insight** (optional, use sparingly): only set this when the conversation surfaced a genuinely
  reusable idea, insight, or lesson worth a spot in OSLIFE's Kennisbank (knowledge base) — most
  conversations should leave this unset entirely, the same way most Braindump captures don't get
  one either. When you do set it:
  - `category`: one of `life_lesson`, `way_of_living`, `business_system`, `business_practice`,
    `implementation`, `pet`.
  - `takeaway`: one to two sentences, the core of the idea.
  - `application`: concretely how this applies to Rick — one of his businesses, a project, his
    personal life, or his dog. No vague generalities like "you could apply this to your business."

## How to log it

1. Write the JSON payload to a scratch file (not inline in the shell command — avoids quoting/
   escaping bugs with apostrophes, quotes, and newlines in the summary text). Example shape:

   ```json
   {
     "summary": "...",
     "keyPoints": ["...", "..."],
     "title": "...",
     "tags": ["..."],
     "domain": "personal",
     "sourceUrl": null,
     "insight": null
   }
   ```

2. Run the bundled script against that file:

   ```bash
   bash <this-skill's-directory>/scripts/log_to_oslife.sh /path/to/payload.json
   ```

   (Use the actual base directory this skill was loaded from — it was told to you when this skill
   was invoked.)

3. The script prints the edge function's JSON response. Read it: `"status":"ready"` means it's
   logged, `"status":"duplicate"` means you (or a past you) already logged the same content within
   the last 30 days — either is a success, just tell Rick which. A non-zero exit / error message
   usually means `OSLIFE_CLAUDE_INGEST_SECRET` isn't set — see below.

4. Briefly confirm to Rick what got logged (a one-line recap of the title/summary is enough — he
   doesn't need to see the raw JSON or response).

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
