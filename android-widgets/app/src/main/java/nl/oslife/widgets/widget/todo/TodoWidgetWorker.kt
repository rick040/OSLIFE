package nl.oslife.widgets.widget.todo

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
import org.json.JSONObject

/**
 * Renders the to-do widget by pushing a fixed set of rows directly, same
 * WorkManager+RemoteViews pattern as every other widget here — NOT a
 * RemoteViewsService/ListView collection. That approach was tried first and
 * proved unreliable: binding a widget's RemoteViewsService is a cross-process
 * service bind the OS can silently refuse under battery/background
 * restrictions (observed in practice — the list got stuck on the system's
 * default "Laden..." placeholder forever, while every Worker-based widget on
 * the same device kept working). A fixed-row push has no such failure mode.
 * How many of the eight rows show depends on each instance's height.
 */
class TodoWidgetWorker(context: Context, params: WorkerParameters) : DataWidgetWorker(context, params) {

    override val function = TaskRows.FUNCTION

    override fun onFresh(context: Context, json: JSONObject) {
        PendingDone.reconcile(context, TaskRows.parse(json).map { it.id }.toSet())
    }

    override fun push(context: Context, data: WidgetData) = TaskRows.pushAll(context, data)

    companion object {
        private const val UNIQUE_PERIODIC_WORK = "todo_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "todo_widget_refresh_once"

        private val IDS = TaskRows.Ids(
            rows = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4, R.id.widget_row5, R.id.widget_row6, R.id.widget_row7, R.id.widget_row8),
            checks = intArrayOf(R.id.widget_check1, R.id.widget_check2, R.id.widget_check3, R.id.widget_check4, R.id.widget_check5, R.id.widget_check6, R.id.widget_check7, R.id.widget_check8),
            titles = intArrayOf(R.id.widget_title1, R.id.widget_title2, R.id.widget_title3, R.id.widget_title4, R.id.widget_title5, R.id.widget_title6, R.id.widget_title7, R.id.widget_title8),
            dues = intArrayOf(R.id.widget_due1, R.id.widget_due2, R.id.widget_due3, R.id.widget_due4, R.id.widget_due5, R.id.widget_due6, R.id.widget_due7, R.id.widget_due8),
        )

        fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) =
            WidgetPush.push(context, TodoListWidgetProvider::class.java, appWidgetIds, data) { id, d -> buildViews(context, id, d) }

        fun buildViews(context: Context, appWidgetId: Int, data: WidgetData): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_todo_list)
            val json = WidgetChrome.bind(
                context, views, appWidgetId, data,
                TodoListWidgetProvider::class.java, TodoListWidgetProvider.ACTION_REFRESH,
                DeepLink.pendingIntent(context, 0, "tasks"),
            )
            if (json == null) {
                views.setViewVisibility(R.id.widget_count, android.view.View.GONE)
                return views
            }

            val items = TaskRows.parse(json)
            val done = PendingDone.ids(context)
            val open = items.count { it.id !in done }
            views.setViewVisibility(R.id.widget_count, if (open > 0) android.view.View.VISIBLE else android.view.View.GONE)
            views.setTextViewText(R.id.widget_count, open.toString())

            if (items.isEmpty()) {
                WidgetChrome.showEmpty(views, "Alles gedaan — geen open taken.")
                WidgetChrome.setMore(views, null)
                return views
            }

            val capacity = WidgetStyle.rowCapacity(context, appWidgetId, TaskRows.ROW_HEIGHT_DP, TaskRows.CHROME_DP, IDS.rows.size)
            val shown = minOf(capacity, items.size)
            TaskRows.render(context, views, IDS, items, shown, done, compact = WidgetStyle.isNarrow(context, appWidgetId))
            WidgetChrome.setMore(views, if (items.size > shown) "+${items.size - shown} meer" else null)
            return views
        }

        fun refreshNow(context: Context) = WidgetJobs.refreshNow(context, TodoWidgetWorker::class.java, UNIQUE_ONE_TIME_WORK)

        fun schedulePeriodic(context: Context) = WidgetJobs.schedulePeriodic(context, TodoWidgetWorker::class.java, UNIQUE_PERIODIC_WORK)

        fun cancelPeriodic(context: Context) = WidgetJobs.cancel(context, UNIQUE_PERIODIC_WORK)
    }
}
