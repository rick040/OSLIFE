package nl.oslife.walktracker.walks

/**
 * Holds the last fetched walk list in memory so WalkDetailActivity can look a
 * walk up by id without re-fetching or Bundle-serializing its (potentially
 * large) point array across the Intent.
 */
object WalkCache {
    @Volatile private var walks: List<Walk> = emptyList()

    fun set(list: List<Walk>) {
        walks = list
    }

    fun find(id: String): Walk? = walks.find { it.id == id }
}
