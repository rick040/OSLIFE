package nl.oslife.widgets.widget.priority

import android.content.Context
import android.view.View
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
import nl.oslife.widgets.widget.todo.PendingDone
import nl.oslife.widgets.widget.todo.TaskRows
import org.json.JSONObject

/**
 * "Belangrijkste": open High/Medium tasks, High first (each bucket keeps widget-tasks' due-date
 * order). Same rows as the to-do widget, so they can be ticked off right here too.
 */
class TopPriorityWidgetWorker(context: Context, params: WorkerParameters) : DataWidgetWorker(context, params) {

    override val function = TaskRows.FUNCTION

    override fun onFresh(context: Context, json: JSONObject) {
        PendingDone.reconcile(context, TaskRows.parse(json).map { it.id }.toSet())
    }

    override fun push(context: Context, data: WidgetData) = TaskRows.pushAll(context, data)

    companion object {
        private const val UNIQUE_PERIODIC_WORK = "priority_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "priority_widget_refresh_once"

        private val IDS = TaskRows.Ids(
            rows = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4, R.id.widget_row5),
            checks = intArrayOf(R.id.widget_check1, R.id.widget_check2, R.id.widget_check3, R.id.widget_check4, R.id.widget_check5),
            titles = intArrayOf(R.id.widget_title1, R.id.widget_title2, R.id.widget_title3, R.id.widget_title4, R.id.widget_title5),
            dues = intArrayOf(R.id.widget_due1, R.id.widget_due2, R.id.widget_due3, R.id.widget_due4, R.id.widget_due5),
        )

        fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) =
            WidgetPush.push(context, TopPriorityWidgetProvider::class.java, appWidgetIds, data) { id, d -> buildViews(context, id, d) }

        fun buildViews(context: Context, appWidgetId: Int, data: WidgetData): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_top_priority)
            // requestCode 1 (not 0): the to-do widget's card also links to view=tasks with no id,
            // and a shared requestCode would make both cards literally the same PendingIntent.
            val json = WidgetChrome.bind(
                context, views, appWidgetId, data,
                TopPriorityWidgetProvider::class.java, TopPriorityWidgetProvider.ACTION_REFRESH,
                DeepLink.pendingIntent(context, 1, "tasks"),
            )
            if (json == null) {
                views.setViewVisibility(R.id.widget_count, View.GONE)
                return views
            }

            val all = TaskRows.parse(json)
            val items = all.filter { it.priority == "High" } + all.filter { it.priority == "Medium" }
            val done = PendingDone.ids(context)
            val open = items.count { it.id !in done }
            views.setViewVisibility(R.id.widget_count, if (open > 0) View.VISIBLE else View.GONE)
            views.setTextViewText(R.id.widget_count, open.toString())

            if (items.isEmpty()) {
                WidgetChrome.showEmpty(views, "Niets urgents open — lekker bezig.")
                WidgetChrome.setMore(views, null)
                return views
            }

            val capacity = WidgetStyle.rowCapacity(context, appWidgetId, TaskRows.ROW_HEIGHT_DP, TaskRows.CHROME_DP, IDS.rows.size)
            val shown = minOf(capacity, items.size)
            TaskRows.render(context, views, IDS, items, shown, done, compact = WidgetStyle.isNarrow(context, appWidgetId))
            WidgetChrome.setMore(views, if (items.size > shown) "+${items.size - shown} meer" else null)
            return views
        }

        fun refreshNow(context: Context) = WidgetJobs.refreshNow(context, TopPriorityWidgetWorker::class.java, UNIQUE_ONE_TIME_WORK)

        fun schedulePeriodic(context: Context) = WidgetJobs.schedulePeriodic(context, TopPriorityWidgetWorker::class.java, UNIQUE_PERIODIC_WORK)

        fun cancelPeriodic(context: Context) = WidgetJobs.cancel(context, UNIQUE_PERIODIC_WORK)
    }
}
