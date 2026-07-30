#!/usr/bin/env node
/**
 * OSLIFE memory MCP server
 * -------------------------
 * A tiny stdio MCP server, connected directly to Claude Desktop / Claude Code,
 * exposing one tool: `log_to_oslife_memory`. Claude calls it mid-conversation
 * to log a summary + key points into OSLIFE's memory (the same
 * `braindump_entries` table the in-app "Braindump" capture writes to) — it
 * then shows up in the Capture grid, feeds `search_memory()`'s recall, and
 * mirrors into the Obsidian vault + cognee knowledge graph, exactly like any
 * other captured note.
 *
 * This process holds no Supabase credentials of its own — it only knows the
 * `claude-chat-ingest` edge function URL and its shared secret, both read
 * from the environment (see README.md). The edge function does all the
 * actual writing, service-role side, scoped to the single OSLIFE account.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const INGEST_URL = process.env.OSLIFE_CLAUDE_INGEST_URL
  ?? "https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/claude-chat-ingest";
const INGEST_SECRET = process.env.OSLIFE_CLAUDE_INGEST_SECRET;

if (!INGEST_SECRET) {
  console.error(
    "[oslife-memory-mcp] OSLIFE_CLAUDE_INGEST_SECRET is not set — every log_to_oslife_memory call will fail. " +
      "See integrations/claude-mcp/README.md.",
  );
}

const DOMAINS = ["parkingyou", "prjct", "buurtkaart", "personal", "cross"] as const;
const LEARNING_CATEGORIES = [
  "life_lesson",
  "way_of_living",
  "business_system",
  "business_practice",
  "implementation",
  "pet",
] as const;

const server = new McpServer({ name: "oslife-memory", version: "1.0.0" });

server.tool(
  "log_to_oslife_memory",
  "Log a summary of the current (or a past) Claude conversation into OSLIFE's long-term memory, " +
    "so Rick's personal life-OS can recall it later. Use this when a conversation produced " +
    "something worth remembering — a decision, a plan, a fact about Rick, a useful insight — " +
    "not for routine/throwaway exchanges. Write the summary and key points yourself, in your own words.",
  {
    summary: z.string().min(1).describe(
      "A concise paragraph capturing what this conversation was about and what was concluded/decided.",
    ),
    keyPoints: z.array(z.string()).optional().describe(
      "Short bullet-point facts/decisions/action-items worth remembering individually (max ~20).",
    ),
    title: z.string().optional().describe("A short title (max ~8 words) for this memory entry."),
    tags: z.array(z.string()).optional().describe("Lowercase keyword tags (a 'claude-chat' tag is always added)."),
    domain: z.enum(DOMAINS).optional().describe(
      "Which life/business area this belongs to (parkingyou/prjct/buurtkaart = Rick's businesses, personal = private life, cross = spans multiple). Defaults to personal.",
    ),
    sourceUrl: z.string().optional().describe("A link back to this conversation, if one exists (e.g. a claude.ai chat URL)."),
    conversationTitle: z.string().optional().describe("The conversation/session title, if different from `title`."),
    insight: z.object({
      category: z.enum(LEARNING_CATEGORIES).optional(),
      takeaway: z.string().min(1).describe("One to two sentences: the core of the idea/insight/lesson."),
      application: z.string().min(1).describe(
        "Concretely how this applies to Rick — one of his businesses, a project, his personal life, or his dog. No vague generalities.",
      ),
    }).optional().describe(
      "ONLY set this when the conversation surfaced a genuinely reusable idea/insight/lesson worth a spot in " +
        "OSLIFE's Kennisbank (knowledge base) — most conversations should leave this unset.",
    ),
  },
  async ({ summary, keyPoints, title, tags, domain, sourceUrl, conversationTitle, insight }) => {
    if (!INGEST_SECRET) {
      return {
        isError: true,
        content: [{ type: "text", text: "OSLIFE_CLAUDE_INGEST_SECRET is not configured on this MCP server." }],
      };
    }

    let res: Response;
    try {
      res = await fetch(INGEST_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": INGEST_SECRET },
        body: JSON.stringify({ summary, keyPoints, title, tags, domain, sourceUrl, conversationTitle, insight }),
      });
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `Could not reach OSLIFE: ${String(err)}` }] };
    }

    const text = await res.text();
    if (!res.ok) {
      return { isError: true, content: [{ type: "text", text: `OSLIFE rejected the entry (${res.status}): ${text}` }] };
    }

    return { content: [{ type: "text", text: `Logged to OSLIFE memory: ${text}` }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
