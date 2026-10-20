package nl.oslife.widgets.widget.braindump

import android.content.Context
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetProvider
import nl.oslife.widgets.widget.common.WidgetData

/**
 * Home-screen "Brain-dump snel toevoegen" widget: the type / speak / upload shortcuts open
 * QuickAddActivity or BraindumpUploadActivity — the widget itself never blocks on the network,
 * it only shows today's capture count (widget-braindump-add GET) as a light "it's working" signal.
 */
class BraindumpQuickAddWidgetProvider : DataWidgetProvider() {

    override val function = BraindumpQuickAddWidgetWorker.FUNCTION
    override val layoutId = R.layout.widget_braindump_add
    override val refreshAction = ACTION_REFRESH

    override fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) = BraindumpQuickAddWidgetWorker.push(context, appWidgetIds, data)
    override fun refreshNow(context: Context) = BraindumpQuickAddWidgetWorker.refreshNow(context)
    override fun schedulePeriodic(context: Context) = BraindumpQuickAddWidgetWorker.schedulePeriodic(context)
    override fun cancelPeriodic(context: Context) = BraindumpQuickAddWidgetWorker.cancelPeriodic(context)

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.braindump.ACTION_REFRESH"
    }
}
