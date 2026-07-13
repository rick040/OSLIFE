/**
 * OSLIFE · Google Apps Script ingestion hub
 * ------------------------------------------------------------------
 * ONE standalone Apps Script project handles ALL OSLIFE ingestion. Create it at
 * script.google.com → New project (do NOT bind it to a sheet). It writes ONLY
 * to the OSLIFE project (nhyunnnmdcmojvkxrbpl) — no Vercel / rick-os middleman.
 *
 * Add these files to this one project:
 *   Code.gs              (this file) — Notion, Gmail, Calendar, payments-calendar
 *   health-sheets.gs     — reads your Health sheet  (by id)  → health-sheets-ingest
 *   payments-sheet.gs    — reads your Betalingen sheet (by id) → payments-sheet-ingest
 *   screentime-sheet.gs  — reads your Schermtijd sheet (by id) → screentime-sheet-ingest
 *
 * The sheet readers open your sheets BY ID (SpreadsheetApp.openById), so you do
 * NOT touch the existing Apps Script that fills each sheet — leave those as-is.
 *
 * SETUP
 * 1. Project Settings → Script Properties, add:
 *      SUPABASE_URL          https://nhyunnnmdcmojvkxrbpl.supabase.co
 *      SUPABASE_SERVICE_KEY  <service_role key from Supabase dashboard>
 *      OSLIFE_USER_ID        <auth.users uuid of your account>
 *      NOTION_TOKEN          secret_xxx
 *      NOTION_DB_ID          239ddc8e-9208-8186-b452-cc35f89677ff   (Projects)
 *      NOTION_CLIENTS_DB_ID  239ddc8e-9208-8102-86b9-eda32f63e815   (Clients)
 *      PAYMENTS_CAL_ID       <your payments Google Calendar id>
 *      INGEST_SECRET         <same secret as the edge-function secret>
 *      HEALTH_SYNC_URL       https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/health-sheets-ingest
 *      HEALTH_SHEET_ID       <id from the Health sheet URL>
 *      PAYMENTS_SYNC_URL     https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/payments-sheet-ingest
 *      PAYMENTS_SHEET_ID     <id from the Betalingen sheet URL>
 *      SCREENTIME_SYNC_URL   https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/screentime-sheet-ingest
 *      SCREENTIME_SHEET_ID   <id from the Schermtijd sheet URL>
 *   (The sheet id is the long code in the URL:
 *    docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit )
 *
 * 2. Run installAllTriggers() once → authorize all scopes when prompted.
 *    (Or add the triggers by hand — see installAllTriggers below.)
 *
 * LOGS: View → Executions.
 */

/** One-click: install every time-driven trigger this project needs. */
function installAllTriggers() {
  var wanted = {
    syncNotion: 15, syncClients: 15, syncGmail: 15, syncPayments: 15,   // every N minutes
    syncCalendarBlocks: 60,                                             // hourly (minutes)
    syncHealthSheet: 30, syncPaymentsSheet: 30, syncScreentimeSheet: 30,
  };
  var existing = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { existing[t.getHandlerFunction()] = true; });
  Object.keys(wanted).forEach(function (fn) {
    if (existing[fn]) return;
    var b = ScriptApp.newTrigger(fn).timeBased();
    if (wanted[fn] % 60 === 0) b.everyHours(wanted[fn] / 60).create();
    else b.everyMinutes(wanted[fn]).create();
    Logger.log('trigger installed: ' + fn + ' every ' + wanted[fn] + ' min');
  });
}

// ── Calendar config ────────────────────────────────────────────────────────
// List the calendar IDs to sync. Use ["all"] to sync every accessible calendar,
// or include "default" for your primary one.
var CALENDAR_IDS     = ['rickvmierlo@gmail.com', 'rick.prjct.agency@gmail.com'];
var LOOKBACK_DAYS    = 1;
var LOOKAHEAD_DAYS   = 60;

// ── Gmail config ───────────────────────────────────────────────────────────
var GMAIL_LOOKBACK_HOURS = 24;  // first-run fallback
var GMAIL_OVERLAP_SEC    = 300; // re-scan a small window before the cursor on each run
var GMAIL_MAX_THREADS    = 100;
var GMAIL_LAST_RUN_KEY   = 'GMAIL_LAST_RUN_SEC';

// ── Shared helpers ─────────────────────────────────────────────────────────

var P = PropertiesService.getScriptProperties();
function prop(k) { return P.getProperty(k); }

// User id under which all rows are scoped (RLS owner). Prefer OSLIFE_USER_ID,
// fall back to the legacy RICK_USER_ID property so existing setups keep working.
function userId_() { return prop('OSLIFE_USER_ID') || prop('RICK_USER_ID'); }

function log(msg) {
  Logger.log('[%s] %s', new Date().toISOString(), msg);
}

/**
 * Acquire the script lock so overlapping trigger runs don't double-process.
 * Returns the lock on success, null if another run already holds it (caller skips).
 * Always release in a finally block.
 */
function acquireLock_() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(1000);
    return lock;
  } catch (e) {
    return null;
  }
}

/**
 * Exponential backoff with jitter: ~1s, 2s, 4s, 8s (capped at 8s).
 */
function backoffMs_(attempt) {
  var base = Math.min(8000, 1000 * Math.pow(2, attempt - 1));
  return base + Math.floor(Math.random() * 400);
}

/**
 * Upsert rows into a Supabase table via PostgREST.
 * Retries on network failures, 429, and 5xx (up to 4 attempts).
 * Fails fast on 4xx (bad request won't fix itself).
 * rows: array of objects. conflict: comma-separated cols for on_conflict.
 */
/**
 * @param {boolean} [ignoreDuplicates] When true, rows that already exist (by
 *   `conflict`) are left untouched instead of overwritten. Use this for tables
 *   the native CRM lets the user edit (projects, clients) so a Notion re-sync
 *   never clobbers an in-app edit — it only inserts pages Supabase doesn't
 *   have yet.
 */
function supabaseUpsert(table, rows, conflict, ignoreDuplicates) {
  if (!rows.length) {
    log('supabaseUpsert(' + table + '): 0 rows — skipping');
    return;
  }

  var url = prop('SUPABASE_URL') + '/rest/v1/' + table +
            (conflict ? '?on_conflict=' + conflict : '');
  var userId = userId_();
  var withUser = rows.map(function (r) {
    return Object.assign({}, r, { user_id: userId });
  });
  var body = JSON.stringify(withUser);

  log('supabaseUpsert(' + table + '): sending ' + withUser.length + ' rows');

  var resolution = ignoreDuplicates ? 'ignore-duplicates' : 'merge-duplicates';
  var maxAttempts = 4;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    var res = null;
    try {
      res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: {
          apikey: prop('SUPABASE_SERVICE_KEY'),
          Authorization: 'Bearer ' + prop('SUPABASE_SERVICE_KEY'),
          Prefer: 'resolution=' + resolution + ',return=minimal'
        },
        payload: body,
        muteHttpExceptions: true
      });
    } catch (e) {
      // Network-level failure — retry.
      if (attempt < maxAttempts) {
        log('supabaseUpsert(' + table + '): network error on attempt ' + attempt + ', retrying…');
        Utilities.sleep(backoffMs_(attempt));
        continue;
      }
      throw new Error(table + ' upsert network error: ' + (e && e.message));
    }

    var code = res.getResponseCode();
    var resBody = res.getContentText();

    if (code < 300) {
      log('supabaseUpsert(' + table + '): OK (HTTP ' + code + ')');
      return;
    }

    var transient = code === 429 || code >= 500;
    if (transient && attempt < maxAttempts) {
      log('supabaseUpsert(' + table + '): HTTP ' + code + ' (attempt ' + attempt + '/' + maxAttempts + '), retrying…');
      Utilities.sleep(backoffMs_(attempt));
      continue;
    }
    throw new Error(table + ' upsert failed (' + code + '): ' + resBody.slice(0, 300));
  }
}

// ── Shared helpers for the Google-Sheet readers (health/payments/screentime) ──
// The sheet readers live in THIS same project and POST to Supabase edge
// functions with INGEST_SECRET, so they reuse these helpers instead of carrying
// their own copies.

/** Open a Google Sheet by the id stored in a Script Property (e.g. HEALTH_SHEET_ID). */
function openSheetById_(idProp) {
  var id = prop(idProp);
  if (!id) throw new Error('Set Script Property ' + idProp + ' to the spreadsheet id (from its URL).');
  return SpreadsheetApp.openById(id);
}

/** POST a JSON payload to an edge function with the shared INGEST_SECRET. Retries on 429/5xx. */
function ingestPost_(url, payload) {
  var secret = prop('INGEST_SECRET');
  if (!url || !secret) throw new Error('Set INGEST_SECRET and the *_SYNC_URL Script Properties.');
  var body = JSON.stringify(payload);
  for (var attempt = 1; attempt <= 4; attempt++) {
    var res = null;
    try {
      res = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        headers: { 'x-ingest-secret': secret }, payload: body, muteHttpExceptions: true,
      });
    } catch (e) {
      if (attempt < 4) { Utilities.sleep(backoffMs_(attempt)); continue; }
      throw new Error('ingest network error: ' + (e && e.message));
    }
    var code = res.getResponseCode(), text = res.getContentText();
    if (code < 300) { try { return JSON.parse(text); } catch (_) { return {}; } }
    if ((code === 429 || code >= 500) && attempt < 4) { Utilities.sleep(backoffMs_(attempt)); continue; }
    throw new Error('ingest ' + code + ': ' + text.slice(0, 400));
  }
}

/**
 * 'YYYY-MM-DD' from a Date or string cell. Handles:
 *   Date object → Amsterdam date
 *   '2026.06.25 02:46:00' (dots) and '2026-06-25 ...'
 *   ISO with time+Z → converted to the Amsterdam calendar date
 *   '25-06-2026' (dd-mm-yyyy)
 */
function sheetDate_(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'Europe/Amsterdam', 'yyyy-MM-dd');
  var s = String(val).trim();
  if (/^\d{4}[.\-/]\d{2}[.\-/]\d{2}/.test(s)) {
    if (s.indexOf('T') !== -1) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Europe/Amsterdam', 'yyyy-MM-dd');
    }
    return s.slice(0, 10).replace(/[.\/]/g, '-');
  }
  var m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

/** Full ISO datetime from a Date or string cell (keeps the time-of-day). */
function sheetDatetime_(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString();
  var s = String(val).trim();
  if (!s) return '';
  if (s.indexOf('T') !== -1) { var iso = new Date(s); if (!isNaN(iso.getTime())) return iso.toISOString(); }
  var m = s.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00') + 'Z';
  var dd = sheetDate_(val);
  return dd ? dd + 'T12:00:00Z' : '';
}

/** Minutes from a duration cell: a Sheets time-Date (1899 epoch), 'h:mm:ss', or '2m 27s'. */
function durationMin_(val) {
  if (val == null || val === '') return 0;
  if (val instanceof Date) return val.getUTCHours() * 60 + val.getUTCMinutes() + val.getUTCSeconds() / 60;
  var s = String(val).trim();
  if (/^\d{4}[.\-/]\d{2}[.\-/]\d{2}T/.test(s)) { var d = new Date(s); if (!isNaN(d.getTime())) return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60; }
  return durStringMs_(s) / 60000;
}

/** Milliseconds from a duration string: '2m 27s', '1u 3m', '1:23:45', 'mm:ss', or a bare number (minutes). */
function durStringMs_(val) {
  if (val == null || val === '') return 0;
  var s = String(val).trim().toLowerCase();
  if (s.indexOf(':') !== -1) {
    var p = s.split(':').map(function (x) { return parseInt(x, 10) || 0; });
    if (p.length === 3) return (p[0] * 3600 + p[1] * 60 + p[2]) * 1000;
    if (p.length === 2) return (p[0] * 60 + p[1]) * 1000;
  }
  var ms = 0, m;
  if ((m = s.match(/(\d+)\s*(?:u|uur|h|hr)\b/))) ms += parseInt(m[1], 10) * 3600000;
  if ((m = s.match(/(\d+)\s*m(?:in)?\b/)))        ms += parseInt(m[1], 10) * 60000;
  if ((m = s.match(/(\d+)\s*s(?:ec)?\b/)))        ms += parseInt(m[1], 10) * 1000;
  if (ms === 0) { var n = parseFloat(s.replace(',', '.')); if (!isNaN(n)) ms = Math.round(n * 60000); }
  return ms;
}

function sheetNum_(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;
  var n = parseFloat(String(val).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function sheetNumOrNull_(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return val;
  var n = parseFloat(String(val).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

/** Convert a duration cell to ms. Plain numbers = minutes; "h:mm[:ss]" parsed; ≥600000 = already ms. */
function toMs_(val) {
  if (val == null || val === '') return 0;
  if (val instanceof Date) return 0;
  var s = String(val).trim();
  if (s.indexOf(':') !== -1) {
    var parts = s.split(':').map(function (p) { return parseInt(p, 10) || 0; });
    var h = 0, m = 0, sec = 0;
    if (parts.length === 3) { h = parts[0]; m = parts[1]; sec = parts[2]; }
    else { m = parts[0]; sec = parts[1]; }
    return ((h * 3600) + (m * 60) + sec) * 1000;
  }
  var n = parseFloat(s.replace(',', '.'));
  if (isNaN(n)) return 0;
  return n >= 600000 ? Math.round(n) : Math.round(n * 60000);
}

/** Exact-match column index (case-insensitive) for one of the aliases; null if none. */
function headerIndex_(headerRow, aliases) {
  var norm = headerRow.map(function (h) { return String(h || '').trim().toLowerCase(); });
  for (var c = 0; c < norm.length; c++) if (aliases.indexOf(norm[c]) !== -1) return c;
  return null;
}

/** First column whose lowercased header CONTAINS any of `inc` and none of `exc`; -1 if none. */
function colIdx_(headerRow, inc, exc) {
  exc = exc || [];
  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c] || '').trim().toLowerCase();
    if (!h) continue;
    var hit = false, i;
    for (i = 0; i < inc.length; i++) if (h.indexOf(inc[i]) !== -1) { hit = true; break; }
    if (!hit) continue;
    var bad = false;
    for (i = 0; i < exc.length; i++) if (h.indexOf(exc[i]) !== -1) { bad = true; break; }
    if (!bad) return c;
  }
  return -1;
}

/** Map text to a domain. Tune keywords to your own senders/events. */
function domainFor(text) {
  var t = (text || '').toLowerCase();
  if (/parking|strijp|host|signage/.test(t))                              return 'parkingyou';
  if (/buurtkaart|geldrop|flyer|kroon/.test(t))                           return 'buurtkaart';
  if (/invoice|factuur|klant|client|prjct|logo|branding|website|mural/.test(t)) return 'prjct';
  return 'personal';
}

// ── 1. NOTION → projects + clients ───────────────────────────────────────────

var NOTION_STATUS_MAP = {
  'In uitvoering': 'active',
  'Gepland':       'lead',
  'Gepauzeerd':    'blocked',
  'Opgeleverd':    'done',
};

function notionFetch_(path, payload) {
  var res = UrlFetchApp.fetch('https://api.notion.com/v1' + path, {
    method: payload ? 'post' : 'get',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + prop('NOTION_TOKEN'), 'Notion-Version': '2022-06-28' },
    payload: payload ? JSON.stringify(payload) : undefined,
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code >= 300) throw new Error('Notion ' + path + ' HTTP ' + code + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}

function queryAllPages_(dbId) {
  var pages = [], cursor;
  do {
    var body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    var data = notionFetch_('/databases/' + dbId + '/query', body);
    pages = pages.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

function notionText_(prop) {
  if (!prop) return '';
  var arr = prop.title || prop.rich_text || [];
  return arr.map(function(t) { return t.plain_text; }).join('');
}
function notionSelect_(prop) { return prop && (prop.select || prop.status) ? (prop.select || prop.status).name : null; }
function notionMultiSelect_(prop) { return prop && prop.multi_select ? prop.multi_select.map(function(o){return o.name;}) : []; }
function notionDate_(prop) { return prop && prop.date ? prop.date.start : null; }
function notionNumber_(prop) { return prop && typeof prop.number === 'number' ? prop.number : 0; }
function notionEmail_(prop) { return prop && prop.email ? prop.email : null; }
function notionUrl_(prop) { return prop && prop.url ? prop.url : null; }

function syncNotion() {
  var lock = acquireLock_();
  if (!lock) { log('syncNotion: another run in progress — skipping'); return; }
  try {
    log('syncNotion: start');
    var dbId = prop('NOTION_DB_ID');
    if (!dbId) { log('syncNotion: NOTION_DB_ID not set — aborting'); return; }

    var pages = queryAllPages_(dbId);
    log('syncNotion: fetched ' + pages.length + ' pages');

    var rows = pages
      .map(function (pg) {
        var p = pg.properties;
        var name = notionText_(p['Name']) || 'Untitled';
        if (name.charAt(0) === '{') return null; // skip template rows

        var notionStatus = notionSelect_(p['Status']);
        var appStatus    = NOTION_STATUS_MAP[notionStatus] || 'lead';
        var client       = notionText_(p['Client']);
        var types        = notionMultiSelect_(p['Type']);

        return {
          external_id: pg.id,
          notion_url:  pg.url,
          name:        name,
          client:      client,
          domain:      domainFor(name + ' ' + client),
          status:      appStatus,
          type:        types,
          prioriteit:  notionSelect_(p['Prioriteit']),
          start_datum: notionDate_(p['Start Datum']),
          deadline:    notionDate_(p['Deadline']),
          value:       notionNumber_(p['Budget']),
          progress:    notionNumber_(p['Progress']),
          source:      'notion',
        };
      })
      .filter(function(r) { return r !== null; });

    supabaseUpsert('projects', rows, 'user_id,external_id', true);
    log('syncNotion: done — ' + rows.length + ' rows');
  } finally {
    lock.releaseLock();
  }
}

// ── 1b. NOTION Clients DB → clients table ────────────────────────────────────
function syncClients() {
  var lock = acquireLock_();
  if (!lock) { log('syncClients: another run in progress — skipping'); return; }
  try {
    log('syncClients: start');
    var dbId = prop('NOTION_CLIENTS_DB_ID');  // set in Script Properties: 239ddc8e-9208-8102-86b9-eda32f63e815
    if (!dbId) { log('syncClients: NOTION_CLIENTS_DB_ID not set — skipping'); return; }

    var pages = queryAllPages_(dbId);
    log('syncClients: fetched ' + pages.length + ' pages');

    var rows = pages
      .map(function (pg) {
        var p = pg.properties;
        var name = notionText_(p['Name']);
        if (!name) return null;
        return {
          external_id:   pg.id,
          notion_url:    pg.url,
          name:          name,
          client_status: notionSelect_(p['Client Status']),
          crm_status:    notionSelect_(p['CRM Status']),
          first_contact: notionDate_(p['First Contact']),
          email:         notionEmail_(p['Email']),
          website_url:   notionUrl_(p['Website URL']),
          potentie:      notionSelect_(p['Potentie']),
          scope:         notionNumber_(p['Scope']),
          domain:        domainFor(name),
        };
      })
      .filter(function(r) { return r !== null; });

    supabaseUpsert('clients', rows, 'user_id,external_id', true);
    log('syncClients: done — ' + rows.length + ' rows');
  } finally {
    lock.releaseLock();
  }
}

// ── 2. GMAIL → gmail_messages ────────────────────────────────────────────────
// Uses an incremental cursor (last successful run stored in Script Properties)
// so each run only scans messages since then, plus a small overlap to avoid gaps.
// Falls back to GMAIL_LOOKBACK_HOURS on first run.
function syncGmail() {
  var lock = acquireLock_();
  if (!lock) { log('syncGmail: another run in progress — skipping'); return; }
  try {
    log('syncGmail: start');

    var nowSec   = Math.floor(Date.now() / 1000);
    var fallback = nowSec - GMAIL_LOOKBACK_HOURS * 3600;
    var lastRun  = parseInt(P.getProperty(GMAIL_LAST_RUN_KEY) || '0', 10);
    var sinceSec = lastRun > 0 ? Math.max(fallback, lastRun - GMAIL_OVERLAP_SEC) : fallback;
    var sinceMs  = sinceSec * 1000;

    var query =
      'in:inbox -category:promotions -category:social -category:forums ' +
      'after:' + sinceSec;

    var threads = GmailApp.search(query, 0, GMAIL_MAX_THREADS);
    if (threads.length === GMAIL_MAX_THREADS) {
      log('syncGmail: WARNING — hit MAX_THREADS=' + GMAIL_MAX_THREADS +
          '. Lower trigger interval or raise the cap if this recurs.');
    }
    log('syncGmail: found ' + threads.length + ' threads since ' + new Date(sinceMs).toISOString());

    var rows = [];
    for (var i = 0; i < threads.length; i++) {
      var th = threads[i];
      var labels = th.getLabels().map(function (l) { return l.getName(); });
      var msgs = th.getMessages();
      for (var j = 0; j < msgs.length; j++) {
        var m = msgs[j];
        try {
          // Thread can match `after:` on a recent message but still carry older ones.
          if (m.getDate().getTime() < sinceMs) continue;
          rows.push({
            from_addr:   m.getFrom(),
            subject:     (m.getSubject() || '').slice(0, 240),
            snippet:     (m.getPlainBody() || '').replace(/\s+/g, ' ').trim().slice(0, 280),
            received_at: m.getDate().toISOString(),
            read:        !th.isUnread(),
            importance:  'normal',
            labels:      labels,
            external_id: m.getId()
          });
        } catch (e) {
          log('syncGmail: skip message — ' + (e && e.message));
        }
      }
    }

    if (rows.length === 0) {
      log('syncGmail: no new messages');
      P.setProperty(GMAIL_LAST_RUN_KEY, String(nowSec));
      return;
    }

    // Send in chunks.
    var CHUNK = 25;
    for (var k = 0; k < rows.length; k += CHUNK) {
      supabaseUpsert('gmail_messages', rows.slice(k, k + CHUNK), 'user_id,external_id');
    }

    // Only advance cursor once all chunks succeed.
    P.setProperty(GMAIL_LAST_RUN_KEY, String(nowSec));
    log('syncGmail: done — ' + rows.length + ' messages upserted');
  } finally {
    lock.releaseLock();
  }
}

// ── 3. CALENDAR → day_blocks ──────────────────────────────────────────────────
// Syncs all calendars in CALENDAR_IDS from LOOKBACK_DAYS ago to LOOKAHEAD_DAYS ahead.
// Recurring-event instances get a unique external_id (base id + start time) so each
// instance keeps its own row instead of overwriting the others.
function syncCalendarBlocks() {
  var lock = acquireLock_();
  if (!lock) { log('syncCalendarBlocks: another run in progress — skipping'); return; }
  try {
    log('syncCalendarBlocks: start');

    var now  = new Date();
    var from = new Date(now.getTime() - LOOKBACK_DAYS  * 86400000);
    var to   = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400000);

    var cals = resolveCalendars_();
    if (cals.length === 0) {
      throw new Error('No calendars resolved from CALENDAR_IDS: ' + JSON.stringify(CALENDAR_IDS));
    }

    var rows = [];
    for (var c = 0; c < cals.length; c++) {
      var cal = cals[c];
      var events = cal.getEvents(from, to);
      log('syncCalendarBlocks: ' + cal.getId() + ' → ' + events.length + ' events');

      for (var i = 0; i < events.length; i++) {
        var e = events[i];
        try {
          var s    = e.getStartTime();
          var f    = e.getEndTime();
          var hhmm = function (d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm'); };
          var title = e.getTitle();
          // Suffix start-time millis so recurring instances get distinct external_ids.
          var extId = e.getId() + '_' + s.getTime();
          rows.push({
            title:       title,
            block_type:  domainFor(title),
            description: e.getDescription() || '',
            date:        Utilities.formatDate(s, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
            start_time:  hhmm(s),
            end_time:    hhmm(f),
            status:      'planned',
            external_id: extId
          });
        } catch (err) {
          log('syncCalendarBlocks: skip event — ' + (err && err.message));
        }
      }
    }

    var CHUNK = 50;
    for (var k = 0; k < rows.length; k += CHUNK) {
      supabaseUpsert('day_blocks', rows.slice(k, k + CHUNK), 'user_id,external_id');
    }
    log('syncCalendarBlocks: done — ' + rows.length + ' events across ' + cals.length + ' calendar(s)');
  } finally {
    lock.releaseLock();
  }
}

function resolveCalendars_() {
  if (CALENDAR_IDS.length === 1 && CALENDAR_IDS[0] === 'all') {
    return CalendarApp.getAllCalendars();
  }
  var cals = [];
  for (var i = 0; i < CALENDAR_IDS.length; i++) {
    var id = CALENDAR_IDS[i];
    var c  = id === 'default' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (c) cals.push(c);
    else log('resolveCalendars_: not found / not accessible: ' + id);
  }
  return cals;
}

// ── 4. PAYMENTS CALENDAR → payments ──────────────────────────────────────────
function syncPayments() {
  var lock = acquireLock_();
  if (!lock) { log('syncPayments: another run in progress — skipping'); return; }
  try {
    log('syncPayments: start');
    var calId = prop('PAYMENTS_CAL_ID');
    if (!calId) { log('syncPayments: PAYMENTS_CAL_ID not set — aborting'); return; }
    var cal = CalendarApp.getCalendarById(calId);
    if (!cal) throw new Error('Payments calendar not found / not shared: ' + calId);

    var from = new Date(Date.now() - 90  * 86400000);
    var to   = new Date(Date.now() + 180 * 86400000);
    var events = cal.getEvents(from, to);
    log('syncPayments: found ' + events.length + ' payment events');

    var rows = events.map(function (e) {
      var text      = e.getTitle() + ' ' + (e.getDescription() || '');
      var amt       = (text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/) || [])[1];
      var amount    = amt ? parseFloat(amt.replace(/\./g, '').replace(',', '.')) : 0;
      // Prefer the explicit [in]/[uit] marker (the same convention payee strips
      // below). Fall back to unambiguous keywords — NOT a bare "in" (matched any
      // title with the word "in", e.g. "Betaling in termijnen") and NOT
      // "factuur"/"invoice" (an invoice can just as easily be payable/outgoing).
      var direction = /\[in\]/i.test(text) ? 'incoming'
        : /\[uit\]/i.test(text) ? 'outgoing'
        : /\b(ontvang(?:en|st)?|inkomend|incoming)\b/i.test(text) ? 'incoming'
        : 'outgoing';
      var paid      = /betaald|paid|✓|✔/i.test(text);
      var payee     = e.getTitle().replace(/\[(in|uit)\]/i, '').replace(/€?\s*\d+[.,]?\d*/, '').trim() || 'Onbekend';
      return {
        payee:      payee,
        amount:     amount,
        due:        Utilities.formatDate(e.getStartTime(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        direction:  direction,
        status:     paid ? 'paid' : 'open',
        domain:     domainFor(text),
        source:     'calendar',
        external_id: e.getId()
      };
    });

    supabaseUpsert('payments', rows, 'user_id,source,external_id');
    log('syncPayments: done — ' + rows.length + ' rows');
  } finally {
    lock.releaseLock();
  }
}

// Health data is ingested from the Health Google Sheet by health-sheets.gs
// (its own Sheet-bound project → /functions/v1/health-sheets-ingest), so there
// is no Google Fit sync here anymore.
