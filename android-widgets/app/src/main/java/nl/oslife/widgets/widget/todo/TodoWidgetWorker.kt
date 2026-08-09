package nl.oslife.widgets.widget.todo

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import androidx.work.Worker
import androidx.work.WorkerParameters
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DateFmt
import nl.oslife.widgets.widget.common.DeepLink
import nl.oslife.widgets.widget.common.OslifeWidgetApi
import org.json.JSONArray
import java.time.Duration
import java.util.concurrent.TimeUnit

private data class TodoItem(val id: String, val title: String, val due: String?, val priority: String?)

private const val MAX_ROWS = 6
private val ROW_IDS = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4, R.id.widget_row5, R.id.widget_row6)
private val CHECK_IDS = intArrayOf(R.id.widget_check1, R.id.widget_check2, R.id.widget_check3, R.id.widget_check4, R.id.widget_check5, R.id.widget_check6)
private val DOT_IDS = intArrayOf(R.id.widget_dot1, R.id.widget_dot2, R.id.widget_dot3, R.id.widget_dot4, R.id.widget_dot5, R.id.widget_dot6)
private val TITLE_IDS = intArrayOf(R.id.widget_title1, R.id.widget_title2, R.id.widget_title3, R.id.widget_title4, R.id.widget_title5, R.id.widget_title6)
private val DUE_IDS = intArrayOf(R.id.widget_due1, R.id.widget_due2, R.id.widget_due3, R.id.widget_due4, R.id.widget_due5, R.id.widget_due6)

/**
 * Renders the to-do widget by pushing a fixed set of rows directly, same
 * WorkManager+RemoteViews pattern as every other widget here — NOT a
 * RemoteViewsService/ListView collection. That approach was tried first and
 * proved unreliable: binding a widget's RemoteViewsService is a cross-process
 * service bind the OS can silently refuse under battery/background
 * restrictions (observed in practice — the list got stuck on the system's
 * default "Laden..." placeholder forever, while every Worker-based widget on
 * the same device kept working). A fixed-row push has no such failure mode:
 * it's the exact same onUpdate()-pushes-RemoteViews mechanism every other
 * widget already uses successfully.
 */
class TodoWidgetWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val context = applicationContext
        val views = try {
            when (val result = OslifeWidgetApi.get(context, "widget-tasks")) {
                is OslifeWidgetApi.Result.Success -> buildViews(context, tasks = result.json.optJSONArray("tasks"))
                is OslifeWidgetApi.Result.NotConfigured -> buildViews(context, notConfiguredMessage = true)
                is OslifeWidgetApi.Result.Failure -> buildViews(context, errorMessage = result.message)
            }
        } catch (e: Exception) {
            buildViews(context, errorMessage = "Interne fout: ${e.message}")
        }
        pushViews(context, views)
        return Result.success()
    }

    companion object {
        private const val UNIQUE_PERIODIC_WORK = "todo_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "todo_widget_refresh_once"
        private val REFRESH_INTERVAL = Duration.ofMinutes(30)

        private fun pushViews(context: Context, views: RemoteViews) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, TodoListWidgetProvider::class.java))
            ids.forEach { id -> manager.updateAppWidget(id, views) }
        }

        private fun parseTasks(tasks: JSONArray?): List<TodoItem> {
            if (tasks == null) return emptyList()
            return (0 until tasks.length()).map {
                val o = tasks.getJSONObject(it)
                TodoItem(
                    id = o.optString("id"),
                    title = o.optString("title", "(zonder titel)"),
                    due = o.optString("due", null),
                    priority = o.optString("priority", null),
                )
            }
        }

        fun buildViews(
            context: Context,
            tasks: JSONArray? = null,
            errorMessage: String? = null,
            notConfiguredMessage: Boolean = false,
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_todo_list)

            views.setOnClickPendingIntent(R.id.widget_root, DeepLink.pendingIntent(context, 0, "tasks"))

            val refreshIntent = Intent(context, TodoListWidgetProvider::class.java).apply {
                action = TodoListWidgetProvider.ACTION_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context, 0, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)

            when {
                notConfiguredMessage -> {
                    ROW_IDS.forEach { views.setViewVisibility(it, View.GONE) }
                    views.setViewVisibility(R.id.widget_more, View.GONE)
                    views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
                    views.setTextViewText(R.id.widget_empty, "Nog niet ingesteld — open de app → Instellingen")
                    views.setTextViewText(R.id.widget_updated, "")
                }
                errorMessage != null -> {
                    ROW_IDS.forEach { views.setViewVisibility(it, View.GONE) }
                    views.setViewVisibility(R.id.widget_more, View.GONE)
                    views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
                    views.setTextViewText(R.id.widget_empty, "⚠️ $errorMessage")
                    views.setTextViewText(R.id.widget_updated, "")
                }
                else -> renderTasks(context, views, parseTasks(tasks))
            }

            return views
        }

        private fun renderTasks(context: Context, views: RemoteViews, items: List<TodoItem>) {
            views.setViewVisibility(R.id.widget_empty, if (items.isEmpty()) View.VISIBLE else View.GONE)

            for (i in ROW_IDS.indices) {
                if (i >= items.size) {
                    views.setViewVisibility(ROW_IDS[i], View.GONE)
                    continue
                }
                val item = items[i]
                views.setViewVisibility(ROW_IDS[i], View.VISIBLE)
                views.setTextViewText(TITLE_IDS[i], item.title)

                val dotRes = when (item.priority) {
                    "High" -> R.drawable.priority_dot_high
                    "Medium" -> R.drawable.priority_dot_medium
                    else -> R.drawable.priority_dot_low
                }
                views.setInt(DOT_IDS[i], "setBackgroundResource", dotRes)

                val dueLabel = DateFmt.relative(item.due)
                val overdue = DateFmt.isOverdue(item.due)
                if (dueLabel.isEmpty()) {
                    views.setViewVisibility(DUE_IDS[i], View.GONE)
                } else {
                    views.setViewVisibility(DUE_IDS[i], View.VISIBLE)
                    views.setTextViewText(DUE_IDS[i], dueLabel)
                    views.setInt(DUE_IDS[i], "setBackgroundResource", if (overdue) R.drawable.pill_danger else R.drawable.pill_glass)
                    views.setTextColor(DUE_IDS[i], if (overdue) context.getColor(R.color.widget_danger) else context.getColor(R.color.widget_text_secondary))
                }

                val toggleIntent = Intent(context, TodoListWidgetProvider::class.java).apply {
                    action = TodoListWidgetProvider.ACTION_TOGGLE
                    putExtra(TodoListWidgetProvider.EXTRA_TASK_ID, item.id)
                    data = android.net.Uri.parse("todowidget://toggle/${item.id}")
                }
                val togglePendingIntent = PendingIntent.getBroadcast(
                    context, 400 + i, toggleIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                )
                views.setOnClickPendingIntent(CHECK_IDS[i], togglePendingIntent)

                // Distinct request code per row so each row's PendingIntent carries its own task id.
                views.setOnClickPendingIntent(ROW_IDS[i], DeepLink.pendingIntent(context, 450 + i, "tasks", item.id))
            }

            if (items.size > MAX_ROWS) {
                views.setViewVisibility(R.id.widget_more, View.VISIBLE)
                views.setTextViewText(R.id.widget_more, "+${items.size - MAX_ROWS} meer — tik om alles te zien")
            } else {
                views.setViewVisibility(R.id.widget_more, View.GONE)
            }

            views.setTextViewText(R.id.widget_updated, "Ververst: net")
        }

        fun refreshNow(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<TodoWidgetWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_ONE_TIME_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<TodoWidgetWorker>(REFRESH_INTERVAL)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(UNIQUE_PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        fun cancelPeriodic(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_PERIODIC_WORK)
        }
    }
}
