/**
 * Supabase Edge Function: notify-tick
 * ------------------------------------
 * The scheduled "brain" behind OSLIFE's proactive Telegram notifications.
 * Invoked every 5 minutes by a pg_cron job (see the one-time SQL in
 * docs/SECRETS.md) via net.http_post with a bearer CRON_SECRET.
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
 *   4. Checks every active `medications` row's `reminder_times` against the
 *      current time (PM-072 Fase 2) — no native Android app exists to use
 *      AlarmManager, so medication reminders reuse this same Telegram channel,
 *      claimed per medication+time+day just like the fixed daily slots.
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
  if (!error) return true;
  // Only a unique-constraint violation means "already sent" → skip. Any other
  // error is transient; throw so the tick 500s and the cron retries, rather than
  // silently dropping the notification (the old `return !error` swallowed it).
  if ((error as { code?: string }).code === "23505") return false;
  throw new Error(`claim(${kind}) failed: ${error.message}`);
}

/** Release a claim so the next tick can retry it (used when a send is rejected). */
// deno-lint-ignore no-explicit-any
async function unclaim(sb: any, kind: string, dedupKey: string): Promise<void> {
  await sb.from("notification_log").delete()
    .eq("user_id", USER_ID).eq("kind", kind).eq("dedup_key", dedupKey);
}

/**
 * Send a message for an already-claimed notification. Telegram's sendMessage
 * never throws — it returns { ok:false } on 429/5xx — so a bare send after a
 * claim would silently drop the notification forever (the claim row blocks any
 * retry). On rejection we release the claim and throw, so the tick 500s and the
 * cron retries the drop on the next run instead of losing it permanently.
 */
// deno-lint-ignore no-explicit-any
async function sendClaimed(
  sb: any, kind: string, dedupKey: string,
  token: string, chatId: number, text: string, keyboard?: InlineKeyboard,
): Promise<void> {
  const { ok } = await sendMessage(token, chatId, text, keyboard);
  if (!ok) {
    await unclaim(sb, kind, dedupKey);
    throw new Error(`sendMessage(${kind}) rejected by Telegram`);
  }
}

/** Flip sent invoices whose due date has passed to 'overdue'. Runs every tick,
 *  independent of notification prefs, so status reconciliation is never coupled
 *  to whether urgent alerts are on or whether it's quiet hours. */
// deno-lint-ignore no-explicit-any
async function reconcileOverdueInvoices(sb: any, today: string): Promise<void> {
  await sb.from("project_invoices")
    .update({ status: "overdue" })
    .eq("user_id", USER_ID)
    .eq("status", "sent")
    .not("due_on", "is", null)
    .lt("due_on", today);
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
    topLine = `${daysBetween(overdue.due!, today)}d te laat — "${overdue.title}" (${overdue.owedTo})`;
  } else if (blockedProjects?.length) {
    topLine = `${blockedProjects.length} project(en) geblokkeerd — o.a. "${blockedProjects[0].name}"`;
  } else {
    const nextDue = threads
      .filter((t) => t.due)
      .sort((a, b) => daysBetween(today, a.due!) - daysBetween(today, b.due!))[0];
    topLine = nextDue
      ? `${fmtDateNL(nextDue.due)} — "${nextDue.title}" (${nextDue.owedTo})`
      : "Geen verlopen loops of harde deadlines vandaag.";
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

// ── Inference digest (PM-201 Slice 1) ──────────────────────────────────────
// Pending inferences (events.status='inferred') routed to the evening digest.
// Each gets a ✅/❌ pair; telegram-webhook's infer: branch resolves the tap via
// confirm_inference. Batched so low-confidence guesses never interrupt the day.

interface PendingInference {
  id: string;
  question: string;
}

// deno-lint-ignore no-explicit-any
async function pendingInferences(sb: any): Promise<PendingInference[]> {
  const { data } = await sb
    .from("events")
    .select("id,payload")
    .eq("user_id", USER_ID)
    .eq("status", "inferred")
    .order("occurred_at", { ascending: false })
    .limit(6);
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[])
    // 'immediate' rides urgentAlerts() instead; 'app_only' (PM-072 Fase 2 —
    // health_condition_promotion) opens a wizard that only exists in the app,
    // so confirming it via a Telegram tap would leave the dossier permanently
    // half-filled — it must only ever surface as the in-app splashscreen.
    .filter((r) => !["immediate", "app_only"].includes(r.payload?.confirm_channel ?? "digest"))
    .map((r) => ({ id: r.id as string, question: (r.payload?.question as string) ?? "Bevestig deze afleiding?" }));
}

// ── Medication reminders (PM-072 Fase 2) ─────────────────────────────────────
// No native Android app exists (see the plan doc's audit) so AlarmManager
// isn't available — reminders route through the same Telegram channel as
// everything else here. Each active medication's reminder_times is checked
// every tick like the fixed daily slots above; claimed per medication+time+day
// so a re-tick (or the 15-minute window) never double-sends.

interface DueMedication {
  id: string;
  name: string;
  dosage: string | null;
  time: string;
}

// deno-lint-ignore no-explicit-any
async function dueMedicationReminders(sb: any, nowMinutes: number): Promise<DueMedication[]> {
  const { data } = await sb
    .from("medications")
    .select("id,name,dosage,reminder_times")
    .eq("user_id", USER_ID)
    .eq("active", true);

  const due: DueMedication[] = [];
  // deno-lint-ignore no-explicit-any
  for (const m of (data ?? []) as any[]) {
    for (const t of (m.reminder_times as string[] | null) ?? []) {
      if (withinWindow(t, nowMinutes)) {
        due.push({ id: m.id as string, name: m.name as string, dosage: (m.dosage as string) ?? null, time: t.slice(0, 5) });
      }
    }
  }
  return due;
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
    const daysLeft = daysBetween(today, due); // due − today; negative = overdue
    if (daysLeft < 0) {
      alerts.push({
        kind: "urgent_payment",
        dedupKey: p.id as string,
        text: `⚠️ Betaling te laat: ${p.payee} — €${p.amount} was ${fmtDateNL(due)} verschuldigd.`,
      });
    } else if (daysLeft <= 3) {
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

  // Overdue invoices — reconcileOverdueInvoices() has already flipped due-passed
  // invoices to 'overdue' (unconditionally, every tick). Here we just nudge once
  // per overdue invoice; the claim keyed by invoice id dedups repeat ticks.
  const { data: invoiceRows } = await sb
    .from("project_invoices")
    .select("id,number,amount,due_on")
    .eq("user_id", USER_ID)
    .eq("status", "overdue")
    .not("due_on", "is", null);
  for (const inv of invoiceRows ?? []) {
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
    // Local getters, not toISOString() — the latter shifts a day early vs `today`.
    const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
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
  // Fail CLOSED: an unset secret must NOT leave this service-role endpoint open.
  if (!CRON_SECRET || auth !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);
  if (!BOT_TOKEN) return json({ error: "TELEGRAM_BOT_TOKEN secret is not set" }, 503);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // Reconcile invoice status every tick, before (and independent of) any pref
  // gating — status must stay correct even with alerts off or during quiet hours.
  await reconcileOverdueInvoices(sb, amsterdamToday());
  const { data: prefs } = await sb.from("notification_prefs").select("*").eq("user_id", USER_ID).maybeSingle();
  if (!prefs?.telegram_chat_id) return json({ ok: true, skipped: "not linked" });

  const chatId = prefs.telegram_chat_id as number;
  const today = amsterdamToday();
  const nowMinutes = amsterdamMinutes();
  const sent: string[] = [];

  try {
    if (prefs.morning_briefing && withinWindow(prefs.morning_time, nowMinutes) && (await claim(sb, "morning", today))) {
      await sendClaimed(sb, "morning", today, BOT_TOKEN, chatId, await buildMorningBriefing(sb, today));
      sent.push("morning");
    }

    if (prefs.evening_checkin && withinWindow(prefs.evening_time, nowMinutes) && (await claim(sb, "evening_checkin", today))) {
      if (!(await hasCheckinToday(sb, today))) {
        const keyboard: InlineKeyboard = [[1, 2, 3, 4, 5].map((n) => ({ text: String(n), callback_data: `ci_e:${n}` }))];
        await sendClaimed(sb, "evening_checkin", today, BOT_TOKEN, chatId, "🌙 Hoe ging vandaag? Kies je energie (1-5):", keyboard);
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
        await sendClaimed(sb, "habit_reminder", today, BOT_TOKEN, chatId, "🔁 Nog openstaande gewoontes vandaag:", keyboard);
      }
      sent.push("habit_reminder");
    }

    // Inference digest rides the evening slot: one batched message with a
    // confirm/reject pair per pending guess. Claimed once per day like the check-in.
    if (prefs.evening_checkin && withinWindow(prefs.evening_time, nowMinutes)) {
      const pending = await pendingInferences(sb);
      // Only claim once there's something to send, so an empty evening doesn't
      // burn the daily claim and block a later tick when a guess appears.
      if (pending.length && (await claim(sb, "inference_digest", today))) {
        const lines = ["🔎 Een paar dingen die ik afleidde — kloppen ze?", ""];
        pending.forEach((p, i) => lines.push(`${i + 1}. ${p.question}`));
        const keyboard: InlineKeyboard = pending.map((p, i) => [
          { text: `✅ ${i + 1}`, callback_data: `infer:ok:${p.id}` },
          { text: `❌ ${i + 1}`, callback_data: `infer:no:${p.id}` },
        ]);
        await sendClaimed(sb, "inference_digest", today, BOT_TOKEN, chatId, lines.join("\n"), keyboard);
        sent.push("inference_digest");
      }
    }

    // Medication reminders run independent of the urgent_alerts/quiet_hours
    // pref — a missed dose isn't an "urgent alert" in the existing sense, and
    // muting it during quiet hours would defeat a reminder set for e.g. 22:00.
    for (const m of await dueMedicationReminders(sb, nowMinutes)) {
      const dedupKey = `${m.id}:${m.time}:${today}`;
      if (await claim(sb, "medication_reminder", dedupKey)) {
        const text = `💊 Tijd voor ${m.name}${m.dosage ? ` (${m.dosage})` : ""}.`;
        await sendClaimed(sb, "medication_reminder", dedupKey, BOT_TOKEN, chatId, text);
        sent.push(`medication_reminder:${dedupKey}`);
      }
    }

    if (prefs.urgent_alerts && !inQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end, nowMinutes)) {
      for (const a of await urgentAlerts(sb, today)) {
        if (await claim(sb, a.kind, a.dedupKey)) {
          await sendClaimed(sb, a.kind, a.dedupKey, BOT_TOKEN, chatId, a.text);
          sent.push(`${a.kind}:${a.dedupKey}`);
        }
      }
    }

    return json({ ok: true, sent });
  } catch (err) {
    return json({ error: `notify-tick failed: ${String(err)}` }, 500);
  }
});
