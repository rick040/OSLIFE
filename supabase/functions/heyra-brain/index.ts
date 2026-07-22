/**
 * Supabase Edge Function: heyra-brain
 * ------------------------------------
 * Thin proxy to the Anthropic Messages API so the OSLIFE frontend never ships
 * an LLM API key. Every HEYRA agent (src/heyra/agents/*.ts) builds its own
 * grounded prompt from real store data client-side and calls this function via
 * `supabase.functions.invoke('heyra-brain', { body })` (src/heyra/brainClient.ts).
 * This function does no business logic — it only forwards { system, prompt }
 * to Claude and returns the reply text, so the "only narrate what you're given"
 * honesty rule from reflect.ts stays enforced by the caller, not the proxy.
 *
 * Request body:
 *   { "system": "<agent system prompt>", "prompt": "<grounded user prompt>", "maxTokens"?: number,
 *     "tools"?: AnthropicTool[], "toolChoice"?: {"type":"tool","name":string} | {"type":"auto"} }
 *
 * `tools`/`toolChoice` are forwarded to Anthropic verbatim — this stays a thin
 * proxy with no business logic; the caller (proposeAction.ts) owns the tool
 * schema and what to do with the result.
 *
 * Response: { "text"?: "<reply>", "toolUse"?: {"name": string, "input": object} } or { "error": "<message>" }
 *
 * Deploy:
 *   supabase functions deploy heyra-brain --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets required: ANTHROPIC_API_KEY.
 */

import {
  ANTHROPIC_API,
  MODEL,
  anthropicHeaders,
  extractText,
  extractToolUse,
  type AnthropicTool,
  type AnthropicToolChoice,
} from "../_shared/anthropic.ts";
import { CORS, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const DEFAULT_MAX_TOKENS = 700;

const json = jsonResponder(CORS);

interface BrainRequest {
  system?: string;
  prompt?: string;
  maxTokens?: number;
  tools?: AnthropicTool[];
  toolChoice?: AnthropicToolChoice;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // verify_jwt is enabled at the gateway — the app forwards the session token
  // via functions.invoke, so a valid Authorization header is already required.
  const auth = bearerToken(req);
  if (!auth) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY secret is not set" }, 503);

  let body: BrainRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { system, prompt, maxTokens, tools, toolChoice } = body;
  if (!prompt || typeof prompt !== "string") {
    return json({ error: "prompt is required" }, 400);
  }

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(Math.max(maxTokens ?? DEFAULT_MAX_TOKENS, 64), 2000),
        system: typeof system === "string" && system.trim() ? system : undefined,
        messages: [{ role: "user", content: prompt }],
        tools: Array.isArray(tools) && tools.length ? tools : undefined,
        tool_choice: Array.isArray(tools) && tools.length ? (toolChoice ?? { type: "auto" }) : undefined,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `Anthropic ${res.status}: ${detail}` }, 502);
    }

    const data = await res.json();
    const text = extractText(data.content);
    const toolUse = extractToolUse(data.content);

    if (!text && !toolUse) return json({ error: "Empty response from model" }, 502);
    return json({ text: text || undefined, toolUse: toolUse ?? undefined });
  } catch (err) {
    return json({ error: `Anthropic call failed: ${String(err)}` }, 502);
  }
});
