package nl.oslife.widgets.widget.priority

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle
import nl.oslife.widgets.widget.common.WidgetStyle

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
        // The widget host aborts adding a widget entirely if onUpdate() throws — a
        // rendering bug in the eventual real-data path must never take down the
        // initial placeholder push.
        val views = try {
            TopPriorityWidgetWorker.buildViews(context)
        } catch (e: Exception) {
            TopPriorityWidgetWorker.buildViews(context, errorMessage = "Interne fout: ${e.message}")
        }
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, TopPriorityWidgetWorker.styled(context, views, id)) }
        TopPriorityWidgetWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        TopPriorityWidgetWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        TopPriorityWidgetWorker.cancelPeriodic(context)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        TopPriorityWidgetWorker.refreshNow(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id -> WidgetStyle.clear(context, id) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) TopPriorityWidgetWorker.refreshNow(context)
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.priority.ACTION_REFRESH"
    }
}
