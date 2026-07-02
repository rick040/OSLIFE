/**
 * Supabase Edge Function: categorize-vendor
 * ------------------------------------------
 * Given a merchant name (and optionally the raw bank description + amount), asks
 * Claude Haiku — WITH the Anthropic web-search tool enabled — to figure out what
 * kind of business the vendor is and which OSLIFE spending category + life domain
 * it belongs to. Returns a small JSON verdict the frontend caches in vendor_tags
 * so the same merchant is never looked up twice.
 *
 *   request:  { "vendor": "Albert Heijn", "description"?: "...", "amount"?: -64.2 }
 *   response: { "category": "Groceries", "domain": "personal",
 *               "info": "Dutch supermarket chain", "confidence": 0.95 }
 *             or { "error": "<message>" }
 *
 * Web search is a server-side Anthropic tool: the model performs the search and
 * returns the final answer in ONE request. If the account can't use web search
 * (400/tool error) we transparently retry once WITHOUT tools so categorisation
 * still works from the model's own knowledge — the caller never has to care.
 *
 * Deploy:
 *   supabase functions deploy categorize-vendor --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets required: ANTHROPIC_API_KEY (same one heyra-brain uses).
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";

// The fixed taxonomy the model MUST choose from — kept in sync with
// src/finance/categories.ts on the frontend.
const CATEGORIES = [
  "Groceries", "Takeout", "Convenience", "Transport", "Dog", "Health",
  "Subscriptions", "Software", "Gear", "Utilities", "Housing", "Shopping",
  "Entertainment", "Cash", "Fees", "Taxes", "Client income", "Stock media", "Other",
];
const DOMAINS = ["personal", "prjct", "parkingyou", "buurtkaart"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const SYSTEM = `Je bent de transactie-categoriseerder van OSLIFE. Je krijgt de naam van een winkelier/bedrijf van een Nederlandse bankafschrift. Zoek zo nodig op internet op wat voor bedrijf het is, en bepaal dan de juiste categorie en levensdomein.

Kies de category PRECIES uit deze lijst: ${CATEGORIES.join(", ")}.
Kies het domain uit: personal, prjct (PRJCT Agency / zakelijke tools), parkingyou (ParkingYou), buurtkaart (Buurtkaart Geldrop).
- Supermarkten → Groceries. Bezorgeten/restaurants → Takeout. Tankstations/gemakswinkels → Convenience.
- OV/trein/parkeren/brandstofrit → Transport. Dierenarts/dierenwinkel → Dog. Apotheek/huisarts/sport → Health.
- Streaming/vaste maandabonnementen → Subscriptions. SaaS/zakelijke software → Software (domain prjct).
- Verzekeringen/energie/water/telecom → Utilities. Huur/hypotheek → Housing.
- Bankkosten → Fees. Belasting → Taxes. Inkomen van klanten → Client income.
Bij twijfel: category "Other", domain "personal".

'info' = één korte Nederlandse zin die uitlegt wat het bedrijf is (max 120 tekens).
'confidence' = 0.0..1.0 hoe zeker je bent.

Antwoord ALLEEN met een fenced \`\`\`json blok, niets anders:
{"category":"Groceries","domain":"personal","info":"Nederlandse supermarktketen","confidence":0.95}`;

interface Req {
  vendor?: string;
  description?: string;
  amount?: number;
}

interface Block {
  type: string;
  text?: string;
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is Block => !!b && (b as Block).type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

function parseVerdict(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  // Fall back to the first {...} block if there's no fence.
  const braced = candidate.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse((braced ? braced[0] : candidate).trim());
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function callAnthropic(apiKey: string, prompt: string, withSearch: boolean): Promise<Response> {
  return await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      ...(withSearch && {
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      }),
      messages: [{ role: "user", content: prompt }],
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // verify_jwt is enabled at the gateway — a valid session token is required.
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!auth) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY secret is not set" }, 503);

  let body: Req;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const vendor = (body.vendor ?? "").trim();
  if (!vendor) return json({ error: "vendor is required" }, 400);

  const prompt = [
    `Winkelier: ${vendor}`,
    body.description ? `Ruwe bankomschrijving: ${body.description}` : "",
    typeof body.amount === "number" ? `Bedrag: €${body.amount}` : "",
  ].filter(Boolean).join("\n");

  try {
    // First try with web search; if the account/tool rejects it, retry plain.
    let res = await callAnthropic(apiKey, prompt, true);
    if (!res.ok) res = await callAnthropic(apiKey, prompt, false);
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `Anthropic ${res.status}: ${detail}` }, 502);
    }

    const data = await res.json();
    const verdict = parseVerdict(extractText(data.content));
    if (!verdict) return json({ error: "Could not parse a verdict" }, 502);

    const rawCat = String(verdict.category ?? "Other");
    const category = CATEGORIES.includes(rawCat) ? rawCat : "Other";
    const rawDomain = String(verdict.domain ?? "personal");
    const domain = DOMAINS.includes(rawDomain) ? rawDomain : "personal";
    const info = String(verdict.info ?? "").slice(0, 200);
    let confidence = Number(verdict.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));

    return json({ category, domain, info, confidence });
  } catch (err) {
    return json({ error: `Categorisation failed: ${String(err)}` }, 502);
  }
});
