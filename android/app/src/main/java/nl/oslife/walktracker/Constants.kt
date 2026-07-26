package nl.oslife.walktracker

/**
 * Tunable thresholds for the auto-detection heuristics — see /android/README.md
 * for the reasoning behind each one. Adjust here and rebuild if your own walks
 * don't fit the defaults (e.g. you routinely pause for 25+ minutes at a park).
 */
object Constants {
    /** A walk shorter than this is almost certainly you walking around the house — discard it. */
    const val MIN_WALK_DURATION_MS = 5 * 60 * 1000L

    /** WALKING seen within this long after a home-exit still counts as "started at home". */
    const val HOME_EXIT_TRIGGER_WINDOW_MS = 90 * 60 * 1000L

    /** WALKING seen within this long after a car ride ends counts as a forest/car walk. */
    const val CAR_WALK_TRIGGER_WINDOW_MS = 15 * 60 * 1000L

    /** How long a STILL spell (sniffing, playing, a chat with a neighbour) may last
     *  before the walk is considered over and gets finalized automatically. */
    const val PAUSE_TIMEOUT_MS = 20 * 60 * 1000L

    /** Radius of the one "home" geofence. */
    const val HOME_GEOFENCE_RADIUS_M = 80f

    /** Location update interval while a walk is actively tracked. */
    const val LOCATION_UPDATE_INTERVAL_MS = 8000L

    /** Drop a fix this inaccurate — treated as noise, not a real position update. */
    const val MAX_ACCEPTABLE_ACCURACY_M = 50f

    const val HOME_GEOFENCE_REQUEST_ID = "home"
}
