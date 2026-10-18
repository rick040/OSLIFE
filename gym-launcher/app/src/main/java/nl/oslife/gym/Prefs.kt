package nl.oslife.gym

import android.content.Context
import android.content.SharedPreferences

/** Everything the launcher remembers, editable from SettingsActivity. */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.getSharedPreferences("gym_launcher", Context.MODE_PRIVATE)

    /** The page shown fullscreen. Defaults to the gym kiosk screen. */
    var url: String
        get() = sp.getString(KEY_URL, null)?.takeIf { it.isNotBlank() } ?: DEFAULT_URL
        set(value) = sp.edit().putString(KEY_URL, value.trim()).apply()

    /** Spotify link or URI of the gym playlist, e.g. https://open.spotify.com/playlist/... */
    var playlist: String
        get() = sp.getString(KEY_PLAYLIST, "") ?: ""
        set(value) = sp.edit().putString(KEY_PLAYLIST, value.trim()).apply()

    var spotifyEnabled: Boolean
        get() = sp.getBoolean(KEY_SPOTIFY, true)
        set(value) = sp.edit().putBoolean(KEY_SPOTIFY, value).apply()

    /** Media volume set at startup, 0 to 100. */
    var volumePercent: Int
        get() = sp.getInt(KEY_VOLUME, 70)
        set(value) = sp.edit().putInt(KEY_VOLUME, value.coerceIn(0, 100)).apply()

    /** Extra wait after Wi-Fi is up, before Spotify starts. */
    var startDelaySec: Int
        get() = sp.getInt(KEY_DELAY, 8)
        set(value) = sp.edit().putInt(KEY_DELAY, value.coerceIn(0, 120)).apply()

    /** Shut down cleanly after this many idle minutes with no music. 0 = never. Needs root. */
    var idleShutdownMin: Int
        get() = sp.getInt(KEY_IDLE, 30)
        set(value) = sp.edit().putInt(KEY_IDLE, value.coerceIn(0, 600)).apply()

    /** Android's boot counter at the last startup run, so it runs once per boot. */
    var lastBootCount: Int
        get() = sp.getInt(KEY_BOOT, Int.MIN_VALUE)
        set(value) = sp.edit().putInt(KEY_BOOT, value).apply()

    companion object {
        const val DEFAULT_URL = "https://oslife-iota.vercel.app/tablet/workout"
        const val UPDATE_URL =
            "https://github.com/rick040/OSLIFE/releases/download/gym-launcher-latest/oslife-gym-launcher.apk"

        private const val KEY_URL = "url"
        private const val KEY_PLAYLIST = "playlist"
        private const val KEY_SPOTIFY = "spotify_enabled"
        private const val KEY_VOLUME = "volume_percent"
        private const val KEY_DELAY = "start_delay_sec"
        private const val KEY_IDLE = "idle_shutdown_min"
        private const val KEY_BOOT = "last_boot_count"
    }
}
