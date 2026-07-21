/**
 * Supabase Edge Function: stock-quote
 * ------------------------------------
 * Fetches the latest price for a small, caller-supplied list of tickers — the
 * investments tab's tracker is deliberately scoped to what's actually owned,
 * never a general market feed, so this never crawls or caches a universe of
 * symbols. Backed by Stooq's free, no-key-required quote endpoint (delayed,
 * not tick-real-time, but good enough for a lightweight P/L tracker) — fetched
 * server-side here so the browser never needs a scraping-style cross-origin
 * request, and so a future provider swap only touches this one file.
 *
 * Also resolves EURUSD/EURGBP so the frontend can convert a non-EUR holding's
 * price back to EUR without shipping its own FX logic.
 *
 *   request:  { "tickers": ["AAPL.US", "ASML.NL"] }
 *   response: {
 *     "quotes": { "AAPL.US": { "price": 191.23, "currency": "USD", "asOf": "2026-07-21" }, ... },
 *     "fx": { "EURUSD": 1.08, "EURGBP": 0.85 }
 *   }
 *
 * Deploy:
 *   supabase functions deploy stock-quote --project-ref nhyunnnmdcmojvkxrbpl
 */

import { CORS, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const json = jsonResponder(CORS);
const STOOQ_URL = "https://stooq.com/q/l/";
const MAX_TICKERS = 40;

interface Req {
  tickers?: string[];
}

type Currency = "EUR" | "USD" | "GBP";

function currencyForTicker(ticker: string): Currency {
  const suffix = ticker.toLowerCase().split(".").pop();
  if (suffix === "us") return "USD";
  if (suffix === "uk") return "GBP";
  return "EUR";
}

/** Parses Stooq's `s,date,time,open,high,low,close,volume` CSV (header included via &h). */
function parseStooqCsv(csv: string): Map<string, { close: number | null; date: string | null }> {
  const out = new Map<string, { close: number | null; date: string | null }>();
  const lines = csv.trim().split("\n").slice(1); // drop header row
  for (const line of lines) {
    const cols = line.split(",");
    if (cols.length < 7) continue;
    const symbol = cols[0].trim().toUpperCase();
    const date = cols[1]?.trim();
    const close = Number(cols[6]);
    out.set(symbol, {
      close: Number.isFinite(close) && close > 0 ? close : null,
      date: date && date !== "N/D" ? date : null,
    });
  }
  return out;
}

async function fetchQuotes(symbols: string[]): Promise<Map<string, { close: number | null; date: string | null }>> {
  if (!symbols.length) return new Map();
  const url = `${STOOQ_URL}?s=${symbols.map((s) => encodeURIComponent(s.toLowerCase())).join("+")}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url);
  if (!res.ok) return new Map();
  return parseStooqCsv(await res.text());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = bearerToken(req);
  if (!auth) return json({ error: "Unauthorized" }, 401);

  let body: Req;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const tickers = (body.tickers ?? []).filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  if (!tickers.length) return json({ quotes: {}, fx: { EURUSD: null, EURGBP: null } });
  if (tickers.length > MAX_TICKERS) return json({ error: `Too many tickers (max ${MAX_TICKERS})` }, 400);

  try {
    const [tickerRows, fxRows] = await Promise.all([
      fetchQuotes(tickers),
      fetchQuotes(["eurusd", "eurgbp"]),
    ]);

    const quotes: Record<string, { price: number | null; currency: Currency; asOf: string | null }> = {};
    for (const ticker of tickers) {
      const row = tickerRows.get(ticker.toUpperCase());
      quotes[ticker] = { price: row?.close ?? null, currency: currencyForTicker(ticker), asOf: row?.date ?? null };
    }

    const fx = {
      EURUSD: fxRows.get("EURUSD")?.close ?? null,
      EURGBP: fxRows.get("EURGBP")?.close ?? null,
    };

    return json({ quotes, fx });
  } catch (err) {
    return json({ error: `Quote lookup failed: ${String(err)}` }, 502);
  }
});
