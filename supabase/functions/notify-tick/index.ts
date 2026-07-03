/**
 * Supabase Edge Function: notify-tick
 * ------------------------------------
 * The scheduled "brain" behind OSLIFE's proactive Telegram notifications.
 * Invoked every 5 minutes by a pg_cron job (see the one-time SQL in
 * docs/SECRETS.md) via net.http_post with a bearer CRON_SECRET — the same
 * shared-secret pattern notion-sync uses for its cron trigger.
 *
 * On every tick it:
 *   1. Loads notification_prefs for OSLIFE_USER_ID; does nothing if no
 *      Telegram chat is linked yet (no /start received).
 *   2. Checks the three daily time slots (morning briefing, evening
 *      check-in, habit reminders) against the current Europe/Amsterdam time.
 *      Each slot has a 15-minute catch window (3x the 5-minute tick cadence)
 *      so a late-firing cron never misses it — but the notification_log
 *      unique constraint (via claim()) is what actually prevents duplicate
 *      sends, not the window itself.
 *   3. Continuously scans for urgent conditions (payment due soon, thread
 *      overdue, project newly blocked) and sends+claims each one once,
 *      keyed by the underlying row's id.
 *
 * The morning briefing is a server-side port of src/derive.ts buildNudge():
 * oldest overdue open thread -> first blocked project -> next-due open
 * thread -> calm default. The correlation branch of buildNudge() is
 * intentionally NOT ported here — it depends on the full
 * computeCorrelations()/day-log pipeline in src/derive.ts, and duplicating
 * that would mean maintaining two diverging copies of a large, evolving
 * piece of client logic. This is a known, documented v1 simplification.
 *
 * Deploy:
 *   supabase functions deploy notify-tick --project-ref nhyunnnmdcmojvkxrbpl
 * Then in the Dashboard: Edge Functions -> notify-tick -> Settings ->
 * turn "Enforce JWT verification" OFF (pg_cron cannot send a Supabase JWT).
 *
 * Secrets required: CRON_SECRET, TELEGRAM_BOT_TOKEN, OSLIFE_USER_ID
 * (or legacy RICK_USER_ID). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
 * auto-injected.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMessage, type InlineKeyboard } from "../_shared/telegram.ts";
import { amsterdamToday, daysBetween, fmtDateNL, type Thread } from "../_shared/dates.ts";
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, bearerToken, jsonResponder } from "../_shared/http.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

const WINDOW_MIN = 15;

const json = jsonResponder();

// ── Europe/Amsterdam time helpers (shared ones live in ../_shared/dates.ts) ─

function amsterdamMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function withinWindow(hhmm: string, nowMinutes: number): boolean {
  const diff = nowMinutes - toMinutes(hhmm);
  return diff >= 0 && diff < WINDOW_MIN;
}

function inQuietHours(start: string | null, end: string | null, nowMinutes: number): boolean {
  if (!start || !end) return false;
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  if (s < e) return nowMinutes >= s && nowMinutes < e;
  return nowMinutes >= s || nowMinutes < e; // wraps past midnight
}

// ── Idempotency: an insert into notification_log IS the atomic claim ────────

// deno-lint-ignore no-explicit-any
async function claim(sb: any, kind: string, dedupKey: string): Promise<boolean> {
  const { error } = await sb.from("notification_log").insert({ user_id: USER_ID, kind, dedup_key: dedupKey });
  return !error;
}

// ── Morning briefing (server-side subset of src/derive.ts buildNudge()) ─────

// deno-lint-ignore no-explicit-any
async function buildMorningBriefing(sb: any, today: string): Promise<string> {
  const { data: brainRow } = await sb.from("brain_state").select("threads").eq("user_id", USER_ID).maybeSingle();
  const threads = ((brainRow?.threads as Thread[]) ?? []).filter((t) => t.status === "open");
  const { data: blockedProjects } = await sb.from("projects").select("name").eq("user_id", USER_ID).eq("status", "blocked");

  const overdue = threads
    .filter((t) => t.due && daysBetween(t.due, today) > 0)
    .sort((a, b) => daysBetween(b.due!, today) - daysBetween(a.due!, today))[0];

  let topLine: string;
  if (overdue) {
    topLine = `"${overdue.title}" is ${daysBetween(overdue.due!, today)} dag(en) over de deadline (${overdue.owedTo}). Sluit deze loop eerst.`;
  } else if (blockedProjects?.length) {
    topLine = `${blockedProjects.length} project(en) staan geblokkeerd, waaronder "${blockedProjects[0].name}". Eén bericht kan ze weer in beweging zetten.`;
  } else {
    const nextDue = threads
      .filter((t) => t.due)
      .sort((a, b) => daysBetween(today, a.due!) - daysBetween(today, b.due!))[0];
    topLine = nextDue
      ? `Eerstvolgende deadline: "${nextDue.title}" op ${fmtDateNL(nextDue.due)} (${nextDue.owedTo}).`
      : "Geen verlopen loops of harde deadlines vandaag. Goed moment voor diep werk.";
  }

  const list = threads
    .filter((t) => t.due)
    .sort((a, b) => daysBetween(today, a.due!) - daysBetween(today, b.due!))
    .slice(0, 5)
    .map((t) => {
      const dd = daysBetween(t.due!, today);
      const when = dd > 0 ? `${dd}d te laat` : `deadline ${fmtDateNL(t.due)}`;
      return `• "${t.title}" — ${when} (${t.owedTo})`;
    })
    .join("\n");

  const lines = ["🌅 Goedemorgen, Rick.", "", topLine];
  if (list) lines.push("", "Open loops vandaag:", list);
  return lines.join("\n");
}

// ── Evening check-in ──────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function hasCheckinToday(sb: any, today: string): Promise<boolean> {
  const { data } = await sb.from("daily_checkin").select("id").eq("user_id", USER_ID).eq("date", today).maybeSingle();
  return !!data;
}

// ── Habit reminders ───────────────────────────────────────────────────────

interface OpenHabit {
  id: string;
  name: string;
  icon: string;
  priorStreak: number;
}

/**
 * Habits not done today, with the streak that's at risk (consecutive days
 * done ending YESTERDAY, not today — src/lib/supabase.ts's fetchHabits()
 * streak always reads 0 for a habit not yet done today, since it walks back
 * starting from today itself. That's fine for an in-app "current streak"
 * display, but useless for a reminder whose whole point is "you have N days
 * on the line" — so this deliberately starts the walk-back one day earlier.
 */
// deno-lint-ignore no-explicit-any
async function openHabitsWithStreak(sb: any, today: string): Promise<OpenHabit[]> {
  const { data: habitRows } = await sb
    .from("habits")
    .select("id,name,icon")
    .eq("user_id", USER_ID)
    .eq("active", true)
    .order("order_idx");
  if (!habitRows?.length) return [];

  const since = new Date(today + "T00:00:00");
  since.setDate(since.getDate() - 30);
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

  const open: OpenHabit[] = [];
  // deno-lint-ignore no-explicit-any
  for (const h of habitRows as any[]) {
    const dates = byHabit.get(h.id as string) ?? new Set<string>();
    if (dates.has(today)) continue; // already done today

    let priorStreak = 0;
    const check = new Date(today + "T00:00:00");
    check.setDate(check.getDate() - 1);
    for (let i = 0; i < 30; i++) {
      const d = check.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
      if (dates.has(d)) {
        priorStreak++;
        check.setDate(check.getDate() - 1);
      } else break;
    }

    open.push({ id: h.id as string, name: h.name as string, icon: (h.icon as string) ?? "✅", priorStreak });
  }
  return open;
}

// ── Urgent alerts ─────────────────────────────────────────────────────────

interface UrgentAlert {
  kind: string;
  dedupKey: string;
  text: string;
}

// deno-lint-ignore no-explicit-any
async function urgentAlerts(sb: any, today: string): Promise<UrgentAlert[]> {
  const alerts: UrgentAlert[] = [];

  const { data: paymentRows } = await sb
    .from("payments")
    .select("id,payee,amount,due")
    .eq("user_id", USER_ID)
    .eq("status", "open")
    .eq("direction", "outgoing")
    .not("due", "is", null);
  for (const p of paymentRows ?? []) {
    const due = p.due as string;
    if (daysBetween(today, due) <= 3) {
      alerts.push({
        kind: "urgent_payment",
        dedupKey: p.id as string,
        text: `⚠️ Betaling nadert: ${p.payee} — €${p.amount} vervalt op ${fmtDateNL(due)}.`,
      });
    }
  }

  const { data: brainRow } = await sb.from("brain_state").select("threads").eq("user_id", USER_ID).maybeSingle();
  const threads = (brainRow?.threads as Thread[]) ?? [];
  for (const t of threads) {
    if (t.status === "open" && t.due && daysBetween(t.due, today) > 0) {
      alerts.push({
        kind: "urgent_thread",
        dedupKey: t.id,
        text: `⏰ "${t.title}" staat al ${daysBetween(t.due, today)} dag(en) open en is nog niet afgesloten (${t.owedTo}).`,
      });
    }
  }

  const { data: projectRows } = await sb
    .from("projects")
    .select("id,name")
    .eq("user_id", USER_ID)
    .eq("status", "blocked");
  for (const p of projectRows ?? []) {
    alerts.push({
      kind: "urgent_project_blocked",
      dedupKey: p.id as string,
      text: `🚧 Project "${p.name}" is geblokkeerd geraakt. Eén bericht kan 'm weer los trekken.`,
    });
  }

  // Overdue invoices — a sent invoice whose due date has passed. Flip it to
  // 'overdue' server-side (mirrors the client-side reconcile) and nudge once.
  const { data: invoiceRows } = await sb
    .from("project_invoices")
    .select("id,number,amount,due_on")
    .eq("user_id", USER_ID)
    .eq("status", "sent")
    .not("due_on", "is", null)
    .lt("due_on", today);
  for (const inv of invoiceRows ?? []) {
    await sb.from("project_invoices").update({ status: "overdue" }).eq("id", inv.id);
    const label = (inv.number as string) ? `Factuur ${inv.number}` : "Een factuur";
    alerts.push({
      kind: "urgent_invoice_overdue",
      dedupKey: inv.id as string,
      text: `⚠️ ${label} (€${inv.amount}) is te laat — verviel ${fmtDateNL(inv.due_on as string)}.`,
    });
  }

  // Follow-up due — a client past its follow-up cycle (last contact + cycle).
  // Keyed by the due date so it nudges once per missed cycle, not every tick.
  const { data: clientRows } = await sb
    .from("clients")
    .select("id,name,last_contacted_at,follow_up_cycle_days")
    .eq("user_id", USER_ID)
    .not("last_contacted_at", "is", null);
  for (const c of clientRows ?? []) {
    const cycle = (c.follow_up_cycle_days as number) ?? 30;
    const due = new Date((c.last_contacted_at as string).slice(0, 10) + "T00:00:00");
    due.setDate(due.getDate() + cycle);
    const dueStr = due.toISOString().slice(0, 10);
    if (dueStr < today) {
      const daysSince = daysBetween((c.last_contacted_at as string).slice(0, 10), today);
      alerts.push({
        kind: "urgent_followup",
        dedupKey: `${c.id}:${dueStr}`,
        text: `📇 Tijd om ${c.name} op te volgen — al ${daysSince} dag(en) geen contact.`,
      });
    }
  }

  return alerts;
}

// ── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const auth = bearerToken(req);
  if (CRON_SECRET && auth !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);
  if (!BOT_TOKEN) return json({ error: "TELEGRAM_BOT_TOKEN secret is not set" }, 503);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: prefs } = await sb.from("notification_prefs").select("*").eq("user_id", USER_ID).maybeSingle();
  if (!prefs?.telegram_chat_id) return json({ ok: true, skipped: "not linked" });

  const chatId = prefs.telegram_chat_id as number;
  const today = amsterdamToday();
  const nowMinutes = amsterdamMinutes();
  const sent: string[] = [];

  try {
    if (prefs.morning_briefing && withinWindow(prefs.morning_time, nowMinutes) && (await claim(sb, "morning", today))) {
      await sendMessage(BOT_TOKEN, chatId, await buildMorningBriefing(sb, today));
      sent.push("morning");
    }

    if (prefs.evening_checkin && withinWindow(prefs.evening_time, nowMinutes) && (await claim(sb, "evening_checkin", today))) {
      if (!(await hasCheckinToday(sb, today))) {
        const keyboard: InlineKeyboard = [[1, 2, 3, 4, 5].map((n) => ({ text: String(n), callback_data: `ci_e:${n}` }))];
        await sendMessage(BOT_TOKEN, chatId, "🌙 Hoe ging vandaag? Kies je energie (1-5):", keyboard);
      }
      sent.push("evening_checkin");
    }

    if (prefs.habit_reminders && withinWindow(prefs.habit_time, nowMinutes) && (await claim(sb, "habit_reminder", today))) {
      const open = await openHabitsWithStreak(sb, today);
      if (open.length) {
        const keyboard: InlineKeyboard = open.map((h) => [
          {
            text: `${h.icon} ${h.name}${h.priorStreak > 0 ? ` (🔥${h.priorStreak}d op het spel)` : ""}`,
            callback_data: `hb_done:${h.id}`,
          },
        ]);
        await sendMessage(BOT_TOKEN, chatId, "🔁 Nog openstaande gewoontes vandaag:", keyboard);
      }
      sent.push("habit_reminder");
    }

    if (prefs.urgent_alerts && !inQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end, nowMinutes)) {
      for (const a of await urgentAlerts(sb, today)) {
        if (await claim(sb, a.kind, a.dedupKey)) {
          await sendMessage(BOT_TOKEN, chatId, a.text);
          sent.push(`${a.kind}:${a.dedupKey}`);
        }
      }
    }

    return json({ ok: true, sent });
  } catch (err) {
    return json({ error: `notify-tick failed: ${String(err)}` }, 500);
  }
});
