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
 * no duplicates. A row wallet-ingest wrote as a PENDING_MERCHANT placeholder
 * (real-time bank notification with no merchant name) gets enriched with this
 * sheet's real merchant/category/domain instead of being dedup-blocked by it —
 * mirrors insertFinanceTx's enrichment in src/lib/supabase.ts. Any other
 * existing row (already has a real merchant, or was manually edited) wins,
 * via ignoreDuplicates, as before.
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

// MUST match PENDING_MERCHANT in supabase/functions/wallet-ingest/index.ts
// and src/lib/supabase.ts.
const PENDING_MERCHANT = "Onbekend (bank-melding)";

// Counterparties known to be the user's own accounts — money moving between
// wallets, not real income/spend. MUST match isTransferCounterparty() in
// src/finance/categories.ts.
const TRANSFER_COUNTERPARTIES = [/r\.?\s*van\s*mierlo/i, /prjct agency/i];

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
  // Fail CLOSED: an unset secret must NOT leave this service-role endpoint open.
  if (!INGEST_SECRET || secret !== INGEST_SECRET) return json({ ok: false, error: "Unauthorized" }, 401);

  let payload: { transactions?: InTx[] };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const txns = (payload.transactions ?? []).filter((t) => t && t.date && Number.isFinite(t.amount));
  if (!txns.length) return json({ ok: true, upserted: 0 });

  const rows = txns.map((t) => {
    const merchant = (t.merchant ?? "").slice(0, 200);
    const isTransfer = TRANSFER_COUNTERPARTIES.some((re) => re.test(merchant));
    return {
      user_id: USER_ID,
      occurred_on: t.date,
      amount: t.amount,
      counterparty: merchant,
      description: (t.description ?? "").slice(0, 200),
      category: isTransfer ? "Internal transfer" : (t.category ?? "Other"),
      domain: t.domain ?? "personal",
      source: "card_log",
      payment_method: "card",
      dedup_key: dedupKey(t.date, t.amount),
    };
  });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const dedupKeys = rows.map((r) => r.dedup_key);
  const { data: pendingRows, error: selectError } = await supabase
    .from("finance_tx")
    .select("dedup_key")
    .eq("user_id", USER_ID)
    .eq("counterparty", PENDING_MERCHANT)
    .in("dedup_key", dedupKeys);
  if (selectError) return json({ ok: false, error: selectError.message }, 500);
  const pendingKeys = new Set((pendingRows ?? []).map((r) => r.dedup_key as string));

  const toEnrich = rows.filter((r) => pendingKeys.has(r.dedup_key));
  const toInsert = rows.filter((r) => !pendingKeys.has(r.dedup_key));

  let upserted = 0;
  if (toEnrich.length) {
    const results = await Promise.all(
      toEnrich.map((r) =>
        supabase
          .from("finance_tx")
          .update(
            { counterparty: r.counterparty, description: r.description, category: r.category, domain: r.domain, source: r.source, payment_method: r.payment_method },
            { count: "exact" },
          )
          .eq("user_id", USER_ID)
          .eq("dedup_key", r.dedup_key)
          // Re-check counterparty at write time: don't clobber a manual edit
          // or a CSV-import enrichment that landed between select and update.
          .eq("counterparty", PENDING_MERCHANT),
      ),
    );
    const enrichError = results.find((r) => r.error)?.error;
    if (enrichError) return json({ ok: false, error: enrichError.message }, 500);
    upserted += results.reduce((n, r) => n + (r.count ?? 0), 0);
  }

  if (toInsert.length) {
    // ignoreDuplicates: a row already present (e.g. from the ABN CSV import) wins.
    const { error, count } = await supabase
      .from("finance_tx")
      .upsert(toInsert, { onConflict: "user_id,dedup_key", ignoreDuplicates: true, count: "exact" });
    if (error) return json({ ok: false, error: error.message }, 500);
    upserted += count ?? toInsert.length;
  }

  return json({ ok: true, received: rows.length, upserted });
});
