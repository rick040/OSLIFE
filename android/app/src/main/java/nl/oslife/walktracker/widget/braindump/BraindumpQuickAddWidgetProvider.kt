package nl.oslife.walktracker.widget.braindump

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/**
 * Home-screen "Brain-dump snel toevoegen" widget: tapping the card (or the "+"
 * chip) opens QuickAddActivity, a small floating capture dialog — the widget
 * itself never blocks on the network, it only shows today's capture count
 * (widget-braindump-add GET) as a light "it's working" signal.
 */
class BraindumpQuickAddWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = BraindumpQuickAddWidgetWorker.buildViews(context)
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, views) }
        BraindumpQuickAddWidgetWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        BraindumpQuickAddWidgetWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        BraindumpQuickAddWidgetWorker.cancelPeriodic(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) BraindumpQuickAddWidgetWorker.refreshNow(context)
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.walktracker.widget.braindump.ACTION_REFRESH"
    }
}
