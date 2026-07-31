/**
 * OSLIFE · Health Sheet setup script
 * ------------------------------------
 * Run setupHealthSheet() ONCE in any Google Sheet to create all the tabs
 * that health-sheets.gs expects, with the correct column headers and a
 * sample row so you can see the expected format before your first export.
 *
 * Note: there is no "Steps" tab — steps are ingested in real time by
 * steps-ingest (MacroDroid reading the Samsung Health/Google Fit step-count
 * notification directly), not via this Sheet. See
 * integrations/macrodroid/steps-notifications.md.
 *
 * How to use:
 *  1. Create a new Google Sheet (or open an existing empty one).
 *  2. Extensions → Apps Script → paste this file → save.
 *  3. Run setupHealthSheet() → authorize → done.
 *  4. Your sheet now has 3 tabs ready for Samsung Health / Health Sync data.
 *  5. Then follow the health-sheets.gs setup instructions to add the ingest
 *     trigger to this same sheet.
 */

function setupHealthSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // These tabs/columns/units MUST match what health-sheets.gs actually reads:
  //  - Weight     : Date + weight (kg) AND body-fat (%) — body fat is read from
  //                 THIS tab, not a separate one.
  //  - Sleep      : one row per stage segment; duration is in SECONDS (the reader
  //                 divides by 60) and a Stage column buckets light/deep/rem/awake.
  //  - Exercise   : Date + duration (min) AND distance (km) — distance is read
  //                 from THIS tab, not a separate one.
  // (There is no separate Distance/Calories/Body Fat tab: the reader never reads
  // a Calories column, and folds distance/body-fat into the tabs above.)
  const tabs = [
    {
      name: "Weight",
      headers: ["Date", "Weight (kg)", "Body Fat (%)"],
      sample: ["2026-06-28", 75.5, 18.2],
    },
    {
      // Health Sync exports one row per sleep-stage segment. Duration is in
      // SECONDS; the Stage column drives the light/deep/rem/awake split.
      name: "Sleep",
      headers: ["Date", "Stage", "Duration (seconds)"],
      sample: ["2026-06-28", "deep", 5400],
    },
    {
      name: "Exercise",
      headers: ["Date", "Type", "Title", "Start", "End", "Duration (min)", "Distance (km)"],
      sample: ["2026-06-28", "running", "Morning run", "2026-06-28T07:30:00", "2026-06-28T08:15:00", 45, 6.18],
    },
  ];

  // Rename the first (default) sheet to "Weight" — keeps it tidy.
  const existing = ss.getSheets();
  if (existing.length === 1 && existing[0].getName() === "Sheet1") {
    existing[0].setName("Weight");
  }

  for (const tab of tabs) {
    let sheet = ss.getSheetByName(tab.name);
    if (!sheet) {
      sheet = ss.insertSheet(tab.name);
    }

    // Only write headers + sample if the sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(tab.headers);
      sheet.appendRow(tab.sample);

      // Bold the header row
      sheet.getRange(1, 1, 1, tab.headers.length).setFontWeight("bold");
      // Freeze header row
      sheet.setFrozenRows(1);
      // Auto-resize columns for readability
      sheet.autoResizeColumns(1, tab.headers.length);
    } else {
      Logger.log("Tab '" + tab.name + "' already has data — skipping sample row.");
    }
  }

  Logger.log("Done! " + tabs.length + " tabs ready. Now follow the health-sheets.gs setup instructions.");
  SpreadsheetApp.getUi().alert(
    "Health Sheet setup complete!\n\n" +
    "3 tabs created: Weight (incl. body fat), Sleep, Exercise (incl. distance).\n\n" +
    "Steps are not tracked here — set up steps-ingest instead, see " +
    "integrations/macrodroid/steps-notifications.md.\n\n" +
    "Next step: open Extensions → Apps Script and paste health-sheets.gs to add the ingest trigger."
  );
}
