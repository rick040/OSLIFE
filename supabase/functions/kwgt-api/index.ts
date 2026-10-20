/**
 * Supabase Edge Function: kwgt-api
 * ---------------------------------
 * Backend for the 5 premium KWGT (Kustom Widget) home-screen widgets — see
 * integrations/kwgt/README.md and integrations/kwgt/presets/*.kwgt. Same
 * single-phone/single-device convention as widget-summary/screentime-app-ingest:
 * GET everywhere (KWGT's network engine and its "Open URL" touch action are
 * both GET-only), shared secret via header or query param, service role,
 * scoped to the one OSLIFE account.
 *
 *   GET  ?w=todos                       → open tasks (todo-list widget)
 *   GET  ?w=focus                       → "Belangrijkste vandaag" shortlist
 *   GET  ?w=projects                    → active projects
 *   GET  ?w=braindump-count             → today's Braindump capture count (read-only badge)
 *   GET  ?w=braindump&text=...          → quick-capture into Braindump
 *   GET  ?w=heyra&msg=...               → one-shot HEYRA reply (chat/voice widget)
 *   GET  ?w=task-toggle&id=...          → flip a task open/closed, returns fresh ?w=todos
 *   secret: `x-widget-secret` header or `?secret=` query param.
 *
 * Deploy:
 *   supabase functions deploy kwgt-api --project-ref nhyunnnmdcmojvkxrbpl
 *   supabase secrets set KWGT_WIDGETS_SECRET=<random 32+ char secret> --project-ref nhyunnnmdcmojvkxrbpl
 *   (falls back to WIDGET_SUMMARY_SECRET, then WALLET_WEBHOOK_SECRET if unset —
 *   same convention as the other single-phone endpoints; reuse an existing
 *   secret if you already have one instead of minting a new one.)
 *   Optional for the HEYRA widget: ANTHROPIC_API_KEY must be set (shared with
 *   braindump-ingest/heyra-brain).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from "../_shared/http.ts";
import { amsterdamToday, daysBetween } from "../_shared/dates.ts";
import { ANTHROPIC_API, MODEL, anthropicHeaders, extractText } from "../_shared/anthropic.ts";

const WEBHOOK_SECRET = Deno.env.get("KWGT_WIDGETS_SECRET") ??
  Deno.env.get("WIDGET_SUMMARY_SECRET") ??
  Deno.env.get("WALLET_WEBHOOK_SECRET") ??
  "";

const json = jsonResponder();

// deno-lint-ignore no-explicit-any
type Sb = any;

interface TaskRow {
  id: string;
  title: string;
  domain: string;
  due: string | null;
  priority: string | null;
  status: string;
  focus_date: string | null;
}

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function rankTask(t: TaskRow, today: string): number {
  const overdue = t.due ? daysBetween(t.due, today) > 0 : false;
  const prio = PRIORITY_RANK[t.priority ?? ""] ?? 3;
  return (overdue ? -100 : 0) + prio;
}

function shapeTask(t: TaskRow, today: string) {
  return {
    id: t.id,
    title: t.title,
    domain: t.domain,
    due: t.due,
    overdue: t.due ? daysBetween(t.due, today) > 0 : false,
    priority: t.priority ?? "Medium",
    pinned: !!t.focus_date && t.focus_date === today,
  };
}

/** Open tasks, sorted overdue-first then by priority then by due date. Shared by ?w=todos and ?w=task-toggle. */
async function fetchTodos(sb: Sb, limit: number) {
  const today = amsterdamToday();
  const { data, error } = await sb
    .from("tasks")
    .select("id,title,domain,due,priority,status,focus_date")
    .eq("user_id", USER_ID)
    .eq("status", "open");
  if (error) return { ok: false as const, error: error.message };
  const rows = (data ?? []) as TaskRow[];
  rows.sort((a, b) => {
    const r = rankTask(a, today) - rankTask(b, today);
    if (r !== 0) return r;
    return (a.due ?? "9999-99-99").localeCompare(b.due ?? "9999-99-99");
  });
  return {
    ok: true as const,
    asOf: new Date().toISOString(),
    count: rows.length,
    items: rows.slice(0, limit).map((t) => shapeTask(t, today)),
  };
}

/** "Belangrijkste vandaag": today's focus_date pins, falling back to the top-ranked open tasks when nothing is pinned. */
async function fetchFocus(sb: Sb) {
  const today = amsterdamToday();
  const { data, error } = await sb
    .from("tasks")
    .select("id,title,domain,due,priority,status,focus_date")
    .eq("user_id", USER_ID)
    .eq("status", "open");
  if (error) return { ok: false as const, error: error.message };
  const rows = (data ?? []) as TaskRow[];
  const pinned = rows.filter((t) => t.focus_date === today);
  const source = pinned.length ? pinned : [...rows].sort((a, b) => rankTask(a, today) - rankTask(b, today)).slice(0, 3);
  return {
    ok: true as const,
    asOf: new Date().toISOString(),
    isPinned: pinned.length > 0,
    count: source.length,
    items: source.map((t) => shapeTask(t, today)),
  };
}

interface ProjectRow {
  id: string;
  name: string;
  client: string | null;
  domain: string | null;
  status: string;
  deadline: string | null;
  progress: number | null;
}

async function fetchProjects(sb: Sb, limit: number) {
  const today = amsterdamToday();
  const { data, error } = await sb
    .from("projects")
    .select("id,name,client,domain,status,deadline,progress")
    .eq("user_id", USER_ID)
    .eq("status", "active")
    .order("deadline", { ascending: true, nullsFirst: false });
  if (error) return { ok: false as const, error: error.message };
  const rows = (data ?? []) as ProjectRow[];
  return {
    ok: true as const,
    asOf: new Date().toISOString(),
    count: rows.length,
    items: rows.slice(0, limit).map((p) => ({
      id: p.id,
      name: p.name,
      client: p.client ?? "",
      domain: p.domain ?? "personal",
      progressPct: Math.round((p.progress ?? 0) * 100),
      deadline: p.deadline,
      daysLeft: p.deadline ? daysBetween(today, p.deadline) : null,
      overdue: p.deadline ? daysBetween(today, p.deadline) < 0 : false,
    })),
  };
}

/** Read-only count of today's Braindump captures — powers the quick-add widget's live badge. */
async function fetchBraindumpCountToday(sb: Sb) {
  const today = amsterdamToday();
  const { count, error } = await sb
    .from("braindump_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", USER_ID)
    .gte("created_at", `${today}T00:00:00.000Z`);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, asOf: new Date().toISOString(), count: count ?? 0 };
}

/** Quick-capture into Braindump — same pipeline as telegram-webhook's plain-text path. */
async function captureBraindump(sb: Sb, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false as const, error: "text is required" };
  const { data, error } = await sb
    .from("braindump_entries")
    .insert({ user_id: USER_ID, source_kind: "text", status: "pending", meta: { rawText: trimmed, source: "kwgt" } })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "insert failed" };
  fetch(`${SUPABASE_URL}/functions/v1/braindump-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    body: JSON.stringify({ entryId: data.id }),
  }).catch(() => {});
  return { ok: true as const, status: "captured" as const, preview: trimmed.slice(0, 80) };
}

const HEYRA_SYSTEM = `Je bent HEYRA, de persoonlijke AI-assistent in OSLIFE. Je antwoordt hier vanuit een klein KWGT-widget op het beginscherm — dus kort, direct en bruikbaar (max 2-3 zinnen, geen opsommingen tenzij echt nodig). Beantwoord de vraag met de context hieronder; als iets niet in de context staat, zeg dat eerlijk in plaats van te verzinnen.`;

/** One-shot HEYRA reply for the chat/voice widget — no multi-turn memory, but grounded in today's snapshot. */
async function heyraReply(sb: Sb, message: string) {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false as const, error: "msg is required" };
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false as const, error: "ANTHROPIC_API_KEY not configured" };

  const today = amsterdamToday();
  const [focus, projects, blocks] = await Promise.all([
    fetchFocus(sb),
    fetchProjects(sb, 5),
    sb.from("day_blocks").select("title,start_time").eq("user_id", USER_ID).eq("date", today).order("start_time"),
  ]);
  const context = [
    `Datum: ${today}`,
    focus.ok ? `Belangrijkste taken vandaag: ${focus.items.map((t: { title: string }) => t.title).join(", ") || "geen"}` : "",
    projects.ok ? `Actieve projecten: ${projects.items.map((p: { name: string }) => p.name).join(", ") || "geen"}` : "",
    blocks.data?.length
      ? `Agenda: ${blocks.data.map((b: { start_time: string | null; title: string }) => `${(b.start_time ?? "").slice(0, 5)} ${b.title}`).join(", ")}`
      : "",
  ].filter(Boolean).join("\n");

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: `${HEYRA_SYSTEM}\n\nContext:\n${context}`,
        messages: [{ role: "user", content: trimmed }],
      }),
    });
  } catch (err) {
    return { ok: false as const, error: `HEYRA onbereikbaar: ${String(err)}` };
  }
  if (!res.ok) return { ok: false as const, error: `HEYRA-fout (${res.status})` };
  const data = await res.json();
  const reply = extractText(data.content) || "Geen antwoord ontvangen.";
  return { ok: true as const, asOf: new Date().toISOString(), reply };
}

async function toggleTask(sb: Sb, id: string) {
  if (!id) return { ok: false as const, error: "id is required" };
  const { data: row, error: readErr } = await sb
    .from("tasks")
    .select("id,status")
    .eq("user_id", USER_ID)
    .eq("id", id)
    .maybeSingle();
  if (readErr || !row) return { ok: false as const, error: "task not found" };
  const nextStatus = row.status === "open" ? "closed" : "open";
  const { error: updErr } = await sb
    .from("tasks")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", USER_ID);
  if (updErr) return { ok: false as const, error: updErr.message };
  return await fetchTodos(sb, 8);
}

const LIMITS: Record<string, number> = { todos: 8, projects: 6 };

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const secret = req.headers.get("x-widget-secret") ?? url.searchParams.get("secret") ?? "";
  // Fail CLOSED: an unset secret must not leave this service-role endpoint open.
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) return json({ ok: false, error: "Unauthorized" }, 401);

  const widget = url.searchParams.get("w") ?? "";
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  switch (widget) {
    case "todos":
      return json(await fetchTodos(sb, LIMITS.todos));
    case "focus":
      return json(await fetchFocus(sb));
    case "projects":
      return json(await fetchProjects(sb, LIMITS.projects));
    case "braindump-count":
      return json(await fetchBraindumpCountToday(sb));
    case "braindump":
      return json(await captureBraindump(sb, url.searchParams.get("text") ?? ""));
    case "heyra":
      return json(await heyraReply(sb, url.searchParams.get("msg") ?? ""));
    case "task-toggle":
      return json(await toggleTask(sb, url.searchParams.get("id") ?? ""));
    default:
      return json({ ok: false, error: "Unknown widget — use ?w=todos|focus|projects|braindump-count|braindump|heyra|task-toggle" }, 400);
  }
});
