package nl.oslife.widgets.widget.inbox

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
import org.json.JSONObject
import java.time.Duration
import java.util.concurrent.TimeUnit

private val ROW_IDS = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3)
private val FROM_IDS = intArrayOf(R.id.widget_from1, R.id.widget_from2, R.id.widget_from3)
private val SUBJECT_IDS = intArrayOf(R.id.widget_subject1, R.id.widget_subject2, R.id.widget_subject3)

class InboxWidgetWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val context = applicationContext
        val views = try {
            when (val result = OslifeWidgetApi.get(context, "widget-inbox")) {
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
        private const val UNIQUE_PERIODIC_WORK = "inbox_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "inbox_widget_refresh_once"
        private val REFRESH_INTERVAL = Duration.ofMinutes(30)

        private fun pushViews(context: Context, views: RemoteViews) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, InboxWidgetProvider::class.java))
            ids.forEach { id -> manager.updateAppWidget(id, views) }
        }

        fun buildViews(
            context: Context,
            data: JSONObject? = null,
            errorMessage: String? = null,
            notConfiguredMessage: Boolean = false,
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_inbox)

            views.setOnClickPendingIntent(R.id.widget_root, DeepLink.pendingIntent(context, 0, "inbox"))

            val refreshIntent = Intent(context, InboxWidgetProvider::class.java).apply {
                action = InboxWidgetProvider.ACTION_REFRESH
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
                else -> renderMessages(views, data)
            }

            return views
        }

        private fun renderMessages(views: RemoteViews, data: JSONObject?) {
            val unreadCount = data?.optInt("unreadCount", 0) ?: 0
            if (unreadCount > 0) {
                views.setViewVisibility(R.id.widget_unread_badge, View.VISIBLE)
                views.setTextViewText(R.id.widget_unread_badge, unreadCount.toString())
            } else {
                views.setViewVisibility(R.id.widget_unread_badge, View.GONE)
            }

            val recent = data?.optJSONArray("recent")
            val rows = (0 until (recent?.length() ?: 0)).map { i -> recent!!.getJSONObject(i) }

            views.setViewVisibility(R.id.widget_empty, if (rows.isEmpty()) View.VISIBLE else View.GONE)
            if (rows.isEmpty()) views.setTextViewText(R.id.widget_empty, "Geen ongelezen mail")

            for (i in ROW_IDS.indices) {
                if (i >= rows.size) {
                    views.setViewVisibility(ROW_IDS[i], View.GONE)
                    continue
                }
                val m = rows[i]
                views.setViewVisibility(ROW_IDS[i], View.VISIBLE)
                val from = m.optString("from", "").substringBefore("<").trim()
                views.setTextViewText(FROM_IDS[i], if (from.isBlank()) "(onbekend)" else from)
                views.setTextViewText(SUBJECT_IDS[i], m.optString("subject", "(geen onderwerp)"))
            }

            views.setTextViewText(R.id.widget_updated, "Ververst: net")
        }

        fun refreshNow(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<InboxWidgetWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_ONE_TIME_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<InboxWidgetWorker>(REFRESH_INTERVAL)
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
