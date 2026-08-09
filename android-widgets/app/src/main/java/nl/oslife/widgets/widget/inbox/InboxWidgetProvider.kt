package nl.oslife.widgets.widget.inbox

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle
import nl.oslife.widgets.widget.common.WidgetStyle

/**
 * Home-screen "Inbox" widget: unread email count plus the most recent
 * unread messages (widget-inbox edge function). Glance card, same
 * WorkManager-driven split as TopPriorityWidgetProvider.
 */
class InboxWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = try {
            InboxWidgetWorker.buildViews(context)
        } catch (e: Exception) {
            InboxWidgetWorker.buildViews(context, errorMessage = "Interne fout: ${e.message}")
        }
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, InboxWidgetWorker.styled(context, views, id)) }
        InboxWidgetWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        InboxWidgetWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        InboxWidgetWorker.cancelPeriodic(context)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        InboxWidgetWorker.refreshNow(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id -> WidgetStyle.clear(context, id) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) InboxWidgetWorker.refreshNow(context)
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.inbox.ACTION_REFRESH"
    }
}
