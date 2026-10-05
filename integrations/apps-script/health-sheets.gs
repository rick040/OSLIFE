/**
 * OSLIFE Health-sheet reader — part of the standalone "OSLIFE ingest" project.
 * ---------------------------------------------------------------------------
 * Opens your Health Google Sheet BY ID (HEALTH_SHEET_ID) and POSTs to
 * health-ingest. Legacy fallback — Tasker now reads Health Connect directly
 * for sleep, and steps-ingest (MacroDroid, notification-based) is now the
 * primary real-time steps path — this sheet no longer reads a "Stappen" tab
 * at all. Tailored to the Samsung-Health/Health-Sync export:
 *
 *   Tab "Activiteiten" : … | Datum | … | Actieve tijd | Afstand (km)
 *   Tab "Gewicht"      : Datum | Tijd | Gewicht | Lichaamsvet percentage | …
 *                        (+ any body-composition columns the scale fills:
 *                        spiermassa, skeletspier, lichaamswater %, botmassa,
 *                        visceraal vet, BMR, BMI, … — see healthBody_)
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

// health_daily_stats: distance/duration (Activiteiten), merged per day.
// Steps are NOT read here — steps-ingest (MacroDroid, notification-based) owns
// that column now; sending steps from this batch sync would just get ignored
// by health-ingest anyway (the row omits the key), so there's no point reading it.
function healthActivity_(ss) {
  var byDate = {};
  function ensure(d) { if (!byDate[d]) byDate[d] = { distance_m: 0, calories_kcal: 0, duration_min: 0 }; return byDate[d]; }

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
    if (!v.distance_m && !v.calories_kcal && !v.duration_min) continue;
    rows.push({ date: date, distance_m: v.distance_m, calories_kcal: v.calories_kcal, duration_min: v.duration_min });
  }
  return rows;
}

// health_body_metrics: weight + body-fat from "Gewicht", plus whatever
// body-composition columns the export has. health-ingest range-checks each
// value (supabase/functions/_shared/bodyMetrics.ts), so a misread column is
// dropped there rather than stored.
function healthBody_(ss) {
  var sheet = healthTab_(ss, ['gewicht', 'weight', 'body']);
  if (!sheet) return [];
  var d = sheet.getDataRange().getValues();
  if (d.length < 2) return [];
  var dateC = colIdx_(d[0], ['datum', 'date']);
  var wC = colIdx_(d[0], ['gewicht', 'weight'], ['vrij', 'massa']);
  var fatC = colIdx_(d[0], ['lichaamsvet perc', 'vetpercentage', 'body fat', 'lichaamsvet'], ['massa', 'vrij']);
  if (dateC === -1) return [];

  // Percentages and masses often share a name ("Skeletspier" % vs kg), so the
  // header must say which: PCT words for a %, none of them for a kg column.
  var PCT = ['perc', '%', 'rate', 'ratio'];
  var h = d[0];
  var extraC = {
    bmi:                  bodyCol_(h, ['bmi']),
    muscle_pct:           bodyCol_(h, ['spier', 'muscle'], ['skelet'], PCT),
    muscle_mass_kg:       bodyCol_(h, ['spier', 'muscle'], ['skelet'].concat(PCT)),
    skeletal_muscle_pct:  bodyCol_(h, ['skelet'], [], PCT),
    skeletal_muscle_kg:   bodyCol_(h, ['skelet'], PCT),
    fat_free_mass_kg:     bodyCol_(h, ['vetvrij', 'fat free', 'fat-free', 'lean'], PCT),
    body_water_pct:       bodyCol_(h, ['water', 'vocht'], [], PCT),
    bone_mass_kg:         bodyCol_(h, ['botmassa', 'bone'], PCT),
    protein_pct:          bodyCol_(h, ['eiwit', 'protein', 'proteïne']),
    subcutaneous_fat_pct: bodyCol_(h, ['onderhuids', 'subcuta']),
    visceral_fat:         bodyCol_(h, ['visceraal', 'visceral']),
    bmr_kcal:             bodyCol_(h, ['bmr', 'basaal', 'basal', 'rustverbranding']),
    metabolic_age:        bodyCol_(h, ['metabole leeftijd', 'lichaamsleeftijd', 'metabolic age', 'body age']),
  };

  var rows = [];
  for (var i = 1; i < d.length; i++) {
    var dtFull = sheetDatetime_(d[i][dateC]); if (!dtFull) continue;
    var w = wC !== -1 ? sheetNumOrNull_(d[i][wC]) : null;
    var fat = fatC !== -1 ? sheetNumOrNull_(d[i][fatC]) : null;
    if (fat === 0) fat = null;          // 0% = not actually measured
    if (w === 0) w = null;
    var row = { datetime: dtFull, weight_kg: w, body_fat_pct: fat };
    var hasExtra = false;
    for (var key in extraC) {
      if (extraC[key] === -1) continue;
      var v = sheetNumOrNull_(d[i][extraC[key]]);
      if (v == null || v === 0) continue; // 0 = not measured, same as weight/fat
      row[key] = v;
      hasExtra = true;
    }
    if (w == null && fat == null && !hasExtra) continue;
    rows.push(row);
  }
  return rows;
}

/** Like colIdx_, but optionally also requires one of `also` in the header. */
function bodyCol_(header, inc, exc, also) {
  exc = exc || [];
  for (var c = 0; c < header.length; c++) {
    var t = String(header[c] || '').trim().toLowerCase();
    if (!t) continue;
    if (!inc.some(function (k) { return t.indexOf(k) !== -1; })) continue;
    if (exc.some(function (k) { return t.indexOf(k) !== -1; })) continue;
    if (also && !also.some(function (k) { return t.indexOf(k) !== -1; })) continue;
    return c;
  }
  return -1;
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
