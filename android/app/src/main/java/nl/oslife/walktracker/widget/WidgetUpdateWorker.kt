package nl.oslife.walktracker.widget

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
import nl.oslife.walktracker.MainActivity
import nl.oslife.walktracker.Prefs
import nl.oslife.walktracker.R
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Fetches the widget-summary snapshot (see supabase/functions/widget-summary)
 * and renders it into every placed DailyGlanceWidgetProvider instance. Runs
 * on a WorkManager periodic schedule — the widget's own updatePeriodMillis is
 * set to 0 in widget_daily_glance_info.xml, since WorkManager is more reliable
 * about surviving Doze than the AppWidgetProvider's built-in alarm.
 *
 * Never fails the periodic schedule on a network error — a missed refresh
 * just tries again next period; the widget shows the last good data (or a
 * quiet error line) in the meantime, same trade-off as any offline-tolerant
 * glance widget.
 */
class WidgetUpdateWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val context = applicationContext
        val prefs = Prefs(context)
        val url = prefs.widgetSummaryUrl
        if (url.isBlank()) {
            pushViews(context, buildViews(context, notConfiguredMessage = true))
            return Result.success()
        }

        val request = Request.Builder()
            .url(url)
            .addHeader("x-widget-secret", prefs.widgetSummarySecret)
            .get()
            .build()

        return try {
            OkHttpClient().newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    pushViews(context, buildViews(context, errorMessage = "Serverfout (${response.code})"))
                    return Result.success()
                }
                val json = JSONObject(body)
                if (!json.optBoolean("ok", false)) {
                    pushViews(context, buildViews(context, errorMessage = json.optString("error", "Onbekende fout")))
                    return Result.success()
                }
                pushViews(context, buildViews(context, data = json))
                Result.success()
            }
        } catch (_: Exception) {
            pushViews(context, buildViews(context, errorMessage = "Geen verbinding"))
            Result.success()
        }
    }

    private fun pushViews(context: Context, views: RemoteViews) {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, DailyGlanceWidgetProvider::class.java))
        ids.forEach { id -> manager.updateAppWidget(id, views) }
    }

    companion object {
        private const val UNIQUE_PERIODIC_WORK = "widget_refresh_periodic"
        private const val UNIQUE_ONE_TIME_WORK = "widget_refresh_once"
        private val REFRESH_INTERVAL = Duration.ofMinutes(30)

        /** Renders click intents + either placeholder/error/loaded content into a fresh RemoteViews. */
        fun buildViews(
            context: Context,
            data: JSONObject? = null,
            errorMessage: String? = null,
            notConfiguredMessage: Boolean = false,
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_daily_glance)

            val openAppIntent = PendingIntent.getActivity(
                context, 0, Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_root, openAppIntent)

            val refreshIntent = Intent(context, DailyGlanceWidgetProvider::class.java).apply {
                action = DailyGlanceWidgetProvider.ACTION_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context, 0, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)

            when {
                notConfiguredMessage -> {
                    views.setTextViewText(R.id.widget_dog, "Widget nog niet ingesteld")
                    views.setTextViewText(R.id.widget_tasks, "Open de app → Instellingen")
                    views.setTextViewText(R.id.widget_habits, "")
                    views.setTextViewText(R.id.widget_calendar, "")
                    views.setTextViewText(R.id.widget_updated, "")
                }
                errorMessage != null -> {
                    views.setTextViewText(R.id.widget_dog, "⚠️ $errorMessage")
                    views.setTextViewText(R.id.widget_tasks, "Laatste bekende gegevens blijven staan tot de volgende poging.")
                    views.setTextViewText(R.id.widget_habits, "")
                    views.setTextViewText(R.id.widget_calendar, "")
                    views.setTextViewText(R.id.widget_updated, "")
                }
                data != null -> renderContent(views, data)
                else -> Unit // keep the layout's default "Laden…" placeholders
            }

            return views
        }

        private fun renderContent(views: RemoteViews, data: JSONObject) {
            val dog = data.optJSONObject("dog")
            val tasks = data.optJSONObject("tasks")
            val habits = data.optJSONObject("habits")
            val calendar = data.optJSONObject("calendar")

            views.setTextViewText(R.id.widget_dog, "🐕 " + dogLine(dog))
            views.setTextViewText(R.id.widget_tasks, "✅ " + tasksLine(tasks))
            views.setTextViewText(R.id.widget_habits, "🔥 " + habitsLine(habits))
            views.setTextViewText(R.id.widget_calendar, "📅 " + calendarLine(calendar))

            val asOf = data.optString("asOf", null)
            views.setTextViewText(R.id.widget_updated, if (asOf != null) "Ververst: ${timeAgo(asOf)}" else "")
        }

        private fun dogLine(dog: JSONObject?): String {
            if (dog == null) return "Geen gegevens"
            val lastWalkAt = dog.optString("lastWalkAt", null)
            val walksToday = dog.optInt("walksToday", 0)
            val distanceTodayKm = dog.optDouble("distanceTodayKm", 0.0)
            val base = if (lastWalkAt == null) "Nog geen wandeling gelogd" else "Laatste wandeling: ${timeAgo(lastWalkAt)}"
            return if (walksToday > 0) {
                "$base · $walksToday vandaag, ${String.format(Locale.US, "%.1f", distanceTodayKm)} km"
            } else base
        }

        private fun tasksLine(tasks: JSONObject?): String {
            if (tasks == null) return "Geen gegevens"
            val dueToday = tasks.optInt("dueToday", 0)
            val openTotal = tasks.optInt("openTotal", 0)
            return "$dueToday te doen vandaag · $openTotal open in totaal"
        }

        private fun habitsLine(habits: JSONObject?): String {
            if (habits == null) return "Geen gegevens"
            val totalActive = habits.optInt("totalActive", 0)
            if (totalActive == 0) return "Geen gewoontes actief"
            val doneToday = habits.optInt("doneToday", 0)
            val streakDays = habits.optInt("bestStreakDays", 0)
            val streakHabit = habits.optString("bestStreakHabit", null)
            val base = "$doneToday/$totalActive gewoontes gedaan vandaag"
            return if (streakDays > 0 && streakHabit != null) "$base · reeks: $streakDays d ($streakHabit)" else base
        }

        private fun calendarLine(calendar: JSONObject?): String {
            if (calendar == null) return "Geen gegevens"
            val nextTitle = calendar.optString("nextTitle", null)
            val nextStart = calendar.optString("nextStart", null)
            return if (nextTitle == null) "Niets meer gepland vandaag" else "Volgende: $nextTitle om ${nextStart?.take(5)}"
        }

        /** "3u geleden" / "12 min geleden" / "2d geleden" from an ISO-8601 timestamp. */
        private fun timeAgo(iso: String): String {
            val instant = try {
                OffsetDateTime.parse(iso).toInstant()
            } catch (_: DateTimeParseException) {
                return iso
            }
            val minutes = Duration.between(instant, Instant.now()).toMinutes().coerceAtLeast(0)
            return when {
                minutes < 60 -> "$minutes min geleden"
                minutes < 24 * 60 -> "${minutes / 60}u geleden"
                else -> "${minutes / (24 * 60)}d geleden"
            }
        }

        fun refreshNow(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequestBuilder<WidgetUpdateWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_ONE_TIME_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<WidgetUpdateWorker>(REFRESH_INTERVAL)
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
