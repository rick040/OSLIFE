package nl.oslife.walktracker.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/**
 * Home-screen "OSLIFE · Vandaag" widget: dog walks, tasks, habits, and the
 * next calendar block, fetched from the widget-summary edge function by
 * WidgetUpdateWorker. This provider only wires up lifecycle + the manual
 * refresh tap — all rendering and networking lives in the worker so both the
 * periodic schedule and a manual refresh share one code path.
 */
class DailyGlanceWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        // Wire up click intents immediately (placeholder content from the layout XML
        // stays until the refresh below completes), then fetch real data.
        val views = WidgetUpdateWorker.buildViews(context)
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, views) }
        WidgetUpdateWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        WidgetUpdateWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        WidgetUpdateWorker.cancelPeriodic(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            WidgetUpdateWorker.refreshNow(context)
        }
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.walktracker.widget.ACTION_REFRESH"
    }
}
