/**
 * oslife · Health Sheet setup script
 * ------------------------------------
 * Run setupHealthSheet() ONCE in any Google Sheet to create all the tabs
 * that health-sheets.gs expects, with the correct column headers and a
 * sample row so you can see the expected format before your first export.
 *
 * How to use:
 *  1. Create a new Google Sheet (or open an existing empty one).
 *  2. Extensions → Apps Script → paste this file → save.
 *  3. Run setupHealthSheet() → authorize → done.
 *  4. Your sheet now has 7 tabs ready for Samsung Health / Health Sync data.
 *  5. Then follow the health-sheets.gs setup instructions to add the ingest
 *     trigger to this same sheet.
 */

function setupHealthSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const tabs = [
    {
      name: "Steps",
      headers: ["Date", "Total Steps"],
      sample: ["2026-06-28", 8432],
    },
    {
      name: "Distance",
      headers: ["Date", "Distance (m)"],
      sample: ["2026-06-28", 6180],
    },
    {
      name: "Calories Burned",
      headers: ["Date", "Calories (kcal)"],
      // Samsung Health exports kcal × 1000 — sample shows real kcal value
      // (health-sheets.gs auto-detects and divides if value >= 10000)
      sample: ["2026-06-28", 2150],
    },
    {
      name: "Weight",
      headers: ["Date", "Weight (kg)"],
      // Samsung Health exports grams — health-sheets.gs auto-detects and
      // divides by 1000 if value >= 1000
      sample: ["2026-06-28", 75.5],
    },
    {
      name: "Body Fat",
      headers: ["Date", "Body Fat (%)"],
      // Samsung Health exports % × 100 — health-sheets.gs auto-detects and
      // divides if value >= 100
      sample: ["2026-06-28", 18.2],
    },
    {
      name: "Sleep",
      headers: ["Date", "Start Time", "End Time", "Duration (hrs)"],
      sample: ["2026-06-28", "2026-06-27T23:15:00", "2026-06-28T07:05:00", 7.83],
    },
    {
      name: "Exercise",
      headers: ["Date", "Type", "Title", "Start", "End", "Duration (min)"],
      sample: ["2026-06-28", "running", "Morning run", "2026-06-28T07:30:00", "2026-06-28T08:15:00", 45],
    },
  ];

  // Rename the first (default) sheet to "Steps" — keeps it tidy.
  const existing = ss.getSheets();
  if (existing.length === 1 && existing[0].getName() === "Sheet1") {
    existing[0].setName("Steps");
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
    "7 tabs created: Steps, Distance, Calories Burned, Weight, Body Fat, Sleep, Exercise.\n\n" +
    "Next step: open Extensions → Apps Script and paste health-sheets.gs to add the ingest trigger."
  );
}
