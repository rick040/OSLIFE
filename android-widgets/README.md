# OSLIFE Widgets (Android)

A small, standalone Android app whose *only* job is five OSLIFE home-screen
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

Tapping a to-do/priority/project row deep-links straight into that item in
the live OSLIFE web app (`?view=...&id=...` — see `DeepLink.kt` and the web
app's `src/App.tsx`), not just a generic "open the app".

## Building it

Same approach as `/android` — no Android Studio needed. Either:

- Push to `main` touching `android-widgets/**`, or
- Trigger **Actions → OSLIFE widgets-only build → Run workflow** manually

and download `oslife-widgets-debug-apk` from the run's Artifacts section.

## First-run setup (on the phone)

This app needs the same `widget-*` Supabase edge functions as before
(`widget-tasks`, `widget-projects`, `widget-braindump-add`,
`widget-heyra-chat`), reusing the `WIDGET_SUMMARY_SECRET` — if you already
had the old app's widgets working, these are already deployed; nothing new
to deploy here.

1. Open the app → paste the **functions base URL**
   (`https://<project-ref>.supabase.co/functions/v1`, no trailing function
   name), the `WIDGET_SUMMARY_SECRET` value, and the **OSLIFE web app URL**
   (`https://oslife-iota.vercel.app`) → **Instellingen opslaan**.
2. Long-press the home screen → **Widgets** → **OSLIFE Widgets** → drag each
   of the five onto the home screen.
3. Tap **Alle vijf widgets nu verversen** to confirm they're wired up.

Until step 1 is done, each widget shows "Nog niet ingesteld" instead of
guessing at data. A failed refresh (bad secret, no network, server error)
surfaces a visible error on the widget rather than staying blank.

## Why a separate app from the walk tracker

- Widget settings/signature are now independent of the walk-tracker app's
  build — reinstalling or rebuilding one never risks the other's saved
  settings or home-screen widget instances.
- Smaller APK, fewer permissions (no location/activity-recognition — this
  app only ever does HTTP GET/POST to Supabase edge functions).
- Same fixed-debug-keystore approach as `/android` (`app/debug.keystore`,
  committed) so rebuilds update in place instead of wiping widget settings.
