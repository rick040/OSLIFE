package nl.oslife.widgets.widget.finance

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
import java.util.Locale
import java.util.concurrent.TimeUnit

class FinanceWidgetWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val context = applicationContext
        val views = try {
            when (val result = OslifeWidgetApi.get(context, "widget-finance")) {
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
        private const val UNIQUE_PERIODIC_WORK = "finance_widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "finance_widget_refresh_once"
        private val REFRESH_INTERVAL = Duration.ofMinutes(30)

        private fun pushViews(context: Context, views: RemoteViews) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, FinanceWidgetProvider::class.java))
            ids.forEach { id -> manager.updateAppWidget(id, WidgetStyle.applyInstanceStyle(context, views, id)) }
        }

        fun buildViews(
            context: Context,
            data: JSONObject? = null,
            errorMessage: String? = null,
            notConfiguredMessage: Boolean = false,
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_finance)

            views.setOnClickPendingIntent(R.id.widget_root, DeepLink.pendingIntent(context, 0, "money"))

            val refreshIntent = Intent(context, FinanceWidgetProvider::class.java).apply {
                action = FinanceWidgetProvider.ACTION_REFRESH
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

        private fun eur(amount: Double): String =
            "€ " + String.format(Locale.forLanguageTag("nl-NL"), "%,.2f", amount)

        private fun renderStats(views: RemoteViews, data: JSONObject?) {
            views.setViewVisibility(R.id.widget_empty, View.GONE)
            views.setViewVisibility(R.id.widget_stats, View.VISIBLE)

            val balance = data?.optDouble("balance", Double.NaN) ?: Double.NaN
            views.setTextViewText(R.id.widget_balance, if (!balance.isNaN()) eur(balance) else "€ —")

            val asOf = data?.optString("balanceAsOf", "")
            views.setTextViewText(R.id.widget_balance_asof, if (!asOf.isNullOrBlank()) "Saldo per $asOf" else "")

            val openPayments = data?.optJSONObject("openPayments")
            val count = openPayments?.optInt("count", 0) ?: 0
            val total = openPayments?.optDouble("totalAmount", 0.0) ?: 0.0
            views.setTextViewText(R.id.widget_open_payments, "📄 $count open · ${eur(total)}")

            val urgentCount = data?.optInt("urgentCount", 0) ?: 0
            if (urgentCount > 0) {
                views.setViewVisibility(R.id.widget_urgent, View.VISIBLE)
                views.setTextViewText(R.id.widget_urgent, "⚠️ $urgentCount urgent")
            } else {
                views.setViewVisibility(R.id.widget_urgent, View.GONE)
            }

            views.setTextViewText(R.id.widget_updated, "Ververst: net")
        }

        fun refreshNow(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<FinanceWidgetWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_ONE_TIME_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<FinanceWidgetWorker>(REFRESH_INTERVAL)
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
