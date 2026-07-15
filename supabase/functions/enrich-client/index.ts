/**
 * Supabase Edge Function: enrich-client
 * ----------------------------------------
 * Given a website URL, fetches the page (shared _shared/webpage.ts helper —
 * the same fetch/OpenGraph/HTML-to-text pipeline braindump-ingest uses for
 * links) and asks Claude Haiku for a short factual "what does this
 * company/person do" note, for HEYRA's Klant-intake to show as context
 * alongside a drafted reply. Plain web pages only — no login-walled platform
 * scraping (LinkedIn/Instagram etc.), which is fragile and ToS-risky for
 * little payoff at this scale.
 *
 *   request:  { "url": "https://example.com" }
 *   response: { "note": "...", "confidence": 0.8 } | { "error": "<message>" }
 *
 * Deploy:
 *   supabase functions deploy enrich-client --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets required: ANTHROPIC_API_KEY (same one heyra-brain uses).
 */

import { ANTHROPIC_API, MODEL, anthropicHeaders, extractText, parseJsonBlock } from "../_shared/anthropic.ts";
import { CORS, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";
import { fetchText, htmlToText, parseOG } from "../_shared/webpage.ts";

const json = jsonResponder(CORS);

const SYSTEM = `Je bent de "Klant-research"-assistent van OSLIFE, voor Rick van Mierlo (PRJCT Agency). Je krijgt de website-inhoud van een (potentiële) klant of diens bedrijf. Vat in één korte Nederlandse zin samen wat dit bedrijf/deze persoon doet — feitelijk, geen marketingtaal, max 160 tekens.

'confidence' = 0.0..1.0 hoe zeker je bent dat dit een bruikbare samenvatting is (laag als de pagina leeg/onduidelijk was).

Antwoord ALLEEN met een fenced \`\`\`json blok, niets anders:
{"note":"Nederlands adviesbureau voor duurzame energie","confidence":0.85}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!bearerToken(req)) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY secret is not set" }, 503);

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  let url: URL;
  try {
    url = new URL(body.url ?? "");
    if (!/^https?:$/.test(url.protocol)) throw new Error("not http(s)");
  } catch {
    return json({ error: "A valid http(s) url is required" }, 400);
  }

  const html = await fetchText(url.toString());
  if (!html) return json({ error: "Could not fetch the page" }, 502);

  const og = parseOG(html);
  const article = htmlToText(html, 4000);
  const prompt = [
    `Website: ${url.toString()}`,
    og.title ? `Titel: ${og.title}` : "",
    og.description ? `Omschrijving: ${og.description}` : "",
    article ? `Pagina-inhoud:\n"""\n${article}\n"""` : "",
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `Anthropic ${res.status}: ${detail}` }, 502);
    }
    const data = await res.json();
    const verdict = parseJsonBlock(extractText(data.content));
    if (!verdict) return json({ error: "Could not parse a verdict" }, 502);

    const note = String(verdict.note ?? "").slice(0, 200);
    if (!note) return json({ error: "Empty note" }, 502);
    let confidence = Number(verdict.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));

    return json({ note, confidence });
  } catch (err) {
    return json({ error: `Enrichment failed: ${String(err)}` }, 502);
  }
});
