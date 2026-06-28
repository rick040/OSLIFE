/**
 * rick-os Gmail ingest — Google Apps Script
 *
 * Setup:
 *  1. Go to https://script.google.com → New project, name it "rick-os ingest".
 *  2. Add this file PLUS common.gs (and optionally calendar.gs) to the project.
 *  3. Project Settings (gear icon) → Script Properties → add two properties:
 *       INGEST_URL    = https://<your-vercel-url>.vercel.app/api/ingest/gmail
 *       INGEST_SECRET = <same value as INGEST_SECRET in your .env.local + Vercel>
 *  4. Save, then click "Run" on ingestGmail() once.
 *     Authorize the Gmail + UrlFetchApp scopes when prompted.
 *  5. Triggers (clock icon) → Add Trigger → ingestGmail → Time-driven →
 *     Minutes timer → Every 15 minutes. Save.
 *
 *  After this, the script runs every 15 min and POSTs new INBOX messages
 *  (text only, no chat) to your endpoint. It keeps a cursor (last successful
 *  run) in Script Properties so each run only scans messages since then, with
 *  a small overlap so nothing slips through the cracks. Re-runs are safe: the
 *  endpoint dedups by Gmail message id.
 */

const LOOKBACK_HOURS = 24;        // first-run window (and fallback if cursor is lost)
const OVERLAP_SECONDS = 5 * 60;   // re-scan a little before the cursor to avoid gaps
const MAX_THREADS = 100;          // safety cap; we warn if a run hits it
const MAX_BODY_CHARS = 4000;
const CHUNK = 25;
const LAST_RUN_KEY = "GMAIL_LAST_RUN_SEC";

function ingestGmail() {
  const cfg = requireProps_(["INGEST_URL", "INGEST_SECRET"]);

  const lock = acquireLock_(1000);
  if (!lock) {
    console.log("Another ingestGmail run is in progress — skipping.");
    return;
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const nowSec = Math.floor(Date.now() / 1000);
    const fallback = nowSec - LOOKBACK_HOURS * 3600;
    const lastRun = parseInt(props.getProperty(LAST_RUN_KEY) || "0", 10);
    // Resume from the last successful run (minus overlap), but never look back
    // further than the fallback window on a normal run.
    const sinceSec = lastRun > 0 ? Math.max(fallback, lastRun - OVERLAP_SECONDS) : fallback;
    const sinceMs = sinceSec * 1000;

    // Inbox, recent, exclude common noise categories. Adjust as needed.
    const query =
      "in:inbox -category:promotions -category:social -category:forums " +
      "after:" + sinceSec;

    const threads = GmailApp.search(query, 0, MAX_THREADS);
    if (threads.length === MAX_THREADS) {
      console.warn(
        "Hit MAX_THREADS=" + MAX_THREADS + " — some threads may be skipped this run. " +
        "Lower the trigger interval or raise MAX_THREADS if this recurs."
      );
    }

    const messages = [];
    for (const thread of threads) {
      const threadId = thread.getId();
      const labels = thread.getLabels().map(function (l) { return l.getName(); });
      for (const m of thread.getMessages()) {
        try {
          // A thread can match `after:` because of one recent message while still
          // containing older ones — only forward messages inside our window.
          if (m.getDate().getTime() < sinceMs) continue;
          const plain = m.getPlainBody() || "";
          messages.push({
            id: m.getId(),
            threadId: threadId,
            from: m.getFrom(),
            to: m.getTo(),
            subject: (m.getSubject() || "").slice(0, 240),
            snippet: plain.replace(/\s+/g, " ").trim().slice(0, 280),
            body: plain.slice(0, MAX_BODY_CHARS),
            labels: labels,
            receivedAt: m.getDate().toISOString(),
          });
        } catch (e) {
          // Skip individual message errors, keep going.
          console.warn("skip message:", e && e.message);
        }
      }
    }

    if (messages.length === 0) {
      console.log("No new messages.");
      props.setProperty(LAST_RUN_KEY, String(nowSec));
      return;
    }

    // Send in chunks to avoid hitting body size limits.
    let totalNew = 0;
    let totalScored = 0;
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      const j = ingestPost_(cfg.INGEST_URL, cfg.INGEST_SECRET, { messages: chunk });
      totalNew += j.new || 0;
      totalScored += j.scored || 0;
    }

    // Only advance the cursor once every chunk has been accepted, so a mid-run
    // failure re-scans the same window next time instead of losing messages.
    props.setProperty(LAST_RUN_KEY, String(nowSec));
    console.log("Sent " + messages.length + " messages. New: " + totalNew + ", scored: " + totalScored);
  } finally {
    lock.releaseLock();
  }
}
