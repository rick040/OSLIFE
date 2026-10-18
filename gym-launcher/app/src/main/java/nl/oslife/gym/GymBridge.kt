package nl.oslife.gym

import android.view.KeyEvent
import android.webkit.JavascriptInterface

/**
 * Exposed to the OSLIFE page as `window.OSLifeGym`, so the web app can control
 * the device: music keys, volume, keeping the screen alive and shutting down.
 *
 * Every call checks that the page currently shown is on the configured OSLIFE
 * origin, so a page from anywhere else (a login redirect, a link) can't use it.
 * Calls arrive on a WebView background thread.
 */
class GymBridge(private val activity: MainActivity) {

    private fun allowed(): Boolean = activity.originAllowed

    @JavascriptInterface
    fun isAvailable(): Boolean = allowed()

    @JavascriptInterface
    fun version(): String = if (allowed()) activity.appVersion() else ""

    /** Counts as activity for the idle shutdown, e.g. while the phone remote is used. */
    @JavascriptInterface
    fun keepAlive() {
        if (allowed()) activity.markActive()
    }

    @JavascriptInterface
    fun playPause() {
        if (allowed()) activity.mediaPlayPause()
    }

    @JavascriptInterface
    fun play() {
        if (allowed()) GymControl.mediaKey(activity, KeyEvent.KEYCODE_MEDIA_PLAY)
    }

    @JavascriptInterface
    fun pause() {
        if (allowed()) GymControl.mediaKey(activity, KeyEvent.KEYCODE_MEDIA_PAUSE)
    }

    @JavascriptInterface
    fun next() {
        if (allowed()) activity.mediaNext()
    }

    @JavascriptInterface
    fun previous() {
        if (allowed()) activity.mediaPrevious()
    }

    /** What's playing, as JSON: {available, title, artist, album, app, playing, positionMs, durationMs, updatedAt, art}. */
    @JavascriptInterface
    fun nowPlaying(): String = if (allowed()) activity.nowPlayingJson() else NowPlayingWatcher.EMPTY

    /** False until "Notification access" is switched on for this app. */
    @JavascriptInterface
    fun hasMediaAccess(): Boolean = allowed() && NowPlayingWatcher.hasAccess(activity)

    /** 0 to 100. */
    @JavascriptInterface
    fun setVolume(percent: Int) {
        if (allowed()) GymControl.setVolume(activity, percent)
    }

    /** Runs the same music start as after a boot. */
    @JavascriptInterface
    fun startMusic() {
        if (allowed()) activity.runOnUiThread { activity.startMusicSequence() }
    }

    @JavascriptInterface
    fun hasRoot(): Boolean = allowed() && activity.rootAvailable

    /** Clean power off. Returns false when the board isn't rooted. */
    @JavascriptInterface
    fun shutdown(): Boolean = allowed() && GymControl.shutdown()

    @JavascriptInterface
    fun reboot(): Boolean = allowed() && GymControl.reboot()

    @JavascriptInterface
    fun openSettings() {
        if (allowed()) activity.runOnUiThread { activity.openSettings() }
    }
}
