package nl.oslife.widgets.widget.finance

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import nl.oslife.widgets.widget.common.WidgetStyle

/**
 * Home-screen "Financiën" widget: current balance (drift-corrected the same
 * way the web app's Money screen computes it) plus open/urgent payments
 * (widget-finance edge function). Glance card, same WorkManager-driven split
 * as TopPriorityWidgetProvider.
 */
class FinanceWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = try {
            FinanceWidgetWorker.buildViews(context)
        } catch (e: Exception) {
            FinanceWidgetWorker.buildViews(context, errorMessage = "Interne fout: ${e.message}")
        }
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, WidgetStyle.applyInstanceStyle(context, views, id)) }
        FinanceWidgetWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        FinanceWidgetWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        FinanceWidgetWorker.cancelPeriodic(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id -> WidgetStyle.clear(context, id) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) FinanceWidgetWorker.refreshNow(context)
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.finance.ACTION_REFRESH"
    }
}
