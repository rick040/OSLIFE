/**
 * Supabase Edge Function: telegram-webhook
 * -------------------------------------------
 * Receives inbound updates from the OSLIFE Telegram bot (Telegram calls this
 * URL directly once registered via setWebhook — see docs/SECRETS.md). This
 * is what makes notifications two-way: /start links the chat, and tapping an
 * inline-keyboard button writes straight into daily_checkin / habit_log, the
 * same tables the app itself writes to.
 *
 * Auth: Telegram's secret_token mechanism, not a Supabase JWT (Telegram can't
 * send one). setWebhook is called once with a secret_token; Telegram echoes
 * it back on every request as the X-Telegram-Bot-Api-Secret-Token header.
 *
 * Deploy:
 *   supabase functions deploy telegram-webhook --project-ref nhyunnnmdcmojvkxrbpl
 * Then in the Dashboard: Edge Functions -> telegram-webhook -> Settings ->
 * turn "Enforce JWT verification" OFF.
 *
 * Secrets required: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
 * OSLIFE_USER_ID (or legacy RICK_USER_ID). SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY are auto-injected.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { editMessageText, answerCallbackQuery, sendMessage, type InlineKeyboard } from "../_shared/telegram.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USER_ID = Deno.env.get("OSLIFE_USER_ID") ?? Deno.env.get("RICK_USER_ID")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

function amsterdamToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

function moodKeyboard(energy: number): InlineKeyboard {
  return [[1, 2, 3, 4, 5].map((n) => ({ text: String(n), callback_data: `ci_m:${energy}:${n}` }))];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) return new Response("unauthorized", { status: 401 });
  if (!BOT_TOKEN) return new Response("ok"); // never let a missing secret surface to Telegram as an error loop

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response("ok");
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── /start — link this chat to the one OSLIFE account ─────────────────────
  const message = update.message as Record<string, unknown> | undefined;
  if (message?.text === "/start") {
    const chat = message.chat as Record<string, unknown>;
    const from = message.from as Record<string, unknown> | undefined;
    const chatId = chat.id as number;
    const username = (chat.username as string) ?? (from?.username as string) ?? null;

    await sb.from("notification_prefs").upsert(
      { user_id: USER_ID, telegram_chat_id: chatId, telegram_username: username, linked_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    await sendMessage(
      BOT_TOKEN,
      chatId,
      "Gekoppeld! ✅ Je krijgt hier voortaan je ochtendbriefing, avond-check-in en gewoonte-herinneringen. Beheer dit in OSLIFE onder Instellingen.",
    );
    return new Response("ok");
  }

  // ── Inline-keyboard taps ───────────────────────────────────────────────────
  const cq = update.callback_query as Record<string, unknown> | undefined;
  if (cq) {
    const data = (cq.data as string) ?? "";
    const cqMessage = cq.message as Record<string, unknown>;
    const chatId = (cqMessage.chat as Record<string, unknown>).id as number;
    const messageId = cqMessage.message_id as number;
    const callbackId = cq.id as string;

    if (data.startsWith("ci_e:")) {
      const energy = Number(data.split(":")[1]);
      await editMessageText(BOT_TOKEN, chatId, messageId, `Energie: ${energy}/5 genoteerd. En je stemming (1-5)?`, moodKeyboard(energy));
      await answerCallbackQuery(BOT_TOKEN, callbackId);
      return new Response("ok");
    }

    if (data.startsWith("ci_m:")) {
      const [, e, m] = data.split(":");
      const today = amsterdamToday();
      const { error } = await sb.from("daily_checkin").upsert(
        { user_id: USER_ID, date: today, energy: Number(e), mood: Number(m), updated_at: new Date().toISOString() },
        { onConflict: "user_id,date" },
      );
      await editMessageText(
        BOT_TOKEN,
        chatId,
        messageId,
        error ? "Kon de check-in niet opslaan — probeer het later opnieuw." : `Check-in compleet: energie ${e}/5 · stemming ${m}/5 ✅`,
      );
      await answerCallbackQuery(BOT_TOKEN, callbackId, error ? "Mislukt" : "Opgeslagen");
      return new Response("ok");
    }

    if (data.startsWith("hb_done:")) {
      const habitId = data.split(":")[1];
      const today = amsterdamToday();
      // habit_log has no unique(habit_id,on_date) constraint — mirror
      // persistHabitTick's delete-then-insert (src/lib/supabase.ts:194-204).
      await sb.from("habit_log").delete().eq("habit_id", habitId).eq("on_date", today);
      const { error } = await sb.from("habit_log").insert({ user_id: USER_ID, habit_id: habitId, on_date: today, done: true });
      await answerCallbackQuery(BOT_TOKEN, callbackId, error ? "Mislukt" : "Gelukt! ✅");
      return new Response("ok");
    }

    await answerCallbackQuery(BOT_TOKEN, callbackId);
  }

  return new Response("ok");
});
