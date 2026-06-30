/**
 * OSLIFE Schermtijd-sheet reader — part of the standalone "OSLIFE ingest" project.
 * --------------------------------------------------------------------------------
 * Opens your Schermtijd Google Sheet BY ID (SCREENTIME_SHEET_ID) and POSTs to
 * screentime-sheet-ingest (→ screentime). Tailored to the StayFree export:
 *
 *   Tab "Gebruikstijd" : Datum | App | Device | Tijd (string) | Totaal (string)   ← ingested
 *   Tab "Aantal keren gebruikt"  ← skipped (open-counts, no duration column)
 *   Tab "Ontgrendelingen"        ← skipped (unlock counts; no place in the schema yet)
 *
 * Duration strings like "2m 27s" / "1u 3m" are parsed to ms. The category is the
 * tab name. dedup_key (date|app|category) keeps re-syncs idempotent.
 * Trigger: installAllTriggers() installs syncScreentimeSheet (every 30 min).
 */

// Tabs to skip: counts/unlocks/summaries — they have no usable duration column.
var ST_SKIP = ['aantal keren', 'ontgrendel', 'unlock', 'count', 'overzicht', 'overview', 'totaal', 'summary', 'samenvatting'];

function syncScreentimeSheet() {
  var url = prop('SCREENTIME_SYNC_URL');
  if (!url) { log('syncScreentimeSheet: SCREENTIME_SYNC_URL not set — skipping'); return; }
  var lock = acquireLock_();
  if (!lock) { log('syncScreentimeSheet: another run in progress — skipping'); return; }
  try {
    var ss = openSheetById_('SCREENTIME_SHEET_ID');
    var rows = screentimeRows_(ss);
    var unlocks = screentimeUnlocks_(ss);
    if (!rows.length && !unlocks.length) { log('syncScreentimeSheet: no rows'); return; }

    // Unlocks are small (one per day) — send once.
    if (unlocks.length) ingestPost_(url, { unlocks: unlocks });

    var CHUNK = 400, total = 0;
    for (var k = 0; k < rows.length; k += CHUNK) {
      var resp = ingestPost_(url, { rows: rows.slice(k, k + CHUNK) });
      total += (resp && resp.apps && resp.apps.upserted) || 0;
    }
    log('syncScreentimeSheet: ' + rows.length + ' app-rows (upserted ' + total + '), ' + unlocks.length + ' unlock-days');
  } finally {
    lock.releaseLock();
  }
}

// "Ontgrendelingen" tab: Datum | Aantal ontgrendelingen → pickups per day.
function screentimeUnlocks_(ss) {
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    if (sheets[s].getName().trim().toLowerCase().indexOf('ontgrendel') === -1) continue;
    var d = sheets[s].getDataRange().getValues();
    if (d.length < 2) return [];
    var dateC = colIdx_(d[0], ['datum', 'date']);
    var cntC = colIdx_(d[0], ['ontgrendel', 'unlock', 'aantal', 'count']);
    if (dateC === -1 || cntC === -1) return [];
    var out = [];
    for (var i = 1; i < d.length; i++) {
      var date = sheetDate_(d[i][dateC]); if (!date) continue;
      out.push({ usage_date: date, count: sheetNum_(d[i][cntC]) });
    }
    return out;
  }
  return [];
}

function screentimeRows_(ss) {
  var out = [];
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var name = sheet.getName().trim();
    var lname = name.toLowerCase();
    var skip = false;
    for (var z = 0; z < ST_SKIP.length; z++) if (lname.indexOf(ST_SKIP[z]) !== -1) { skip = true; break; }
    if (skip) continue;

    var d = sheet.getDataRange().getValues();
    if (d.length < 2) continue;

    var dateC = colIdx_(d[0], ['datum', 'date', 'dag']);
    var appC  = colIdx_(d[0], ['app', 'applicatie', 'application']);
    // duration = a "tijd/duur/time/usage" column, but NOT a cumulative "totaal/total" one.
    var durC  = colIdx_(d[0], ['tijd', 'duur', 'duration', 'time', 'gebruik', 'usage'], ['totaal', 'total', 'device']);
    if (dateC === -1 || appC === -1 || durC === -1) continue; // not a usable usage tab

    var cat = lname;
    for (var i = 1; i < d.length; i++) {
      var date = sheetDate_(d[i][dateC]); if (!date) continue;
      var app = String(d[i][appC] || '').trim(); if (!app) continue;
      var ms = durStringMs_(d[i][durC]);
      if (ms <= 0) continue;
      out.push({ usage_date: date, app_name: app, duration_ms: ms, category: cat });
    }
  }
  return out;
}
