package nl.oslife.widgets

import android.content.Context
import android.content.SharedPreferences

/**
 * All app state in one SharedPreferences file: the one base URL + secret
 * shared by all five widget-* edge functions, plus the OSLIFE web app URL
 * used for deep-linking widget taps (see DeepLink.kt).
 */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.getSharedPreferences("oslife_widgets_prefs", Context.MODE_PRIVATE)

    // ── Premium OSLIFE widgets (to-do, priority, projects, brain-dump, HEYRA) ──
    // One shared base URL + secret for all five — each function derives its own
    // full URL by appending its own name, so setup is "paste once", not five
    // separate URL/secret pairs.

    var oslifeFunctionsBaseUrl: String
        get() = sp.getString(KEY_OSLIFE_BASE_URL, "") ?: ""
        set(value) = sp.edit().putString(KEY_OSLIFE_BASE_URL, value).apply()

    /** The deployed OSLIFE web app's URL (e.g. https://oslife.vercel.app) — tapping a
     * task/project in a widget opens straight to that item there (see DeepLink.kt). */
    var oslifeWebAppUrl: String
        get() = sp.getString(KEY_OSLIFE_WEB_APP_URL, "") ?: ""
        set(value) = sp.edit().putString(KEY_OSLIFE_WEB_APP_URL, value).apply()

    var oslifeWidgetSecret: String
        get() = sp.getString(KEY_OSLIFE_SECRET, "") ?: ""
        set(value) = sp.edit().putString(KEY_OSLIFE_SECRET, value).apply()

    /** Full URL for one of the widget-* edge functions, or "" if not configured yet. */
    fun oslifeFunctionUrl(functionName: String): String {
        val base = oslifeFunctionsBaseUrl.trim().trimEnd('/')
        return if (base.isBlank()) "" else "$base/$functionName"
    }

    companion object {
        private const val KEY_OSLIFE_BASE_URL = "oslife_functions_base_url"
        private const val KEY_OSLIFE_WEB_APP_URL = "oslife_web_app_url"
        private const val KEY_OSLIFE_SECRET = "oslife_widget_secret"
    }
}
