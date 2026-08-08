package nl.oslife.walktracker.widget.braindump

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
import nl.oslife.walktracker.R
import nl.oslife.walktracker.widget.common.OslifeWidgetApi
import java.time.Duration
import java.util.concurrent.TimeUnit

class BraindumpQuickAddWidgetWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val context = applicationContext
        val views = when (val result = OslifeWidgetApi.get(context, "widget-braindump-add")) {
            is OslifeWidgetApi.Result.Success -> buildViews(context, todayCount = result.json.optInt("todayCount", 0))
            is OslifeWidgetApi.Result.NotConfigured -> buildViews(context, notConfiguredMessage = true)
            is OslifeWidgetApi.Result.Failure -> buildViews(context)
        }
        pushViews(context, views)
        return Result.success()
    }

    companion object {
        private const val UNIQUE_PERIODIC_WORK = "braindump_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "braindump_widget_refresh_once"
        private val REFRESH_INTERVAL = Duration.ofMinutes(30)

        private fun pushViews(context: Context, views: RemoteViews) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, BraindumpQuickAddWidgetProvider::class.java))
            ids.forEach { id -> manager.updateAppWidget(id, views) }
        }

        fun buildViews(context: Context, todayCount: Int? = null, notConfiguredMessage: Boolean = false): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_braindump_add)

            val openQuickAdd = PendingIntent.getActivity(
                context, 0, Intent(context, QuickAddActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_root, openQuickAdd)
            views.setOnClickPendingIntent(R.id.widget_add_button, openQuickAdd)

            val refreshIntent = Intent(context, BraindumpQuickAddWidgetProvider::class.java).apply {
                action = BraindumpQuickAddWidgetProvider.ACTION_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context, 0, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)

            views.setTextViewText(
                R.id.widget_count,
                when {
                    notConfiguredMessage -> "Nog niet ingesteld"
                    todayCount == null -> ""
                    todayCount == 0 -> "Nog niets vandaag"
                    todayCount == 1 -> "1 vandaag vastgelegd"
                    else -> "$todayCount vandaag vastgelegd"
                },
            )

            return views
        }

        fun refreshNow(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<BraindumpQuickAddWidgetWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_ONE_TIME_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<BraindumpQuickAddWidgetWorker>(REFRESH_INTERVAL)
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
