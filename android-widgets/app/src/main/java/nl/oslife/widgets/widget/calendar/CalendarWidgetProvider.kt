package nl.oslife.widgets.widget.calendar

import android.content.Context
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetProvider
import nl.oslife.widgets.widget.common.WidgetData

/**
 * Home-screen "Agenda" widget: what's left of today's calendar (widget-calendar edge function).
 */
class CalendarWidgetProvider : DataWidgetProvider() {

    override val function = CalendarWidgetWorker.FUNCTION
    override val layoutId = R.layout.widget_calendar
    override val refreshAction = ACTION_REFRESH

    override fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) = CalendarWidgetWorker.push(context, appWidgetIds, data)
    override fun refreshNow(context: Context) = CalendarWidgetWorker.refreshNow(context)
    override fun schedulePeriodic(context: Context) = CalendarWidgetWorker.schedulePeriodic(context)
    override fun cancelPeriodic(context: Context) = CalendarWidgetWorker.cancelPeriodic(context)

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.calendar.ACTION_REFRESH"
    }
}
