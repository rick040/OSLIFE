package nl.oslife.walktracker.widget.priority

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/**
 * Home-screen "Belangrijkste items" widget: a curated top-5 of open
 * High/Medium priority tasks (widget-tasks edge function, client-side
 * filtered/sorted) — a glance card, not a scrollable list, since this is
 * meant to be a short, curated view. All rendering/networking lives in
 * TopPriorityWidgetWorker so the periodic schedule and a manual refresh tap
 * share one code path (same split as DailyGlanceWidgetProvider).
 */
class TopPriorityWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = TopPriorityWidgetWorker.buildViews(context)
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, views) }
        TopPriorityWidgetWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        TopPriorityWidgetWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        TopPriorityWidgetWorker.cancelPeriodic(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) TopPriorityWidgetWorker.refreshNow(context)
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.walktracker.widget.priority.ACTION_REFRESH"
    }
}
