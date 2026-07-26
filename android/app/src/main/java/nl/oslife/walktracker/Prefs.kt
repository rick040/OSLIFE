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
