/**
 * rick-os Calendar ingest — Google Apps Script
 *
 * ⚠️  SEPARATE PROJECT — do NOT add this file to the same Apps Script project
 *     as Code.gs. Code.gs is self-contained (Supabase-direct). This file is
 *     for a second project that posts to Vercel /api/ingest/* endpoints.
 *
 * Setup:
 *  1. Create a NEW Apps Script project (not the one that has Code.gs).
 *     Add this file PLUS common.gs (and optionally gmail.gs) to it.
 *  2. Script Properties already has INGEST_SECRET from gmail.gs setup.
 *     Add one more: CALENDAR_INGEST_URL = https://<your-vercel-url>.vercel.app/api/ingest/calendar
 *  3. Run ingestCalendar() once, authorize the Calendar scope.
 *  4. Triggers → Add Trigger → ingestCalendar → Time-driven → Hour timer → Every hour.
 *
 * What it syncs:
 *  - Events from the calendars in CALENDAR_IDS, from LOOKBACK_DAYS ago up to
 *    LOOKAHEAD_DAYS ahead (currently yesterday → +60 days).
 *  - Use ["all"] to sync every calendar, or include "default" for your primary.
 *  - Deletes from the DB any events that disappeared from Google (canceled),
 *    via the cleanup call at the end.
 */

// Only sync these calendars — others polluted the dashboard.
const CALENDAR_IDS = ["rickvmierlo@gmail.com", "rick.prjct.agency@gmail.com"];
const LOOKBACK_DAYS = 1;
const LOOKAHEAD_DAYS = 60;
const EVENT_CHUNK = 50;

function ingestCalendar() {
  const cfg = requireProps_(["CALENDAR_INGEST_URL", "INGEST_SECRET"]);

  const lock = acquireLock_(1000);
  if (!lock) {
    console.log("Another ingestCalendar run is in progress — skipping.");
    return;
  }

  try {
    const now = new Date();
    const from = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);
    const to = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400000);

    const cals = resolveCalendars_();
    if (cals.length === 0) {
      throw new Error("No calendars resolved from CALENDAR_IDS: " + JSON.stringify(CALENDAR_IDS));
    }

    // Collect every Google event id we see this run so the server can detect deletions.
    const seenIds = {};
    const events = [];

    for (const cal of cals) {
      const calendarKey = cal.getId();
      for (const e of cal.getEvents(from, to)) {
        try {
          // getId() is identical for every instance of a recurring event, which
          // made repeated events (e.g. weekly "Werk") overwrite each other in the
          // DB. Suffix with the start time so each instance gets its own row.
          const id = e.getId() + "_" + e.getStartTime().getTime();
          seenIds[id] = true;
          events.push({
            id: id,
            calendarId: calendarKey,
            title: (e.getTitle() || "").slice(0, 240),
            description: (e.getDescription() || "").slice(0, 2000),
            location: (e.getLocation() || "").slice(0, 240),
            startsAt: e.getStartTime().toISOString(),
            endsAt: e.getEndTime().toISOString(),
            allDay: e.isAllDayEvent(),
            attendees: e.getGuestList().map(function (g) {
              const gs = g.getGuestStatus();
              return { email: g.getEmail(), name: g.getName(), status: gs ? gs.toString() : null };
            }),
            status: e.getMyStatus() ? e.getMyStatus().toString() : null,
          });
        } catch (err) {
          console.warn("skip event:", err && err.message);
        }
      }
    }

    // Send in chunks.
    let upserted = 0;
    for (let i = 0; i < events.length; i += EVENT_CHUNK) {
      const chunk = events.slice(i, i + EVENT_CHUNK);
      ingestPost_(cfg.CALENDAR_INGEST_URL, cfg.INGEST_SECRET, { events: chunk });
      upserted += chunk.length;
    }

    // Deletion detection: tell the server which ids we saw in this window. The
    // server deletes any stored event in [from, to] not in the list (canceled).
    // A cleanup failure shouldn't fail the whole run — log and move on.
    try {
      ingestPost_(cfg.CALENDAR_INGEST_URL, cfg.INGEST_SECRET, {
        cleanup: { from: from.toISOString(), to: to.toISOString(), seenIds: Object.keys(seenIds) },
      });
    } catch (e) {
      console.warn("cleanup failed: " + (e && e.message));
    }

    console.log("Synced " + upserted + " events across " + cals.length + " calendar(s).");
  } finally {
    lock.releaseLock();
  }
}

/** Resolve CALENDAR_IDS into CalendarApp calendar objects. */
function resolveCalendars_() {
  if (CALENDAR_IDS.length === 1 && CALENDAR_IDS[0] === "all") {
    return CalendarApp.getAllCalendars();
  }
  const cals = [];
  for (const calId of CALENDAR_IDS) {
    const c = calId === "default" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
    if (c) cals.push(c);
    else console.warn("Calendar not found / not accessible: " + calId);
  }
  return cals;
}
