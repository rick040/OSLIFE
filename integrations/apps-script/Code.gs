/**
 * RICK-OS · Google Apps Script ingestion hub
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
 * 2. Triggers (Triggers → Add):
 *      syncNotion          every 15 min
 *      syncGmail           every 10 min
 *      syncCalendarBlocks  every 15 min
 *      syncPayments        every 15 min
 *      syncFit             every hour
 * 3. Run each function once manually → authorize OAuth scopes.
 * 4. For screen time + wallet: use MacroDroid on Android (see README).
 *    Those POST directly to the Supabase REST API — no trigger needed here.
 *
 * LOGS
 * View logs: Apps Script editor → Executions (left sidebar) → click a run.
 * Or: View → Logs while a manual run is active.
 */

var P = PropertiesService.getScriptProperties();
function prop(k) { return P.getProperty(k); }

/** Timestamped log helper — shows up in Executions log. */
function log(msg) {
  Logger.log('[%s] %s', new Date().toISOString(), msg);
}

/** Generic Supabase upsert. rows: array of objects. conflict: comma-separated cols for on_conflict. */
function supabaseUpsert(table, rows, conflict) {
  if (!rows.length) {
    log('supabaseUpsert(' + table + '): 0 rows — skipping');
    return;
  }
  var url = prop('SUPABASE_URL') + '/rest/v1/' + table +
            (conflict ? '?on_conflict=' + conflict : '');
  var userId = prop('RICK_USER_ID');
  // Build new objects instead of mutating the originals
  var withUser = rows.map(function (r) {
    return Object.assign({}, r, { user_id: userId });
  });
  log('supabaseUpsert(' + table + '): sending ' + withUser.length + ' rows to ' + url);
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: prop('SUPABASE_SERVICE_KEY'),
      Authorization: 'Bearer ' + prop('SUPABASE_SERVICE_KEY'),
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    payload: JSON.stringify(withUser),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  log('supabaseUpsert(' + table + '): HTTP ' + code + (body ? ' — ' + body.slice(0, 200) : ''));
  if (code >= 300) throw new Error(table + ' upsert failed (' + code + '): ' + body);
  log('supabaseUpsert(' + table + '): OK');
}

/** Map an email/keyword to a domain. Tune to your own senders/labels. */
function domainFor(text) {
  var t = (text || '').toLowerCase();
  if (/parking|strijp|host|signage/.test(t)) return 'parkingyou';
  if (/buurtkaart|geldrop|flyer|kroon/.test(t)) return 'buurtkaart';
  if (/invoice|factuur|klant|client|prjct|logo|branding|website|mural/.test(t)) return 'prjct';
  return 'personal';
}

// ── 1. NOTION → projects ─────────────────────────────────────────────────────
function syncNotion() {
  log('syncNotion: start');
  var dbId = prop('NOTION_DB_ID');
  if (!dbId) { log('syncNotion: NOTION_DB_ID not set — aborting'); return; }

  var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + prop('NOTION_TOKEN'), 'Notion-Version': '2022-06-28' },
    payload: '{}',
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  log('syncNotion: Notion API HTTP ' + code);
  if (code >= 300) {
    log('syncNotion: error response — ' + res.getContentText().slice(0, 300));
    throw new Error('Notion API error (' + code + ')');
  }

  var pages = JSON.parse(res.getContentText()).results || [];
  log('syncNotion: fetched ' + pages.length + ' pages from Notion');

  var rows = pages.map(function (pg) {
    var p = pg.properties;
    var name = (p.Name && p.Name.title[0]) ? p.Name.title[0].plain_text : 'Untitled';
    var status = (p.Status && p.Status.status) ? p.Status.status.name.toLowerCase() : 'lead';
    var client = (p.Client && p.Client.rich_text[0]) ? p.Client.rich_text[0].plain_text : '';
    var deadline = (p.Deadline && p.Deadline.date) ? p.Deadline.date.start : null;
    var value = (p.Value && typeof p.Value.number === 'number') ? p.Value.number : 0;
    var progress = (p.Progress && typeof p.Progress.number === 'number') ? p.Progress.number : 0;
    var validStatus = ['lead', 'active', 'review', 'blocked', 'done'].indexOf(status) >= 0 ? status : 'lead';
    log('syncNotion: page "' + name + '" status=' + validStatus + ' client=' + (client || '—') + ' value=' + value);
    return {
      name: name, client: client, domain: domainFor(name + ' ' + client),
      status: validStatus,
      deadline: deadline, value: value, progress: progress,
      source: 'notion', external_id: pg.id
    };
  });

  log('syncNotion: upserting ' + rows.length + ' project rows');
  supabaseUpsert('projects', rows, 'user_id,external_id');
  log('syncNotion: done');
}

// ── 2. GMAIL → gmail_messages ────────────────────────────────────────────────
function syncGmail() {
  log('syncGmail: start');
  var threads = GmailApp.search('is:important newer_than:7d', 0, 25);
  log('syncGmail: found ' + threads.length + ' important threads');

  var rows = threads.map(function (th) {
    var m = th.getMessages()[th.getMessageCount() - 1];
    var from = m.getFrom();
    var subject = th.getFirstMessageSubject();
    var isRead = !th.isUnread();
    log('syncGmail: thread "' + subject.slice(0, 60) + '" from=' + from + ' read=' + isRead);
    return {
      from_addr: from,
      subject: subject,
      snippet: m.getPlainBody().slice(0, 160),
      received_at: m.getDate().toISOString(),
      read: isRead,
      importance: 'high',
      labels: th.getLabels().map(function (l) { return l.getName(); }),
      external_id: th.getId()
    };
  });

  log('syncGmail: upserting ' + rows.length + ' message rows');
  supabaseUpsert('gmail_messages', rows, 'user_id,external_id');
  log('syncGmail: done');
}

// ── 3. CALENDAR (main) → day_blocks ──────────────────────────────────────────
function syncCalendarBlocks() {
  log('syncCalendarBlocks: start');
  var now = new Date();
  var end = new Date(now.getTime() + 36 * 3600 * 1000);
  log('syncCalendarBlocks: window ' + now.toISOString() + ' → ' + end.toISOString());

  var events = CalendarApp.getDefaultCalendar().getEvents(now, end);
  log('syncCalendarBlocks: found ' + events.length + ' events');

  var rows = events.map(function (e) {
    var s = e.getStartTime(), f = e.getEndTime();
    var hhmm = function (d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm'); };
    var title = e.getTitle();
    var btype = domainFor(title);
    log('syncCalendarBlocks: event "' + title + '" block_type=' + btype + ' ' + hhmm(s) + '-' + hhmm(f));
    return {
      title: title,
      block_type: btype,
      description: e.getDescription() || '',
      date: Utilities.formatDate(s, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      start_time: hhmm(s),
      end_time: hhmm(f),
      status: 'planned',
      external_id: e.getId()
    };
  });

  log('syncCalendarBlocks: upserting ' + rows.length + ' block rows');
  supabaseUpsert('day_blocks', rows, 'user_id,external_id');
  log('syncCalendarBlocks: done');
}

// ── 4. PAYMENTS CALENDAR → payments ──────────────────────────────────────────
function syncPayments() {
  log('syncPayments: start');
  var calId = prop('PAYMENTS_CAL_ID');
  var cal = CalendarApp.getCalendarById(calId);
  if (!cal) {
    log('syncPayments: calendar not found for id=' + calId);
    throw new Error('Payments calendar not found / not shared');
  }
  log('syncPayments: calendar "' + cal.getName() + '" found');

  var from = new Date(Date.now() - 90 * 86400000);
  var to = new Date(Date.now() + 180 * 86400000);
  log('syncPayments: window ' + from.toISOString() + ' → ' + to.toISOString());

  var events = cal.getEvents(from, to);
  log('syncPayments: found ' + events.length + ' payment events');

  var rows = events.map(function (e) {
    var title = e.getTitle() + ' ' + (e.getDescription() || '');
    // Fix: handle Dutch thousands (1.500,50) and plain decimals (15,50)
    var amt = (title.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/) || [])[1];
    var amount = amt ? parseFloat(amt.replace(/\./g, '').replace(',', '.')) : 0;
    var direction = /\b(in|ontvang|factuur|invoice)\b/i.test(title) ? 'incoming' : 'outgoing';
    var paid = /betaald|paid|✓|✔/i.test(title);
    var payee = e.getTitle().replace(/\[(in|uit)\]/i, '').replace(/€?\s*\d+[.,]?\d*/, '').trim() || 'Onbekend';
    log('syncPayments: "' + payee + '" amount=' + amount + ' dir=' + direction + ' paid=' + paid);
    return {
      payee: payee,
      amount: amount,
      due: Utilities.formatDate(e.getStartTime(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      direction: direction,
      status: paid ? 'paid' : 'open',
      domain: domainFor(title),
      source: 'calendar',
      external_id: e.getId()
    };
  });

  log('syncPayments: upserting ' + rows.length + ' payment rows');
  supabaseUpsert('payments', rows, 'user_id,source,external_id');
  log('syncPayments: done');
}

// ── 5. GOOGLE FIT / SAMSUNG HEALTH → health_daily_stats ──────────────────────
// Samsung Health syncs to Google Fit via Health Connect (Android 14+).
// On phone: Samsung Health → Settings → Connected apps → Health Connect → Allow all.
function syncFit() {
  log('syncFit: start');
  var token = ScriptApp.getOAuthToken();
  var endMs = Date.now();
  var startMs = endMs - 13 * 86400000; // last 13 days
  log('syncFit: querying last 13 days of Fit data');

  function aggregate(dataTypeName) {
    log('syncFit: aggregate(' + dataTypeName + ')');
    var res = UrlFetchApp.fetch('https://fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({
        aggregateBy: [{ dataTypeName: dataTypeName }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: startMs, endTimeMillis: endMs
      }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    log('syncFit: aggregate(' + dataTypeName + ') HTTP ' + code);
    if (code >= 300) {
      log('syncFit: Fit API error — ' + res.getContentText().slice(0, 300));
      return [];
    }
    var buckets = JSON.parse(res.getContentText()).bucket || [];
    log('syncFit: aggregate(' + dataTypeName + ') returned ' + buckets.length + ' buckets');
    return buckets;
  }

  // Seed byDate from ALL data types so days with no steps aren't dropped
  var byDate = {};
  function ensureDay(d) {
    if (!byDate[d]) byDate[d] = { date: d, steps: 0, sleep_min: 0, avg_resting_hr: 0, active_min: 0 };
  }

  // Steps
  aggregate('com.google.step_count.delta').forEach(function (b) {
    var d = Utilities.formatDate(new Date(parseInt(b.startTimeMillis, 10)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var v = 0;
    (b.dataset[0].point || []).forEach(function (p) { v += p.value[0].intVal || 0; });
    ensureDay(d);
    byDate[d].steps = v;
    log('syncFit: steps ' + d + ' = ' + v);
  });

  // Sleep: store as minutes — exclude stage 1 (awake) and 3 (out-of-bed)
  aggregate('com.google.sleep.segment').forEach(function (b) {
    var d = Utilities.formatDate(new Date(parseInt(b.startTimeMillis, 10)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var mins = 0;
    (b.dataset[0].point || []).forEach(function (p) {
      var stage = p.value[0].intVal;
      // 1=awake, 2=sleep(generic), 3=out-of-bed, 4=light, 5=deep, 6=REM
      // Only count actual sleep stages, not awake or out-of-bed
      if (stage === 2 || stage >= 4) {
        mins += Math.round((parseInt(p.endTimeNanos, 10) - parseInt(p.startTimeNanos, 10)) / 60000000000);
      }
    });
    ensureDay(d);
    byDate[d].sleep_min = mins;
    log('syncFit: sleep ' + d + ' = ' + mins + ' min');
  });

  // Resting heart rate → avg_resting_hr
  aggregate('com.google.heart_rate.bpm').forEach(function (b) {
    var d = Utilities.formatDate(new Date(parseInt(b.startTimeMillis, 10)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var total = 0, count = 0;
    (b.dataset[0].point || []).forEach(function (p) { total += p.value[0].fpVal || 0; count++; });
    if (count > 0) {
      ensureDay(d);
      byDate[d].avg_resting_hr = Math.round(total / count);
      log('syncFit: heart_rate ' + d + ' = ' + byDate[d].avg_resting_hr + ' bpm (n=' + count + ')');
    }
  });

  // Active minutes → active_min
  aggregate('com.google.active_minutes').forEach(function (b) {
    var d = Utilities.formatDate(new Date(parseInt(b.startTimeMillis, 10)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var v = 0;
    (b.dataset[0].point || []).forEach(function (p) { v += p.value[0].intVal || 0; });
    ensureDay(d);
    byDate[d].active_min = v;
    log('syncFit: active_min ' + d + ' = ' + v);
  });

  var rows = Object.keys(byDate).map(function (d) { return byDate[d]; });
  log('syncFit: ' + rows.length + ' days of health data collected');
  supabaseUpsert('health_daily_stats', rows, 'user_id,date');
  log('syncFit: done');
}
