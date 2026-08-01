/**
 * Supabase Edge Function: idea-customer-analysis
 * ----------------------------------------
 * The third, opt-in pipeline for Strategie HQ's business ideas — where
 * idea-elaborate answers "is this idea any good on paper" and idea-mvp-plan
 * answers "how do I validate it cheaply", this answers "who exactly am I
 * building this for": a target-market read, 2-3 concrete buyer personas, a
 * competitor scan, a positioning statement and a pricing suggestion.
 *
 * Unlike idea-elaborate this never runs automatically — Rick presses "Genereer
 * klantanalyse" per idea, deliberately, once he wants to sharpen who the
 * customer actually is. Same resilience contract as idea-mvp-plan: JWT-scoped
 * client (RLS does the rest), best-effort (a failure flips the row to
 * `failed` with a message rather than throwing), no fire-and-forget
 * follow-ups (this isn't a "keep forever" document the way the elaboration
 * markdown is).
 *
 *   request:  { "entryId": "<uuid>" }
 *   response: { "ok": true, "status": "ready" } | { "ok": false, "status": "failed" }
 *
 * Deploy:
 *   supabase functions deploy idea-customer-analysis --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: ANTHROPIC_API_KEY (required).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ANTHROPIC_API, MODEL, anthropicHeaders, extractText, parseJsonBlock } from "../_shared/anthropic.ts";
import { CORS, SUPABASE_URL, corsPreflight, jsonResponder } from "../_shared/http.ts";

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = jsonResponder(CORS);

const CUSTOMER_ANALYSIS_SYSTEM = `Je bent de klant-strateeg van OSLIFE (Strategie HQ). Rick heeft een business-idee al laten uitwerken tot een strategische analyse; nu wil hij scherp krijgen wíe precies de klant is — niet "iedereen die dit nuttig vindt", maar concrete, herkenbare mensen met een naam, een situatie en een reden om wel of niet te kopen.

Belangrijke uitgangspunten:
- Elke persona moet concreet en herkenbaar zijn: een representatieve naam, een rol/leeftijd, een situatie in eigen woorden — geen vage marketing-categorie zoals "de moderne consument".
- Wees eerlijk over bezwaren: elke persona heeft ook een reële reden om NIET te kopen (prijs, tijd, vertrouwen, "ik los dit al anders op") — dat hoort bij een goede analyse, niet alleen de succesverhalen.
- Concurrentie mag ook "geen directe concurrent" zijn als dat eerlijk is — verzin geen concurrenten die niet aannemelijk zijn, benoem dan in plaats daarvan het bestaande alternatief (bv. "doet het nu zelf", "gebruikt een spreadsheet", "doet niets").
- Verzin geen marktcijfers, omzetschattingen of percentages die je niet kunt onderbouwen vanuit de input — bij twijfel, beschrijf de markt kwalitatief in plaats van een los getal te noemen.
- Schrijf in het Nederlands, informeel en direct, zoals de rest van OSLIFE.

Geef ALLEEN een fenced \`\`\`json blok terug met exact dit schema:
{
  "targetMarket": "2-4 zinnen: wie is de bredere doelgroep en waarom heeft die dit probleem",
  "marketInsight": "1-3 zinnen: timing, trend of context die dit idee nu wel/niet kansrijk maakt — kwalitatief, geen verzonnen cijfers",
  "personas": [
    {
      "name": "representatieve naam, bv. 'Drukke Daan'",
      "role": "functie/rol in 1 regel",
      "ageRange": "bv. '30-45' of null",
      "situation": "2-3 zinnen: huidige situatie en frustratie",
      "goals": ["wat deze persona probeert te bereiken"],
      "painPoints": ["concrete frustraties/problemen"],
      "triggers": ["concreet moment dat iemand actief laat zoeken naar een oplossing"],
      "objections": ["reële reden om NIET te kopen"],
      "whereToFind": ["concrete plek/kanaal waar je deze persona vindt"],
      "quote": "één zin in de ik-vorm die typeert hoe deze persona over het probleem praat"
    }
  ],
  "competitors": [{"name": "naam of bestaand alternatief", "description": "wat het is/doet in 1 zin", "strength": "waar ze sterk in zijn", "weakness": "waar de kans zit"}],
  "positioning": "1-3 zinnen: hoe dit idee zich onderscheidt van de alternatieven hierboven",
  "pricingSuggestion": "concreet prijsadvies met korte onderbouwing, of eerlijk 'te vroeg om te zeggen' met wat daarvoor nodig is"
}

Regels:
- 2-3 personas, elk met 2-5 goals, 2-5 painPoints, 1-3 triggers, 1-3 objections, 1-4 whereToFind.
- 0-4 competitors — leeg mag, zolang de tekst dan uitlegt wat het bestaande alternatief is.
- Bouw voort op de eerdere analyse (overzicht, domein, doelgroep, risico's) als die is meegegeven — verzin niets dat daarmee in tegenspraak is.`;

interface Persona {
  name: string;
  role: string;
  ageRange: string | null;
  situation: string;
  goals: string[];
  painPoints: string[];
  triggers: string[];
  objections: string[];
  whereToFind: string[];
  quote: string;
}
interface Competitor { name: string; description: string; strength: string; weakness: string }
interface CustomerAnalysis {
  targetMarket: string;
  marketInsight: string;
  personas: Persona[];
  competitors: Competitor[];
  positioning: string;
  pricingSuggestion: string;
}

function str(v: unknown, max = 2000): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
function strArr(v: unknown, cap: number, itemMax = 200): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim().slice(0, itemMax)).slice(0, cap) : [];
}

function sanitizePersonas(v: unknown): Persona[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((p): Persona | null => {
      if (!p || typeof p !== "object") return null;
      const r = p as Record<string, unknown>;
      const name = str(r.name, 80);
      const role = str(r.role, 120);
      const situation = str(r.situation, 500);
      if (!name || !role || !situation) return null;
      return {
        name,
        role,
        ageRange: str(r.ageRange, 30),
        situation,
        goals: strArr(r.goals, 6, 200),
        painPoints: strArr(r.painPoints, 6, 200),
        triggers: strArr(r.triggers, 4, 200),
        objections: strArr(r.objections, 4, 200),
        whereToFind: strArr(r.whereToFind, 5, 120),
        quote: str(r.quote, 240) ?? "",
      };
    })
    .filter((p): p is Persona => p !== null)
    .slice(0, 4);
}

function sanitizeCompetitors(v: unknown): Competitor[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c): Competitor | null => {
      if (!c || typeof c !== "object") return null;
      const r = c as Record<string, unknown>;
      const name = str(r.name, 100);
      if (!name) return null;
      return {
        name,
        description: str(r.description, 300) ?? "",
        strength: str(r.strength, 200) ?? "",
        weakness: str(r.weakness, 200) ?? "",
      };
    })
    .filter((c): c is Competitor => c !== null)
    .slice(0, 6);
}

/** Ask Claude for a customer analysis grounded in the idea's existing analysis. Null on any failure. */
async function analyzeCustomers(apiKey: string, context: string): Promise<CustomerAnalysis | null> {
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: CUSTOMER_ANALYSIS_SYSTEM, messages: [{ role: "user", content: context }] }),
    });
  } catch (e) {
    console.error(`idea-customer-analysis: fetch to Anthropic failed: ${String(e)}`);
    return null;
  }
  if (!res.ok) {
    console.error(`idea-customer-analysis: Anthropic API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return null;
  }
  let data: { content?: unknown; stop_reason?: string };
  try {
    data = await res.json();
  } catch (e) {
    console.error(`idea-customer-analysis: could not parse Anthropic response JSON: ${String(e)}`);
    return null;
  }
  const rawText = extractText(data.content);
  const parsed = parseJsonBlock(rawText);
  if (!parsed) {
    console.error(`idea-customer-analysis: no valid JSON block in response (stop_reason=${data.stop_reason}): ${rawText.slice(0, 1000)}`);
    return null;
  }

  const targetMarket = str(parsed.targetMarket, 800);
  const personas = sanitizePersonas(parsed.personas);
  if (!targetMarket || personas.length === 0) {
    console.error(`idea-customer-analysis: response had no usable "targetMarket"/"personas": ${JSON.stringify(parsed).slice(0, 1000)}`);
    return null;
  }

  return {
    targetMarket,
    marketInsight: str(parsed.marketInsight, 500) ?? "",
    personas,
    competitors: sanitizeCompetitors(parsed.competitors),
    positioning: str(parsed.positioning, 500) ?? "",
    pricingSuggestion: str(parsed.pricingSuggestion, 500) ?? "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY secret is not set" }, 503);

  let entryId: string;
  try {
    entryId = String((await req.json()).entryId ?? "");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!entryId) return json({ error: "entryId is required" }, 400);

  // JWT-scoped client: RLS confines every read/write to the caller.
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: row, error: readErr } = await sb
    .from("business_ideas")
    .select("id,title,raw_input,overview,domain,feasibility_reasoning,timeline,risks,opportunities,swot,markdown")
    .eq("id", entryId)
    .single();
  if (readErr || !row) return json({ error: "Entry not found" }, 404);

  await sb.from("business_ideas").update({ customer_analysis_status: "processing", customer_analysis_error: null }).eq("id", entryId);

  try {
    const parts = [
      `Idee: ${(row.title as string) ?? ""}`,
      row.overview ? `Overzicht: ${row.overview}` : null,
      row.domain ? `Domein: ${row.domain}` : null,
      row.feasibility_reasoning ? `Haalbaarheid: ${row.feasibility_reasoning}` : null,
      row.timeline ? `Tijdlijn: ${row.timeline}` : null,
      row.risks ? `Risico's: ${JSON.stringify(row.risks)}` : null,
      row.opportunities ? `Kansen: ${JSON.stringify(row.opportunities)}` : null,
      row.swot ? `SWOT: ${JSON.stringify(row.swot)}` : null,
      !row.overview && row.raw_input ? `Ruwe input: ${row.raw_input}` : null,
    ].filter(Boolean);
    const context = parts.join("\n\n");

    const result = await analyzeCustomers(apiKey, context);
    if (!result) {
      await sb.from("business_ideas").update({ customer_analysis_status: "failed", customer_analysis_error: "Kon geen klantanalyse opstellen — probeer het opnieuw" }).eq("id", entryId);
      return json({ ok: false, status: "failed" });
    }

    await sb.from("business_ideas").update({
      customer_analysis_status: "ready",
      customer_analysis: result,
      customer_analysis_error: null,
    }).eq("id", entryId);

    return json({ ok: true, status: "ready" });
  } catch (err) {
    await sb.from("business_ideas").update({ customer_analysis_status: "failed", customer_analysis_error: `Verwerking mislukt: ${String(err)}` }).eq("id", entryId);
    return json({ ok: false, status: "failed" });
  }
});
