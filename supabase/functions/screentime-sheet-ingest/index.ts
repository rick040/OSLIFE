/**
 * Supabase Edge Function: screentime-sheet-ingest
 * ------------------------------------------------
 * Receives screen-time / app-usage / unlocks from the "Schermtijd" Google Sheet
 * (screentime-sheet.gs, bound to that sheet) and upserts into `screentime`.
 * Each category has its own tab in the sheet; the Apps Script flattens them to
 * one row per (date, app, category).
 *
 * dedup_key = `${usage_date}|${app_name}|${category}` so re-syncing the same
 * sheet is idempotent (UNIQUE (user_id, dedup_key)).
 *
 * Request body:
 *   { "rows": [
 *       { "usage_date": "YYYY-MM-DD", "app_name": "Instagram",
 *         "duration_ms": 3600000, "category": "social" }
 *   ]}
 *
 * Deploy:
 *   supabase functions deploy screentime-sheet-ingest --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: INGEST_SECRET, OSLIFE_USER_ID (or legacy RICK_USER_ID).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET = Deno.env.get("INGEST_SECRET") ?? "";
const USER_ID = Deno.env.get("OSLIFE_USER_ID") ?? Deno.env.get("RICK_USER_ID")!;

interface InRow {
  usage_date: string;
  app_name?: string;
  duration_ms?: number;
  category?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const secret = req.headers.get("x-ingest-secret") ?? "";
  if (INGEST_SECRET && secret !== INGEST_SECRET) return json({ ok: false, error: "Unauthorized" }, 401);

  let payload: { rows?: InRow[] };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const rowsIn = (payload.rows ?? []).filter((r) => r && r.usage_date);
  if (!rowsIn.length) return json({ ok: true, upserted: 0 });

  // Aggregate by (date, app, category): the same app can appear multiple times
  // per day (e.g. across devices, or repeated exports). Summing avoids the
  // "ON CONFLICT cannot affect row a second time" error AND gives the true
  // per-app daily total.
  const byKey = new Map<string, {
    user_id: string; usage_date: string; app_name: string; duration_ms: number; category: string; dedup_key: string;
  }>();
  for (const r of rowsIn) {
    const app = (r.app_name ?? "all").slice(0, 120);
    const category = (r.category ?? "other").slice(0, 60);
    const dedup_key = `${r.usage_date}|${app}|${category}`;
    const existing = byKey.get(dedup_key);
    const ms = Math.round(r.duration_ms ?? 0);
    if (existing) existing.duration_ms += ms;
    else byKey.set(dedup_key, { user_id: USER_ID, usage_date: r.usage_date, app_name: app, duration_ms: ms, category, dedup_key });
  }
  const rows = [...byKey.values()];

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { error, count } = await supabase
    .from("screentime")
    .upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: false, count: "exact" });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, received: rows.length, upserted: count ?? rows.length });
});
