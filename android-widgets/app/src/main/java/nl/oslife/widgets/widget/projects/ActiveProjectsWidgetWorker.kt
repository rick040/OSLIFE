package nl.oslife.widgets.widget.projects

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
import nl.oslife.widgets.widget.common.str
import nl.oslife.widgets.widget.todo.TaskRows
import org.json.JSONObject

private data class ActiveProject(val id: String, val name: String, val client: String?, val progress: Double, val deadline: String?)

private val ROW_IDS = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4)
private val NAME_IDS = intArrayOf(R.id.widget_name1, R.id.widget_name2, R.id.widget_name3, R.id.widget_name4)
private val META_IDS = intArrayOf(R.id.widget_meta1, R.id.widget_meta2, R.id.widget_meta3, R.id.widget_meta4)
private val DEADLINE_IDS = intArrayOf(R.id.widget_deadline1, R.id.widget_deadline2, R.id.widget_deadline3, R.id.widget_deadline4)
private val PROGRESS_IDS = intArrayOf(R.id.widget_progress1, R.id.widget_progress2, R.id.widget_progress3, R.id.widget_progress4)

class ActiveProjectsWidgetWorker(context: Context, params: WorkerParameters) : DataWidgetWorker(context, params) {

    override val function = FUNCTION
    override fun push(context: Context, data: WidgetData) = push(context, null, data)

    companion object {
        const val FUNCTION = "widget-projects"
        private const val UNIQUE_PERIODIC_WORK = "projects_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "projects_widget_refresh_once"
        private const val ROW_HEIGHT_DP = 50

        fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) =
            WidgetPush.push(context, ActiveProjectsWidgetProvider::class.java, appWidgetIds, data) { id, d -> buildViews(context, id, d) }

        private fun parseProjects(json: JSONObject): List<ActiveProject> {
            val projects = json.optJSONArray("projects") ?: return emptyList()
            return (0 until projects.length()).map {
                val o = projects.getJSONObject(it)
                ActiveProject(
                    id = o.optString("id"),
                    name = o.str("name") ?: "(zonder naam)",
                    client = o.str("client"),
                    progress = o.optDouble("progress", 0.0).takeIf { p -> !p.isNaN() } ?: 0.0,
                    deadline = o.str("deadline"),
                )
            }
        }

        fun buildViews(context: Context, appWidgetId: Int, data: WidgetData): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_active_projects)
            val json = WidgetChrome.bind(
                context, views, appWidgetId, data,
                ActiveProjectsWidgetProvider::class.java, ActiveProjectsWidgetProvider.ACTION_REFRESH,
                DeepLink.pendingIntent(context, 0, "projects"),
            )
            if (json == null) {
                views.setViewVisibility(R.id.widget_count, View.GONE)
                return views
            }

            val items = parseProjects(json)
            views.setViewVisibility(R.id.widget_count, if (items.isNotEmpty()) View.VISIBLE else View.GONE)
            views.setTextViewText(R.id.widget_count, items.size.toString())
            if (items.isEmpty()) {
                WidgetChrome.showEmpty(views, "Geen actieve projecten.")
                WidgetChrome.setMore(views, null)
                return views
            }

            val shown = minOf(WidgetStyle.rowCapacity(context, appWidgetId, ROW_HEIGHT_DP, TaskRows.CHROME_DP, ROW_IDS.size), items.size)
            for (i in ROW_IDS.indices) {
                if (i >= shown) {
                    views.setViewVisibility(ROW_IDS[i], View.GONE)
                    continue
                }
                val p = items[i]
                val percent = (p.progress.coerceIn(0.0, 1.0) * 100).toInt()
                views.setViewVisibility(ROW_IDS[i], View.VISIBLE)
                views.setTextViewText(NAME_IDS[i], p.name)
                views.setTextViewText(META_IDS[i], listOfNotNull(p.client, "$percent%").joinToString(" · "))
                views.setProgressBar(PROGRESS_IDS[i], 100, percent, false)
                TaskRows.bindDue(context, views, DEADLINE_IDS[i], p.deadline)
                // Distinct request code per row so each row's PendingIntent carries its own project id.
                views.setOnClickPendingIntent(ROW_IDS[i], DeepLink.pendingIntent(context, 200 + i, "projects", p.id))
            }
            WidgetChrome.setMore(views, if (items.size > shown) "+${items.size - shown} meer" else null)
            return views
        }

        fun refreshNow(context: Context) = WidgetJobs.refreshNow(context, ActiveProjectsWidgetWorker::class.java, UNIQUE_ONE_TIME_WORK)

        fun schedulePeriodic(context: Context) = WidgetJobs.schedulePeriodic(context, ActiveProjectsWidgetWorker::class.java, UNIQUE_PERIODIC_WORK)

        fun cancelPeriodic(context: Context) = WidgetJobs.cancel(context, UNIQUE_PERIODIC_WORK)
    }
}
