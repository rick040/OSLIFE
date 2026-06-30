/**
 * OSLIFE Health Sheets ingest — Google Apps Script
 *
 * Reads data from your health export Google Sheet and upserts to the OSLIFE
 * Supabase project via the health-sheets-ingest edge function.
 *
 * This file is bound to your Google Sheet (its own Apps Script project), so it
 * is fully self-contained — it carries its own HTTP/retry/lock helpers rather
 * than depending on common.gs.
 *
 * Expected tabs (from Health Sync / Samsung Health export):
 *   "Steps"            — Date | Total Steps
 *   "Distance"         — Date | Distance (m)
 *   "Calories Burned"  — Date | Calories (kcal)  ← values are kcal × 1000
 *   "Weight"           — Date | Weight (kg)       ← values are grams
 *   "Body Fat"         — Date | Body Fat (%)      ← values are % × 100
 *   "Sleep"            — Date | Start Time | End Time | Duration (hrs)
 *   "Exercise"         — Date | Type | Title | Start | End | Duration (min)
 *
 * Setup:
 *  1. Open your health Google Sheet → Extensions → Apps Script.
 *  2. Paste this file (or replace the existing Code.gs).
 *  3. Script Properties (gear icon → Script properties) → add:
 *       HEALTH_SYNC_URL  = https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/health-sheets-ingest
 *       INGEST_SECRET    = <same random secret you set with: supabase secrets set INGEST_SECRET=…>
 *  4. Run installTrigger() once to set up the onChange trigger.
 *  5. Done — every sheet change auto-syncs to Supabase (idempotent upsert).
 */

// ── Tab names ──────────────────────────────────────────────────────────────
const TAB_STEPS    = "Steps";
const TAB_DISTANCE = "Distance";
const TAB_CALORIES = "Calories Burned";
const TAB_WEIGHT   = "Weight";
const TAB_BODY_FAT = "Body Fat";
const TAB_SLEEP    = "Sleep";
const TAB_EXERCISE = "Exercise";

// ── Install onChange trigger ───────────────────────────────────────────────
function installTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "syncHealthToOslife")
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("syncHealthToOslife")
    .forSpreadsheet(ss)
    .onChange()
    .create();

  Logger.log("Trigger installed: syncHealthToOslife on onChange");
}

// ── Main sync function (called by trigger) ─────────────────────────────────
function syncHealthToOslife() {
  const cfg = requireProps_(["HEALTH_SYNC_URL", "INGEST_SECRET"]);

  // onChange fires on every edit; the lock coalesces bursts so we don't fire a
  // pile of overlapping syncs for one paste of many rows.
  const lock = acquireLock_(1000);
  if (!lock) {
    Logger.log("Another sync is in progress — skipping this onChange.");
    return;
  }

  try {
    const ss       = SpreadsheetApp.getActiveSpreadsheet();
    const activity = parseActivity(ss);
    const body     = parseBody(ss);
    const sleep    = parseSleep(ss);

    if (activity.length === 0 && body.length === 0 && sleep.length === 0) {
      Logger.log("No data found — skipping");
      return;
    }

    const resp = ingestPost_(cfg.HEALTH_SYNC_URL, cfg.INGEST_SECRET, { activity, body, sleep });
    Logger.log(
      "Synced — activity:" + activity.length + " body:" + body.length +
      " sleep:" + sleep.length + " → " + JSON.stringify(resp)
    );
  } finally {
    lock.releaseLock();
  }
}

// ── Parsers ────────────────────────────────────────────────────────────────

function parseActivity(ss) {
  // Merge Steps + Distance + Calories Burned + Exercise by date
  const byDate = {};

  const ensure = function(date) {
    if (!byDate[date]) byDate[date] = { steps: 0, distance_m: 0, calories_kcal: 0, duration_min: 0 };
    return byDate[date];
  };

  // Steps
  const stepsSheet = ss.getSheetByName(TAB_STEPS);
  if (stepsSheet) {
    const data = stepsSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      const date = formatDate(data[i][0]);
      if (!date) continue;
      ensure(date).steps = Math.max(ensure(date).steps, toNum(data[i][1]));
    }
  }

  // Distance (meters — already in m, no conversion needed)
  const distSheet = ss.getSheetByName(TAB_DISTANCE);
  if (distSheet) {
    const data = distSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      const date = formatDate(data[i][0]);
      if (!date) continue;
      ensure(date).distance_m = Math.max(ensure(date).distance_m, toNum(data[i][1]));
    }
  }

  // Calories Burned — values are stored as kcal × 1000 → divide by 1000
  const calSheet = ss.getSheetByName(TAB_CALORIES);
  if (calSheet) {
    const data = calSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      const date = formatDate(data[i][0]);
      if (!date) continue;
      const raw = toNum(data[i][1]);
      const kcal = raw >= 10000 ? raw / 1000 : raw; // auto-detect scaling
      ensure(date).calories_kcal = Math.max(ensure(date).calories_kcal, kcal);
    }
  }

  // Exercise — Duration (min) in col 6 (index 5)
  const exSheet = ss.getSheetByName(TAB_EXERCISE);
  if (exSheet) {
    const data = exSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      const date = formatDate(data[i][0]);
      if (!date) continue;
      ensure(date).duration_min = Math.max(ensure(date).duration_min, toNum(data[i][5]));
    }
  }

  // Build output — skip all-zero rows
  const rows = [];
  for (const date in byDate) {
    const d = byDate[date];
    if (d.steps === 0 && d.distance_m === 0 && d.calories_kcal === 0 && d.duration_min === 0) continue;
    rows.push({ date, steps: d.steps, distance_m: d.distance_m, calories_kcal: d.calories_kcal, duration_min: d.duration_min });
  }
  return rows;
}

function parseBody(ss) {
  // Merge Weight + Body Fat by date
  const byDate = {};

  const ensure = function(date) {
    if (!byDate[date]) byDate[date] = { weight_kg: null, body_fat_pct: null };
    return byDate[date];
  };

  // Weight — values in grams → divide by 1000
  const weightSheet = ss.getSheetByName(TAB_WEIGHT);
  if (weightSheet) {
    const data = weightSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      const date = formatDate(data[i][0]);
      if (!date) continue;
      const raw = toNumOrNull(data[i][1]);
      if (raw == null) continue;
      const kg = raw >= 1000 ? raw / 1000 : raw; // auto-detect grams vs kg
      ensure(date).weight_kg = kg;
    }
  }

  // Body Fat — values are % × 100 → divide by 100
  const fatSheet = ss.getSheetByName(TAB_BODY_FAT);
  if (fatSheet) {
    const data = fatSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      const date = formatDate(data[i][0]);
      if (!date) continue;
      const raw = toNumOrNull(data[i][1]);
      if (raw == null) continue;
      const pct = raw >= 100 ? raw / 100 : raw; // auto-detect scaling
      ensure(date).body_fat_pct = pct;
    }
  }

  // Convert to body rows with datetime (use date as datetime)
  const rows = [];
  for (const date in byDate) {
    const d = byDate[date];
    if (d.weight_kg == null && d.body_fat_pct == null) continue;
    rows.push({ datetime: date + "T12:00:00Z", weight_kg: d.weight_kg, body_fat_pct: d.body_fat_pct });
  }
  return rows;
}

function parseSleep(ss) {
  const sheet = ss.getSheetByName(TAB_SLEEP);
  if (!sheet) { Logger.log("Tab not found: " + TAB_SLEEP); return []; }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  // Cols: Date | Start Time | End Time | Duration (hrs)
  const rows = [];
  for (var i = 1; i < data.length; i++) {
    const row   = data[i];
    const date  = formatDate(row[0]);
    if (!date) continue;

    let start = formatDatetime(row[1]);
    let end   = formatDatetime(row[2]);
    const durationHrs = toNumOrNull(row[3]);
    const durationMs  = durationHrs != null ? Math.round(durationHrs * 3600000) : null;

    // The export sometimes has only one endpoint plus a duration. Derive the
    // missing endpoint so the row still carries a usable interval instead of a
    // null the server has to guess at.
    if (start && !end && durationMs != null) {
      end = new Date(new Date(start).getTime() + durationMs).toISOString();
    } else if (!start && end && durationMs != null) {
      start = new Date(new Date(end).getTime() - durationMs).toISOString();
    }

    // Nothing usable on this row — skip it rather than push an empty interval.
    if (!start && !end) continue;

    rows.push({
      date,
      start_time: start || null,
      end_time:   end   || null,
      light_min:  0,
      deep_min:   0,
      rem_min:    0,
      awake_min:  0,
    });
  }
  return rows;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "UTC", "yyyy-MM-dd");
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function formatDatetime(val) {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString();
  const s = String(val).trim();
  if (!s) return "";
  const d = new Date(s.replace(" ", "T") + (s.includes("T") || s.includes("+") ? "" : "Z"));
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

function toNum(val) {
  if (val == null || val === "") return 0;
  const n = parseFloat(String(val).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function toNumOrNull(val) {
  if (val == null || val === "") return null;
  const n = parseFloat(String(val).replace(",", "."));
  return isNaN(n) ? null : n;
}

// ── Self-contained HTTP / config / lock helpers ─────────────────────────────
// (Kept local to this file because the Sheet-bound project doesn't share
//  common.gs with the gmail/calendar project.)

function requireProps_(keys) {
  const props = PropertiesService.getScriptProperties();
  const out = {};
  const missing = [];
  keys.forEach(function (k) {
    const v = props.getProperty(k);
    if (!v) missing.push(k);
    out[k] = v;
  });
  if (missing.length) {
    throw new Error("Missing Script Properties: " + missing.join(", "));
  }
  return out;
}

function ingestPost_(url, secret, payload, opts) {
  opts = opts || {};
  const maxAttempts = opts.maxAttempts || 4;
  const body = JSON.stringify(payload);
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res = null;
    try {
      res = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        headers: { "x-ingest-secret": secret },
        payload: body,
        muteHttpExceptions: true,
      });
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) { Utilities.sleep(backoffMs_(attempt)); continue; }
      throw new Error("health/sync-sheets network error after " + attempt + " attempts: " + (e && e.message));
    }

    const code = res.getResponseCode();
    const text = res.getContentText();

    if (code < 300) {
      try { return JSON.parse(text); } catch (_) { return {}; }
    }

    const transient = code === 429 || code >= 500;
    if (transient && attempt < maxAttempts) {
      Logger.log("health/sync-sheets " + code + " (attempt " + attempt + "/" + maxAttempts + "), retrying…");
      Utilities.sleep(backoffMs_(attempt));
      continue;
    }
    throw new Error("health/sync-sheets " + code + ": " + text.slice(0, 500));
  }
  throw lastErr || new Error("health/sync-sheets failed");
}

function backoffMs_(attempt) {
  const base = Math.min(8000, 1000 * Math.pow(2, attempt - 1));
  return base + Math.floor(Math.random() * 400);
}

function acquireLock_(waitMs) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(waitMs || 1000);
    return lock;
  } catch (e) {
    return null;
  }
}
