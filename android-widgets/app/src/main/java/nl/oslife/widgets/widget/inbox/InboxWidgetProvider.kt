package nl.oslife.widgets.widget.inbox

import android.content.Context
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetProvider
import nl.oslife.widgets.widget.common.WidgetData

/**
 * Home-screen "Inbox" widget: unread count plus the newest unread mails
 * (widget-inbox edge function).
 */
class InboxWidgetProvider : DataWidgetProvider() {

    override val function = InboxWidgetWorker.FUNCTION
    override val layoutId = R.layout.widget_inbox
    override val refreshAction = ACTION_REFRESH

    override fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) = InboxWidgetWorker.push(context, appWidgetIds, data)
    override fun refreshNow(context: Context) = InboxWidgetWorker.refreshNow(context)
    override fun schedulePeriodic(context: Context) = InboxWidgetWorker.schedulePeriodic(context)
    override fun cancelPeriodic(context: Context) = InboxWidgetWorker.cancelPeriodic(context)

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.inbox.ACTION_REFRESH"
    }
}
