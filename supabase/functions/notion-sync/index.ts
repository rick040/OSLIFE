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

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USER_ID              = Deno.env.get("RICK_USER_ID")!;
const SYNC_SECRET          = Deno.env.get("SYNC_SECRET") ?? "";

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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  // Auth: accept either a Bearer token matching SYNC_SECRET or the Supabase service key
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (SYNC_SECRET && token !== SYNC_SECRET && token !== SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
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

    const { error: projErr } = await supabase
      .from("projects")
      .upsert(rows, { onConflict: "user_id,external_id" });

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

    const { error: clientErr } = await supabase
      .from("clients")
      .upsert(rows, { onConflict: "user_id,external_id" });

    results.clients = clientErr
      ? { error: clientErr.message }
      : { synced: rows.length };
  } catch (err) {
    results.clients = { error: String(err) };
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
