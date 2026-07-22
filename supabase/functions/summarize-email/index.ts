/**
 * Supabase Edge Function: summarize-email
 * ----------------------------------------
 * Given a gmail_messages row id, asks Claude Haiku for a short summary, a
 * handful of key takeaways, and any reminders/dates/action items buried in
 * the email — then persists the result on the row so the Inbox's highlights
 * panel and detail view never have to re-ask. Called automatically in the
 * background for "Belangrijk" (high-importance) mail on load, and on-demand
 * the first time any other email is opened (src/store.ts / Inbox.tsx).
 *
 *   request:  { "id": "<gmail_messages.id>" }
 *   response: { "summary": "...", "takeaways": ["..."], "reminders": [{"text":"...","date":"YYYY-MM-DD"|null}] }
 *             | { "error": "<message>" }
 *
 * Deploy:
 *   supabase functions deploy summarize-email --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets required: ANTHROPIC_API_KEY (same one heyra-brain uses), SUPABASE_ANON_KEY.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ANTHROPIC_API, MODEL, anthropicHeaders, extractText, parseJsonBlock } from "../_shared/anthropic.ts";
import { CORS, SUPABASE_URL, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = jsonResponder(CORS);

const SYSTEM = `Je bent de "Inbox"-assistent van OSLIFE, voor Rick van Mierlo. Je krijgt de afzender, het onderwerp en de inhoud van één e-mail. Vat 'm samen in het Nederlands, kort en feitelijk — geen marketingtaal.

Antwoord ALLEEN met een fenced \`\`\`json blok, niets anders:
{"summary":"één tot twee zinnen samenvatting","takeaways":["puntsgewijze kernpunten, max 4"],"reminders":[{"text":"actie of iets om te onthouden","date":"YYYY-MM-DD of null als er geen concrete datum genoemd wordt"}]}

Laat takeaways/reminders leeg ([]) als de mail daar simpelweg niks voor bevat (bv. een korte bevestiging). Verzin geen datums die niet in de mail staan.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!bearerToken(req)) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY secret is not set" }, 503);

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const id = (body.id ?? "").trim();
  if (!id) return json({ error: "id is required" }, 400);

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: row, error: fetchErr } = await sb
    .from("gmail_messages")
    .select("subject, from_addr, body, snippet")
    .eq("id", id)
    .single();
  if (fetchErr || !row) return json({ error: "Email not found" }, 404);

  const content = (row.body as string | null)?.trim() || (row.snippet as string | null) || "";
  if (!content) return json({ error: "Email has no content to summarize" }, 400);

  const prompt = [
    `Van: ${row.from_addr ?? ""}`,
    `Onderwerp: ${row.subject ?? ""}`,
    `Inhoud:\n"""\n${content.slice(0, 12000)}\n"""`,
  ].join("\n");

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return json({ error: `Anthropic ${res.status}: ${await res.text()}` }, 502);

    const data = await res.json();
    const verdict = parseJsonBlock(extractText(data.content));
    if (!verdict) return json({ error: "Could not parse a verdict" }, 502);

    const summary = String(verdict.summary ?? "").slice(0, 500);
    const takeaways = Array.isArray(verdict.takeaways)
      ? verdict.takeaways.map((t) => String(t)).slice(0, 6)
      : [];
    const reminders = Array.isArray(verdict.reminders)
      ? verdict.reminders
        .filter((r): r is { text?: unknown; date?: unknown } => !!r && typeof r === "object")
        .map((r) => ({
          text: String(r.text ?? "").slice(0, 200),
          date: typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
        }))
        .filter((r) => r.text)
        .slice(0, 6)
      : [];

    const { error: updateErr } = await sb
      .from("gmail_messages")
      .update({
        ai_summary: summary,
        ai_takeaways: takeaways,
        ai_reminders: reminders,
        ai_summarized_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ summary, takeaways, reminders });
  } catch (err) {
    return json({ error: `Summarize failed: ${String(err)}` }, 502);
  }
});
