package nl.oslife.widgets.widget.projects

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle
import nl.oslife.widgets.widget.common.WidgetStyle

/**
 * Home-screen "Actieve projecten" widget: up to 4 active projects with
 * progress bars (widget-projects edge function). Glance card, same
 * WorkManager-driven split as TopPriorityWidgetProvider/DailyGlanceWidgetProvider.
 */
class ActiveProjectsWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        // The widget host aborts adding a widget entirely if onUpdate() throws — a
        // rendering bug in the eventual real-data path must never take down the
        // initial placeholder push.
        val views = try {
            ActiveProjectsWidgetWorker.buildViews(context)
        } catch (e: Exception) {
            ActiveProjectsWidgetWorker.buildViews(context, errorMessage = "Interne fout: ${e.message}")
        }
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, ActiveProjectsWidgetWorker.styled(context, views, id)) }
        ActiveProjectsWidgetWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        ActiveProjectsWidgetWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        ActiveProjectsWidgetWorker.cancelPeriodic(context)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        ActiveProjectsWidgetWorker.refreshNow(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id -> WidgetStyle.clear(context, id) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) ActiveProjectsWidgetWorker.refreshNow(context)
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.projects.ACTION_REFRESH"
    }
}
