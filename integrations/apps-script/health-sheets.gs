/**
 * OSLIFE Health-sheet reader — part of the standalone "OSLIFE ingest" project.
 * ---------------------------------------------------------------------------
 * Opens your Health Google Sheet BY ID (HEALTH_SHEET_ID) and POSTs to
 * health-sheets-ingest. Tailored to the Samsung-Health/Health-Sync export:
 *
 *   Tab "Stappen"      : Datum | Tijd | Stappen                 (per-interval → summed per day)
 *   Tab "Activiteiten" : … | Datum | … | Actieve tijd | Afstand (km)
 *   Tab "Gewicht"      : Datum | Tijd | Gewicht | Lichaamsvet percentage | …
 *   Tab "Slaap"        : Datum | Tijd | Duur in seconden | Slaap stadium
 *
 * Tab + column names are matched case-insensitively with NL/EN aliases, so
 * small renames keep working. Shared helpers live in Code.gs.
 * Trigger: installAllTriggers() installs syncHealthSheet (every 30 min).
 */

function syncHealthSheet() {
  var url = prop('HEALTH_SYNC_URL');
  if (!url) { log('syncHealthSheet: HEALTH_SYNC_URL not set — skipping'); return; }
  var lock = acquireLock_();
  if (!lock) { log('syncHealthSheet: another run in progress — skipping'); return; }
  try {
    var ss = openSheetById_('HEALTH_SHEET_ID');
    var activity = healthActivity_(ss);
    var body = healthBody_(ss);
    var sleep = healthSleep_(ss);
    if (!activity.length && !body.length && !sleep.length) { log('syncHealthSheet: no data'); return; }
    var resp = ingestPost_(url, { activity: activity, body: body, sleep: sleep });
    log('syncHealthSheet: activity ' + activity.length + ' body ' + body.length + ' sleep ' + sleep.length + ' → ' + JSON.stringify(resp));
  } finally {
    lock.releaseLock();
  }
}

/** Find a tab by name aliases (case-insensitive, contains). */
function healthTab_(ss, names) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName().trim().toLowerCase();
    for (var j = 0; j < names.length; j++) if (n.indexOf(names[j]) !== -1) return sheets[i];
  }
  return null;
}

// health_daily_stats: steps (Stappen) + distance/duration (Activiteiten), merged per day.
function healthActivity_(ss) {
  var byDate = {};
  function ensure(d) { if (!byDate[d]) byDate[d] = { steps: 0, distance_m: 0, calories_kcal: 0, duration_min: 0 }; return byDate[d]; }

  var stappen = healthTab_(ss, ['stappen', 'steps']);
  if (stappen) {
    var d = stappen.getDataRange().getValues();
    var dateC = colIdx_(d[0], ['datum', 'date']);
    var stepC = colIdx_(d[0], ['stappen', 'steps', 'aantal']);
    if (dateC !== -1 && stepC !== -1) {
      for (var i = 1; i < d.length; i++) { var dt = sheetDate_(d[i][dateC]); if (!dt) continue; ensure(dt).steps += sheetNum_(d[i][stepC]); }
    }
  }

  var act = healthTab_(ss, ['activiteit', 'activities', 'exercise', 'workout']);
  if (act) {
    var a = act.getDataRange().getValues();
    var dateA = colIdx_(a[0], ['datum', 'date']);
    var distA = colIdx_(a[0], ['afstand', 'distance']);
    var durA = colIdx_(a[0], ['actieve tijd', 'active', 'duur', 'duration'], ['verstreken']);
    if (dateA !== -1) {
      for (var k = 1; k < a.length; k++) {
        var dtA = sheetDate_(a[k][dateA]); if (!dtA) continue;
        var row = ensure(dtA);
        if (distA !== -1) row.distance_m += Math.round(sheetNum_(a[k][distA]) * 1000); // km → m
        if (durA !== -1) row.duration_min += Math.round(durationMin_(a[k][durA]));
      }
    }
  }

  var rows = [];
  for (var date in byDate) {
    var v = byDate[date];
    if (!v.steps && !v.distance_m && !v.calories_kcal && !v.duration_min) continue;
    rows.push({ date: date, steps: v.steps, distance_m: v.distance_m, calories_kcal: v.calories_kcal, duration_min: v.duration_min });
  }
  return rows;
}

// health_body_metrics: weight + body-fat from "Gewicht".
function healthBody_(ss) {
  var sheet = healthTab_(ss, ['gewicht', 'weight', 'body']);
  if (!sheet) return [];
  var d = sheet.getDataRange().getValues();
  if (d.length < 2) return [];
  var dateC = colIdx_(d[0], ['datum', 'date']);
  var wC = colIdx_(d[0], ['gewicht', 'weight'], ['vrij', 'massa']);
  var fatC = colIdx_(d[0], ['lichaamsvet perc', 'vetpercentage', 'body fat', 'lichaamsvet'], ['massa', 'vrij']);
  if (dateC === -1) return [];
  var rows = [];
  for (var i = 1; i < d.length; i++) {
    var dtFull = sheetDatetime_(d[i][dateC]); if (!dtFull) continue;
    var w = wC !== -1 ? sheetNumOrNull_(d[i][wC]) : null;
    var fat = fatC !== -1 ? sheetNumOrNull_(d[i][fatC]) : null;
    if (fat === 0) fat = null;          // 0% = not actually measured
    if (w === 0) w = null;
    if (w == null && fat == null) continue;
    rows.push({ datetime: dtFull, weight_kg: w, body_fat_pct: fat });
  }
  return rows;
}

// health_sleep: aggregate segment minutes per stage per day from "Slaap".
function healthSleep_(ss) {
  var sheet = healthTab_(ss, ['slaap', 'sleep']);
  if (!sheet) return [];
  var d = sheet.getDataRange().getValues();
  if (d.length < 2) return [];
  var dateC = colIdx_(d[0], ['datum', 'date']);
  var secC = colIdx_(d[0], ['seconden', 'seconds', 'duur', 'duration']);
  var stageC = colIdx_(d[0], ['stadium', 'stage', 'fase']);
  if (dateC === -1 || secC === -1) return [];

  var byDate = {};
  function ensure(dt) { if (!byDate[dt]) byDate[dt] = { light_min: 0, deep_min: 0, rem_min: 0, awake_min: 0 }; return byDate[dt]; }
  for (var i = 1; i < d.length; i++) {
    var dt = sheetDate_(d[i][dateC]); if (!dt) continue;
    var min = sheetNum_(d[i][secC]) / 60;
    var stage = stageC !== -1 ? String(d[i][stageC] || '').toLowerCase() : '';
    var b = ensure(dt);
    if (/diep|deep/.test(stage)) b.deep_min += min;
    else if (/rem/.test(stage)) b.rem_min += min;
    else if (/wakker|awake|ontwaak/.test(stage)) b.awake_min += min;
    else b.light_min += min; // licht/light/onbekend
  }
  var rows = [];
  for (var date in byDate) {
    var v = byDate[date];
    rows.push({ date: date, start_time: null, end_time: null,
      light_min: Math.round(v.light_min), deep_min: Math.round(v.deep_min),
      rem_min: Math.round(v.rem_min), awake_min: Math.round(v.awake_min) });
  }
  return rows;
}
