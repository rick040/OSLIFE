/**
 * Supabase Edge Function: telegram-webhook
 * -------------------------------------------
 * Receives inbound updates from the OSLIFE Telegram bot (Telegram calls this
 * URL directly once registered via setWebhook — see docs/SECRETS.md). This
 * is what makes notifications two-way: /start links the chat, tapping an
 * inline-keyboard button writes straight into daily_checkin / habit_log, and
 * the slash-commands below let you read your day and capture loops from chat.
 *
 * Commands (also registered in @BotFather so they show in the menu):
 *   /menu     — list what the bot can do
 *   /today    — agenda + check-in status + open loops + open habits
 *   /finance  — open outgoing payments (overdue + due within 14 days)
 *   /note …   — capture text as one open loop (brain_state.threads)
 *   /dump …   — capture each line as its own open loop
 *   /clear    — undo: remove the most recent Telegram-captured loop
 *   /start    — link this chat to the one OSLIFE account
 *
 * Captured loops use an id prefixed "thr-tg-": deliberately NOT the
 * "thr-(prj|cli)-" shape the app derives from projects/clients, so the app
 * treats them as persisted, non-derived captured loops (see
 * src/store.ts isDerivedThreadId). They surface live in-app (brain_state
 * realtime) and in the morning briefing, exactly like an in-app capture.
 *
 * Anything else (a photo, a voice note, a document, or plain free text with
 * no leading "/") becomes a Braindump capture instead — a "send me anything"
 * inbox that lands in braindump_entries and runs through the same
 * braindump-ingest pipeline as an in-app capture (OCR via vision, Whisper
 * transcription via braindump-worker, Markdown + tagging). Deliberately
 * separate from /note's open-loop capture above, which stays a distinct,
 * intentional "quick task" tool.
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
import { editMessageText, answerCallbackQuery, getFileBytes, sendMessage, type InlineKeyboard } from "../_shared/telegram.ts";
import { amsterdamToday, daysBetween, fmtDateNL, type Thread } from "../_shared/dates.ts";
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID } from "../_shared/http.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

function fmtEUR(n: number): string {
  return "€" + (Math.round(n * 100) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moodKeyboard(energy: number): InlineKeyboard {
  return [[1, 2, 3, 4, 5].map((n) => ({ text: String(n), callback_data: `ci_m:${energy}:${n}` }))];
}

// ── Captured loops live in brain_state.threads (Thread from ../_shared/dates.ts) ──

// deno-lint-ignore no-explicit-any
async function getBrain(sb: any): Promise<{ threads: Thread[]; patterns: unknown[] }> {
  const { data } = await sb.from("brain_state").select("threads,patterns").eq("user_id", USER_ID).maybeSingle();
  return { threads: (data?.threads as Thread[]) ?? [], patterns: (data?.patterns as unknown[]) ?? [] };
}

// deno-lint-ignore no-explicit-any
async function saveBrain(sb: any, threads: Thread[], patterns: unknown[]): Promise<boolean> {
  const { error } = await sb.from("brain_state").upsert(
    { user_id: USER_ID, threads, patterns, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  return !error;
}

function newLoop(title: string): Thread {
  return {
    id: `thr-tg-${crypto.randomUUID().slice(0, 8)}`,
    domain: "personal",
    title,
    owedTo: "self (Telegram)",
    due: null,
    status: "open",
    createdAt: new Date().toISOString(),
  };
}

// ── Command handlers ─────────────────────────────────────────────────────────

const MENU = [
  "🤖 OSLIFE-bot — wat ik kan:",
  "",
  "/today — je dag in één overzicht (agenda, check-in, loops, gewoontes)",
  "/finance — openstaande betalingen (te laat + binnen 14 dagen)",
  "/note <tekst> — leg een gedachte vast als open loop",
  "/dump <regels> — meerdere regels ineens, elk een eigen loop",
  "/clear — maak je laatste Telegram-notitie ongedaan",
  "/menu — dit overzicht",
  "",
  "'s Ochtends/'s avonds krijg je automatisch je briefing, check-in en gewoonte-herinneringen. Beheer de tijden in OSLIFE → Instellingen.",
].join("\n");

// deno-lint-ignore no-explicit-any
async function cmdNote(sb: any, arg: string): Promise<string> {
  if (!arg) return "Gebruik: /note <je notitie>.\nBijv. /note Bel de boekhouder maandag.";
  const { threads, patterns } = await getBrain(sb);
  const loop = newLoop(arg);
  const ok = await saveBrain(sb, [loop, ...threads], patterns);
  return ok
    ? `📝 Vastgelegd als open loop:\n"${arg}"\n\nStaat in OSLIFE bij je loops. /clear maakt 'm weer ongedaan.`
    : "Kon 'm niet opslaan — probeer het later opnieuw.";
}

// deno-lint-ignore no-explicit-any
async function cmdDump(sb: any, arg: string): Promise<string> {
  const lines = arg.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "Gebruik: /dump gevolgd door meerdere regels — elke regel wordt een aparte loop.";
  const { threads, patterns } = await getBrain(sb);
  const loops = lines.map(newLoop);
  const ok = await saveBrain(sb, [...loops, ...threads], patterns);
  if (!ok) return "Kon de dump niet opslaan — probeer het later opnieuw.";
  return `🧠 ${loops.length} loop(s) vastgelegd:\n` + loops.map((l) => `• ${l.title}`).join("\n");
}

// deno-lint-ignore no-explicit-any
async function cmdToday(sb: any): Promise<string> {
  const today = amsterdamToday();
  const lines: string[] = [`📅 Vandaag — ${fmtDateNL(today)}`];

  const { data: ci } = await sb.from("daily_checkin").select("energy,mood").eq("user_id", USER_ID).eq("date", today).maybeSingle();
  lines.push("", ci ? `Check-in: energie ${ci.energy ?? "?"}/5 · stemming ${ci.mood ?? "?"}/5 ✅` : "Check-in: nog niet gedaan vandaag.");

  const { data: blocks } = await sb
    .from("day_blocks")
    .select("start_time,title")
    .eq("user_id", USER_ID)
    .eq("date", today)
    .order("start_time");
  if (blocks?.length) {
    lines.push("", "🗓 Agenda:");
    for (const b of blocks) {
      const t = (b.start_time as string | null)?.slice(0, 5);
      lines.push(`• ${t ? t + " " : ""}${(b.title as string) || "(geen titel)"}`);
    }
  }

  const { threads } = await getBrain(sb);
  const open = threads.filter((t) => t.status === "open");
  if (open.length) {
    const withDue = open.filter((t) => t.due).sort((a, b) => daysBetween(today, a.due!) - daysBetween(today, b.due!));
    lines.push("", `🔓 Open loops (${open.length}):`);
    for (const t of (withDue.length ? withDue : open).slice(0, 6)) {
      const when = t.due
        ? daysBetween(t.due, today) > 0
          ? `${daysBetween(t.due, today)}d te laat`
          : `deadline ${fmtDateNL(t.due)}`
        : "geen datum";
      lines.push(`• ${t.title} — ${when}`);
    }
  } else {
    lines.push("", "🔓 Geen open loops. 🎉");
  }

  const { data: habitRows } = await sb.from("habits").select("id,name,icon").eq("user_id", USER_ID).eq("active", true).order("order_idx");
  if (habitRows?.length) {
    const { data: doneRows } = await sb.from("habit_log").select("habit_id").eq("user_id", USER_ID).eq("on_date", today).eq("done", true);
    const doneSet = new Set((doneRows ?? []).map((r: { habit_id: string }) => r.habit_id));
    // deno-lint-ignore no-explicit-any
    const openHabits = (habitRows as any[]).filter((h) => !doneSet.has(h.id));
    if (openHabits.length) {
      lines.push("", "🔁 Nog te doen:");
      for (const h of openHabits) lines.push(`• ${(h.icon as string) ?? "✅"} ${h.name}`);
    } else {
      lines.push("", "🔁 Alle gewoontes gedaan vandaag. 🔥");
    }
  }

  return lines.join("\n");
}

// deno-lint-ignore no-explicit-any
async function cmdFinance(sb: any): Promise<string> {
  const today = amsterdamToday();
  const { data: rows } = await sb.from("payments").select("payee,amount,due,direction").eq("user_id", USER_ID).eq("status", "open");
  // deno-lint-ignore no-explicit-any
  const outgoing = ((rows ?? []) as any[]).filter((p) => (p.direction ?? "outgoing") === "outgoing");
  if (!outgoing.length) return "💶 Geen openstaande betalingen. ✅";

  const total = outgoing.reduce((s, p) => s + Number(p.amount || 0), 0);
  const withDue = outgoing.filter((p) => p.due).sort((a, b) => daysBetween(today, a.due) - daysBetween(today, b.due));
  const overdue = withDue.filter((p) => daysBetween(p.due, today) > 0);
  const upcoming = withDue.filter((p) => daysBetween(today, p.due) >= 0 && daysBetween(today, p.due) <= 14);

  const lines: string[] = [`💶 Openstaand — totaal ${fmtEUR(total)} over ${outgoing.length} post(en).`];
  if (overdue.length) {
    lines.push("", "⚠️ Te laat:");
    for (const p of overdue.slice(0, 8)) lines.push(`• ${p.payee} — ${fmtEUR(Number(p.amount || 0))} (${daysBetween(p.due, today)}d te laat)`);
  }
  if (upcoming.length) {
    lines.push("", "📆 Binnen 14 dagen:");
    for (const p of upcoming.slice(0, 8)) lines.push(`• ${p.payee} — ${fmtEUR(Number(p.amount || 0))} op ${fmtDateNL(p.due)}`);
  }
  if (!overdue.length && !upcoming.length) lines.push("", "Niets te laat of binnen 14 dagen.");
  return lines.join("\n");
}

// deno-lint-ignore no-explicit-any
async function cmdClear(sb: any): Promise<string> {
  const { threads, patterns } = await getBrain(sb);
  const tg = threads.filter((t) => t.id.startsWith("thr-tg-"));
  if (!tg.length) return "Niets om te wissen — er is nog geen loop via Telegram vastgelegd.";
  const newest = tg.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
  const ok = await saveBrain(sb, threads.filter((t) => t.id !== newest.id), patterns);
  return ok ? `🗑 Laatste Telegram-loop verwijderd:\n"${newest.title}"` : "Kon 'm niet verwijderen — probeer het later opnieuw.";
}

// ── /start — link this chat to the one OSLIFE account ───────────────────────

// deno-lint-ignore no-explicit-any
async function cmdStart(sb: any, message: Record<string, unknown>, chatId: number): Promise<string> {
  const chat = message.chat as Record<string, unknown>;
  const from = message.from as Record<string, unknown> | undefined;
  const username = (chat.username as string) ?? (from?.username as string) ?? null;
  await sb.from("notification_prefs").upsert(
    { user_id: USER_ID, telegram_chat_id: chatId, telegram_username: username, linked_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  return "Gekoppeld! ✅ Je krijgt hier voortaan je ochtendbriefing, avond-check-in en gewoonte-herinneringen. Typ /menu om te zien wat ik nog meer kan.";
}

// ── Braindump capture: photos / voice / documents / free text ───────────────
// Everything non-command lands in braindump_entries via the same pipeline the
// app itself uses (see src/store.ts braindumpCapture / src/lib/supabase.ts
// insertBraindumpEntry) — meta.rawText for plain text, meta.storagePath for
// anything uploaded to the `braindump` storage bucket.

type CaptureKind = "image" | "audio" | "pdf" | "file" | "text" | "link";

function telegramDocumentKind(mime: string | undefined): CaptureKind {
  if (mime === "application/pdf") return "pdf";
  if (mime?.startsWith("image/")) return "image";
  return "file"; // braindump-ingest has no processor for this yet — stored, not summarised
}

// deno-lint-ignore no-explicit-any
async function storeTelegramFile(sb: any, bytes: Uint8Array, ext: string, mime: string): Promise<string | null> {
  const path = `${USER_ID}/${Date.now()}_telegram${ext}`;
  const { error } = await sb.storage.from("braindump").upload(path, bytes, { contentType: mime, upsert: false });
  return error ? null : path;
}

// deno-lint-ignore no-explicit-any
async function insertBraindumpRow(
  sb: any,
  sourceKind: CaptureKind,
  meta: Record<string, unknown>,
  sourceUrl: string | null = null,
): Promise<string | null> {
  const { data, error } = await sb
    .from("braindump_entries")
    .insert({ user_id: USER_ID, source_kind: sourceKind, status: "pending", source_url: sourceUrl, meta })
    .select("id")
    .single();
  return error || !data ? null : (data.id as string);
}

/** Fire-and-forget, same contract as the app's own invokeBraindumpIngest(). */
function triggerBraindumpIngest(entryId: string): void {
  fetch(`${SUPABASE_URL}/functions/v1/braindump-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    body: JSON.stringify({ entryId }),
  }).catch(() => {});
}

/**
 * Route a non-command Telegram message into a Braindump capture. Returns the
 * confirmation to send back, or null when there's nothing to capture (e.g. a
 * sticker or location message) — mirrors today's silent-drop behaviour for
 * message types this bot doesn't understand.
 */
// deno-lint-ignore no-explicit-any
async function captureTelegramMessage(sb: any, message: Record<string, unknown>, text: string): Promise<string | null> {
  const photos = message.photo as Array<{ file_id: string }> | undefined;
  const voice = message.voice as { file_id: string } | undefined;
  const doc = message.document as { file_id: string; mime_type?: string } | undefined;

  if (photos?.length) {
    const bytes = await getFileBytes(BOT_TOKEN, photos[photos.length - 1].file_id); // largest resolution
    if (!bytes) return null;
    const path = await storeTelegramFile(sb, bytes, ".jpg", "image/jpeg");
    if (!path) return "Kon de foto niet opslaan — probeer het later opnieuw.";
    const entryId = await insertBraindumpRow(sb, "image", { storagePath: path, source: "telegram" });
    if (!entryId) return "Kon de foto niet vastleggen — probeer het later opnieuw.";
    triggerBraindumpIngest(entryId);
    return "📥 Foto opgeslagen, wordt verwerkt…";
  }

  if (voice) {
    const bytes = await getFileBytes(BOT_TOKEN, voice.file_id);
    if (!bytes) return null;
    const path = await storeTelegramFile(sb, bytes, ".ogg", "audio/ogg");
    if (!path) return "Kon het spraakbericht niet opslaan — probeer het later opnieuw.";
    const entryId = await insertBraindumpRow(sb, "audio", { storagePath: path, source: "telegram" });
    if (!entryId) return "Kon het spraakbericht niet vastleggen — probeer het later opnieuw.";
    triggerBraindumpIngest(entryId);
    return "📥 Spraakbericht opgeslagen, wordt getranscribeerd…";
  }

  if (doc) {
    const kind = telegramDocumentKind(doc.mime_type);
    const bytes = await getFileBytes(BOT_TOKEN, doc.file_id);
    if (!bytes) return null;
    const ext = kind === "pdf" ? ".pdf" : kind === "image" ? ".jpg" : "";
    const path = await storeTelegramFile(sb, bytes, ext, doc.mime_type || "application/octet-stream");
    if (!path) return "Kon het bestand niet opslaan — probeer het later opnieuw.";
    const entryId = await insertBraindumpRow(sb, kind, { storagePath: path, source: "telegram" });
    if (!entryId) return "Kon het bestand niet vastleggen — probeer het later opnieuw.";
    triggerBraindumpIngest(entryId);
    return kind === "file"
      ? "📥 Bestand bewaard — dit bestandstype kan ik nog niet automatisch samenvatten, maar het staat klaar in Braindump."
      : "📥 Bestand opgeslagen, wordt verwerkt…";
  }

  if (text) {
    const isBareUrl = /^https?:\/\/\S+$/i.test(text);
    const entryId = await insertBraindumpRow(
      sb,
      isBareUrl ? "link" : "text",
      isBareUrl ? { source: "telegram" } : { rawText: text, source: "telegram" },
      isBareUrl ? text : null,
    );
    if (!entryId) return "Kon dit niet vastleggen — probeer het later opnieuw.";
    triggerBraindumpIngest(entryId);
    return "📥 Opgeslagen, wordt verwerkt…";
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  // Fail CLOSED: an unset secret must NOT leave this service-role endpoint open.
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) return new Response("unauthorized", { status: 401 });
  if (!BOT_TOKEN) return new Response("ok"); // never let a missing secret surface to Telegram as an error loop

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response("ok");
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Slash-commands ─────────────────────────────────────────────────────────
  const message = update.message as Record<string, unknown> | undefined;
  const text = typeof message?.text === "string" ? (message.text as string).trim() : "";
  if (message && text.startsWith("/")) {
    const chatId = (message.chat as Record<string, unknown>).id as number;
    // "/cmd@BotName arg…" or "/cmd\narg…" — split command from its argument.
    const match = text.match(/^\/([^\s@]+)(?:@\S+)?\s*([\s\S]*)$/);
    const cmd = (match?.[1] ?? "").toLowerCase();
    const arg = (match?.[2] ?? "").trim();

    let reply: string;
    switch (cmd) {
      case "start":
        reply = await cmdStart(sb, message, chatId);
        break;
      case "menu":
      case "help":
        reply = MENU;
        break;
      case "note":
        reply = await cmdNote(sb, arg);
        break;
      case "dump":
        reply = await cmdDump(sb, arg);
        break;
      case "today":
        reply = await cmdToday(sb);
        break;
      case "finance":
        reply = await cmdFinance(sb);
        break;
      case "clear":
        reply = await cmdClear(sb);
        break;
      default:
        reply = "Onbekend commando. Typ /menu voor de opties.";
    }
    await sendMessage(BOT_TOKEN, chatId, reply);
    return new Response("ok");
  }

  // ── Everything else: photo / voice / document / free text → Braindump ─────
  if (message) {
    const chatId = (message.chat as Record<string, unknown>).id as number;
    const reply = await captureTelegramMessage(sb, message, text);
    if (reply) await sendMessage(BOT_TOKEN, chatId, reply);
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

    // Inference confirm/reject (PM-201 Slice 1). callback_data: infer:ok|no:<eventId>.
    // Runs the SECURITY DEFINER confirm_inference — trusted here (service role, no
    // JWT), which sets status confirmed/rejected and applies any effect.
    if (data.startsWith("infer:")) {
      const [, verdict, eventId] = data.split(":");
      const decision = verdict === "ok" ? "confirm" : "reject";
      const { data: ok, error } = await sb.rpc("confirm_inference", { p_event_id: eventId, p_decision: decision });
      const label = error || !ok ? "Kon het niet verwerken" : decision === "confirm" ? "Bevestigd ✅" : "Verworpen";
      await answerCallbackQuery(BOT_TOKEN, callbackId, label);
      return new Response("ok");
    }

    await answerCallbackQuery(BOT_TOKEN, callbackId);
  }

  return new Response("ok");
});
