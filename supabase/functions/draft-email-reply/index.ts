/**
 * Supabase Edge Function: draft-email-reply
 * ----------------------------------------
 * Given a gmail_messages row id (and an optional steering instruction, e.g.
 * "wijs beleefd af"), asks Claude Haiku for a short reply body in the
 * email's own language. Purely a suggestion: the result is returned to the
 * caller and is NOT persisted — the Inbox detail view shows it in an
 * editable textarea, and only create-gmail-draft actually writes anything
 * (to Gmail, once the user approves the text).
 *
 *   request:  { "id": "<gmail_messages.id>", "instruction"?: "..." }
 *   response: { "draft": "..." } | { "error": "<message>" }
 *
 * Deploy:
 *   supabase functions deploy draft-email-reply --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets required: ANTHROPIC_API_KEY, SUPABASE_ANON_KEY.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ANTHROPIC_API, MODEL, anthropicHeaders, extractText } from "../_shared/anthropic.ts";
import { CORS, SUPABASE_URL, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = jsonResponder(CORS);

const SYSTEM = `Je bent de schrijfassistent van Rick van Mierlo (PRJCT Agency), voor OSLIFE's Inbox. Je krijgt een binnengekomen e-mail (en evt. een korte samenvatting) en schrijft een kort, professioneel antwoord.

Regels:
- Schrijf in dezelfde taal als de binnenkomende mail (meestal Nederlands, soms Engels).
- Kort en to-the-point — geen overbodige beleefdheidsformules.
- Onderteken met "Rick" (geen volledige signature, dat voegt de gebruiker zelf toe).
- Antwoord ALLEEN met de platte tekst van het antwoord, geen aanhef als "Hier is een concept", geen markdown, geen JSON.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!bearerToken(req)) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY secret is not set" }, 503);

  let body: { id?: string; instruction?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const id = (body.id ?? "").trim();
  if (!id) return json({ error: "id is required" }, 400);
  const instruction = (body.instruction ?? "").trim().slice(0, 500);

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: row, error: fetchErr } = await sb
    .from("gmail_messages")
    .select("subject, from_addr, body, snippet, ai_summary")
    .eq("id", id)
    .single();
  if (fetchErr || !row) return json({ error: "Email not found" }, 404);

  const content = (row.body as string | null)?.trim() || (row.snippet as string | null) || "";
  const prompt = [
    `Van: ${row.from_addr ?? ""}`,
    `Onderwerp: ${row.subject ?? ""}`,
    row.ai_summary ? `Samenvatting: ${row.ai_summary}` : "",
    content ? `Inhoud:\n"""\n${content.slice(0, 8000)}\n"""` : "",
    instruction ? `Extra instructie van Rick voor dit antwoord: ${instruction}` : "",
  ].filter(Boolean).join("\n");

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
    const draft = extractText(data.content).trim();
    if (!draft) return json({ error: "Empty draft" }, 502);

    return json({ draft });
  } catch (err) {
    return json({ error: `Draft failed: ${String(err)}` }, 502);
  }
});
