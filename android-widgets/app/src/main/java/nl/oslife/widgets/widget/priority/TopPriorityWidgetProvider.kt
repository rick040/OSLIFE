package nl.oslife.widgets.widget.priority

import android.content.Context
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetProvider
import nl.oslife.widgets.widget.common.WidgetData
import nl.oslife.widgets.widget.todo.TaskRows

/**
 * Home-screen "Belangrijkste items" widget: open High/Medium-priority tasks (widget-tasks),
 * tick off or tap through to the task. Tick-offs go to TodoListWidgetProvider, which owns
 * the shared toggle flow for both task widgets.
 */
class TopPriorityWidgetProvider : DataWidgetProvider() {

    override val function = TaskRows.FUNCTION
    override val layoutId = R.layout.widget_top_priority
    override val refreshAction = ACTION_REFRESH

    override fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) = TopPriorityWidgetWorker.push(context, appWidgetIds, data)
    override fun refreshNow(context: Context) = TopPriorityWidgetWorker.refreshNow(context)
    override fun schedulePeriodic(context: Context) = TopPriorityWidgetWorker.schedulePeriodic(context)
    override fun cancelPeriodic(context: Context) = TopPriorityWidgetWorker.cancelPeriodic(context)

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.priority.ACTION_REFRESH"
    }
}
