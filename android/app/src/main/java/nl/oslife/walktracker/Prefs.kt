package nl.oslife.walktracker

import android.content.Context
import android.content.SharedPreferences

/**
 * All app state in one SharedPreferences file: user-entered settings (server
 * URL/secret, home location) and the walk-detector's durable state machine
 * fields. The detector's receivers/workers are short-lived processes, so
 * anything the state machine needs to survive between events lives here, not
 * in memory.
 */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.getSharedPreferences("walk_tracker_prefs", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString(KEY_SERVER_URL, "") ?: ""
        set(value) = sp.edit().putString(KEY_SERVER_URL, value).apply()

    var secret: String
        get() = sp.getString(KEY_SECRET, "") ?: ""
        set(value) = sp.edit().putString(KEY_SECRET, value).apply()

    // ── Home-screen widget (widget-summary edge function) ────────────────────

    var widgetSummaryUrl: String
        get() = sp.getString(KEY_WIDGET_SUMMARY_URL, "") ?: ""
        set(value) = sp.edit().putString(KEY_WIDGET_SUMMARY_URL, value).apply()

    var widgetSummarySecret: String
        get() = sp.getString(KEY_WIDGET_SUMMARY_SECRET, "") ?: ""
        set(value) = sp.edit().putString(KEY_WIDGET_SUMMARY_SECRET, value).apply()

    // ── Premium OSLIFE widgets (to-do, priority, projects, brain-dump, HEYRA) ──
    // One shared base URL + secret for all five — each function derives its own
    // full URL by appending its own name, so setup is "paste once", not five
    // separate URL/secret pairs. Defaults to the widget-summary secret's own
    // convention (WIDGET_SUMMARY_SECRET) so most installs need zero new config.

    var oslifeFunctionsBaseUrl: String
        get() = sp.getString(KEY_OSLIFE_BASE_URL, "") ?: ""
        set(value) = sp.edit().putString(KEY_OSLIFE_BASE_URL, value).apply()

    var oslifeWidgetSecret: String
        get() = sp.getString(KEY_OSLIFE_SECRET, "") ?: ""
        set(value) = sp.edit().putString(KEY_OSLIFE_SECRET, value).apply()

    /** Full URL for one of the widget-* edge functions, or "" if not configured yet. */
    fun oslifeFunctionUrl(functionName: String): String {
        val base = oslifeFunctionsBaseUrl.trim().trimEnd('/')
        return if (base.isBlank()) "" else "$base/$functionName"
    }

    var homeLat: Double
        get() = java.lang.Double.longBitsToDouble(sp.getLong(KEY_HOME_LAT, 0L))
        set(value) = sp.edit().putLong(KEY_HOME_LAT, java.lang.Double.doubleToLongBits(value)).apply()

    var homeLon: Double
        get() = java.lang.Double.longBitsToDouble(sp.getLong(KEY_HOME_LON, 0L))
        set(value) = sp.edit().putLong(KEY_HOME_LON, java.lang.Double.doubleToLongBits(value)).apply()

    val hasHome: Boolean
        get() = sp.contains(KEY_HOME_LAT) && sp.contains(KEY_HOME_LON)

    // ── Detector state machine ───────────────────────────────────────────────

    var isWalkActive: Boolean
        get() = sp.getBoolean(KEY_WALK_ACTIVE, false)
        set(value) = sp.edit().putBoolean(KEY_WALK_ACTIVE, value).apply()

    var walkStartAt: Long
        get() = sp.getLong(KEY_WALK_START_AT, 0L)
        set(value) = sp.edit().putLong(KEY_WALK_START_AT, value).apply()

    var triggerSource: String
        get() = sp.getString(KEY_TRIGGER_SOURCE, "unknown") ?: "unknown"
        set(value) = sp.edit().putString(KEY_TRIGGER_SOURCE, value).apply()

    var lastHomeExitAt: Long
        get() = sp.getLong(KEY_LAST_HOME_EXIT_AT, 0L)
        set(value) = sp.edit().putLong(KEY_LAST_HOME_EXIT_AT, value).apply()

    var lastVehicleEndAt: Long
        get() = sp.getLong(KEY_LAST_VEHICLE_END_AT, 0L)
        set(value) = sp.edit().putLong(KEY_LAST_VEHICLE_END_AT, value).apply()

    var pausedSinceAt: Long
        get() = sp.getLong(KEY_PAUSED_SINCE_AT, 0L)
        set(value) = sp.edit().putLong(KEY_PAUSED_SINCE_AT, value).apply()

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_SECRET = "secret"
        private const val KEY_WIDGET_SUMMARY_URL = "widget_summary_url"
        private const val KEY_WIDGET_SUMMARY_SECRET = "widget_summary_secret"
        private const val KEY_OSLIFE_BASE_URL = "oslife_functions_base_url"
        private const val KEY_OSLIFE_SECRET = "oslife_widget_secret"
        private const val KEY_HOME_LAT = "home_lat"
        private const val KEY_HOME_LON = "home_lon"
        private const val KEY_WALK_ACTIVE = "walk_active"
        private const val KEY_WALK_START_AT = "walk_start_at"
        private const val KEY_TRIGGER_SOURCE = "trigger_source"
        private const val KEY_LAST_HOME_EXIT_AT = "last_home_exit_at"
        private const val KEY_LAST_VEHICLE_END_AT = "last_vehicle_end_at"
        private const val KEY_PAUSED_SINCE_AT = "paused_since_at"
    }
}
