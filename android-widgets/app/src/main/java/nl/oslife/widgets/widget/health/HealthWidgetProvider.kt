package nl.oslife.widgets.widget.health

import android.content.Context
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetProvider
import nl.oslife.widgets.widget.common.WidgetData

/**
 * Home-screen "Gezondheid" widget: today's steps toward the daily goal, last night's sleep,
 * latest weight and habits (widget-health edge function).
 */
class HealthWidgetProvider : DataWidgetProvider() {

    override val function = HealthWidgetWorker.FUNCTION
    override val layoutId = R.layout.widget_health
    override val refreshAction = ACTION_REFRESH

    override fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) = HealthWidgetWorker.push(context, appWidgetIds, data)
    override fun refreshNow(context: Context) = HealthWidgetWorker.refreshNow(context)
    override fun schedulePeriodic(context: Context) = HealthWidgetWorker.schedulePeriodic(context)
    override fun cancelPeriodic(context: Context) = HealthWidgetWorker.cancelPeriodic(context)

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.health.ACTION_REFRESH"
    }
}
