/**
 * OSLIFE · Google Apps Script ingestion hub
 * ------------------------------------------------------------------
 * Pulls each source on a time-driven trigger, normalizes it, and upserts
 * into Supabase via PostgREST using the service_role key (bypasses RLS).
 *
 * SETUP
 * 1. Project Settings → Script Properties, add:
 *      SUPABASE_URL          https://nhyunnnmdcmojvkxrbpl.supabase.co
 *      SUPABASE_SERVICE_KEY  <service_role key from Supabase dashboard>
 *      RICK_USER_ID          <auth.users uuid of your account>
 *      NOTION_TOKEN          secret_xxx
 *      NOTION_DB_ID          <projects database id>
 *      PAYMENTS_CAL_ID       <your payments Google Calendar ID>
 *
 * 2. Triggers (Triggers → Add):
 *      syncNotion          every 15 min
 *      syncGmail           every 15 min
 *      syncCalendarBlocks  every hour
 *      syncPayments        every 15 min
 *      syncFit             every hour
 *
 * 3. Run each function once manually → authorize OAuth scopes.
 *
 * 4. For screen time + wallet: use MacroDroid on Android (see README).
 *    Those POST directly to the Supabase REST API — no trigger needed here.
 *
 * LOGS
 * View → Executions (left sidebar) → click a run.
 */

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
function supabaseUpsert(table, rows, conflict) {
  if (!rows.length) {
    log('supabaseUpsert(' + table + '): 0 rows — skipping');
    return;
  }

  var url = prop('SUPABASE_URL') + '/rest/v1/' + table +
            (conflict ? '?on_conflict=' + conflict : '');
  var userId = prop('RICK_USER_ID');
  var withUser = rows.map(function (r) {
    return Object.assign({}, r, { user_id: userId });
  });
  var body = JSON.stringify(withUser);

  log('supabaseUpsert(' + table + '): sending ' + withUser.length + ' rows');

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
          Prefer: 'resolution=merge-duplicates,return=minimal'
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

    supabaseUpsert('projects', rows, 'user_id,external_id');
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

    supabaseUpsert('clients', rows, 'user_id,external_id');
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
      var direction = /\b(in|ontvang|factuur|invoice)\b/i.test(text) ? 'incoming' : 'outgoing';
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

// ── 5. GOOGLE FIT / SAMSUNG HEALTH → health_daily_stats ──────────────────────
// Samsung Health syncs to Google Fit via Health Connect (Android 14+).
// Phone: Samsung Health → Settings → Connected apps → Health Connect → Allow all.
function syncFit() {
  var lock = acquireLock_();
  if (!lock) { log('syncFit: another run in progress — skipping'); return; }
  try {
    log('syncFit: start');
    var token   = ScriptApp.getOAuthToken();
    var endMs   = Date.now();
    var startMs = endMs - 13 * 86400000;

    function aggregate(dataTypeName) {
      var res = UrlFetchApp.fetch('https://fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({
          aggregateBy:    [{ dataTypeName: dataTypeName }],
          bucketByTime:   { durationMillis: 86400000 },
          startTimeMillis: startMs, endTimeMillis: endMs
        }),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code >= 300) {
        log('syncFit: Fit API error ' + code + ' for ' + dataTypeName + ' — ' + res.getContentText().slice(0, 200));
        return [];
      }
      return JSON.parse(res.getContentText()).bucket || [];
    }

    var byDate = {};
    function ensureDay(d) {
      if (!byDate[d]) byDate[d] = { date: d, steps: 0, sleep_min: 0, avg_resting_hr: 0, active_min: 0 };
    }

    aggregate('com.google.step_count.delta').forEach(function (b) {
      var d = Utilities.formatDate(new Date(parseInt(b.startTimeMillis, 10)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var v = 0;
      (b.dataset[0].point || []).forEach(function (p) { v += p.value[0].intVal || 0; });
      ensureDay(d); byDate[d].steps = v;
    });

    // Sleep stages: 2=generic, 4=light, 5=deep, 6=REM — exclude 1=awake, 3=out-of-bed
    aggregate('com.google.sleep.segment').forEach(function (b) {
      var d = Utilities.formatDate(new Date(parseInt(b.startTimeMillis, 10)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var mins = 0;
      (b.dataset[0].point || []).forEach(function (p) {
        var stage = p.value[0].intVal;
        if (stage === 2 || stage >= 4) {
          mins += Math.round((parseInt(p.endTimeNanos, 10) - parseInt(p.startTimeNanos, 10)) / 60000000000);
        }
      });
      ensureDay(d); byDate[d].sleep_min = mins;
    });

    aggregate('com.google.heart_rate.bpm').forEach(function (b) {
      var d = Utilities.formatDate(new Date(parseInt(b.startTimeMillis, 10)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var total = 0, count = 0;
      (b.dataset[0].point || []).forEach(function (p) { total += p.value[0].fpVal || 0; count++; });
      if (count > 0) { ensureDay(d); byDate[d].avg_resting_hr = Math.round(total / count); }
    });

    aggregate('com.google.active_minutes').forEach(function (b) {
      var d = Utilities.formatDate(new Date(parseInt(b.startTimeMillis, 10)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var v = 0;
      (b.dataset[0].point || []).forEach(function (p) { v += p.value[0].intVal || 0; });
      ensureDay(d); byDate[d].active_min = v;
    });

    var rows = Object.keys(byDate).map(function (d) { return byDate[d]; });
    log('syncFit: ' + rows.length + ' days collected');
    supabaseUpsert('health_daily_stats', rows, 'user_id,date');
    log('syncFit: done');
  } finally {
    lock.releaseLock();
  }
}
