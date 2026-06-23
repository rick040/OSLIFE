/**
 * RICK-OS · Google Apps Script ingestion hub
 * ------------------------------------------------------------------
 * Pulls each source on a time-driven trigger, normalizes it, and upserts
 * into Supabase via PostgREST using the service_role key (bypasses RLS).
 *
 * SETUP
 * 1. Project Settings → Script Properties, add:
 *      SUPABASE_URL          https://<ref>.supabase.co
 *      SUPABASE_SERVICE_KEY  <service_role key>   (server-only, never in the app)
 *      RICK_USER_ID          <auth.users uuid of your account>
 *      NOTION_TOKEN          secret_xxx
 *      NOTION_DB_ID          <projects database id>
 *      GC_SECRET_ID          <gocardless secret id>
 *      GC_SECRET_KEY         <gocardless secret key>
 *      GC_ACCOUNT_ID         <linked ABN account id>
 *      PAYMENTS_CAL_ID       b310e66b...@group.calendar.google.com
 * 2. Triggers (Triggers → Add): syncNotion 15m, syncGmail 10m, syncCalendarBlocks 15m,
 *    syncPayments 15m, syncBank (4x/day: 7/12/17/22h), syncFit hourly.
 * 3. For Fit, add Fitness scopes to appsscript.json (see README).
 */

var P = PropertiesService.getScriptProperties();
function prop(k) { return P.getProperty(k); }

/** Generic Supabase upsert. rows: array of objects. conflict: comma cols for on_conflict. */
function supabaseUpsert(table, rows, conflict) {
  if (!rows.length) return;
  var url = prop('SUPABASE_URL') + '/rest/v1/' + table +
            (conflict ? '?on_conflict=' + conflict : '');
  var withUser = rows.map(function (r) { r.user_id = prop('RICK_USER_ID'); return r; });
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
  if (res.getResponseCode() >= 300) throw new Error(table + ': ' + res.getContentText());
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
  var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + prop('NOTION_DB_ID') + '/query', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + prop('NOTION_TOKEN'), 'Notion-Version': '2022-06-28' },
    payload: '{}',
    muteHttpExceptions: true
  });
  var pages = JSON.parse(res.getContentText()).results || [];
  var rows = pages.map(function (pg) {
    var p = pg.properties;
    var name = (p.Name && p.Name.title[0]) ? p.Name.title[0].plain_text : 'Untitled';
    var status = (p.Status && p.Status.status) ? p.Status.status.name.toLowerCase() : 'lead';
    var client = (p.Client && p.Client.rich_text[0]) ? p.Client.rich_text[0].plain_text : '';
    var deadline = (p.Deadline && p.Deadline.date) ? p.Deadline.date.start : null;
    var value = (p.Value && typeof p.Value.number === 'number') ? p.Value.number : 0;
    var progress = (p.Progress && typeof p.Progress.number === 'number') ? p.Progress.number : 0;
    return {
      name: name, client: client, domain: domainFor(name + ' ' + client),
      status: ['lead','active','review','blocked','done'].indexOf(status) >= 0 ? status : 'lead',
      deadline: deadline, value: value, progress: progress,
      source: 'notion', external_id: pg.id
    };
  });
  supabaseUpsert('projects', rows, 'user_id,source,external_id');
}

// ── 2. GMAIL → emails ────────────────────────────────────────────────────────
function syncGmail() {
  var threads = GmailApp.search('is:important newer_than:7d', 0, 25);
  var rows = threads.map(function (th) {
    var m = th.getMessages()[th.getMessageCount() - 1];
    var from = m.getFrom();
    return {
      from_addr: from, subject: th.getFirstMessageSubject(),
      snippet: m.getPlainBody().slice(0, 160),
      received_at: m.getDate().toISOString(),
      unread: th.isUnread(), important: true,
      domain: domainFor(from + ' ' + th.getFirstMessageSubject()),
      source: 'gmail', external_id: th.getId()
    };
  });
  supabaseUpsert('emails', rows, 'user_id,source,external_id');
}

// ── 3. CALENDAR (main) → blocks ──────────────────────────────────────────────
function syncCalendarBlocks() {
  var now = new Date();
  var end = new Date(now.getTime() + 36 * 3600 * 1000);
  var events = CalendarApp.getDefaultCalendar().getEvents(now, end);
  var rows = events.map(function (e) {
    var s = e.getStartTime(), f = e.getEndTime();
    var hhmm = function (d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm'); };
    return {
      title: e.getTitle(), domain: domainFor(e.getTitle()),
      date: Utilities.formatDate(s, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      start: hhmm(s), end: hhmm(f), status: 'planned',
      rationale: 'From Google Calendar', source: 'calendar', external_id: e.getId()
    };
  });
  supabaseUpsert('blocks', rows, 'user_id,source,external_id');
}

// ── 4. PAYMENTS CALENDAR → payments ──────────────────────────────────────────
function syncPayments() {
  var cal = CalendarApp.getCalendarById(prop('PAYMENTS_CAL_ID'));
  if (!cal) throw new Error('Payments calendar not found / not shared');
  var from = new Date(Date.now() - 90 * 86400000);
  var to = new Date(Date.now() + 180 * 86400000);
  var events = cal.getEvents(from, to);
  var rows = events.map(function (e) {
    var title = e.getTitle() + ' ' + (e.getDescription() || '');
    var amt = (title.match(/(\d+[.,]?\d*)/) || [])[1];
    var amount = amt ? parseFloat(amt.replace('.', '').replace(',', '.')) : 0;
    // direction: tag with [in]/[uit] in title, or default to outgoing
    var direction = /\b(in|ontvang|factuur|invoice)\b/i.test(title) ? 'incoming' : 'outgoing';
    var paid = /betaald|paid|✓|✔/i.test(title);
    return {
      payee: e.getTitle().replace(/\[(in|uit)\]/i, '').replace(/€?\s*\d+[.,]?\d*/, '').trim() || 'Onbekend',
      amount: amount, due: Utilities.formatDate(e.getStartTime(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      direction: direction, status: paid ? 'paid' : 'open',
      domain: domainFor(title), source: 'calendar', external_id: e.getId()
    };
  });
  supabaseUpsert('payments', rows, 'user_id,source,external_id');
}

// ── 5. GOCARDLESS (ABN) → transactions ───────────────────────────────────────
function syncBank() {
  var tok = UrlFetchApp.fetch('https://bankaccountdata.gocardless.com/api/v2/token/new/', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ secret_id: prop('GC_SECRET_ID'), secret_key: prop('GC_SECRET_KEY') }),
    muteHttpExceptions: true
  });
  var access = JSON.parse(tok.getContentText()).access;
  var res = UrlFetchApp.fetch(
    'https://bankaccountdata.gocardless.com/api/v2/accounts/' + prop('GC_ACCOUNT_ID') + '/transactions/',
    { headers: { Authorization: 'Bearer ' + access }, muteHttpExceptions: true });
  var booked = (JSON.parse(res.getContentText()).transactions || {}).booked || [];
  var rows = booked.map(function (t) {
    var amount = parseFloat(t.transactionAmount.amount);
    var merchant = t.creditorName || t.debtorName || (t.remittanceInformationUnstructured || 'Onbekend');
    return {
      date: t.bookingDate, amount: amount, merchant: merchant,
      category: amount > 0 ? 'Client income' : 'Uncategorized',
      domain: amount > 0 ? 'prjct' : domainFor(merchant),
      source: 'gocardless',
      external_id: t.transactionId || null,
      dedup_key: t.transactionId || (t.bookingDate + '|' + amount + '|' + merchant)
    };
  });
  supabaseUpsert('transactions', rows, 'user_id,dedup_key');
}

// ── 6. GOOGLE FIT → health_days ──────────────────────────────────────────────
function syncFit() {
  var token = ScriptApp.getOAuthToken(); // requires Fitness scopes in appsscript.json
  var endMs = Date.now();
  var startMs = endMs - 13 * 86400000;
  function aggregate(dataTypeName) {
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
    return JSON.parse(res.getContentText()).bucket || [];
  }
  var steps = aggregate('com.google.step_count.delta');
  var byDate = {};
  steps.forEach(function (b) {
    var d = Utilities.formatDate(new Date(parseInt(b.startTimeMillis, 10)), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var v = 0; (b.dataset[0].point || []).forEach(function (p) { v += p.value[0].intVal || 0; });
    byDate[d] = { date: d, steps: v };
  });
  // NOTE: sleep (com.google.sleep.segment) and heart rate (com.google.heart_rate.bpm)
  // follow the same pattern; merge into byDate, then:
  var rows = Object.keys(byDate).map(function (d) {
    return {
      date: d, steps: byDate[d].steps, step_goal: 8000,
      sleep_hours: 0, resting_hr: 0, active_minutes: 0, energy: 3, mood: 3,
      source: 'fit'
    };
  });
  supabaseUpsert('health_days', rows, 'user_id,date');
}
