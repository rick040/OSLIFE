/**
 * Supabase Edge Function: widget-summary
 * --------------------------------------
 * A tiny, read-only JSON endpoint that powers Android/Samsung home-screen
 * widgets (via KWGT — Kustom Widget Maker) without a native app. KWGT fetches a
 * plain URL and binds JSON fields to text, so this function returns a compact
 * summary of three areas — tasks/CRM, habits/goals and sleep/health — each with
 * both structured fields AND pre-formatted `line*` / `headline` strings you can
 * drop straight onto a widget with zero KWGT formula work.
 *
 * It never writes anything and only ever reads the single OSLIFE account's rows
 * (service-role client, scoped by OSLIFE_USER_ID) — so the worst a leaked token
 * can do is show someone your task count. Rotate WIDGET_TOKEN to revoke.
 *
 * Auth (fail-closed): a shared secret WIDGET_TOKEN, sent EITHER as
 *   Authorization: Bearer <token>        (if your client can set headers), OR
 *   ?token=<token>                       (KWGT's WebGet fetches a plain URL)
 * If WIDGET_TOKEN is unset the endpoint refuses every request (never open).
 *
 * Deploy:
 *   supabase functions deploy widget-summary --project-ref nhyunnnmdcmojvkxrbpl
 * Then in the Dashboard: Edge Functions -> widget-summary -> Settings ->
 * turn "Enforce JWT verification" OFF (KWGT cannot send a Supabase JWT), and add
 * the WIDGET_TOKEN secret. Full setup: integrations/kwgt/README.md
 *
 * Secrets required: WIDGET_TOKEN, OSLIFE_USER_ID (or legacy RICK_USER_ID).
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { amsterdamToday, daysBetween, fmtDateNL } from "../_shared/dates.ts";
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, bearerToken, jsonResponder } from "../_shared/http.ts";

const WIDGET_TOKEN = Deno.env.get("WIDGET_TOKEN") ?? "";

const json = jsonResponder();

// ── Small NL formatting helpers ─────────────────────────────────────────────

/** Thousands with a dot, the Dutch way: 8423 -> "8.423". */
function nlInt(n: number): string {
  return Math.round(n).toLocaleString("nl-NL");
}

/** One decimal with a comma: 78.4 -> "78,4". */
function nlDec(n: number, digits = 1): string {
  return n.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Minutes -> "7u 11m" (drops the hour part below 60m). */
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}u ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Human "when" label relative to today, in Dutch. */
function dueLabel(due: string, today: string): string {
  const d = daysBetween(today, due);
  if (d < 0) return `${-d}d te laat`;
  if (d === 0) return "vandaag";
  if (d === 1) return "morgen";
  if (d <= 7) return `over ${d} dagen`;
  return fmtDateNL(due);
}

// ── Tasks & CRM ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function buildTasks(sb: any, today: string) {
  const { data: taskRows } = await sb
    .from("project_tasks")
    .select("name,project_id,due_date,priority")
    .eq("user_id", USER_ID)
    .eq("done", false);
  const tasks = taskRows ?? [];

  // Resolve project names for whatever projects the open tasks belong to.
  const projectIds = [...new Set(tasks.map((t: any) => t.project_id).filter(Boolean))];
  const nameById = new Map<string, string>();
  if (projectIds.length) {
    const { data: projRows } = await sb.from("projects").select("id,name").eq("user_id", USER_ID).in("id", projectIds);
    for (const p of projRows ?? []) nameById.set(p.id as string, p.name as string);
  }

  const dueToday = tasks.filter((t: any) => t.due_date && daysBetween(today, t.due_date) === 0).length;
  const overdue = tasks.filter((t: any) => t.due_date && daysBetween(today, t.due_date) < 0).length;

  // Priority weight so High-priority tasks bubble up when due dates tie/absent.
  const prio = (p: string | null) => (p === "High" ? 0 : p === "Medium" ? 1 : p === "Low" ? 2 : 3);
  const top = [...tasks]
    .sort((a: any, b: any) => {
      // Dated tasks first, soonest (most overdue) first; then by priority.
      const ad = a.due_date ? daysBetween(today, a.due_date) : Infinity;
      const bd = b.due_date ? daysBetween(today, b.due_date) : Infinity;
      if (ad !== bd) return ad - bd;
      return prio(a.priority) - prio(b.priority);
    })
    .slice(0, 4)
    .map((t: any) => ({
      name: t.name as string,
      project: t.project_id ? nameById.get(t.project_id) ?? null : null,
      due: (t.due_date as string) ?? null,
      due_label: t.due_date ? dueLabel(t.due_date, today) : null,
      overdue: t.due_date ? daysBetween(today, t.due_date) < 0 : false,
      priority: (t.priority as string) ?? null,
    }));

  // Next milestone (not done) by earliest due date.
  const { data: msRows } = await sb
    .from("project_milestones")
    .select("title,due_date,progress")
    .eq("user_id", USER_ID)
    .eq("done", false)
    .not("due_date", "is", null)
    .order("due_date", { ascending: true })
    .limit(1);
  const ms = msRows?.[0];
  const nextMilestone = ms
    ? {
        title: ms.title as string,
        due_label: dueLabel(ms.due_date as string, today),
        progress_pct: Math.round((Number(ms.progress) || 0) * 100),
      }
    : null;

  const head = top[0];
  const headline = head
    ? `"${head.name}"${head.due_label ? ` — ${head.due_label}` : ""}${head.priority === "High" ? " (High)" : ""}`
    : "Geen open taken 🎉";

  return {
    open_count: tasks.length,
    due_today: dueToday,
    overdue,
    top,
    next_milestone: nextMilestone,
    line1: `${tasks.length} open · ${dueToday} vandaag · ${overdue} te laat`,
    headline,
  };
}

// ── Habits ──────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function buildHabits(sb: any, today: string) {
  const { data: habitRows } = await sb
    .from("habits")
    .select("id,name,icon")
    .eq("user_id", USER_ID)
    .eq("active", true)
    .order("order_idx");
  const habits = habitRows ?? [];
  if (!habits.length) {
    return { done_today: 0, total: 0, best_streak: 0, best_streak_name: null, open: [], line1: "Geen gewoontes", headline: "" };
  }

  // Load ~40 days of done-logs so we can compute current streaks in memory.
  const since = new Date(today + "T00:00:00");
  since.setDate(since.getDate() - 40);
  const sinceStr = since.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
  const { data: logRows } = await sb
    .from("habit_log")
    .select("habit_id,on_date")
    .eq("user_id", USER_ID)
    .gte("on_date", sinceStr)
    .eq("done", true);

  const byHabit = new Map<string, Set<string>>();
  for (const l of logRows ?? []) {
    const hid = l.habit_id as string;
    if (!byHabit.has(hid)) byHabit.set(hid, new Set());
    byHabit.get(hid)!.add(l.on_date as string);
  }

  /** Current streak: consecutive done-days ending today (inclusive). */
  const streakOf = (dates: Set<string>): number => {
    let streak = 0;
    const check = new Date(today + "T00:00:00");
    for (let i = 0; i < 40; i++) {
      const d = check.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
      if (dates.has(d)) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else break;
    }
    return streak;
  };

  let doneToday = 0;
  let bestStreak = 0;
  let bestName: string | null = null;
  const open: { name: string; icon: string; streak: number }[] = [];

  for (const h of habits as any[]) {
    const dates = byHabit.get(h.id as string) ?? new Set<string>();
    const streak = streakOf(dates);
    if (streak > bestStreak) {
      bestStreak = streak;
      bestName = h.name as string;
    }
    if (dates.has(today)) {
      doneToday++;
    } else {
      // Streak-at-risk = consecutive done ending YESTERDAY (see notify-tick).
      let prior = 0;
      const check = new Date(today + "T00:00:00");
      check.setDate(check.getDate() - 1);
      for (let i = 0; i < 40; i++) {
        const d = check.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
        if (dates.has(d)) {
          prior++;
          check.setDate(check.getDate() - 1);
        } else break;
      }
      open.push({ name: h.name as string, icon: (h.icon as string) ?? "✅", streak: prior });
    }
  }

  return {
    done_today: doneToday,
    total: habits.length,
    best_streak: bestStreak,
    best_streak_name: bestName,
    open: open.slice(0, 4),
    line1: `${doneToday}/${habits.length} vandaag`,
    headline: bestStreak > 0 ? `🔥 ${bestName} ${bestStreak}d` : "",
  };
}

// ── Goals ───────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function buildGoals(sb: any, today: string) {
  const { data: goalRows } = await sb
    .from("goals")
    .select("title,progress,due_on")
    .eq("user_id", USER_ID)
    .eq("status", "active");
  const goals = goalRows ?? [];
  if (!goals.length) return { active: 0, top: null, line1: "Geen actieve doelen" };

  // Pick the goal with the soonest due date; fall back to highest progress.
  const dated = goals.filter((g: any) => g.due_on).sort((a: any, b: any) => (a.due_on < b.due_on ? -1 : 1));
  const top = dated[0] ?? [...goals].sort((a: any, b: any) => (Number(b.progress) || 0) - (Number(a.progress) || 0))[0];
  const pct = Math.round((Number(top.progress) || 0) * 100);

  return {
    active: goals.length,
    top: {
      title: top.title as string,
      progress_pct: pct,
      due_label: top.due_on ? dueLabel(top.due_on as string, today) : null,
    },
    line1: `${top.title} · ${pct}%`,
  };
}

// ── Health (sleep / steps / weight) ─────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function buildHealth(sb: any) {
  const { data: sleepRows } = await sb
    .from("health_sleep")
    .select("date,light_min,deep_min,rem_min")
    .eq("user_id", USER_ID)
    .order("date", { ascending: false })
    .limit(1);
  const s = sleepRows?.[0];
  const sleepTotal = s ? (s.light_min || 0) + (s.deep_min || 0) + (s.rem_min || 0) : 0;
  const sleep = s
    ? { date: s.date as string, total_min: sleepTotal, label: fmtDuration(sleepTotal), deep_min: s.deep_min || 0, rem_min: s.rem_min || 0 }
    : null;

  const { data: statRows } = await sb
    .from("health_daily_stats")
    .select("date,steps")
    .eq("user_id", USER_ID)
    .order("date", { ascending: false })
    .limit(1);
  const steps = statRows?.[0]?.steps ?? null;

  const { data: bodyRows } = await sb
    .from("health_body_metrics")
    .select("weight_kg")
    .eq("user_id", USER_ID)
    .not("weight_kg", "is", null)
    .order("datetime", { ascending: false })
    .limit(1);
  const weight = bodyRows?.[0]?.weight_kg != null ? Number(bodyRows[0].weight_kg) : null;

  const parts: string[] = [];
  if (sleep) parts.push(`😴 ${sleep.label}`);
  if (steps != null) parts.push(`👣 ${nlInt(steps)}`);
  if (weight != null) parts.push(`⚖️ ${nlDec(weight)}kg`);

  return {
    sleep,
    steps,
    weight_kg: weight,
    line1: parts.length ? parts.join(" · ") : "Geen gezondheidsdata",
  };
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = bearerToken(req) || url.searchParams.get("token") || "";
  // Fail CLOSED: an unset secret must NOT leave this endpoint open.
  if (!WIDGET_TOKEN || token !== WIDGET_TOKEN) return json({ error: "Unauthorized" }, 401);

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const today = amsterdamToday();

    const [tasks, habits, goals, health] = await Promise.all([
      buildTasks(sb, today),
      buildHabits(sb, today),
      buildGoals(sb, today),
      buildHealth(sb),
    ]);

    return json({
      generated_at: new Date().toISOString(),
      date: today,
      tasks,
      habits,
      goals,
      health,
    });
  } catch (err) {
    return json({ error: `widget-summary failed: ${String(err)}` }, 500);
  }
});
