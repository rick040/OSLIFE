# OSLIFE Walk Tracker (Android)

A small, standalone Android app that auto-detects real dog walks — not
wandering around the house — and logs the route/distance/duration straight
to OSLIFE's Supabase project via one HTTP POST. No Google Fit, no Strava, no
MacroDroid: this app owns the whole path from GPS to database.

Cost: **€0**. No Play Store publishing (sideload the APK directly), no Maps
API billing (the web dashboard renders the route with Leaflet + OpenStreetMap,
not Google Maps), no paid backend (rides on the Supabase project OSLIFE
already uses).

## How it decides "this is a real walk"

Manual start/stop would be simpler, but this app auto-detects walks using two
free, battery-cheap Play Services signals — no continuous GPS polling except
during a walk itself:

- **Activity Recognition** (`ActivityRecognitionClient.requestActivityTransitionUpdates`)
  — fires when the phone's motion sensors are confident you've started/stopped
  WALKING, being STILL, or being IN_VEHICLE. This is handled by the OS, not a
  polling loop, so it costs very little battery even running all the time.
- **Geofencing** — one "home" geofence (enter/exit), set once from the app.

The rules (`WalkDetector.kt`), matching how these walks actually happen:

1. **Minimum 5 minutes.** Anything shorter is discarded — that's moving
   around the house, not a walk. (`Constants.MIN_WALK_DURATION_MS`)
2. **Pauses don't split a walk.** WALKING → STILL → WALKING (the dog
   sniffing something, playing, you chatting with a neighbour) counts as one
   continuous walk, as long as the STILL spell doesn't outlast 20 minutes —
   past that, the walk is finalized automatically. (`Constants.PAUSE_TIMEOUT_MS`)
3. **Most walks start and end at home.** WALKING detected within 90 minutes
   of exiting the home geofence starts a walk tagged `home`; entering the
   home geofence while a walk is active ends it.
4. **Forest walks.** No home-exit right before, but WALKING starts within 15
   minutes of a car ride (IN_VEHICLE) ending — that's tagged `car_forest`.
   Getting back in the car ends the walk.

If neither (3) nor (4) applies, WALKING is **ignored** — this is the main
defence against misfires (grocery run on foot, walking around a shop, etc.
never starts a tracked walk). Adjust the thresholds in `Constants.kt` if your
own routine doesn't fit these defaults.

A manual override always exists in the app (MainActivity): **"Wandeling nu
afronden en loggen"** (force-end/log now) and **"Huidige wandeling
verwijderen"** (discard — for when the detector gets it wrong).

## What happens on a detected walk

1. `WalkDetector` flips to an active walk and starts `WalkTrackingService`
   (a foreground service — required by Android to keep GPS running while the
   screen is off/app backgrounded).
2. The service polls location every ~8s via `FusedLocationProviderClient`,
   accumulates distance (`Location.distanceTo`) and buffers every accepted
   point (fixes worse than 50m accuracy are dropped as noise).
3. On finalize, it hands the whole walk (points + totals) to `WalkUploadWorker`
   — a WorkManager job that POSTs it once to the `walk-ingest` Supabase edge
   function and keeps retrying (with backoff) until it succeeds, so a walk
   that ends somewhere with no signal still uploads once you're back on wifi.
4. `walk-ingest` writes a `dog_log` row (shows up in the existing Kyra
   timeline like any manually logged walk) **and** a `walks` row (the GPS
   route, read by the map card in the OSLIFE web app's Kyra screen).

**Known v1 limitation:** the GPS point buffer lives in memory in
`WalkTrackingService`, not on disk. A foreground location service is very
unlikely to be killed by Android mid-walk, but if it were, that walk's route
would be lost (nothing would upload). Acceptable trade-off for a lean first
version — a future version could flush points to a local file periodically
instead.

## Building it

You need [Android Studio](https://developer.android.com/studio) (free) — it
bundles the Android SDK this sandbox doesn't have, so this project has not
been compiled here; every API call was hand-checked against the current
stable AndroidX/Play Services docs instead. Double-check it builds cleanly
before you rely on it.

1. Open the `/android` folder as a project in Android Studio (not the repo
   root — `/android` is a separate Gradle project from the web app).
2. Let Gradle sync (downloads AGP, Kotlin, Play Services, WorkManager, OkHttp
   — all free, no license/billing needed).
3. Connect your phone (enable Developer Options → USB debugging) and hit
   **Run**, or **Build → Generate Signed Bundle / APK** to produce an APK you
   can copy to the phone and install directly (allow "install unknown apps"
   for whichever app you copy it with).

No Play Console account, no $25 fee — this never needs to go through the
Play Store.

## First-run setup (on the phone)

1. Deploy `walk-ingest` and set its secret (see repo root `.env.example` /
   README "Going live" section):
   ```bash
   supabase functions deploy walk-ingest --project-ref nhyunnnmdcmojvkxrbpl
   supabase secrets set WALK_WEBHOOK_SECRET=<random 32+ char secret> --project-ref nhyunnnmdcmojvkxrbpl
   ```
2. Open the app → **Instellingen**: paste the function URL
   (`https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/walk-ingest`) and
   the same secret → **Instellingen opslaan**.
3. Tap **Rechten controleren / aanvragen** and grant everything asked:
   - Location → choose **"Allow all the time"** (background location) — on
     Android 11+ this may require a second trip through system Settings; the
     app will prompt you if the initial dialog doesn't offer it directly.
   - Physical activity / activity recognition.
   - Notifications (needed for the "wandeling wordt gevolgd" foreground
     notification — Android requires a visible notification while GPS runs
     in the background).
4. Stand at home and tap **Huidige locatie instellen als thuis** — this sets
   the one geofence everything else is anchored to.
5. That's it — go walk the dog. Nothing more to tap; the app is fully
   automatic from here. The status card in the app shows "Idle" vs "Wandeling
   bezig" live if you want to check it's working.

## Home-screen widget ("OSLIFE · Vandaag")

The same app also provides a 4×2 home-screen widget with four glanceable
lines, refreshed every ~30 minutes (WorkManager periodic job, not the
widget's own OS-level alarm) plus a manual refresh tap:

```
🐕 Laatste wandeling: 3u geleden · 2 vandaag, 4.2 km
✅ 3 te doen vandaag · 7 open in totaal
🔥 2/3 gewoontes gedaan vandaag · reeks: 5 d (Mediteren)
📅 Volgende: Team sync om 14:00
```

It fetches this from one Supabase Edge Function (`widget-summary`) that
aggregates `dog_log`/`walks`, `tasks`, `habits`/`habit_log`, and `day_blocks`
server-side with the service-role key — the widget itself never touches
Supabase Auth, it just does one authenticated GET, same shared-secret
pattern as `walk-ingest`. Tapping the widget body opens the app; tapping the
small sync icon forces an immediate refresh.

**Setup:**
1. Deploy the function and set its secret:
   ```bash
   supabase functions deploy widget-summary --project-ref nhyunnnmdcmojvkxrbpl
   supabase secrets set WIDGET_SUMMARY_SECRET=<random 32+ char secret> --project-ref nhyunnnmdcmojvkxrbpl
   ```
2. In the app → **Widget (Vandaag in één oogopslag)**: paste the function URL
   (`https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/widget-summary`)
   and the same secret → **Widget-instellingen opslaan**.
3. Long-press the home screen → Widgets → **OSLIFE Walk Tracker** → drag
   "OSLIFE · Vandaag" onto the home screen.
4. Tap **Widget nu verversen** in the app (or the widget's sync icon) to
   confirm it's wired up correctly.

Until step 2 is done, the widget shows "Widget nog niet ingesteld" instead
of guessing at data. A failed refresh (no network, server error) leaves the
last good snapshot on screen rather than clearing it.

## Tuning

All thresholds live in `Constants.kt`:

| Constant | Default | What it controls |
|---|---|---|
| `MIN_WALK_DURATION_MS` | 5 min | Shorter walks are discarded |
| `HOME_EXIT_TRIGGER_WINDOW_MS` | 90 min | How long after leaving home WALKING still counts as "started at home" |
| `CAR_WALK_TRIGGER_WINDOW_MS` | 15 min | How long after a car ride ends WALKING counts as a forest walk |
| `PAUSE_TIMEOUT_MS` | 20 min | How long a STILL spell may last before the walk is auto-finalized |
| `HOME_GEOFENCE_RADIUS_M` | 80 m | Radius of the home geofence |

Change a value, rebuild, reinstall.
