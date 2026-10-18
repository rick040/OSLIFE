package nl.oslife.gym

import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Empty on purpose. Android only lets an app read other apps' media sessions
 * (what Spotify is playing) when it has an enabled notification listener, so
 * this service exists to be switched on under "Notification access".
 */
class NowPlayingService : NotificationListenerService()

/**
 * Follows the active media session (Spotify or any other player) and reports
 * what's playing as JSON for the OSLIFE page. Needs notification access.
 */
class NowPlayingWatcher(private val context: Context, private val onChange: (String) -> Unit) {

    private val sessions = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
    private val component = ComponentName(context, NowPlayingService::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private var controller: MediaController? = null
    private var started = false

    @Volatile
    var lastJson: String = EMPTY
        private set

    private var artKey: String? = null
    private var artData: String? = null

    private val callback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) = publish()
        override fun onPlaybackStateChanged(state: PlaybackState?) = publish()
        override fun onSessionDestroyed() = pickController(null)
    }

    private val sessionsListener = MediaSessionManager.OnActiveSessionsChangedListener { list ->
        pickController(list)
    }

    fun start() {
        if (started || !hasAccess(context)) return
        try {
            sessions.addOnActiveSessionsChangedListener(sessionsListener, component, handler)
            started = true
            pickController(null)
        } catch (e: SecurityException) {
            started = false
        }
    }

    fun stop() {
        if (started) {
            try {
                sessions.removeOnActiveSessionsChangedListener(sessionsListener)
            } catch (e: Exception) {
                // already gone
            }
        }
        controller?.unregisterCallback(callback)
        controller = null
        started = false
    }

    // Transport controls go straight to the player when we know it; otherwise
    // fall back to a media key, which Android routes to the active player.
    fun playPause(fallback: () -> Unit) {
        val c = controller ?: return fallback()
        if (c.playbackState?.state == PlaybackState.STATE_PLAYING) c.transportControls.pause() else c.transportControls.play()
    }

    fun next(fallback: () -> Unit) {
        controller?.transportControls?.skipToNext() ?: fallback()
    }

    fun previous(fallback: () -> Unit) {
        controller?.transportControls?.skipToPrevious() ?: fallback()
    }

    private fun pickController(list: List<MediaController>?) {
        val active = list ?: try {
            sessions.getActiveSessions(component)
        } catch (e: SecurityException) {
            emptyList<MediaController>()
        }
        val best = active.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING } ?: active.firstOrNull()
        if (best?.sessionToken != controller?.sessionToken) {
            controller?.unregisterCallback(callback)
            controller = best
            best?.registerCallback(callback, handler)
        }
        publish()
    }

    private fun publish() {
        val c = controller
        val meta = c?.metadata
        val title = meta?.getString(MediaMetadata.METADATA_KEY_TITLE)
            ?: meta?.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)
        val json = JSONObject()
        if (c == null || meta == null || title.isNullOrBlank()) {
            json.put("available", false)
        } else {
            val artist = meta.getString(MediaMetadata.METADATA_KEY_ARTIST)
                ?: meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
                ?: meta.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE)
                ?: ""
            val state = c.playbackState
            val playing = state?.state == PlaybackState.STATE_PLAYING
            var position = state?.position ?: 0L
            if (playing && state != null && state.lastPositionUpdateTime > 0) {
                position += ((SystemClock.elapsedRealtime() - state.lastPositionUpdateTime) * state.playbackSpeed).toLong()
            }
            json.put("available", true)
            json.put("title", title)
            json.put("artist", artist)
            json.put("album", meta.getString(MediaMetadata.METADATA_KEY_ALBUM) ?: "")
            json.put("app", appLabel(c.packageName))
            json.put("playing", playing)
            json.put("positionMs", position.coerceAtLeast(0L))
            json.put("durationMs", meta.getLong(MediaMetadata.METADATA_KEY_DURATION))
            json.put("updatedAt", System.currentTimeMillis())
            val art = artFor(c.packageName + "|" + title + "|" + artist, meta)
            if (art != null) json.put("art", art)
        }
        val text = json.toString()
        lastJson = text
        onChange(text)
    }

    /** Album art as a small JPEG data URL, cached per track. */
    private fun artFor(key: String, meta: MediaMetadata): String? {
        if (key == artKey) return artData
        val bitmap = meta.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
            ?: meta.getBitmap(MediaMetadata.METADATA_KEY_ART)
            ?: meta.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON)
        artKey = key
        artData = bitmap?.let { encode(it) }
        return artData
    }

    private fun encode(bitmap: Bitmap): String? = try {
        val size = 192
        val scale = size.toFloat() / maxOf(bitmap.width, bitmap.height).coerceAtLeast(1)
        val small = if (scale < 1f) {
            Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt().coerceAtLeast(1), (bitmap.height * scale).toInt().coerceAtLeast(1), true)
        } else {
            bitmap
        }
        val out = ByteArrayOutputStream()
        small.compress(Bitmap.CompressFormat.JPEG, 80, out)
        "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) {
        null
    }

    private fun appLabel(pkg: String): String = try {
        val pm = context.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) {
        pkg
    }

    companion object {
        const val EMPTY = "{\"available\":false}"

        /** True when the user enabled this app under "Notification access". */
        fun hasAccess(context: Context): Boolean {
            val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
            return enabled.split(":").any { it.startsWith(context.packageName + "/") }
        }
    }
}
