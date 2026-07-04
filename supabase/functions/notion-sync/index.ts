/**
 * Supabase Edge Function: notion-sync
 * ------------------------------------
 * Fetches Projects + Clients from Notion and upserts them into Supabase.
 * Replaces / augments the Google Apps Script syncNotion() with richer fields.
 *
 * Deploy:
 *   supabase functions deploy notion-sync --project-ref nhyunnnmdcmojvkxrbpl
 *
 * Secrets (set once):
 *   supabase secrets set \
 *     NOTION_TOKEN=secret_xxx \
 *     RICK_USER_ID=<your auth.users uuid> \
 *     SYNC_SECRET=<shared secret for cron caller> \
 *     --project-ref nhyunnnmdcmojvkxrbpl
 *
 * Trigger via cron (replace Apps Script trigger):
 *   curl -X POST https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/notion-sync \
 *     -H "Authorization: Bearer $SYNC_SECRET"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  queryDatabase,
  getText,
  getSelect,
  getMultiSelect,
  getNumber,
  getDate,
  getEmail,
  getUrl,
  getRelation,
} from "../_shared/notion.ts";
import {
  CORS_BASIC,
  CORS_ORIGIN,
  SUPABASE_SERVICE_KEY,
  SUPABASE_URL,
  USER_ID,
  bearerToken,
  corsPreflight,
  jsonResponder,
} from "../_shared/http.ts";

const SYNC_SECRET = Deno.env.get("SYNC_SECRET") ?? "";

const json     = jsonResponder(CORS_ORIGIN); // actual responses: origin-only CORS
const jsonBare = jsonResponder();            // 401 historically carried no CORS

const DB_PROJECTS = "239ddc8e-9208-8186-b452-cc35f89677ff";
const DB_CLIENTS  = "239ddc8e-9208-8102-86b9-eda32f63e815";

// Map Notion project status names to the app's ProjectStatus values
const STATUS_MAP: Record<string, string> = {
  "In uitvoering": "active",
  "Gepland":       "lead",
  "Gepauzeerd":    "blocked",
  "Opgeleverd":    "done",
};

function domainFor(text: string): string {
  const t = text.toLowerCase();
  if (/parking|strijp|host|signage/.test(t))                               return "parkingyou";
  if (/buurtkaart|geldrop|flyer|kroon/.test(t))                            return "buurtkaart";
  if (/invoice|factuur|klant|client|prjct|logo|branding|website|mural/.test(t)) return "prjct";
  return "personal";
}

Deno.serve(async (req) => {
  // Allow OPTIONS for CORS preflight
  if (req.method === "OPTIONS") return corsPreflight(CORS_BASIC);

  // Auth: accept either a Bearer token matching SYNC_SECRET or the Supabase service
  // key. Fail CLOSED — require one of the configured secrets. The service key is
  // always injected, so an unset SYNC_SECRET no longer leaves this endpoint open.
  const token = bearerToken(req);
  if (token !== SUPABASE_SERVICE_KEY && !(SYNC_SECRET && token === SYNC_SECRET)) {
    return jsonBare({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const results: Record<string, unknown> = {};

  // ── Sync projects ──────────────────────────────────────────────────────────
  try {
    const pages = await queryDatabase(DB_PROJECTS, undefined, [
      { property: "Status", direction: "ascending" },
    ]);

    const rows = pages
      .map((pg) => {
        const name = getText(pg.properties["Name"]);
        if (!name || name.startsWith("{")) return null;

        const notionStatus = getSelect(pg.properties["Status"]);
        const appStatus    = notionStatus ? (STATUS_MAP[notionStatus] ?? "lead") : "lead";
        const client       = getText(pg.properties["Client"]) ||
                             (getRelation(pg.properties["Client"]).length > 0 ? "–" : "");

        return {
          user_id:     USER_ID,
          external_id: pg.id,
          notion_url:  pg.url,
          name,
          client,
          domain:      domainFor(name + " " + client),
          status:      appStatus,
          type:        getMultiSelect(pg.properties["Type"]),
          prioriteit:  getSelect(pg.properties["Prioriteit"]),
          start_datum: getDate(pg.properties["Start Datum"]),
          deadline:    getDate(pg.properties["Deadline"]),
          value:       getNumber(pg.properties["Budget"]) ?? 0,
          progress:    getNumber(pg.properties["Progress"]) ?? 0,
          source:      "notion",
        };
      })
      .filter(Boolean);

    // Insert-only: once a project exists (whether from Notion or created natively
    // in-app), the app is the source of truth. Re-syncing must never clobber
    // edits the user made via the native CRM, so existing rows are left alone —
    // this only seeds projects Notion has that Supabase doesn't have yet.
    const { error: projErr } = await supabase
      .from("projects")
      .upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true });

    results.projects = projErr
      ? { error: projErr.message }
      : { synced: rows.length };
  } catch (err) {
    results.projects = { error: String(err) };
  }

  // ── Sync clients ───────────────────────────────────────────────────────────
  try {
    const pages = await queryDatabase(DB_CLIENTS, undefined, [
      { property: "Name", direction: "ascending" },
    ]);

    const rows = pages
      .map((pg) => {
        const name = getText(pg.properties["Name"]);
        if (!name) return null;
        return {
          user_id:       USER_ID,
          external_id:   pg.id,
          notion_url:    pg.url,
          name,
          client_status: getSelect(pg.properties["Client Status"]),
          crm_status:    getSelect(pg.properties["CRM Status"]),
          first_contact: getDate(pg.properties["First Contact"]),
          email:         getEmail(pg.properties["Email"]),
          website_url:   getUrl(pg.properties["Website URL"]),
          potentie:      getSelect(pg.properties["Potentie"]),
          scope:         getNumber(pg.properties["Scope"]),
          domain:        domainFor(name),
        };
      })
      .filter(Boolean);

    // Same insert-only rule as projects — never overwrite a client the app owns.
    const { error: clientErr } = await supabase
      .from("clients")
      .upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true });

    results.clients = clientErr
      ? { error: clientErr.message }
      : { synced: rows.length };
  } catch (err) {
    results.clients = { error: String(err) };
  }

  return json({ ok: true, ...results });
});
