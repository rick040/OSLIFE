# OSLIFE Widgets (Android)

A small, standalone Android app whose *only* job is eleven OSLIFE home-screen
widgets — no walk tracking, no location permissions, nothing else. Split out
from `/android` (the walk-tracker app) into its own installable APK so
widget setup/updates don't depend on that app at all.

| Widget | Shows | Interaction |
|---|---|---|
| **Vandaag** | Date, next agenda block, tasks due today, habits, dog walks | Each line opens its own screen in OSLIFE |
| **Snelle acties** (4×1) | Five one-tap actions | Note, speak, HEYRA, upload, open OSLIFE |
| **To-do** | Open tasks; ring color = priority, due-date pill | Tap the ring to tick off (instant, tap again to undo); tap the task to open it |
| **Belangrijkste** | Open High/Medium tasks | Same rows as To-do: tick off or open |
| **Projecten** | Active projects: deadline pill, progress bar, client · % | Tap a project to open it |
| **Brain-dump** | Today's capture count | Typen / Inspreken / Upload shortcuts (work offline too — captures queue) |
| **HEYRA** | Static prompt | Chat button, or the mic to start listening immediately |
| **Gezondheid** | Steps toward goal, sleep, weight, habits, streak | Opens Gezondheid in OSLIFE |
| **Financiën** | Balance (red when negative), open + urgent payments | Opens Geld in OSLIFE |
| **Inbox** | Unread count + newest unread mails | Opens Inbox in OSLIFE |
| **Agenda** | Rest of today's blocks; the current one highlighted ("Nu · tot 11:30") | Opens Dagplanner in OSLIFE |

Tapping a to-do/priority/project row deep-links straight into that item in
the live OSLIFE web app (`?view=...&id=...` — see `DeepLink.kt` and the web
app's `src/App.tsx`), not just a generic "open the app". The other widgets
deep-link to their screen.

## How the widgets behave

- **Never blank on a bad connection.** Every response is cached per edge
  function (`WidgetData`). A failed refresh keeps the last data on screen with
  an amber "Offline · stand van 14:32" footer; a widget that's just been placed
  or survived a reboot draws instantly from that cache.
- **Honest footer.** "Bijgewerkt 14:32" is the real fetch time; tapping ↻ shows
  "Verversen…" immediately.
- **Size-aware.** Each pinned instance is drawn for its own size: list widgets
  show as many rows as fit and count the rest in the footer ("+3 meer"); narrow
  2-column widgets drop due-date pills so titles keep their room; the inbox
  drops snippets when that lets more mails fit.
- **Background-only transparency.** Long-press → *Widget aanpassen* sets how
  opaque the card is (0–100%), previewed live on the widget; text never fades.
  Android 12+ places widgets without opening that screen first, and the card
  corners follow the launcher's own widget radius.
- **Picker.** Every widget has its own name, description and a real preview
  image in the widget picker.

## Design system

All layouts share `res/values/widget_styles.xml` (card, 32dp header, 36dp
rows, footer line) and one line-icon set (`res/drawable/ic_w_*.xml`, tinted per
widget accent from `colors.xml`). Shared drawing code lives in
`widget/common/`: `DataWidgetProvider`/`DataWidgetWorker` (lifecycle, fetch,
retry), `WidgetChrome` (header/footer/empty states), `WidgetStyle` (opacity,
rows that fit).

### Seeing every widget without a phone

`WidgetRenderTest` inflates every widget through the real RemoteViews path
(Robolectric, native graphics) — so a layout a launcher would refuse fails the
test instead of showing "Kan widget niet laden" on the phone — and saves PNGs:

    ./gradlew testDebugUnitTest
    # → app/build/widget-renders/  every widget, state and size, on a mock wallpaper
    # → app/build/widget-previews/ picker previews: copy into res/drawable-nodpi/

CI runs it after building the APK and uploads the renders as the
`oslife-widgets-renders` artifact. If Maven Central rate-limits Robolectric's
runtime download locally, fetch
`org.robolectric:android-all-instrumented:14-robolectric-10818077-i6` by hand
and set `ROBOLECTRIC_DEPS_DIR` to its folder.

## Building it

Same approach as `/android` — no Android Studio needed. Either:

- Push to `main` touching `android-widgets/**`, or
- Trigger **Actions → OSLIFE widgets-only build → Run workflow** manually

and download `oslife-widgets-debug-apk` from the run's Artifacts section.

## First-run setup (on the phone)

This app needs the `widget-*` Supabase edge functions deployed, all reusing
the `WIDGET_SUMMARY_SECRET` — nothing new to generate:
`widget-summary` (Vandaag), `widget-tasks`, `widget-projects`,
`widget-braindump-add`, `widget-braindump-upload`, `widget-heyra-chat`,
`widget-health`, `widget-finance`, `widget-inbox`, `widget-calendar`.

1. **Open the app first**, before adding any widget. Paste the **functions
   base URL** (`https://<project-ref>.supabase.co/functions/v1`, no trailing
   function name), the `WIDGET_SUMMARY_SECRET` value, and the **OSLIFE web
   app URL** (`https://oslife-iota.vercel.app`) → **Opslaan en verbinding
   testen** (it tells you right there whether the URL and secret work).
   Android restricts background execution (WorkManager jobs, binding to a
   widget's RemoteViewsService) for apps that have never been opened once —
   adding a widget before the app's first launch is a common cause of a
   widget getting stuck on its loading placeholder or refusing to add at
   all. Open it once, then add widgets.
2. Long-press the home screen → **Widgets** → **OSLIFE Widgets** → drag the
   ones you want onto the home screen.

Until step 1 is done, each widget shows "Nog niet ingesteld" (tap it to open
the app) instead of guessing at data. A failed refresh with nothing cached yet
(bad secret, server error) shows the reason and "Tik ↻ om het opnieuw te
proberen" rather than staying blank — every widget's render path is wrapped
(`WidgetPush`) so a rendering bug can never leave the widget host stuck
mid-add or stuck on "Laden…".

## Why a separate app from the walk tracker

- Widget settings/signature are now independent of the walk-tracker app's
  build — reinstalling or rebuilding one never risks the other's saved
  settings or home-screen widget instances.
- Smaller APK, fewer permissions (no location/activity-recognition — this
  app only ever does HTTP GET/POST to Supabase edge functions).
- Same fixed-debug-keystore approach as `/android` (`app/debug.keystore`,
  committed) so rebuilds update in place instead of wiping widget settings.
