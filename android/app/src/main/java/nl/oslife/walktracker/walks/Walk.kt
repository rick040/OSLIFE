package nl.oslife.walktracker.walks

/** One GPS point in a tracked walk's route, mirroring the `walks.points` jsonb shape. */
data class WalkPoint(val lat: Double, val lon: Double, val t: String?)

/** A finished walk as read back from walk-ingest's GET (see WalkRepository). */
data class Walk(
    val id: String,
    val startedAt: String, // ISO datetime
    val endedAt: String, // ISO datetime
    val durationMin: Int,
    val distanceKm: Double,
    val points: List<WalkPoint>,
    val triggerSource: String?,
)
