/**
 * OSLIFE Health-sheet reader — part of the standalone "OSLIFE ingest" project.
 * ---------------------------------------------------------------------------
 * Opens your Health Google Sheet BY ID (Script Property HEALTH_SHEET_ID), reads
 * the tabs and POSTs to the health-sheets-ingest edge function. It does NOT
 * touch the script that fills the sheet — leave that one alone.
 *
 * Shared helpers (openSheetById_, ingestPost_, sheetDate_, sheetNum_,
 * sheetNumOrNull_, sheetDatetime_) live in Code.gs in the same project.
 *
 * Trigger: installAllTriggers() in Code.gs installs syncHealthSheet (every 30 min).
 *
 * Expected tabs (Date in column A):
 *   "Steps" | "Distance" | "Calories Burned" | "Weight" | "Body Fat" |
 *   "Sleep" (Date|Start|End|Duration hrs) | "Exercise" (Date|Type|Title|Start|End|Duration min)
 */

var H_TAB_STEPS    = "Steps";
var H_TAB_DISTANCE = "Distance";
var H_TAB_CALORIES = "Calories Burned";
var H_TAB_WEIGHT   = "Weight";
var H_TAB_BODY_FAT = "Body Fat";
var H_TAB_SLEEP    = "Sleep";
var H_TAB_EXERCISE = "Exercise";

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

function healthActivity_(ss) {
  var byDate = {};
  function ensure(d) { if (!byDate[d]) byDate[d] = { steps: 0, distance_m: 0, calories_kcal: 0, duration_min: 0 }; return byDate[d]; }

  var steps = ss.getSheetByName(H_TAB_STEPS);
  if (steps) { var d = steps.getDataRange().getValues(); for (var i = 1; i < d.length; i++) { var dt = sheetDate_(d[i][0]); if (dt) ensure(dt).steps = Math.max(ensure(dt).steps, sheetNum_(d[i][1])); } }

  var dist = ss.getSheetByName(H_TAB_DISTANCE);
  if (dist) { var d2 = dist.getDataRange().getValues(); for (var j = 1; j < d2.length; j++) { var dt2 = sheetDate_(d2[j][0]); if (dt2) ensure(dt2).distance_m = Math.max(ensure(dt2).distance_m, sheetNum_(d2[j][1])); } }

  var cal = ss.getSheetByName(H_TAB_CALORIES);
  if (cal) { var d3 = cal.getDataRange().getValues(); for (var k = 1; k < d3.length; k++) { var dt3 = sheetDate_(d3[k][0]); if (!dt3) continue; var raw = sheetNum_(d3[k][1]); ensure(dt3).calories_kcal = Math.max(ensure(dt3).calories_kcal, raw >= 10000 ? raw / 1000 : raw); } }

  var ex = ss.getSheetByName(H_TAB_EXERCISE);
  if (ex) { var d4 = ex.getDataRange().getValues(); for (var m = 1; m < d4.length; m++) { var dt4 = sheetDate_(d4[m][0]); if (dt4) ensure(dt4).duration_min = Math.max(ensure(dt4).duration_min, sheetNum_(d4[m][5])); } }

  var rows = [];
  for (var date in byDate) {
    var v = byDate[date];
    if (!v.steps && !v.distance_m && !v.calories_kcal && !v.duration_min) continue;
    rows.push({ date: date, steps: v.steps, distance_m: v.distance_m, calories_kcal: v.calories_kcal, duration_min: v.duration_min });
  }
  return rows;
}

function healthBody_(ss) {
  var byDate = {};
  function ensure(d) { if (!byDate[d]) byDate[d] = { weight_kg: null, body_fat_pct: null }; return byDate[d]; }

  var w = ss.getSheetByName(H_TAB_WEIGHT);
  if (w) { var d = w.getDataRange().getValues(); for (var i = 1; i < d.length; i++) { var dt = sheetDate_(d[i][0]); if (!dt) continue; var raw = sheetNumOrNull_(d[i][1]); if (raw == null) continue; ensure(dt).weight_kg = raw >= 1000 ? raw / 1000 : raw; } }

  var f = ss.getSheetByName(H_TAB_BODY_FAT);
  if (f) { var d2 = f.getDataRange().getValues(); for (var j = 1; j < d2.length; j++) { var dt2 = sheetDate_(d2[j][0]); if (!dt2) continue; var raw2 = sheetNumOrNull_(d2[j][1]); if (raw2 == null) continue; ensure(dt2).body_fat_pct = raw2 >= 100 ? raw2 / 100 : raw2; } }

  var rows = [];
  for (var date in byDate) { var v = byDate[date]; if (v.weight_kg == null && v.body_fat_pct == null) continue; rows.push({ datetime: date + 'T12:00:00Z', weight_kg: v.weight_kg, body_fat_pct: v.body_fat_pct }); }
  return rows;
}

function healthSleep_(ss) {
  var sheet = ss.getSheetByName(H_TAB_SLEEP);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var date = sheetDate_(row[0]);
    if (!date) continue;
    var start = sheetDatetime_(row[1]);
    var end = sheetDatetime_(row[2]);
    var hrs = sheetNumOrNull_(row[3]);
    var ms = hrs != null ? Math.round(hrs * 3600000) : null;
    if (start && !end && ms != null) end = new Date(new Date(start).getTime() + ms).toISOString();
    else if (!start && end && ms != null) start = new Date(new Date(end).getTime() - ms).toISOString();
    if (!start && !end) continue;
    rows.push({ date: date, start_time: start || null, end_time: end || null, light_min: 0, deep_min: 0, rem_min: 0, awake_min: 0 });
  }
  return rows;
}
