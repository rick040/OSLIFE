/**
 * Supabase Edge Function: create-gmail-draft
 * ----------------------------------------
 * Given a gmail_messages row id and a reply body (usually the edited output
 * of draft-email-reply), creates a real Gmail draft in the original thread
 * via the Gmail API — a single-user OAuth client scoped to gmail.compose
 * only (see _shared/gmail.ts). Never sends anything; the user still opens
 * Gmail to review and hit send.
 *
 *   request:  { "id": "<gmail_messages.id>", "body": "..." }
 *   response: { "ok": true, "draftId": "..." } | { "error": "<message>" }
 *
 * Deploy:
 *   supabase functions deploy create-gmail-draft --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets required: SUPABASE_ANON_KEY, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
 * GMAIL_REFRESH_TOKEN (see integrations/apps-script/Code.gs header for how
 * the sync itself works — this OAuth client is separate and unrelated to it).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, SUPABASE_URL, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";
import { createDraftReply } from "../_shared/gmail.ts";

const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = jsonResponder(CORS);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!bearerToken(req)) return json({ error: "Unauthorized" }, 401);

  let payload: { id?: string; body?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const id = (payload.id ?? "").trim();
  const replyBody = (payload.body ?? "").trim();
  if (!id || !replyBody) return json({ error: "id and body are required" }, 400);

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: row, error: fetchErr } = await sb
    .from("gmail_messages")
    .select("subject, from_addr, thread_id")
    .eq("id", id)
    .single();
  if (fetchErr || !row) return json({ error: "Email not found" }, 404);

  try {
    const draftId = await createDraftReply({
      to: (row.from_addr as string) ?? "",
      subject: (row.subject as string) ?? "",
      body: replyBody,
      threadId: (row.thread_id as string | null) ?? null,
    });
    return json({ ok: true, draftId });
  } catch (err) {
    return json({ error: `Gmail draft failed: ${String(err)}` }, 502);
  }
});
