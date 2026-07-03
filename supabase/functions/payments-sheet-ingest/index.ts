/**
 * Supabase Edge Function: payments-sheet-ingest
 * ----------------------------------------------
 * Receives the card-payment log from the "Betalingen" Google Sheet
 * (payments-sheet.gs, bound to that sheet) and upserts into `finance_tx`.
 *
 * Dedup contract (IMPORTANT):
 *   dedup_key = `${occurred_on}|${amount.toFixed(2)}`
 * The in-app ABN AMRO CSV import uses the EXACT same key, so a purchase that is
 * both logged on your phone (this sheet) and present in the monthly ABN export
 * collapses to a single row via the UNIQUE (user_id, dedup_key) constraint —
 * no duplicates. Sheet rows are written with ignoreDuplicates so a later CSV
 * import never overwrites them, and vice-versa.
 *
 * Request body:
 *   { "transactions": [
 *       { "date": "YYYY-MM-DD", "amount": -12.5, "merchant": "Albert Heijn",
 *         "category": "groceries", "domain": "personal", "description": "..." }
 *   ]}
 *
 * Deploy:
 *   supabase functions deploy payments-sheet-ingest --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets: INGEST_SECRET, OSLIFE_USER_ID (or legacy RICK_USER_ID).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from "../_shared/http.ts";

const INGEST_SECRET = Deno.env.get("INGEST_SECRET") ?? "";

interface InTx {
  date: string;
  amount: number;
  merchant?: string;
  category?: string;
  domain?: string;
  description?: string;
}

const json = jsonResponder();

/** Same key the in-app ABN CSV import uses → cross-source dedup. */
export function dedupKey(date: string, amount: number): string {
  return `${date}|${amount.toFixed(2)}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const secret = req.headers.get("x-ingest-secret") ?? "";
  if (INGEST_SECRET && secret !== INGEST_SECRET) return json({ ok: false, error: "Unauthorized" }, 401);

  let payload: { transactions?: InTx[] };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const txns = (payload.transactions ?? []).filter((t) => t && t.date && Number.isFinite(t.amount));
  if (!txns.length) return json({ ok: true, upserted: 0 });

  const rows = txns.map((t) => ({
    user_id: USER_ID,
    occurred_on: t.date,
    amount: t.amount,
    counterparty: (t.merchant ?? "").slice(0, 200),
    description: (t.description ?? "").slice(0, 200),
    category: t.category ?? "other",
    domain: t.domain ?? "personal",
    source: "card_log",
    payment_method: "card",
    dedup_key: dedupKey(t.date, t.amount),
  }));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // ignoreDuplicates: a row already present (e.g. from the ABN CSV import) wins.
  const { error, count } = await supabase
    .from("finance_tx")
    .upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: true, count: "exact" });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, received: rows.length, upserted: count ?? rows.length });
});
