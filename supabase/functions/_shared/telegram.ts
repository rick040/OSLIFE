/**
 * Minimal Telegram Bot API client for Deno / Supabase Edge Functions.
 * Used by notify-tick (sending proactive nudges) and telegram-webhook
 * (sending confirmations + editing messages after a button tap).
 */

const TELEGRAM_API = "https://api.telegram.org";

export interface InlineButton {
  text: string;
  callback_data: string; // Telegram limit: 64 bytes
}
export type InlineKeyboard = InlineButton[][];

function endpoint(token: string, method: string): string {
  return `${TELEGRAM_API}/bot${token}/${method}`;
}

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<{ ok: boolean; message_id?: number }> {
  const res = await fetch(endpoint(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    }),
  });
  const data = await res.json();
  return { ok: !!data.ok, message_id: data.result?.message_id };
}

export async function editMessageText(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<boolean> {
  const res = await fetch(endpoint(token, "editMessageText"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    }),
  });
  const data = await res.json();
  return !!data.ok;
}

export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await fetch(endpoint(token, "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

/**
 * Resolve a Telegram file_id to its bytes: getFile (returns file_path) then a
 * plain download from the file API. Null on any failure — every caller treats
 * that as "couldn't fetch this one", never throws.
 */
export async function getFileBytes(token: string, fileId: string): Promise<Uint8Array | null> {
  try {
    const metaRes = await fetch(endpoint(token, "getFile") + `?file_id=${encodeURIComponent(fileId)}`);
    const meta = await metaRes.json();
    const filePath = meta?.result?.file_path as string | undefined;
    if (!filePath) return null;
    const fileRes = await fetch(`${TELEGRAM_API}/file/bot${token}/${filePath}`);
    if (!fileRes.ok) return null;
    return new Uint8Array(await fileRes.arrayBuffer());
  } catch {
    return null;
  }
}
