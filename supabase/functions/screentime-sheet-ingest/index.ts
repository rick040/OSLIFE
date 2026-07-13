/**
 * Supabase Edge Function: screentime-sheet-ingest
 * ------------------------------------------------
 * Receives screen-time / app-usage from the "Schermtijd" Google Sheet
 * (screentime-sheet.gs, bound to that sheet) and upserts into `screentime`.
 * Each category has its own tab in the sheet; the Apps Script flattens them to
 * one row per (date, app, category). Per-app duration has no MacroDroid
 * equivalent (no generic foreground-app trigger), so this sheet stays the
 * source for it.
 *
 * `unlocks` (daily pickup counts) is still accepted for backward compatibility,
 * but screentime-sheet.gs no longer sends it — pickups are now derived in
 * real time from `phone_events` by phone-events-ingest's refreshPickups().
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
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from "../_shared/http.ts";

const INGEST_SECRET = Deno.env.get("INGEST_SECRET") ?? "";

interface InRow {
  usage_date: string;
  app_name?: string;
  duration_ms?: number;
  category?: string;
}

interface UnlockRow {
  usage_date: string;
  count?: number;
}

const json = jsonResponder();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const secret = req.headers.get("x-ingest-secret") ?? "";
  // Fail CLOSED: an unset secret must NOT leave this service-role endpoint open.
  if (!INGEST_SECRET || secret !== INGEST_SECRET) return json({ ok: false, error: "Unauthorized" }, 401);

  let payload: { rows?: InRow[]; unlocks?: UnlockRow[] };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const result: Record<string, unknown> = { ok: true };

  // ── Phone unlocks → screentime_daily.pickups ──────────────────────────────
  const unlocksIn = (payload.unlocks ?? []).filter((u) => u && u.usage_date);
  if (unlocksIn.length) {
    const byDay = new Map<string, number>();
    for (const u of unlocksIn) byDay.set(u.usage_date, (byDay.get(u.usage_date) ?? 0) + Math.round(u.count ?? 0));
    const uRows = [...byDay.entries()].map(([usage_date, pickups]) => ({ user_id: USER_ID, usage_date, pickups }));
    const { error } = await supabase.from("screentime_daily").upsert(uRows, { onConflict: "user_id,usage_date", ignoreDuplicates: false });
    result.unlocks = error ? { error: error.message } : { upserted: uRows.length };
  }

  const rowsIn = (payload.rows ?? []).filter((r) => r && r.usage_date);
  if (!rowsIn.length) return json(result);

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

  const { error, count } = await supabase
    .from("screentime")
    .upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: false, count: "exact" });

  if (error) { result.ok = false; result.error = error.message; return json(result, 500); }
  result.apps = { received: rows.length, upserted: count ?? rows.length };
  return json(result);
});
