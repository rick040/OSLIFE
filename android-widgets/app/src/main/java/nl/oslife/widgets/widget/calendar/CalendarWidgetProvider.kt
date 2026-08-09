package nl.oslife.widgets.widget.calendar

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/**
 * Home-screen "Agenda" widget: today's remaining calendar blocks
 * (widget-calendar edge function, day_blocks synced from Google Calendar).
 * Glance card, same WorkManager-driven split as TopPriorityWidgetProvider.
 */
class CalendarWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = try {
            CalendarWidgetWorker.buildViews(context)
        } catch (e: Exception) {
            CalendarWidgetWorker.buildViews(context, errorMessage = "Interne fout: ${e.message}")
        }
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, views) }
        CalendarWidgetWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        CalendarWidgetWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        CalendarWidgetWorker.cancelPeriodic(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) CalendarWidgetWorker.refreshNow(context)
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.calendar.ACTION_REFRESH"
    }
}
