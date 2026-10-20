package nl.oslife.widgets.widget.today

import android.content.Context
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetProvider
import nl.oslife.widgets.widget.common.WidgetData

/**
 * Home-screen "Vandaag" widget: the day at a glance — next agenda block, tasks due, habits,
 * the dog — from the single widget-summary edge function. Each line opens its own screen.
 */
class TodayWidgetProvider : DataWidgetProvider() {

    override val function = TodayWidgetWorker.FUNCTION
    override val layoutId = R.layout.widget_today
    override val refreshAction = ACTION_REFRESH

    override fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) = TodayWidgetWorker.push(context, appWidgetIds, data)
    override fun refreshNow(context: Context) = TodayWidgetWorker.refreshNow(context)
    override fun schedulePeriodic(context: Context) = TodayWidgetWorker.schedulePeriodic(context)
    override fun cancelPeriodic(context: Context) = TodayWidgetWorker.cancelPeriodic(context)

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.today.ACTION_REFRESH"
    }
}
