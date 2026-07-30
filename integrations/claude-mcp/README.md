# OSLIFE memory MCP server

A small custom [MCP](https://modelcontextprotocol.io) server you connect directly to Claude
(Claude Desktop, Claude Code, or any other MCP-capable Claude client). It exposes one tool,
`log_to_oslife_memory`, that Claude can call mid-conversation to log a summary + key points of
what you just talked about into OSLIFE's memory — the same `braindump_entries` table the in-app
"Braindump" capture writes to. From there it behaves exactly like any other captured note: it
shows up in the Capture grid, feeds `search_memory()`'s recall (used by HEYRA/Strategie HQ),
mirrors into the Obsidian vault, and reaches the cognee knowledge graph — all best-effort, same
graceful-degradation contract as the rest of the app.

This process never talks to Supabase directly and holds no Supabase credentials — it only knows
the `claude-chat-ingest` edge function's URL and a shared secret. The edge function does the
actual writing, service-role side, scoped to your single OSLIFE account (`OSLIFE_USER_ID`).

## 1. Deploy the edge function (once)

```bash
supabase functions deploy claude-chat-ingest --project-ref nhyunnnmdcmojvkxrbpl
supabase secrets set CLAUDE_INGEST_SECRET=$(openssl rand -base64 32) --project-ref nhyunnnmdcmojvkxrbpl
```

`CLAUDE_INGEST_SECRET` is dedicated to this integration — it deliberately does **not** fall back
to `WALLET_WEBHOOK_SECRET` like the MacroDroid ingest functions do, since this secret lives in an
MCP config on a laptop rather than on your phone. Keep the value you generated; you'll need it in
step 3.

## 2. Build this server

```bash
cd integrations/claude-mcp
npm install
npm run build   # emits dist/index.js
```

## 3. Connect it to Claude

**Claude Code CLI:**

```bash
claude mcp add oslife-memory \
  --env OSLIFE_CLAUDE_INGEST_SECRET=<the secret from step 1> \
  -- node /absolute/path/to/OSLIFE/integrations/claude-mcp/dist/index.js
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "oslife-memory": {
      "command": "node",
      "args": ["/absolute/path/to/OSLIFE/integrations/claude-mcp/dist/index.js"],
      "env": {
        "OSLIFE_CLAUDE_INGEST_SECRET": "<the secret from step 1>"
      }
    }
  }
}
```

Restart the client afterwards. Both need the built `dist/index.js` from step 2 — this server
speaks stdio, so it must run locally next to Claude, not on Supabase.

## Environment variables

| Variable | Required | Default |
|----------|----------|---------|
| `OSLIFE_CLAUDE_INGEST_SECRET` | yes | — (every call fails without it) |
| `OSLIFE_CLAUDE_INGEST_URL` | no | `https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/claude-chat-ingest` |

## Using it

Once connected, just ask Claude to remember something — e.g. "log the key points of this chat to
OSLIFE" or "remember that I decided to switch the invoice template" — and it calls
`log_to_oslife_memory` with a summary, optional key points, tags and a domain
(`parkingyou`/`prjct`/`buurtkaart`/`personal`/`cross`). It can optionally flag a genuinely reusable
idea/insight (an `insight` field) — that also creates a `suggested` Kennisbank entry, same as a
Braindump capture would, for you to confirm or reject in the app.

Nothing here reads OSLIFE's data back — it's a one-way write. If you also want Claude to recall
past OSLIFE memory during a chat, that would be a second tool calling the `memory-search` edge
function; not built here.
