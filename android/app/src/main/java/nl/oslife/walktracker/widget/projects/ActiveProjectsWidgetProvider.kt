package nl.oslife.walktracker.widget.projects

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/**
 * Home-screen "Actieve projecten" widget: up to 4 active projects with
 * progress bars (widget-projects edge function). Glance card, same
 * WorkManager-driven split as TopPriorityWidgetProvider/DailyGlanceWidgetProvider.
 */
class ActiveProjectsWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = ActiveProjectsWidgetWorker.buildViews(context)
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, views) }
        ActiveProjectsWidgetWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        ActiveProjectsWidgetWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        ActiveProjectsWidgetWorker.cancelPeriodic(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) ActiveProjectsWidgetWorker.refreshNow(context)
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.walktracker.widget.projects.ACTION_REFRESH"
    }
}
