package nl.oslife.widgets.widget.health

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import nl.oslife.widgets.widget.common.WidgetStyle

/**
 * Home-screen "Gezondheid" widget: today's steps/sleep/active minutes,
 * latest body weight, and habit completion (widget-health edge function) —
 * a glance card mirroring the same pieces OSLIFE's web Dashboard "today"
 * screen shows. Same WorkManager-driven split as TopPriorityWidgetProvider.
 */
class HealthWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = try {
            HealthWidgetWorker.buildViews(context)
        } catch (e: Exception) {
            HealthWidgetWorker.buildViews(context, errorMessage = "Interne fout: ${e.message}")
        }
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, WidgetStyle.applyInstanceStyle(context, views, id)) }
        HealthWidgetWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        HealthWidgetWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        HealthWidgetWorker.cancelPeriodic(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id -> WidgetStyle.clear(context, id) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) HealthWidgetWorker.refreshNow(context)
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.health.ACTION_REFRESH"
    }
}
