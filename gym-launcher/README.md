# OSLIFE gym launcher

Home-screen app for the wall-mounted gym screen (Rockchip Android board).
Android opens the home screen after every boot, so this app decides what the
screen does:

- Shows OSLIFE fullscreen (default `https://oslife-iota.vercel.app/tablet/workout`),
  no browser bar, no Android bars, screen always on, text fixed at 100%.
- Once per boot: waits for Wi-Fi, sets the volume, opens Spotify on the gym
  playlist, presses play, and comes back to OSLIFE.
- Shuts the board down cleanly after N idle minutes without music, if the
  board is rooted.
- Exposes `window.OSLifeGym` to the OSLIFE page (only on the configured origin):
  `isAvailable()`, `version()`, `keepAlive()`, `play()`, `pause()`,
  `playPause()`, `next()`, `previous()`, `setVolume(0..100)`, `startMusic()`,
  `hasRoot()`, `shutdown()`, `reboot()`, `openSettings()`.

No libraries, plain Android framework only.

## Install on the board

1. On the board, open
   `https://github.com/rick040/OSLIFE/releases/download/gym-launcher-latest/oslife-gym-launcher.apk`
   in Chrome and install it (allow "install unknown apps" for Chrome once).
2. Press the home button and choose **OSLIFE Gym**, **Always**.
3. Open the hidden settings: hold **three fingers** on the screen, or hold the
   **right mouse button**, for 2 seconds.
4. In settings: paste the Spotify playlist link, tap **Sta 'Weergeven over
   andere apps' toe**, tap **Controleer root**, then **Opslaan en
   opstartroutine nu testen**.
5. Log in to OSLIFE once in the screen, and log in to Spotify once in the
   Spotify app.

Updates: settings, **Nieuwste versie downloaden**, install over the old one.
Settings and logins are kept.

## Notes

- Music start uses Spotify's own app: open the playlist, then a media "play"
  key. Spotify resumes what it last played, so after the first run it keeps
  playing the gym playlist.
- Clean shutdown needs root (`su`). Many signage boards ship rooted; settings
  shows whether this one is. Without root the screen just stays on until the
  smart plug cuts power.
- Build: `.github/workflows/gym-launcher-build.yml`, same fixed debug keystore
  as `/android` and `/android-widgets` so updates install in place.
