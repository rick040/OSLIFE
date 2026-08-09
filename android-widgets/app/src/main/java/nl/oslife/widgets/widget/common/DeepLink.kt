package nl.oslife.widgets.widget.common

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import nl.oslife.widgets.MainActivity
import nl.oslife.widgets.Prefs
import java.net.URLEncoder

/**
 * Deep links from a widget tap into the OSLIFE web app (see src/App.tsx —
 * ?view=<View>&id=<entityId> opens straight to that screen, and for
 * tasks/projects, straight to that item's detail modal). Falls back to
 * opening the native app's MainActivity when no web-app URL is configured
 * yet, so a tap is never a dead end.
 */
object DeepLink {

    /** e.g. view="tasks", id="<task uuid>" → https://.../?view=tasks&id=<task uuid> */
    private fun webAppUri(context: Context, view: String, id: String? = null): Uri? {
        val base = Prefs(context).oslifeWebAppUrl.trim().trimEnd('/')
        if (base.isBlank()) return null
        val encodedId = id?.let { URLEncoder.encode(it, "UTF-8") }
        val query = if (encodedId != null) "view=$view&id=$encodedId" else "view=$view"
        return Uri.parse("$base/?$query")
    }

    /** PendingIntent that opens the web app at the given screen (+ optional specific item), or MainActivity if not configured.
     * Never throws — building the click target for one row must never take down the rest of the widget's render. */
    fun pendingIntent(context: Context, requestCode: Int, view: String, id: String? = null): PendingIntent {
        val intent = try {
            val uri = webAppUri(context, view, id)
            if (uri != null) Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) else null
        } catch (_: Exception) {
            null
        } ?: Intent(context, MainActivity::class.java)
        return PendingIntent.getActivity(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** Same as pendingIntent(), but as a plain Intent — for firing directly from a BroadcastReceiver (e.g. a collection-widget row tap). Never throws. */
    fun intent(context: Context, view: String, id: String? = null): Intent {
        val fallback = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            val uri = webAppUri(context, view, id) ?: return fallback
            Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        } catch (_: Exception) {
            fallback
        }
    }
}
