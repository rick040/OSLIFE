package nl.oslife.widgets.widget.today

import android.content.Context
import android.widget.RemoteViews
import androidx.work.WorkerParameters
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetWorker
import nl.oslife.widgets.widget.common.DateFmt
import nl.oslife.widgets.widget.common.DeepLink
import nl.oslife.widgets.widget.common.WidgetChrome
import nl.oslife.widgets.widget.common.WidgetData
import nl.oslife.widgets.widget.common.WidgetJobs
import nl.oslife.widgets.widget.common.WidgetPush
import nl.oslife.widgets.widget.common.str
import org.json.JSONObject
import java.util.Locale

/**
 * "Vandaag": one line each for the next agenda block, tasks, habits and the dog, all from
 * widget-summary (the same endpoint the walk-tracker app's daily-glance widget uses), so the
 * whole card costs one request.
 */
class TodayWidgetWorker(context: Context, params: WorkerParameters) : DataWidgetWorker(context, params) {

    override val function = FUNCTION
    override fun push(context: Context, data: WidgetData) = push(context, null, data)

    companion object {
        const val FUNCTION = "widget-summary"
        private const val UNIQUE_PERIODIC_WORK = "today_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "today_widget_refresh_once"
        private val DUTCH = Locale("nl", "NL")

        fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) =
            WidgetPush.push(context, TodayWidgetProvider::class.java, appWidgetIds, data) { id, d -> buildViews(context, id, d) }

        fun buildViews(context: Context, appWidgetId: Int, data: WidgetData): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_today)
            val json = WidgetChrome.bind(
                context, views, appWidgetId, data,
                TodayWidgetProvider::class.java, TodayWidgetProvider.ACTION_REFRESH,
                DeepLink.pendingIntent(context, 0, "dashboard"),
            ) ?: return views

            views.setTextViewText(R.id.widget_value1, nextBlock(json.optJSONObject("calendar")))
            views.setTextViewText(R.id.widget_value2, tasks(json.optJSONObject("tasks")))
            views.setTextViewText(R.id.widget_value3, habits(json.optJSONObject("habits")))
            views.setTextViewText(R.id.widget_value4, dog(json.optJSONObject("dog")))

            views.setOnClickPendingIntent(R.id.widget_row1, DeepLink.pendingIntent(context, 0, "daybuilder"))
            views.setOnClickPendingIntent(R.id.widget_row2, DeepLink.pendingIntent(context, 0, "tasks"))
            views.setOnClickPendingIntent(R.id.widget_row3, DeepLink.pendingIntent(context, 0, "habits"))
            views.setOnClickPendingIntent(R.id.widget_row4, DeepLink.pendingIntent(context, 0, "dog"))
            return views
        }

        private fun nextBlock(calendar: JSONObject?): String {
            val title = calendar?.str("nextTitle") ?: return "Niets meer gepland"
            val start = calendar.str("nextStart")?.take(5)
            return if (start != null) "$start · $title" else title
        }

        private fun tasks(tasks: JSONObject?): String {
            val due = tasks?.optInt("dueToday", 0) ?: 0
            val open = tasks?.optInt("openTotal", 0) ?: 0
            return when {
                due > 0 -> "$due voor vandaag · $open open"
                open > 0 -> "Niets voor vandaag · $open open"
                else -> "Alles gedaan"
            }
        }

        private fun habits(habits: JSONObject?): String {
            val total = habits?.optInt("totalActive", 0) ?: 0
            if (total == 0) return "Geen actieve gewoontes"
            val done = habits?.optInt("doneToday", 0) ?: 0
            val streak = habits?.optInt("bestStreakDays", 0) ?: 0
            return "$done/$total gedaan" + if (streak > 1) " · reeks $streak d" else ""
        }

        private fun dog(dog: JSONObject?): String {
            val walks = dog?.optInt("walksToday", 0) ?: 0
            if (walks > 0) {
                val km = dog?.optDouble("distanceTodayKm", 0.0) ?: 0.0
                return "${walks}× gelopen" + if (km > 0) " · ${String.format(DUTCH, "%.1f", km)} km" else ""
            }
            val last = DateFmt.shortTime(dog?.str("lastWalkAt")).lowercase(DUTCH)
            return if (last.isNotEmpty()) "Nog niet gelopen · laatst $last" else "Nog niet gelopen"
        }

        fun refreshNow(context: Context) = WidgetJobs.refreshNow(context, TodayWidgetWorker::class.java, UNIQUE_ONE_TIME_WORK)

        fun schedulePeriodic(context: Context) = WidgetJobs.schedulePeriodic(context, TodayWidgetWorker::class.java, UNIQUE_PERIODIC_WORK)

        fun cancelPeriodic(context: Context) = WidgetJobs.cancel(context, UNIQUE_PERIODIC_WORK)
    }
}
