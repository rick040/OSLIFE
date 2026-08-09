/**
 * Supabase Edge Function: fiverr-poll
 * ------------------------------------
 * Step A of the Fiverr client/project intake pipeline. Invoked every ~3
 * minutes by a pg_cron job via net.http_post with a bearer CRON_SECRET (same
 * pattern as notify-tick).
 *
 * Gmail already syncs into `gmail_messages` every 15 min via the Apps Script
 * project (integrations/apps-script/Code.gs, syncGmail()) under Rick's own
 * Google account — this function does NOT talk to Gmail itself. It only
 * mirrors gmail_messages rows labelled "fiverr-logged" into `client_messages`
 * (the unified inbox), which is where the rest of OSLIFE (and step B of this
 * pipeline) already reads from.
 *
 * For each new fiverr-logged gmail_messages row:
 *   1. Skip pure marketing/digest subjects (recap, newsletter, ...).
 *   2. Extract the Fiverr username from the subject (several known patterns).
 *   3. Match a client via clients.aliases (already the established
 *      convention — see to2bi9 / rosie_bel09 / noortjeqff in the live data).
 *   4. If matched AND that client has an active project (not archived, not
 *      done) → insert with that project_id. Otherwise insert with
 *      project_id = NULL — this unassigned state IS the buffer step B reads.
 *   5. Idempotent via the existing (user_id, source, external_id) unique
 *      index on client_messages — upsert with ignoreDuplicates.
 *
 * Deploy:
 *   supabase functions deploy fiverr-poll --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets required: CRON_SECRET (shared with notify-tick). SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY are auto-injected.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, bearerToken, jsonResponder } from "../_shared/http.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const LOOKBACK_DAYS = 3;
const MAX_CANDIDATES = 200;

const json = jsonResponder();

const NOISE_SUBJECT_RE = /recap|monthly activity|weekly digest|newsletter|survey|webinar|terms of service|policy update/i;

const USERNAME_PATTERNS: RegExp[] = [
  /(?:received|got)\s+(?:new\s+)?messages\s+from\s+([a-z0-9_.]+)/i,
  /received an order from\s+([a-z0-9_.]+)/i,
  /order from\s+([a-z0-9_.]+)/i,
  /^([a-z0-9_.]+)\s+requested/i,
];

function extractFiverrUsername(subject: string): string | null {
  for (const re of USERNAME_PATTERNS) {
    const m = subject.match(re);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

interface GmailRow {
  id: string;
  external_id: string;
  subject: string | null;
  snippet: string | null;
  body: string | null;
  received_at: string;
  thread_id: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  aliases: string[];
}

Deno.serve(async (req) => {
  const auth = bearerToken(req);
  if (!CRON_SECRET || auth !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const { data: candidates, error: gmErr } = await sb
    .from("gmail_messages")
    .select("id, external_id, subject, snippet, body, received_at, thread_id")
    .eq("user_id", USER_ID)
    .contains("labels", ["fiverr-logged"])
    .gte("received_at", sinceIso)
    .order("received_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (gmErr) return json({ error: `gmail_messages query failed: ${gmErr.message}` }, 500);

  const rows = (candidates ?? []) as GmailRow[];
  if (!rows.length) return json({ ok: true, mirrored: 0, skipped: 0 });

  // Which of these external_ids are already mirrored?
  const extIds = rows.map((r) => r.external_id);
  const { data: existing, error: exErr } = await sb
    .from("client_messages")
    .select("external_id")
    .eq("user_id", USER_ID)
    .eq("source", "gmail_sync")
    .in("external_id", extIds);
  if (exErr) return json({ error: `client_messages lookup failed: ${exErr.message}` }, 500);
  const alreadyMirrored = new Set((existing ?? []).map((r) => r.external_id as string));

  const pending = rows.filter((r) => !alreadyMirrored.has(r.external_id));
  if (!pending.length) return json({ ok: true, mirrored: 0, skipped: rows.length });

  // Load clients once; match in JS so aliases compare case-insensitively.
  const { data: clientRows, error: clErr } = await sb
    .from("clients")
    .select("id, name, aliases")
    .eq("user_id", USER_ID)
    .not("aliases", "eq", "{}");
  if (clErr) return json({ error: `clients query failed: ${clErr.message}` }, 500);

  const aliasMap = new Map<string, ClientRow>();
  for (const c of (clientRows ?? []) as ClientRow[]) {
    for (const a of c.aliases ?? []) aliasMap.set(a.toLowerCase(), c);
  }

  let mirrored = 0;
  let skippedNoise = 0;
  const errors: string[] = [];

  for (const gm of pending) {
    const subject = gm.subject ?? "";
    if (NOISE_SUBJECT_RE.test(subject)) {
      skippedNoise++;
      continue;
    }

    const username = extractFiverrUsername(subject);
    const contactKey = username ?? `fiverr-thread:${gm.thread_id ?? gm.external_id}`;
    const client = username ? aliasMap.get(username) : undefined;

    let projectId: string | null = null;
    if (client) {
      const { data: activeProject } = await sb
        .from("projects")
        .select("id")
        .eq("user_id", USER_ID)
        .eq("client_id", client.id)
        .eq("archived", false)
        .neq("status", "done")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      projectId = (activeProject?.id as string | undefined) ?? null;
    }

    const { error: insErr } = await sb.from("client_messages").upsert(
      {
        user_id: USER_ID,
        client_id: client?.id ?? null,
        project_id: projectId,
        channel: "fiverr",
        direction: "in",
        contact: client?.name ?? username ?? "Unknown Fiverr contact",
        contact_key: contactKey,
        subject,
        snippet: gm.snippet ?? "",
        body: gm.body,
        ts: gm.received_at,
        unread: true,
        source: "gmail_sync",
        external_id: gm.external_id,
      },
      { onConflict: "user_id,source,external_id", ignoreDuplicates: true },
    );
    if (insErr) {
      errors.push(`${gm.external_id}: ${insErr.message}`);
      continue;
    }
    mirrored++;
  }

  return json({ ok: true, mirrored, skippedNoise, candidates: rows.length, errors: errors.length ? errors : undefined });
});
