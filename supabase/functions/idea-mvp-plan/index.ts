/**
 * Supabase Edge Function: idea-mvp-plan
 * ----------------------------------------
 * The second, opt-in pipeline for Strategie HQ's business ideas — where
 * idea-elaborate answers "is this idea any good on paper", this answers "how
 * do I find out if anyone actually wants it before I build anything". Given a
 * business_ideas row id, asks Claude for a lean-startup validation plan: the
 * cheapest, lowest-effort experiments that would surface real customer
 * interest, a phased roadmap, and concrete signals to watch for — biased
 * explicitly against blind cold-email blasts (low reply rate, easy to ignore)
 * in favour of higher-signal, still-cheap alternatives.
 *
 * Unlike idea-elaborate this never runs automatically — Rick presses "Genereer
 * MVP Launch Plan" per idea, deliberately, once he wants to test it. Same
 * resilience contract otherwise: JWT-scoped client (RLS does the rest),
 * best-effort (a failure flips the row to `failed` with a message rather than
 * throwing), no fire-and-forget follow-ups (this isn't a "keep forever"
 * document the way the elaboration markdown is).
 *
 *   request:  { "entryId": "<uuid>" }
 *   response: { "ok": true, "status": "ready" } | { "ok": false, "status": "failed" }
 *
 * Deploy:
 *   supabase functions deploy idea-mvp-plan --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: ANTHROPIC_API_KEY (required).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ANTHROPIC_API, MODEL, anthropicHeaders, extractText, parseJsonBlock } from "../_shared/anthropic.ts";
import { CORS, SUPABASE_URL, corsPreflight, jsonResponder } from "../_shared/http.ts";

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const VALID_IMPACT = ["low", "medium", "high"];

const json = jsonResponder(CORS);

const MVP_PLAN_SYSTEM = `Je bent de lean-startup coach van OSLIFE (Strategie HQ). Rick heeft een business-idee al laten uitwerken tot een strategische analyse; nu wil hij weten of er echt vraag naar is voordat hij ook maar iets bouwt. Hij wil MINIMALE inspanning en MINIMALE kosten, en heeft eerder simpelweg koude e-mails gestuurd — die worden bijna nooit beantwoord. Dat is precies wat je moet oplossen: geen "stuur een mailtje en wacht af", maar een plan met de goedkoopste experimenten die daadwerkelijk een signaal geven of mensen dit zouden gebruiken/kopen, vóórdat er één regel code of product gemaakt wordt.

Belangrijke uitgangspunten:
- Wees kritisch op koude e-mail als enige of primaire validatiemethode: response rates zijn doorgaans laag (vaak enkele procenten), zeker zonder warme relatie. Als e-mail toch zinvol is, geef dan concreet aan hoe het beter kan (kleine specifieke vraag, warme intro, persoonlijke aanpak, follow-up-cadans) — nooit een generieke blast.
- Geef de voorkeur aan kanalen met een hoger signaal-op-kosten: 1-op-1 gesprekken met potentiële klanten, een simpele landingspagina met een concrete call-to-action (wachtlijst, vooraf betalen, intake plannen), posten in een community/forum waar de doelgroep al zit, een "concierge"-test (het probleem handmatig oplossen voor een paar mensen), een korte poll/enquête bij bestaand netwerk, of een kleine advertentietest als filter.
- Elk experiment moet een duidelijk, falsifieerbaar signaal opleveren (bv. "3 van de 10 zeggen ja én zijn bereid een aanbetaling te doen") — geen vage vanity-metrics zoals "aantal weergaven".
- Alles moet passen binnen een paar dagen tot een paar weken, met een budget van een paar tientjes tot maximaal enkele honderden euro's — dit is validatie, geen lancering.
- Schrijf in het Nederlands, informeel en direct, zoals de rest van OSLIFE. Wees eerlijk: als het idee zich slecht leent voor snelle validatie, zeg dat gewoon.

Geef ALLEEN een fenced \`\`\`json blok terug met exact dit schema:
{
  "hypothesis": "de kernaanname die dit plan test, als één zin: 'Als we X aanbieden aan Y, dan Z'",
  "riskiestAssumption": "de aanname die het meeste risico draagt als hij fout blijkt — dit is waar het plan zich op moet richten",
  "targetCustomer": "wie precies is de eerste doelgroep om te testen (zo specifiek mogelijk, geen brede categorie)",
  "channels": [{"name": "...", "why": "waarom dit kanaal beter werkt dan een koude e-mail voor dit specifieke idee", "effort": "low"|"medium"|"high", "cost": "bv. '€0' of '~€20 advertentiebudget'"}],
  "experiments": [{"title": "...", "description": "concrete stappen, uitvoerbaar in dagen", "channel": "welk kanaal hierboven", "effort": "low"|"medium"|"high", "cost": "...", "timeframe": "bv. '2-3 dagen'", "successSignal": "concreet, falsifieerbaar signaal van echte interesse"}],
  "roadmap": [{"phase": "bv. 'Week 1: doelgroep bevestigen'", "goal": "wat deze fase moet aantonen", "tasks": [{"title": "...", "done": false}]}],
  "signalsToWatch": ["concrete metrics/signalen om bij te houden tijdens het valideren"],
  "emailCaveat": "1-3 zinnen specifiek over waarom koude e-mail alleen meestal niet volstaat voor dít idee, en wat te doen in plaats daarvan of ernaast"
}

Regels:
- 3-5 channels, 3-6 experiments, 2-4 roadmap-fases met elk 2-6 tasks, 3-6 signalsToWatch.
- Bouw voort op de eerdere analyse (overzicht, doelgroep, risico's) als die is meegegeven — verzin niets dat daarmee in tegenspraak is.
- Verzin geen concrete deadlines of bedragen die je niet kunt onderbouwen — bij twijfel, geef een range of wees expliciet dat het een grove schatting is.`;

interface MvpChannel { name: string; why: string; effort: string; cost: string }
interface MvpExperiment { title: string; description: string; channel: string; effort: string; cost: string; timeframe: string; successSignal: string }
interface MvpRoadmapTask { title: string; done: boolean }
interface MvpRoadmapPhase { phase: string; goal: string; tasks: MvpRoadmapTask[] }
interface MvpPlan {
  hypothesis: string;
  riskiestAssumption: string;
  targetCustomer: string;
  channels: MvpChannel[];
  experiments: MvpExperiment[];
  roadmap: MvpRoadmapPhase[];
  signalsToWatch: string[];
  emailCaveat: string;
}

function str(v: unknown, max = 2000): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
function strArr(v: unknown, cap: number, itemMax = 300): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim().slice(0, itemMax)).slice(0, cap) : [];
}
function impact(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  return VALID_IMPACT.includes(s) ? s : "medium";
}

function sanitizeChannels(v: unknown): MvpChannel[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c): MvpChannel | null => {
      if (!c || typeof c !== "object") return null;
      const name = str((c as Record<string, unknown>).name, 120);
      if (!name) return null;
      return {
        name,
        why: str((c as Record<string, unknown>).why, 300) ?? "",
        effort: impact((c as Record<string, unknown>).effort),
        cost: str((c as Record<string, unknown>).cost, 80) ?? "onbekend",
      };
    })
    .filter((c): c is MvpChannel => c !== null)
    .slice(0, 8);
}

function sanitizeExperiments(v: unknown): MvpExperiment[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e): MvpExperiment | null => {
      if (!e || typeof e !== "object") return null;
      const r = e as Record<string, unknown>;
      const title = str(r.title, 160);
      if (!title) return null;
      return {
        title,
        description: str(r.description, 600) ?? "",
        channel: str(r.channel, 120) ?? "",
        effort: impact(r.effort),
        cost: str(r.cost, 80) ?? "onbekend",
        timeframe: str(r.timeframe, 60) ?? "",
        successSignal: str(r.successSignal, 300) ?? "",
      };
    })
    .filter((e): e is MvpExperiment => e !== null)
    .slice(0, 10);
}

function sanitizeRoadmap(v: unknown): MvpRoadmapPhase[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((p): MvpRoadmapPhase | null => {
      if (!p || typeof p !== "object") return null;
      const r = p as Record<string, unknown>;
      const phase = str(r.phase, 100);
      if (!phase) return null;
      const tasks = Array.isArray(r.tasks)
        ? r.tasks
            .map((t): MvpRoadmapTask | null => {
              if (!t || typeof t !== "object") return null;
              const title = str((t as Record<string, unknown>).title, 200);
              return title ? { title, done: false } : null;
            })
            .filter((t): t is MvpRoadmapTask => t !== null)
            .slice(0, 10)
        : [];
      return { phase, goal: str(r.goal, 300) ?? "", tasks };
    })
    .filter((p): p is MvpRoadmapPhase => p !== null)
    .slice(0, 6);
}

/** Ask Claude for a validation plan grounded in the idea's existing analysis. Null on any failure. */
async function planMvp(apiKey: string, context: string): Promise<MvpPlan | null> {
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: MVP_PLAN_SYSTEM, messages: [{ role: "user", content: context }] }),
    });
  } catch (e) {
    console.error(`idea-mvp-plan: fetch to Anthropic failed: ${String(e)}`);
    return null;
  }
  if (!res.ok) {
    console.error(`idea-mvp-plan: Anthropic API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return null;
  }
  let data: { content?: unknown; stop_reason?: string };
  try {
    data = await res.json();
  } catch (e) {
    console.error(`idea-mvp-plan: could not parse Anthropic response JSON: ${String(e)}`);
    return null;
  }
  const rawText = extractText(data.content);
  const parsed = parseJsonBlock(rawText);
  if (!parsed) {
    console.error(`idea-mvp-plan: no valid JSON block in response (stop_reason=${data.stop_reason}): ${rawText.slice(0, 1000)}`);
    return null;
  }

  const hypothesis = str(parsed.hypothesis, 400);
  if (!hypothesis) {
    console.error(`idea-mvp-plan: response had no usable "hypothesis" field: ${JSON.stringify(parsed).slice(0, 1000)}`);
    return null;
  }

  return {
    hypothesis,
    riskiestAssumption: str(parsed.riskiestAssumption, 400) ?? "",
    targetCustomer: str(parsed.targetCustomer, 400) ?? "",
    channels: sanitizeChannels(parsed.channels),
    experiments: sanitizeExperiments(parsed.experiments),
    roadmap: sanitizeRoadmap(parsed.roadmap),
    signalsToWatch: strArr(parsed.signalsToWatch, 8),
    emailCaveat: str(parsed.emailCaveat, 600) ?? "",
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

  await sb.from("business_ideas").update({ mvp_plan_status: "processing", mvp_plan_error: null }).eq("id", entryId);

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

    const result = await planMvp(apiKey, context);
    if (!result) {
      await sb.from("business_ideas").update({ mvp_plan_status: "failed", mvp_plan_error: "Kon geen MVP launch plan opstellen — probeer het opnieuw" }).eq("id", entryId);
      return json({ ok: false, status: "failed" });
    }

    await sb.from("business_ideas").update({
      mvp_plan_status: "ready",
      mvp_plan: result,
      mvp_plan_error: null,
    }).eq("id", entryId);

    return json({ ok: true, status: "ready" });
  } catch (err) {
    await sb.from("business_ideas").update({ mvp_plan_status: "failed", mvp_plan_error: `Verwerking mislukt: ${String(err)}` }).eq("id", entryId);
    return json({ ok: false, status: "failed" });
  }
});
