package nl.oslife.widgets.widget.health

import android.content.Context
import android.widget.RemoteViews
import androidx.work.WorkerParameters
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetWorker
import nl.oslife.widgets.widget.common.DeepLink
import nl.oslife.widgets.widget.common.WidgetChrome
import nl.oslife.widgets.widget.common.WidgetData
import nl.oslife.widgets.widget.common.WidgetJobs
import nl.oslife.widgets.widget.common.WidgetPush
import nl.oslife.widgets.widget.common.WidgetStyle
import java.text.NumberFormat
import java.util.Locale

class HealthWidgetWorker(context: Context, params: WorkerParameters) : DataWidgetWorker(context, params) {

    override val function = FUNCTION
    override fun push(context: Context, data: WidgetData) = push(context, null, data)

    companion object {
        const val FUNCTION = "widget-health"
        private const val UNIQUE_PERIODIC_WORK = "health_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "health_widget_refresh_once"
        // No per-user goal endpoint yet — a reasonable fixed daily target, same
        // idea as the OS's own steps widget, until widget-health returns a real one.
        private const val STEP_GOAL = 10_000
        private val DUTCH = Locale("nl", "NL")

        fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) =
            WidgetPush.push(context, HealthWidgetProvider::class.java, appWidgetIds, data) { id, d -> buildViews(context, id, d) }

        fun buildViews(context: Context, appWidgetId: Int, data: WidgetData): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_health)
            val json = WidgetChrome.bind(
                context, views, appWidgetId, data,
                HealthWidgetProvider::class.java, HealthWidgetProvider.ACTION_REFRESH,
                DeepLink.pendingIntent(context, 0, "vitals"),
            ) ?: return views

            val nlInt = NumberFormat.getIntegerInstance(DUTCH)
            val today = json.optJSONObject("today")
            val steps = today?.takeIf { it.has("steps") && !it.isNull("steps") }?.optInt("steps")
            val sleepMin = today?.takeIf { it.has("sleepMin") && !it.isNull("sleepMin") }?.optInt("sleepMin")

            views.setTextViewText(R.id.widget_steps, if (steps != null) nlInt.format(steps) else "—")
            val goal = "/ ${nlInt.format(STEP_GOAL)}"
            views.setTextViewText(R.id.widget_steps_goal, if (WidgetStyle.isNarrow(context, appWidgetId)) goal else "$goal stappen")
            views.setProgressBar(R.id.widget_steps_progress, 100, (steps ?: 0).coerceIn(0, STEP_GOAL) * 100 / STEP_GOAL, false)

            views.setTextViewText(R.id.widget_sleep, if (sleepMin != null) "${sleepMin / 60}u ${sleepMin % 60}m" else "—")

            val weightKg = json.optJSONObject("weight")?.opt("kg") as? Number
            views.setTextViewText(R.id.widget_weight, if (weightKg != null) String.format(DUTCH, "%.1f kg", weightKg.toDouble()) else "—")

            val habits = json.optJSONObject("habits")
            val doneToday = habits?.optInt("doneToday", 0) ?: 0
            val totalActive = habits?.optInt("totalActive", 0) ?: 0
            val bestStreak = habits?.optInt("bestStreakDays", 0) ?: 0
            views.setTextViewText(R.id.widget_habits, if (totalActive > 0) "$doneToday/$totalActive" else "—")
            views.setTextViewText(R.id.widget_streak, if (bestStreak == 1) "1 dag" else "$bestStreak dagen")
            return views
        }

        fun refreshNow(context: Context) = WidgetJobs.refreshNow(context, HealthWidgetWorker::class.java, UNIQUE_ONE_TIME_WORK)

        fun schedulePeriodic(context: Context) = WidgetJobs.schedulePeriodic(context, HealthWidgetWorker::class.java, UNIQUE_PERIODIC_WORK)

        fun cancelPeriodic(context: Context) = WidgetJobs.cancel(context, UNIQUE_PERIODIC_WORK)
    }
}
