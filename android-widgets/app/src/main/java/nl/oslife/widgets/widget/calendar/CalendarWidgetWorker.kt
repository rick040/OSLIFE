package nl.oslife.widgets.widget.calendar

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
import java.time.Duration
import java.util.concurrent.TimeUnit

private val ROW_IDS = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4)
private val TIME_IDS = intArrayOf(R.id.widget_time1, R.id.widget_time2, R.id.widget_time3, R.id.widget_time4)
private val TITLE_IDS = intArrayOf(R.id.widget_title1, R.id.widget_title2, R.id.widget_title3, R.id.widget_title4)

class CalendarWidgetWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val context = applicationContext
        val views = try {
            when (val result = OslifeWidgetApi.get(context, "widget-calendar")) {
                is OslifeWidgetApi.Result.Success -> buildViews(context, blocks = result.json.optJSONArray("blocks"))
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
        private const val UNIQUE_PERIODIC_WORK = "calendar_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "calendar_widget_refresh_once"
        private val REFRESH_INTERVAL = Duration.ofMinutes(30)

        private fun pushViews(context: Context, views: RemoteViews) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, CalendarWidgetProvider::class.java))
            ids.forEach { id -> manager.updateAppWidget(id, styled(context, views, id)) }
        }

        fun styled(context: Context, views: RemoteViews, appWidgetId: Int): RemoteViews =
            WidgetStyle.applyInstanceStyle(context, views, appWidgetId, ROW_IDS, rowHeightDp = 34, chromeDp = 90)

        fun buildViews(
            context: Context,
            blocks: org.json.JSONArray? = null,
            errorMessage: String? = null,
            notConfiguredMessage: Boolean = false,
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_calendar)

            views.setOnClickPendingIntent(R.id.widget_root, DeepLink.pendingIntent(context, 0, "daybuilder"))

            val refreshIntent = Intent(context, CalendarWidgetProvider::class.java).apply {
                action = CalendarWidgetProvider.ACTION_REFRESH
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
                else -> renderBlocks(views, blocks)
            }

            return views
        }

        private fun renderBlocks(views: RemoteViews, blocks: org.json.JSONArray?) {
            val items = (0 until (blocks?.length() ?: 0)).map { i -> blocks!!.getJSONObject(i) }

            views.setViewVisibility(R.id.widget_empty, if (items.isEmpty()) View.VISIBLE else View.GONE)

            for (i in ROW_IDS.indices) {
                if (i >= items.size) {
                    views.setViewVisibility(ROW_IDS[i], View.GONE)
                    continue
                }
                val b = items[i]
                views.setViewVisibility(ROW_IDS[i], View.VISIBLE)
                val startTime = b.optString("startTime", "").take(5)
                views.setTextViewText(TIME_IDS[i], startTime)
                views.setTextViewText(TITLE_IDS[i], b.optString("title", "(geen titel)"))
            }

            views.setTextViewText(R.id.widget_updated, "Ververst: net")
        }

        fun refreshNow(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<CalendarWidgetWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_ONE_TIME_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<CalendarWidgetWorker>(REFRESH_INTERVAL)
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
