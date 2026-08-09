package nl.oslife.widgets.widget.braindump

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
        // The widget host aborts adding a widget entirely if onUpdate() throws — a
        // rendering bug in the eventual real-data path must never take down the
        // initial placeholder push.
        val views = try {
            BraindumpQuickAddWidgetWorker.buildViews(context)
        } catch (e: Exception) {
            BraindumpQuickAddWidgetWorker.buildViews(context, errorMessage = "Interne fout: ${e.message}")
        }
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
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.braindump.ACTION_REFRESH"
    }
}
