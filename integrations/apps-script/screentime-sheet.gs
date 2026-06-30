/**
 * OSLIFE Schermtijd-sheet ingest — Google Apps Script
 * ---------------------------------------------------
 * Bound to your "Schermtijd" Google Sheet. Each category has its own tab; the
 * tab name is used as the screentime category. On every edit it flattens the
 * tabs to one row per (date, app, category) and POSTs to the
 * screentime-sheet-ingest edge function (→ `screentime` table).
 *
 * Two tab layouts are auto-detected:
 *   LONG  — headers include an "App" column:   Datum | App | Duur (min)
 *   WIDE  — no App column; first col is Date, every other column header is an
 *           app name and the cell is that app's usage:  Datum | Instagram | Chrome | …
 *
 * Durations: plain numbers are assumed to be MINUTES (converted to ms). Values
 * shaped "1:23" / "1:23:45" are parsed as h:mm[:ss] / mm:ss. Already-large
 * numbers (≥ 600000) are assumed to already be milliseconds.
 *
 * Setup:
 *  1. Open the Schermtijd sheet → Extensions → Apps Script → paste this file.
 *  2. Project Settings → Script properties, add:
 *       SCREENTIME_SYNC_URL = https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/screentime-sheet-ingest
 *       INGEST_SECRET       = <same secret set with: supabase secrets set INGEST_SECRET=…>
 *  3. Run installTrigger() once → authorize.
 *
 * Tabs whose name matches IGNORE_TABS (e.g. an overview/summary tab) are skipped.
 */

const ST_DATE_ALIASES = ["datum", "date", "dag", "day"];
const ST_APP_ALIASES  = ["app", "applicatie", "application", "app name", "naam"];
const ST_DUR_ALIASES  = ["duur", "duration", "tijd", "time", "minuten", "minutes", "gebruik", "usage"];
const IGNORE_TABS     = ["overzicht", "overview", "totaal", "samenvatting", "summary"];

function installTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "syncScreentimeToOslife")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("syncScreentimeToOslife").forSpreadsheet(ss).onChange().create();
  Logger.log("Trigger installed: syncScreentimeToOslife on onChange");
}

function syncScreentimeToOslife() {
  const cfg = requireProps_(["SCREENTIME_SYNC_URL", "INGEST_SECRET"]);
  const lock = acquireLock_(1000);
  if (!lock) { Logger.log("Another sync running — skipping."); return; }

  try {
    const rows = parseScreentime_(SpreadsheetApp.getActiveSpreadsheet());
    if (!rows.length) { Logger.log("No screentime rows found — skipping"); return; }

    const CHUNK = 400;
    let total = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const resp = ingestPost_(cfg.SCREENTIME_SYNC_URL, cfg.INGEST_SECRET, { rows: rows.slice(i, i + CHUNK) });
      total += (resp && resp.upserted) || 0;
    }
    Logger.log("Synced " + rows.length + " screentime rows (upserted " + total + ")");
  } finally {
    lock.releaseLock();
  }
}

function parseScreentime_(ss) {
  const out = [];
  const sheets = ss.getSheets();

  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s];
    const category = sheet.getName().trim();
    if (IGNORE_TABS.indexOf(category.toLowerCase()) !== -1) continue;

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) continue;

    const header = data[0].map((h) => String(h || "").trim().toLowerCase());
    const dateCol = firstMatch_(header, ST_DATE_ALIASES);
    if (dateCol == null) continue;
    const appCol = firstMatch_(header, ST_APP_ALIASES);
    const durCol = firstMatch_(header, ST_DUR_ALIASES);

    if (appCol != null && durCol != null) {
      // LONG layout
      for (let i = 1; i < data.length; i++) {
        const date = formatDate_(data[i][dateCol]);
        if (!date) continue;
        const app = String(data[i][appCol] || "").trim() || "all";
        const ms = toMs_(data[i][durCol]);
        if (ms <= 0) continue;
        out.push({ usage_date: date, app_name: app, duration_ms: ms, category: category.toLowerCase() });
      }
    } else {
      // WIDE layout — every non-date column header is an app name
      for (let c = 0; c < header.length; c++) {
        if (c === dateCol) continue;
        const app = String(data[0][c] || "").trim();
        if (!app) continue;
        for (let i = 1; i < data.length; i++) {
          const date = formatDate_(data[i][dateCol]);
          if (!date) continue;
          const ms = toMs_(data[i][c]);
          if (ms <= 0) continue;
          out.push({ usage_date: date, app_name: app, duration_ms: ms, category: category.toLowerCase() });
        }
      }
    }
  }
  return out;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function firstMatch_(header, aliases) {
  for (let c = 0; c < header.length; c++) if (aliases.indexOf(header[c]) !== -1) return c;
  return null;
}

/** Convert a cell to milliseconds. Plain numbers = minutes; "h:mm[:ss]" parsed; large = already ms. */
function toMs_(val) {
  if (val == null || val === "") return 0;
  if (val instanceof Date) return 0;
  const s = String(val).trim();
  if (s.indexOf(":") !== -1) {
    const parts = s.split(":").map(function (p) { return parseInt(p, 10) || 0; });
    let h = 0, m = 0, sec = 0;
    if (parts.length === 3) { h = parts[0]; m = parts[1]; sec = parts[2]; }
    else { m = parts[0]; sec = parts[1]; }
    return ((h * 3600) + (m * 60) + sec) * 1000;
  }
  const n = parseFloat(s.replace(",", "."));
  if (isNaN(n)) return 0;
  return n >= 600000 ? Math.round(n) : Math.round(n * 60000); // ms vs minutes
}

function formatDate_(val) {
  if (!val) return "";
  if (val instanceof Date) return Utilities.formatDate(val, "Europe/Amsterdam", "yyyy-MM-dd");
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return "";
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
      throw new Error("screentime ingest network error: " + (e && e.message));
    }
    const code = res.getResponseCode(), text = res.getContentText();
    if (code < 300) { try { return JSON.parse(text); } catch (_) { return {}; } }
    if ((code === 429 || code >= 500) && attempt < 4) { Utilities.sleep(backoffMs_(attempt)); continue; }
    throw new Error("screentime ingest " + code + ": " + text.slice(0, 400));
  }
}

function backoffMs_(attempt) { return Math.min(8000, 1000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 400); }

function acquireLock_(waitMs) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(waitMs || 1000); return lock; } catch (e) { return null; }
}
