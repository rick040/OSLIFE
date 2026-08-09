package nl.oslife.widgets.widget.priority

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
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

private data class PriorityTask(val id: String, val title: String, val due: String?, val priority: String?)

private val ROW_IDS = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4, R.id.widget_row5)
private val DOT_IDS = intArrayOf(R.id.widget_dot1, R.id.widget_dot2, R.id.widget_dot3, R.id.widget_dot4, R.id.widget_dot5)
private val TITLE_IDS = intArrayOf(R.id.widget_title1, R.id.widget_title2, R.id.widget_title3, R.id.widget_title4, R.id.widget_title5)
private val DUE_IDS = intArrayOf(R.id.widget_due1, R.id.widget_due2, R.id.widget_due3, R.id.widget_due4, R.id.widget_due5)

class TopPriorityWidgetWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val context = applicationContext
        // Any failure while rendering must still reach pushViews() — a widget stuck on its
        // pre-render placeholder forever (looking identical to "no data") is worse than a
        // visible error, and a network fetch that succeeded is no guarantee the render will.
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
        private const val UNIQUE_PERIODIC_WORK = "priority_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "priority_widget_refresh_once"
        private val REFRESH_INTERVAL = Duration.ofMinutes(30)

        private fun pushViews(context: Context, views: RemoteViews) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, TopPriorityWidgetProvider::class.java))
            ids.forEach { id -> manager.updateAppWidget(id, views) }
        }

        /** Top-5 open High/Medium priority tasks, High first, each bucket sorted by due date. */
        private fun topPriorityTasks(tasks: JSONArray?): List<PriorityTask> {
            if (tasks == null) return emptyList()
            val all = (0 until tasks.length()).map { tasks.getJSONObject(it) }
            val high = all.filter { it.optString("priority") == "High" }
            val medium = all.filter { it.optString("priority") == "Medium" }
            return (high + medium).take(5).map {
                PriorityTask(
                    it.optString("id"),
                    it.optString("title", "(zonder titel)"),
                    it.optString("due", null),
                    it.optString("priority", null),
                )
            }
        }

        fun buildViews(
            context: Context,
            tasks: JSONArray? = null,
            errorMessage: String? = null,
            notConfiguredMessage: Boolean = false,
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_top_priority)

            // requestCode 1 (not 0): TodoListWidgetProvider's header also links to view=tasks with
            // no id, and PendingIntent identity ignores extras — a shared requestCode would make
            // Android treat both widgets' header taps as literally the same PendingIntent object.
            views.setOnClickPendingIntent(R.id.widget_root, DeepLink.pendingIntent(context, 1, "tasks"))

            val refreshIntent = Intent(context, TopPriorityWidgetProvider::class.java).apply {
                action = TopPriorityWidgetProvider.ACTION_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context, 0, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)

            when {
                notConfiguredMessage -> {
                    ROW_IDS.forEach { views.setViewVisibility(it, android.view.View.GONE) }
                    views.setViewVisibility(R.id.widget_empty, android.view.View.VISIBLE)
                    views.setTextViewText(R.id.widget_empty, "Nog niet ingesteld — open de app → Instellingen")
                    views.setTextViewText(R.id.widget_updated, "")
                }
                errorMessage != null -> {
                    ROW_IDS.forEach { views.setViewVisibility(it, android.view.View.GONE) }
                    views.setViewVisibility(R.id.widget_empty, android.view.View.VISIBLE)
                    views.setTextViewText(R.id.widget_empty, "⚠️ $errorMessage")
                    views.setTextViewText(R.id.widget_updated, "")
                }
                else -> renderTasks(context, views, topPriorityTasks(tasks))
            }

            return views
        }

        private fun renderTasks(context: Context, views: RemoteViews, items: List<PriorityTask>) {
            views.setViewVisibility(R.id.widget_empty, if (items.isEmpty()) android.view.View.VISIBLE else android.view.View.GONE)
            for (i in ROW_IDS.indices) {
                if (i >= items.size) {
                    views.setViewVisibility(ROW_IDS[i], android.view.View.GONE)
                    continue
                }
                val item = items[i]
                views.setViewVisibility(ROW_IDS[i], android.view.View.VISIBLE)
                views.setTextViewText(TITLE_IDS[i], item.title)

                val dueLabel = DateFmt.relative(item.due)
                val overdue = DateFmt.isOverdue(item.due)
                if (dueLabel.isEmpty()) {
                    views.setViewVisibility(DUE_IDS[i], android.view.View.GONE)
                } else {
                    views.setViewVisibility(DUE_IDS[i], android.view.View.VISIBLE)
                    views.setTextViewText(DUE_IDS[i], dueLabel)
                    views.setInt(DUE_IDS[i], "setBackgroundResource", if (overdue) R.drawable.pill_danger else R.drawable.pill_glass)
                    views.setTextColor(DUE_IDS[i], if (overdue) context.getColor(R.color.widget_danger) else context.getColor(R.color.widget_text_secondary))
                }

                val dotRes = if (item.priority == "High") R.drawable.priority_dot_high else R.drawable.priority_dot_medium
                views.setInt(DOT_IDS[i], "setBackgroundResource", dotRes)
                // Distinct request code per row so each row's PendingIntent carries its own task id.
                views.setOnClickPendingIntent(ROW_IDS[i], DeepLink.pendingIntent(context, 100 + i, "tasks", item.id))
            }
            views.setTextViewText(R.id.widget_updated, "Ververst: net")
        }

        fun refreshNow(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<TopPriorityWidgetWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_ONE_TIME_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<TopPriorityWidgetWorker>(REFRESH_INTERVAL)
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
