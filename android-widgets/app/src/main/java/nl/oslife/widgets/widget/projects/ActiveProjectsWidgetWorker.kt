package nl.oslife.widgets.widget.projects

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

private data class ActiveProject(val id: String, val name: String, val client: String, val progress: Double, val deadline: String?)

private val ROW_IDS = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4)
private val NAME_IDS = intArrayOf(R.id.widget_name1, R.id.widget_name2, R.id.widget_name3, R.id.widget_name4)
private val CLIENT_IDS = intArrayOf(R.id.widget_client1, R.id.widget_client2, R.id.widget_client3, R.id.widget_client4)
private val DEADLINE_IDS = intArrayOf(R.id.widget_deadline1, R.id.widget_deadline2, R.id.widget_deadline3, R.id.widget_deadline4)
private val PROGRESS_IDS = intArrayOf(R.id.widget_progress1, R.id.widget_progress2, R.id.widget_progress3, R.id.widget_progress4)

class ActiveProjectsWidgetWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val context = applicationContext
        // Any failure while rendering must still reach pushViews() — see TopPriorityWidgetWorker.
        val views = try {
            when (val result = OslifeWidgetApi.get(context, "widget-projects")) {
                is OslifeWidgetApi.Result.Success -> buildViews(context, projects = result.json.optJSONArray("projects"))
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
        private const val UNIQUE_PERIODIC_WORK = "projects_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "projects_widget_refresh_once"
        private val REFRESH_INTERVAL = Duration.ofMinutes(30)

        private fun pushViews(context: Context, views: RemoteViews) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, ActiveProjectsWidgetProvider::class.java))
            ids.forEach { id -> manager.updateAppWidget(id, views) }
        }

        private fun parseProjects(projects: JSONArray?): List<ActiveProject> {
            if (projects == null) return emptyList()
            return (0 until projects.length()).map {
                val o = projects.getJSONObject(it)
                ActiveProject(
                    id = o.optString("id"),
                    name = o.optString("name", "(zonder naam)"),
                    client = o.optString("client", ""),
                    progress = o.optDouble("progress", 0.0),
                    deadline = o.optString("deadline", null),
                )
            }.take(4)
        }

        fun buildViews(
            context: Context,
            projects: JSONArray? = null,
            errorMessage: String? = null,
            notConfiguredMessage: Boolean = false,
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_active_projects)

            views.setOnClickPendingIntent(R.id.widget_root, DeepLink.pendingIntent(context, 0, "projects"))

            val refreshIntent = Intent(context, ActiveProjectsWidgetProvider::class.java).apply {
                action = ActiveProjectsWidgetProvider.ACTION_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context, 0, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)

            when {
                notConfiguredMessage -> {
                    ROW_IDS.forEach { views.setViewVisibility(it, View.GONE) }
                    views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
                    views.setTextViewText(R.id.widget_empty, "Nog niet ingesteld — open de app → Instellingen")
                    views.setTextViewText(R.id.widget_updated, "")
                }
                errorMessage != null -> {
                    ROW_IDS.forEach { views.setViewVisibility(it, View.GONE) }
                    views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
                    views.setTextViewText(R.id.widget_empty, "⚠️ $errorMessage")
                    views.setTextViewText(R.id.widget_updated, "")
                }
                else -> renderProjects(context, views, parseProjects(projects))
            }

            return views
        }

        private fun renderProjects(context: Context, views: RemoteViews, items: List<ActiveProject>) {
            views.setViewVisibility(R.id.widget_empty, if (items.isEmpty()) View.VISIBLE else View.GONE)
            for (i in ROW_IDS.indices) {
                if (i >= items.size) {
                    views.setViewVisibility(ROW_IDS[i], View.GONE)
                    continue
                }
                val p = items[i]
                views.setViewVisibility(ROW_IDS[i], View.VISIBLE)
                views.setTextViewText(NAME_IDS[i], p.name)
                views.setViewVisibility(CLIENT_IDS[i], if (p.client.isBlank()) View.GONE else View.VISIBLE)
                views.setTextViewText(CLIENT_IDS[i], p.client)

                val deadlineLabel = DateFmt.relative(p.deadline)
                val overdue = DateFmt.isOverdue(p.deadline)
                if (deadlineLabel.isEmpty()) {
                    views.setViewVisibility(DEADLINE_IDS[i], View.GONE)
                } else {
                    views.setViewVisibility(DEADLINE_IDS[i], View.VISIBLE)
                    views.setTextViewText(DEADLINE_IDS[i], deadlineLabel)
                    views.setInt(DEADLINE_IDS[i], "setBackgroundResource", if (overdue) R.drawable.pill_danger else R.drawable.pill_neutral)
                    views.setTextColor(DEADLINE_IDS[i], if (overdue) context.getColor(R.color.widget_danger) else context.getColor(R.color.widget_text_secondary))
                }

                views.setProgressBar(PROGRESS_IDS[i], 100, (p.progress.coerceIn(0.0, 1.0) * 100).toInt(), false)
                // Distinct request code per row so each row's PendingIntent carries its own project id.
                views.setOnClickPendingIntent(ROW_IDS[i], DeepLink.pendingIntent(context, 200 + i, "projects", p.id))
            }
            views.setTextViewText(R.id.widget_updated, "Ververst: net")
        }

        fun refreshNow(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<ActiveProjectsWidgetWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_ONE_TIME_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<ActiveProjectsWidgetWorker>(REFRESH_INTERVAL)
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
