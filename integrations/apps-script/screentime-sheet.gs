/**
 * OSLIFE Schermtijd-sheet reader — part of the standalone "OSLIFE ingest" project.
 * --------------------------------------------------------------------------------
 * Opens your Schermtijd Google Sheet BY ID (Script Property SCREENTIME_SHEET_ID).
 * Each tab is a category; tabs are flattened to one row per (date, app, category)
 * and POSTed to screentime-sheet-ingest (→ screentime). Leave the filling script
 * untouched. Shared helpers live in Code.gs.
 *
 * Two tab layouts are auto-detected:
 *   LONG  — a tab has an "App" column:  Datum | App | Duur (min)
 *   WIDE  — no App column; col A is Date, every other header is an app name.
 * Durations: plain numbers = minutes; "h:mm[:ss]" parsed; ≥600000 = already ms.
 *
 * Trigger: installAllTriggers() in Code.gs installs syncScreentimeSheet (every 30 min).
 */

var ST_DATE = ["datum", "date", "dag", "day"];
var ST_APP  = ["app", "applicatie", "application", "app name", "naam"];
var ST_DUR  = ["duur", "duration", "tijd", "time", "minuten", "minutes", "gebruik", "usage"];
var ST_IGNORE_TABS = ["overzicht", "overview", "totaal", "samenvatting", "summary"];

function syncScreentimeSheet() {
  var url = prop('SCREENTIME_SYNC_URL');
  if (!url) { log('syncScreentimeSheet: SCREENTIME_SYNC_URL not set — skipping'); return; }
  var lock = acquireLock_();
  if (!lock) { log('syncScreentimeSheet: another run in progress — skipping'); return; }
  try {
    var ss = openSheetById_('SCREENTIME_SHEET_ID');
    var rows = screentimeRows_(ss);
    if (!rows.length) { log('syncScreentimeSheet: no rows'); return; }

    var CHUNK = 400, total = 0;
    for (var k = 0; k < rows.length; k += CHUNK) {
      var resp = ingestPost_(url, { rows: rows.slice(k, k + CHUNK) });
      total += (resp && resp.upserted) || 0;
    }
    log('syncScreentimeSheet: ' + rows.length + ' rows (upserted ' + total + ')');
  } finally {
    lock.releaseLock();
  }
}

function screentimeRows_(ss) {
  var out = [];
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var category = sheet.getName().trim();
    if (ST_IGNORE_TABS.indexOf(category.toLowerCase()) !== -1) continue;

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) continue;

    var header = data[0];
    var dateCol = headerIndex_(header, ST_DATE);
    if (dateCol == null) continue;
    var appCol = headerIndex_(header, ST_APP);
    var durCol = headerIndex_(header, ST_DUR);
    var cat = category.toLowerCase();

    if (appCol != null && durCol != null) {
      for (var i = 1; i < data.length; i++) {
        var date = sheetDate_(data[i][dateCol]);
        if (!date) continue;
        var app = String(data[i][appCol] || '').trim() || 'all';
        var ms = toMs_(data[i][durCol]);
        if (ms <= 0) continue;
        out.push({ usage_date: date, app_name: app, duration_ms: ms, category: cat });
      }
    } else {
      for (var c = 0; c < header.length; c++) {
        if (c === dateCol) continue;
        var appName = String(header[c] || '').trim();
        if (!appName) continue;
        for (var r = 1; r < data.length; r++) {
          var d2 = sheetDate_(data[r][dateCol]);
          if (!d2) continue;
          var ms2 = toMs_(data[r][c]);
          if (ms2 <= 0) continue;
          out.push({ usage_date: d2, app_name: appName, duration_ms: ms2, category: cat });
        }
      }
    }
  }
  return out;
}
