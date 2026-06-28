/**
 * rick-os Apps Script — shared helpers
 * ---------------------------------------------------------------------------
 * Add this file to the SAME Apps Script project as gmail.gs and calendar.gs.
 * They both depend on the functions below.
 *
 * (health-sheets.gs is bound to your Google Sheet and lives in its own,
 *  separate project, so it carries its own copy of these helpers.)
 */

/**
 * Read required Script Properties or throw a single, clear error listing
 * everything that is missing. Returns an object keyed by property name.
 */
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

/**
 * POST JSON to an ingest endpoint with retry + exponential backoff.
 *
 * Retries on network-level failures and transient HTTP status (429 / 5xx).
 * Fails fast on 4xx (a bad request won't fix itself by retrying). Returns the
 * parsed JSON response body, or {} when the body isn't JSON.
 */
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
      // Network-level failure (DNS, timeout, connection reset) — retry.
      lastErr = e;
      if (attempt < maxAttempts) {
        Utilities.sleep(backoffMs_(attempt));
        continue;
      }
      throw new Error("ingest network error after " + attempt + " attempts: " + (e && e.message));
    }

    const code = res.getResponseCode();
    const text = res.getContentText();

    if (code < 300) {
      try { return JSON.parse(text); } catch (_) { return {}; }
    }

    const transient = code === 429 || code >= 500;
    if (transient && attempt < maxAttempts) {
      console.warn("ingest " + code + " (attempt " + attempt + "/" + maxAttempts + "), retrying…");
      Utilities.sleep(backoffMs_(attempt));
      continue;
    }
    throw new Error("ingest " + code + ": " + text.slice(0, 500));
  }
  throw lastErr || new Error("ingest failed");
}

/** Exponential backoff with jitter: ~1s, 2s, 4s, 8s (capped). */
function backoffMs_(attempt) {
  const base = Math.min(8000, 1000 * Math.pow(2, attempt - 1));
  return base + Math.floor(Math.random() * 400);
}

/**
 * Acquire the script lock so overlapping time-driven triggers (or rapid
 * onChange events) don't double-process the same data. Returns the lock on
 * success, or null when another run already holds it — callers should skip.
 * Always release the returned lock in a finally block.
 */
function acquireLock_(waitMs) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(waitMs || 1000);
    return lock;
  } catch (e) {
    return null;
  }
}
