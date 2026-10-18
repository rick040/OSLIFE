package nl.oslife.gym

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import android.view.KeyEvent
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

/** Device-level actions: Spotify, volume, network, root power commands. */
object GymControl {
    const val SPOTIFY = "com.spotify.music"

    private val SPOTIFY_TYPES = listOf("playlist", "album", "track", "artist", "show", "episode")

    fun spotifyInstalled(context: Context): Boolean = try {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(SPOTIFY, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    /** Turns an open.spotify.com link into a spotify: URI; passes other input through. */
    fun toSpotifyUri(input: String): String {
        val text = input.trim()
        if (text.isEmpty() || text.startsWith("spotify:")) return text
        if (!text.contains("open.spotify.com")) return text
        val segments = Uri.parse(text).pathSegments
        for (i in 0 until segments.size - 1) {
            if (segments[i] in SPOTIFY_TYPES) return "spotify:${segments[i]}:${segments[i + 1]}"
        }
        return text
    }

    /** Opens Spotify on the playlist (or just opens Spotify when no playlist is set). */
    fun openSpotify(context: Context, playlist: String): Boolean {
        val uri = toSpotifyUri(playlist)
        val intent = if (uri.isEmpty()) {
            context.packageManager.getLaunchIntentForPackage(SPOTIFY) ?: return false
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(SPOTIFY)
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        } catch (e: SecurityException) {
            false
        }
    }

    /** Sends a media button press (play, pause, next...) to whichever app plays music. */
    fun mediaKey(context: Context, keyCode: Int) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
        am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
    }

    fun setVolume(context: Context, percent: Int) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val level = (max * percent.coerceIn(0, 100) / 100.0).roundToInt().coerceIn(0, max)
        am.setStreamVolume(AudioManager.STREAM_MUSIC, level, 0)
    }

    fun isMusicActive(context: Context): Boolean {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return am.isMusicActive
    }

    /** Blocks until there is a working internet connection, or the timeout passes. */
    fun waitForNetwork(context: Context, timeoutMs: Long) {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val start = SystemClock.elapsedRealtime()
        while (SystemClock.elapsedRealtime() - start < timeoutMs) {
            val caps = cm.activeNetwork?.let { cm.getNetworkCapabilities(it) }
            if (caps != null) {
                if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return
                // Some networks never report "validated"; accept plain internet after 20 s.
                val waited = SystemClock.elapsedRealtime() - start
                if (waited > 20_000 && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return
            }
            try {
                Thread.sleep(1000)
            } catch (e: InterruptedException) {
                return
            }
        }
    }

    fun canDrawOverlays(context: Context): Boolean = Settings.canDrawOverlays(context)

    fun isDefaultHome(context: Context): Boolean {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        @Suppress("DEPRECATION")
        val info = context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        return info?.activityInfo?.packageName == context.packageName
    }

    // ----- Root power commands. Call these off the main thread. -----

    /** Runs a command as root. Returns true when it exits with code 0. */
    fun runRoot(command: String, timeoutSec: Long = 10): Boolean = try {
        val process = Runtime.getRuntime().exec(arrayOf("su", "-c", command))
        val finished = process.waitFor(timeoutSec, TimeUnit.SECONDS)
        finished && process.exitValue() == 0
    } catch (e: Exception) {
        false
    }

    fun hasRoot(): Boolean = try {
        val process = Runtime.getRuntime().exec(arrayOf("su", "-c", "id"))
        val output = process.inputStream.bufferedReader().readText()
        process.waitFor(10, TimeUnit.SECONDS)
        output.contains("uid=0")
    } catch (e: Exception) {
        false
    }

    /** Clean power off. Only works on a rooted board. */
    fun shutdown(): Boolean = runRoot("reboot -p") || runRoot("svc power shutdown")

    fun reboot(): Boolean = runRoot("reboot")
}
