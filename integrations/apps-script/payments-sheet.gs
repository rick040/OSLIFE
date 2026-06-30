/**
 * OSLIFE Betalingen-sheet ingest — Google Apps Script
 * ---------------------------------------------------
 * Bound to your "Betalingen" Google Sheet — the one where you log every card
 * payment from your phone. On every edit it reads the rows and POSTs them to
 * the payments-sheet-ingest edge function, which upserts into `finance_tx`.
 *
 * These rows share a dedup_key (`date|amount`) with the in-app ABN AMRO CSV
 * import, so a purchase that appears in BOTH this sheet and the monthly ABN
 * export is stored only once.
 *
 * Expected columns (header row, names are matched case-insensitively; order and
 * extra columns don't matter):
 *   Datum | Date            → transaction date
 *   Bedrag | Amount         → amount (always treated as spend → stored negative)
 *   Omschrijving | Merchant | Naam | Winkel   → counterparty / merchant
 *   Categorie | Category    → optional category
 *   Domein | Domain         → optional domain (personal/prjct/parkingyou/buurtkaart)
 *
 * Setup:
 *  1. Open the Betalingen sheet → Extensions → Apps Script → paste this file.
 *  2. Project Settings → Script properties, add:
 *       PAYMENTS_SYNC_URL = https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/payments-sheet-ingest
 *       INGEST_SECRET     = <same secret set with: supabase secrets set INGEST_SECRET=…>
 *  3. Run installTrigger() once → authorize.
 */

const PAY_HEADER_ALIASES = {
  date:     ["datum", "date", "transactiedatum", "boekdatum"],
  amount:   ["bedrag", "amount", "value", "afschrijving"],
  merchant: ["omschrijving", "merchant", "naam", "winkel", "tegenpartij", "description", "payee"],
  category: ["categorie", "category"],
  domain:   ["domein", "domain"],
};

function installTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "syncPaymentsToOslife")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("syncPaymentsToOslife").forSpreadsheet(ss).onChange().create();
  Logger.log("Trigger installed: syncPaymentsToOslife on onChange");
}

function syncPaymentsToOslife() {
  const cfg = requireProps_(["PAYMENTS_SYNC_URL", "INGEST_SECRET"]);
  const lock = acquireLock_(1000);
  if (!lock) { Logger.log("Another sync running — skipping."); return; }

  try {
    const transactions = parsePayments_(SpreadsheetApp.getActiveSpreadsheet());
    if (!transactions.length) { Logger.log("No payment rows found — skipping"); return; }

    // chunk to keep request bodies small
    const CHUNK = 200;
    let total = 0;
    for (let i = 0; i < transactions.length; i += CHUNK) {
      const resp = ingestPost_(cfg.PAYMENTS_SYNC_URL, cfg.INGEST_SECRET, {
        transactions: transactions.slice(i, i + CHUNK),
      });
      total += (resp && resp.upserted) || 0;
    }
    Logger.log("Synced " + transactions.length + " payment rows (upserted " + total + ")");
  } finally {
    lock.releaseLock();
  }
}

function parsePayments_(ss) {
  // Use the first sheet; if you keep the log on a specific tab, set its name here.
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const idx = headerIndex_(data[0], PAY_HEADER_ALIASES);
  if (idx.date == null || idx.amount == null) {
    Logger.log("Could not find Date/Amount columns — check the header row.");
    return [];
  }

  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const date = formatDate_(row[idx.date]);
    if (!date) continue;
    const amount = toNumOrNull_(row[idx.amount]);
    if (amount == null) continue;

    out.push({
      date: date,
      amount: -Math.abs(amount), // card payments are spend → negative
      merchant: idx.merchant != null ? String(row[idx.merchant] || "").slice(0, 200) : "",
      category: idx.category != null ? String(row[idx.category] || "").toLowerCase() : "",
      domain: idx.domain != null ? String(row[idx.domain] || "").toLowerCase() : "",
    });
  }
  return out;
}

// ── shared self-contained helpers (same pattern as health-sheets.gs) ─────────

function headerIndex_(headerRow, aliases) {
  const norm = headerRow.map((h) => String(h || "").trim().toLowerCase());
  const out = {};
  for (const field in aliases) {
    out[field] = null;
    for (let c = 0; c < norm.length; c++) {
      if (aliases[field].indexOf(norm[c]) !== -1) { out[field] = c; break; }
    }
  }
  return out;
}

function formatDate_(val) {
  if (!val) return "";
  if (val instanceof Date) return Utilities.formatDate(val, "Europe/Amsterdam", "yyyy-MM-dd");
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); // dd-mm-yyyy
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return "";
}

function toNumOrNull_(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number") return val;
  const n = parseFloat(String(val).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function requireProps_(keys) {
  const props = PropertiesService.getScriptProperties();
  const out = {}, missing = [];
  keys.forEach((k) => { const v = props.getProperty(k); if (!v) missing.push(k); out[k] = v; });
  if (missing.length) throw new Error("Missing Script Properties: " + missing.join(", "));
  return out;
}

function ingestPost_(url, secret, payload) {
  const body = JSON.stringify(payload);
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res = null;
    try {
      res = UrlFetchApp.fetch(url, {
        method: "post", contentType: "application/json",
        headers: { "x-ingest-secret": secret }, payload: body, muteHttpExceptions: true,
      });
    } catch (e) {
      if (attempt < 4) { Utilities.sleep(backoffMs_(attempt)); continue; }
      throw new Error("payments ingest network error: " + (e && e.message));
    }
    const code = res.getResponseCode(), text = res.getContentText();
    if (code < 300) { try { return JSON.parse(text); } catch (_) { return {}; } }
    if ((code === 429 || code >= 500) && attempt < 4) { Utilities.sleep(backoffMs_(attempt)); continue; }
    throw new Error("payments ingest " + code + ": " + text.slice(0, 400));
  }
}

function backoffMs_(attempt) { return Math.min(8000, 1000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 400); }

function acquireLock_(waitMs) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(waitMs || 1000); return lock; } catch (e) { return null; }
}
