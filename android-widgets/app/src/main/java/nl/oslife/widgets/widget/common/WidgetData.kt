package nl.oslife.widgets.widget.common

import android.content.Context
import nl.oslife.widgets.Prefs
import org.json.JSONObject

/**
 * What a data widget has to draw right now. Every fetch goes through [fetch], which keeps the
 * last good response per edge function — so a failed refresh (tunnel, airplane mode, a 500)
 * leaves the last known data on screen marked "Offline · stand van 14:32" instead of wiping the
 * widget to an error, and a freshly placed or rebooted widget draws instantly from [cached]
 * instead of sitting on "Laden…" until the network answers.
 */
sealed class WidgetData {
    /** [offline] = the latest fetch failed and this is the last good copy, from [fetchedAt]. */
    data class Ready(val json: JSONObject, val fetchedAt: Long, val offline: Boolean = false) : WidgetData()
    object Loading : WidgetData()
    object NotConfigured : WidgetData()
    data class Error(val message: String) : WidgetData()

    companion object {
        private const val PREFS = "widget_data_cache"

        /** GET [function]; on failure fall back to its last good response, marked offline. */
        fun fetch(context: Context, function: String): WidgetData =
            when (val result = OslifeWidgetApi.get(context, function)) {
                is OslifeWidgetApi.Result.Success -> {
                    val now = System.currentTimeMillis()
                    store(context, function, result.json, now)
                    Ready(result.json, now)
                }
                is OslifeWidgetApi.Result.NotConfigured -> NotConfigured
                is OslifeWidgetApi.Result.Failure ->
                    load(context, function)?.copy(offline = true) ?: Error(result.message)
            }

        /** The last good response for [function] without touching the network. */
        fun cached(context: Context, function: String): WidgetData = when {
            !Prefs(context).isConfigured -> NotConfigured
            else -> load(context, function) ?: Loading
        }

        private fun store(context: Context, function: String, json: JSONObject, at: Long) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("json_$function", json.toString())
                .putLong("at_$function", at)
                .apply()
        }

        private fun load(context: Context, function: String): Ready? {
            val sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val text = sp.getString("json_$function", null) ?: return null
            return try {
                Ready(JSONObject(text), sp.getLong("at_$function", 0L))
            } catch (_: Exception) {
                null
            }
        }
    }
}

/**
 * The string at [key], or null when it's missing, JSON null or blank. org.json's own
 * optString(key, null) returns the literal text "null" for a JSON null — which is how
 * undated tasks used to show a "null" pill.
 */
fun JSONObject.str(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
