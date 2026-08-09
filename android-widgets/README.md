# OSLIFE Widgets (Android)

A small, standalone Android app whose *only* job is nine OSLIFE home-screen
widgets — no walk tracking, no location permissions, nothing else. Split out
from `/android` (the walk-tracker app) into its own installable APK so
widget setup/updates don't depend on that app at all.

| Widget | Shows | Interaction |
|---|---|---|
| **To-do lijst** | Every open task, real scrollable list | Tap a row to mark it done; tap the header to open OSLIFE |
| **Belangrijkste items** | Top 5 open High/Medium-priority tasks | Glance card; tap to open that task in OSLIFE |
| **Actieve projecten** | Up to 4 active projects with a progress bar + deadline | Glance card; tap to open that project in OSLIFE |
| **Brain-dump snel toevoegen** | Today's capture count | Tap the card or the "+" for a floating quick-capture dialog — type or tap the mic to speak |
| **HEYRA snel chatten/spreken** | Static prompt | Tap the card for a floating chat dialog, or the mic chip to start listening immediately |
| **Gezondheid** | Today's steps/sleep, latest weight, habit streak | Glance card; tap to open Gezondheid in OSLIFE |
| **Financiën** | Current balance, open payments, urgent count | Glance card; tap to open Geld in OSLIFE |
| **Inbox** | Unread email count + most recent unread | Glance card; tap to open Inbox in OSLIFE |
| **Agenda** | Today's remaining calendar blocks | Glance card; tap to open Dagplanner in OSLIFE |

Tapping a to-do/priority/project row deep-links straight into that item in
the live OSLIFE web app (`?view=...&id=...` — see `DeepLink.kt` and the web
app's `src/App.tsx`), not just a generic "open the app". The other widgets
deep-link to their screen (no specific item, since they're glance summaries).

## Building it

Same approach as `/android` — no Android Studio needed. Either:

- Push to `main` touching `android-widgets/**`, or
- Trigger **Actions → OSLIFE widgets-only build → Run workflow** manually

and download `oslife-widgets-debug-apk` from the run's Artifacts section.

## First-run setup (on the phone)

This app needs the `widget-*` Supabase edge functions deployed, all reusing
the `WIDGET_SUMMARY_SECRET` — nothing new to generate:
`widget-tasks`, `widget-projects`, `widget-braindump-add`,
`widget-heyra-chat`, `widget-health`, `widget-finance`, `widget-inbox`,
`widget-calendar`.

1. **Open the app first**, before adding any widget. Paste the **functions
   base URL** (`https://<project-ref>.supabase.co/functions/v1`, no trailing
   function name), the `WIDGET_SUMMARY_SECRET` value, and the **OSLIFE web
   app URL** (`https://oslife-iota.vercel.app`) → **Instellingen opslaan**.
   Android restricts background execution (WorkManager jobs, binding to a
   widget's RemoteViewsService) for apps that have never been opened once —
   adding a widget before the app's first launch is a common cause of a
   widget getting stuck on its loading placeholder or refusing to add at
   all. Open it once, then add widgets.
2. Long-press the home screen → **Widgets** → **OSLIFE Widgets** → drag each
   of the nine onto the home screen.
3. Tap **Alle negen widgets nu verversen** to confirm they're wired up.

Until step 1 is done, each widget shows "Nog niet ingesteld" instead of
guessing at data. A failed refresh (bad secret, no network, server error)
surfaces a visible error on the widget rather than staying blank — every
widget's `onUpdate()`/factory render path is wrapped so a rendering bug can
never leave the widget host stuck mid-add or stuck on "Laden...".

## Why a separate app from the walk tracker

- Widget settings/signature are now independent of the walk-tracker app's
  build — reinstalling or rebuilding one never risks the other's saved
  settings or home-screen widget instances.
- Smaller APK, fewer permissions (no location/activity-recognition — this
  app only ever does HTTP GET/POST to Supabase edge functions).
- Same fixed-debug-keystore approach as `/android` (`app/debug.keystore`,
  committed) so rebuilds update in place instead of wiping widget settings.
