package nl.oslife.widgets.widget.todo

import android.content.Context
import java.util.concurrent.TimeUnit

/**
 * Tasks ticked off in a widget whose "done" hasn't been confirmed by the server yet. The widget
 * draws these as done the instant the box is tapped (instead of nothing happening until the
 * round-trip finishes), and tapping one again before it disappears undoes it. An id leaves the
 * set once a fresh widget-tasks fetch no longer lists it as open, or when TodoToggleWorker gives
 * up — [MAX_AGE_MS] only guards against anything that slips through both.
 */
internal object PendingDone {
    private const val PREFS = "todo_pending_done"
    private const val KEY = "entries"
    private val MAX_AGE_MS = TimeUnit.HOURS.toMillis(6)

    @Synchronized
    fun ids(context: Context): Set<String> = read(context).keys

    /** Flips [taskId]; returns true when it's now pending-done, false when this tap undid it. */
    @Synchronized
    fun toggle(context: Context, taskId: String): Boolean {
        val entries = read(context).toMutableMap()
        val nowDone = entries.remove(taskId) == null
        if (nowDone) entries[taskId] = System.currentTimeMillis()
        write(context, entries)
        return nowDone
    }

    @Synchronized
    fun remove(context: Context, taskId: String) {
        val entries = read(context).toMutableMap()
        if (entries.remove(taskId) != null) write(context, entries)
    }

    /** Drops ids the server no longer lists as open — their "done" has landed. */
    @Synchronized
    fun reconcile(context: Context, openIds: Set<String>) {
        val entries = read(context)
        val kept = entries.filterKeys { it in openIds }
        if (kept.size != entries.size) write(context, kept)
    }

    private fun read(context: Context): Map<String, Long> {
        val now = System.currentTimeMillis()
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet(KEY, emptySet()).orEmpty()
            .mapNotNull { entry ->
                val id = entry.substringBeforeLast('@')
                val at = entry.substringAfterLast('@').toLongOrNull() ?: return@mapNotNull null
                if (now - at > MAX_AGE_MS) null else id to at
            }
            .toMap()
    }

    private fun write(context: Context, entries: Map<String, Long>) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putStringSet(KEY, entries.map { (id, at) -> "$id@$at" }.toSet())
            .commit()
    }
}
