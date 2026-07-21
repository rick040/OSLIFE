/**
 * Supabase Edge Function: idea-elaborate
 * ----------------------------------------
 * The conversion pipeline for Strategie HQ's business ideas. Given a
 * business_ideas row id, reads the raw voice/text capture and asks Claude to
 * work it out into a full strategic write-up — feasibility score + reasoning,
 * timeline, milestones, financials, risks, opportunities, a SWOT analysis, and
 * a complete Markdown document combining all of it — in one call. Mirrors
 * braindump-ingest's shape exactly: JWT-scoped client (RLS does the rest),
 * best-effort throughout (a failure flips the row to `failed` with a message
 * rather than throwing), and the same fire-and-forget embed-memory/
 * materialize-note/cognee-remember trio once elaboration succeeds.
 *
 *   request:  { "entryId": "<uuid>" }
 *   response: { "ok": true, "status": "ready" } | { "ok": false, "status": "failed" }
 *
 * Deploy:
 *   supabase functions deploy idea-elaborate --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: ANTHROPIC_API_KEY (required).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ANTHROPIC_API, MODEL, anthropicHeaders, extractText, parseJsonBlock } from "../_shared/anthropic.ts";
import { CORS, SUPABASE_URL, corsPreflight, jsonResponder } from "../_shared/http.ts";
import { cogneeInsight } from "../_shared/cognee.ts";

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const VALID_DOMAINS = ["parkingyou", "prjct", "buurtkaart", "personal", "cross"];
const VALID_IMPACT = ["low", "medium", "high"];

const json = jsonResponder(CORS);

const ELABORATE_SYSTEM = `Je bent de strategie-analist van OSLIFE (Strategie HQ). Rick deelt een ruw business-idee — een voice note (getranscribeerd) of getypte tekst — en jij werkt het uit tot een volledige, eerlijke strategische analyse. Wees kritisch en realistisch, geen hype: een idee met echte risico's krijgt een lage haalbaarheidsscore en dat is precies de bedoeling.

Geef ALLEEN een fenced \`\`\`json blok terug met exact dit schema:
{
  "title": "korte, scherpe titel (max ~8 woorden)",
  "overview": "2-4 zinnen: wat is het idee en voor wie",
  "domain": één van ${VALID_DOMAINS.join(", ")},
  "tags": ["3-6 korte trefwoorden, lowercase"],
  "feasibilityScore": 0-100,
  "feasibilityReasoning": "1-3 zinnen: waarom deze score, wat weegt mee",
  "timeline": "narratieve tijdlijn in 2-5 zinnen: realistische fasering in de tijd",
  "milestones": [{"title": "...", "due": "relatieve periode zoals 'Maand 1' of 'Week 2-4'", "done": false}],
  "financials": {
    "investmentNeeded": number of null,
    "revenueProjection": [{"period": "Maand 1", "amount": number}],
    "costs": [{"label": "...", "amount": number}],
    "breakEven": "beschrijving of periode, of null",
    "notes": "korte toelichting op de aannames, of null"
  },
  "risks": [{"risk": "...", "impact": "low"|"medium"|"high", "mitigation": "..."}],
  "opportunities": [{"opportunity": "...", "potential": "low"|"medium"|"high"}],
  "swot": {"strengths": ["..."], "weaknesses": ["..."], "opportunities": ["..."], "threats": ["..."]},
  "markdown": "de VOLLEDIGE uitwerking in Markdown — eigen # kop, alle secties hierboven leesbaar samengevat (overzicht, haalbaarheid, tijdlijn, mijlpalen, financiën, risico's, kansen, SWOT). Dit is het document dat blijvend wordt bewaard."
}

Regels:
- 4-8 milestones, 2-6 revenueProjection-punten, 2-6 costs, 2-5 risks, 2-5 opportunities, 2-5 items per SWOT-kwadrant.
- Bedragen zijn realistische schattingen in euro's — rond ze af, verzin geen valse precisie.
- Verzin geen concrete deadlines of bedragen die je niet kunt onderbouwen vanuit de input — als iets echt onbekend is, wees daar eerlijk over in de tekst (bv. "afhankelijk van...") in plaats van een willekeurig getal te noemen.
- Schrijf in het Nederlands, informeel en direct, zoals de rest van OSLIFE.
- Krijg je een blok "Context uit Ricks geheugen" mee, gebruik dat om scherper te zijn: signaleer overlap of raakvlak met een eerder vastgelegd idee/project/klant met naam, en laat bestaande patronen (wat al wel/niet werkte) meewegen in de haalbaarheidsscore en aannames. Gebruik die context nooit om iets te verzinnen dat er niet in staat — ontbreekt relevante context, val terug op de ruwe input alleen.`;

interface Milestone { title: string; due: string | null; done: boolean }
interface RevenuePoint { period: string; amount: number }
interface Cost { label: string; amount: number }
interface Financials {
  investmentNeeded: number | null;
  revenueProjection: RevenuePoint[];
  costs: Cost[];
  breakEven: string | null;
  notes: string | null;
}
interface Risk { risk: string; impact: string; mitigation: string | null }
interface Opportunity { opportunity: string; potential: string }
interface Swot { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] }

interface Elaboration {
  title: string;
  overview: string | null;
  domain: string;
  tags: string[];
  feasibilityScore: number | null;
  feasibilityReasoning: string | null;
  timeline: string | null;
  milestones: Milestone[];
  financials: Financials;
  risks: Risk[];
  opportunities: Opportunity[];
  swot: Swot;
  markdown: string;
}

function str(v: unknown, max = 2000): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
function strArr(v: unknown, cap: number, itemMax = 200): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim().slice(0, itemMax)).slice(0, cap) : [];
}
function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function impact(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  return VALID_IMPACT.includes(s) ? s : "medium";
}

function sanitizeMilestones(v: unknown): Milestone[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((m): Milestone | null => {
      if (!m || typeof m !== "object") return null;
      const title = str((m as Record<string, unknown>).title, 160);
      if (!title) return null;
      return { title, due: str((m as Record<string, unknown>).due, 60), done: false };
    })
    .filter((m): m is Milestone => m !== null)
    .slice(0, 12);
}

function sanitizeFinancials(v: unknown): Financials {
  const f = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const revenueProjection = Array.isArray(f.revenueProjection)
    ? f.revenueProjection
        .map((p): RevenuePoint | null => {
          if (!p || typeof p !== "object") return null;
          const period = str((p as Record<string, unknown>).period, 40);
          const amount = numOrNull((p as Record<string, unknown>).amount);
          return period && amount !== null ? { period, amount } : null;
        })
        .filter((p): p is RevenuePoint => p !== null)
        .slice(0, 12)
    : [];
  const costs = Array.isArray(f.costs)
    ? f.costs
        .map((c): Cost | null => {
          if (!c || typeof c !== "object") return null;
          const label = str((c as Record<string, unknown>).label, 80);
          const amount = numOrNull((c as Record<string, unknown>).amount);
          return label && amount !== null ? { label, amount } : null;
        })
        .filter((c): c is Cost => c !== null)
        .slice(0, 20)
    : [];
  return {
    investmentNeeded: numOrNull(f.investmentNeeded),
    revenueProjection,
    costs,
    breakEven: str(f.breakEven, 200),
    notes: str(f.notes, 500),
  };
}

function sanitizeRisks(v: unknown): Risk[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((r): Risk | null => {
      if (!r || typeof r !== "object") return null;
      const risk = str((r as Record<string, unknown>).risk, 300);
      if (!risk) return null;
      return { risk, impact: impact((r as Record<string, unknown>).impact), mitigation: str((r as Record<string, unknown>).mitigation, 300) };
    })
    .filter((r): r is Risk => r !== null)
    .slice(0, 10);
}

function sanitizeOpportunities(v: unknown): Opportunity[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((o): Opportunity | null => {
      if (!o || typeof o !== "object") return null;
      const opportunity = str((o as Record<string, unknown>).opportunity, 300);
      if (!opportunity) return null;
      return { opportunity, potential: impact((o as Record<string, unknown>).potential) };
    })
    .filter((o): o is Opportunity => o !== null)
    .slice(0, 10);
}

function sanitizeSwot(v: unknown): Swot {
  const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    strengths: strArr(s.strengths, 8),
    weaknesses: strArr(s.weaknesses, 8),
    opportunities: strArr(s.opportunities, 8),
    threats: strArr(s.threats, 8),
  };
}

// A slow memory/graph lookup must never hold up the elaboration by more than
// this — grounding degrades to "none" rather than delaying (or failing) the
// one thing Rick is actually waiting on.
const GROUNDING_TIMEOUT_MS = 6000;

function bounded<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), GROUNDING_TIMEOUT_MS)),
  ]);
}

interface MemoryHit { source: string; title: string; snippet: string }

/**
 * Best-effort recall so the elaboration is grounded in what's already known
 * instead of reasoning in a vacuum: hybrid full-text/vector search over
 * search_memory() (braindumps, past interactions, summaries — and other
 * business_ideas rows, so a near-duplicate idea gets flagged) via the
 * memory-search function (keeps the Voyage key server-side-only, same as
 * heyra/agents/memoryContext.ts's buildRecallSection on the frontend), plus a
 * knowledge-graph insight straight from cognee — reachable in-process here,
 * unlike the frontend which has to go through the cognee-search function.
 * Empty string on no signal or any failure; elaboration proceeds unchanged.
 */
async function buildGrounding(authHeader: string, query: string): Promise<string> {
  if (!query.trim()) return "";

  const [hits, graphInsight] = await Promise.all([
    bounded(
      fetch(`${SUPABASE_URL}/functions/v1/memory-search`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: authHeader },
        body: JSON.stringify({ query, limit: 6 }),
      })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []) as Promise<MemoryHit[]>,
      [] as MemoryHit[],
    ),
    bounded(cogneeInsight(query).catch(() => null), null as string | null),
  ]);

  const lines = (Array.isArray(hits) ? hits : []).map((h) => `- [${h.source}] ${h.title}: ${h.snippet}`);
  if (graphInsight) lines.push(`- [kennisgraaf] ${graphInsight}`);
  return lines.length ? `Context uit Ricks geheugen:\n${lines.join("\n")}` : "";
}

/** Ask Claude to elaborate the raw capture. Null on any failure. */
async function elaborate(apiKey: string, title: string, rawInput: string, source: string, grounding: string): Promise<Elaboration | null> {
  const prompt = `Bron: ${source === "voice" ? "voice note (getranscribeerd)" : "getypte tekst"}${title ? `\nWerktitel: ${title}` : ""}\n\nRuwe input:\n"""\n${rawInput}\n"""${grounding ? `\n\n${grounding}` : ""}`;

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: ELABORATE_SYSTEM, messages: [{ role: "user", content: prompt }] }),
    });
  } catch (e) {
    console.error(`idea-elaborate: fetch to Anthropic failed: ${String(e)}`);
    return null;
  }
  if (!res.ok) {
    console.error(`idea-elaborate: Anthropic API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return null;
  }
  let data: { content?: unknown; stop_reason?: string };
  try {
    data = await res.json();
  } catch (e) {
    console.error(`idea-elaborate: could not parse Anthropic response JSON: ${String(e)}`);
    return null;
  }
  const rawText = extractText(data.content);
  const parsed = parseJsonBlock(rawText);
  if (!parsed) {
    // stop_reason "max_tokens" means the model ran out of budget mid-JSON — the
    // most likely reason parseJsonBlock can't find a complete, valid object.
    console.error(`idea-elaborate: no valid JSON block in response (stop_reason=${data.stop_reason}): ${rawText.slice(0, 1000)}`);
    return null;
  }

  const markdown = str(parsed.markdown, 20000);
  if (!markdown) {
    console.error(`idea-elaborate: response had no usable "markdown" field: ${JSON.stringify(parsed).slice(0, 1000)}`);
    return null; // the one field we can't degrade without — no markdown, no elaboration
  }

  const domain = VALID_DOMAINS.includes(String(parsed.domain)) ? String(parsed.domain) : "cross";
  return {
    title: str(parsed.title, 160) ?? title,
    overview: str(parsed.overview, 600),
    domain,
    tags: strArr(parsed.tags, 8, 40),
    feasibilityScore: (() => {
      const n = numOrNull(parsed.feasibilityScore);
      return n === null ? null : Math.max(0, Math.min(100, Math.round(n)));
    })(),
    feasibilityReasoning: str(parsed.feasibilityReasoning, 500),
    timeline: str(parsed.timeline, 1000),
    milestones: sanitizeMilestones(parsed.milestones),
    financials: sanitizeFinancials(parsed.financials),
    risks: sanitizeRisks(parsed.risks),
    opportunities: sanitizeOpportunities(parsed.opportunities),
    swot: sanitizeSwot(parsed.swot),
    markdown,
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
    .select("id,title,raw_input,source,tier")
    .eq("id", entryId)
    .single();
  if (readErr || !row) return json({ error: "Entry not found" }, 404);

  const rawInput = (row.raw_input as string) ?? "";
  if (!rawInput.trim()) {
    await sb.from("business_ideas").update({ elaboration_status: "failed", error: "Geen input om uit te werken" }).eq("id", entryId);
    return json({ ok: false, status: "failed" });
  }

  await sb.from("business_ideas").update({ elaboration_status: "processing" }).eq("id", entryId);

  // Defense in depth: anything unexpected past this point (a thrown exception,
  // not just elaborate()'s own null-on-failure contract) must still flip the
  // row to `failed` — otherwise it's stuck at `processing` forever with no way
  // for the UI to know or offer a retry. Mirrors braindump-ingest's top-level
  // try/catch around its own processing block.
  try {
    const grounding = await buildGrounding(authHeader, [(row.title as string) ?? "", rawInput].filter(Boolean).join("\n"));
    const result = await elaborate(apiKey, (row.title as string) ?? "", rawInput, (row.source as string) ?? "text", grounding);
    if (!result) {
      await sb.from("business_ideas").update({ elaboration_status: "failed", error: "Kon het idee niet uitwerken — probeer het opnieuw" }).eq("id", entryId);
      return json({ ok: false, status: "failed" });
    }

    await sb.from("business_ideas").update({
      elaboration_status: "ready",
      title: result.title,
      overview: result.overview,
      domain: result.domain,
      tags: result.tags,
      feasibility_score: result.feasibilityScore,
      feasibility_reasoning: result.feasibilityReasoning,
      timeline: result.timeline,
      milestones: result.milestones,
      financials: result.financials,
      risks: result.risks,
      opportunities: result.opportunities,
      swot: result.swot,
      markdown: result.markdown,
      error: null,
    }).eq("id", entryId);

    // Fire-and-forget trio, same pattern + tier gate as braindump-ingest.
    fetch(`${SUPABASE_URL}/functions/v1/embed-memory`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authHeader },
      body: JSON.stringify({ source: "business_idea", id: entryId, text: [result.title, result.overview, result.markdown].filter(Boolean).join("\n") }),
    }).catch(() => {});

    if (row.tier !== "geheim") {
      fetch(`${SUPABASE_URL}/functions/v1/materialize-note`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: authHeader },
        body: JSON.stringify({
          source: "business_idea",
          id: entryId,
          frontmatter: { domain: result.domain, tags: result.tags, feasibility_score: result.feasibilityScore },
          body: result.markdown,
        }),
      }).catch(() => {});
      fetch(`${SUPABASE_URL}/functions/v1/cognee-remember`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: authHeader },
        body: JSON.stringify({ source: "business_idea", id: entryId, text: result.markdown }),
      }).catch(() => {});
    }

    return json({ ok: true, status: "ready" });
  } catch (err) {
    await sb.from("business_ideas").update({ elaboration_status: "failed", error: `Verwerking mislukt: ${String(err)}` }).eq("id", entryId);
    return json({ ok: false, status: "failed" });
  }
});
