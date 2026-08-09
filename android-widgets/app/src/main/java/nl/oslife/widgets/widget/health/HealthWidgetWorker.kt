package nl.oslife.widgets.widget.health

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
import nl.oslife.widgets.widget.common.DeepLink
import nl.oslife.widgets.widget.common.OslifeWidgetApi
import nl.oslife.widgets.widget.common.WidgetStyle
import org.json.JSONObject
import java.time.Duration
import java.util.concurrent.TimeUnit

class HealthWidgetWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val context = applicationContext
        val views = try {
            when (val result = OslifeWidgetApi.get(context, "widget-health")) {
                is OslifeWidgetApi.Result.Success -> buildViews(context, data = result.json)
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
        private const val UNIQUE_PERIODIC_WORK = "health_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "health_widget_refresh_once"
        private val REFRESH_INTERVAL = Duration.ofMinutes(30)
        // No per-user goal endpoint yet — a reasonable fixed daily target, same
        // idea as the OS's own steps widget, until widget-health returns a real one.
        private const val STEP_GOAL = 10_000

        private fun pushViews(context: Context, views: RemoteViews) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, HealthWidgetProvider::class.java))
            ids.forEach { id -> manager.updateAppWidget(id, WidgetStyle.applyInstanceStyle(context, views, id)) }
        }

        fun buildViews(
            context: Context,
            data: JSONObject? = null,
            errorMessage: String? = null,
            notConfiguredMessage: Boolean = false,
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_health)

            views.setOnClickPendingIntent(R.id.widget_root, DeepLink.pendingIntent(context, 0, "vitals"))

            val refreshIntent = Intent(context, HealthWidgetProvider::class.java).apply {
                action = HealthWidgetProvider.ACTION_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context, 0, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)

            when {
                notConfiguredMessage -> {
                    views.setViewVisibility(R.id.widget_stats, View.GONE)
                    views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
                    views.setTextViewText(R.id.widget_empty, "Nog niet ingesteld — open de app → Instellingen")
                    views.setTextViewText(R.id.widget_updated, "")
                }
                errorMessage != null -> {
                    views.setViewVisibility(R.id.widget_stats, View.GONE)
                    views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
                    views.setTextViewText(R.id.widget_empty, "⚠️ $errorMessage")
                    views.setTextViewText(R.id.widget_updated, "")
                }
                else -> renderStats(views, data)
            }

            return views
        }

        private fun renderStats(views: RemoteViews, data: JSONObject?) {
            views.setViewVisibility(R.id.widget_empty, View.GONE)
            views.setViewVisibility(R.id.widget_stats, View.VISIBLE)

            val today = data?.optJSONObject("today")
            val steps = today?.takeIf { it.has("steps") && !it.isNull("steps") }?.optInt("steps")
            val sleepMin = today?.takeIf { it.has("sleepMin") && !it.isNull("sleepMin") }?.optInt("sleepMin")
            val nlInt = java.text.NumberFormat.getIntegerInstance(java.util.Locale("nl", "NL"))
            views.setTextViewText(R.id.widget_steps, if (steps != null) nlInt.format(steps) else "—")
            views.setTextViewText(R.id.widget_steps_caption, if (steps != null) "stappen vandaag" else "nog geen stappen vandaag")
            views.setTextViewText(R.id.widget_steps_goal, "/${nlInt.format(STEP_GOAL)}")
            views.setProgressBar(R.id.widget_steps_progress, 100, ((steps ?: 0).coerceIn(0, STEP_GOAL) * 100 / STEP_GOAL), false)

            views.setTextViewText(R.id.widget_sleep, if (sleepMin != null) "😴 ${sleepMin / 60}u ${sleepMin % 60}m" else "😴 geen data")

            val weight = data?.optJSONObject("weight")
            val weightKg = weight?.opt("kg") as? Number
            views.setTextViewText(
                R.id.widget_weight,
                if (weightKg != null) "⚖️ ${String.format(java.util.Locale.US, "%.1f", weightKg.toDouble())} kg" else "⚖️ geen data",
            )

            val habits = data?.optJSONObject("habits")
            val doneToday = habits?.optInt("doneToday", 0) ?: 0
            val totalActive = habits?.optInt("totalActive", 0) ?: 0
            val bestStreak = habits?.optInt("bestStreakDays", 0) ?: 0
            views.setTextViewText(R.id.widget_habits, "✅ $doneToday/$totalActive gewoontes · reeks $bestStreak d")

            views.setTextViewText(R.id.widget_updated, "Ververst: net")
        }

        fun refreshNow(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<HealthWidgetWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_ONE_TIME_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<HealthWidgetWorker>(REFRESH_INTERVAL)
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
