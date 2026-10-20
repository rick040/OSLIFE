package nl.oslife.widgets.widget.todo

import android.content.Context
import android.content.Intent
import nl.oslife.widgets.R
import nl.oslife.widgets.widget.common.DataWidgetProvider
import nl.oslife.widgets.widget.common.WidgetData

/**
 * Home-screen "To-do lijst" widget: open tasks (widget-tasks edge function), one row per task.
 * Tapping the ring ticks the task off immediately on screen (PendingDone) while
 * TodoToggleWorker tells the server; tapping it again before it disappears undoes it.
 * Also the receiver for tick-offs from the "Belangrijkste" widget.
 */
class TodoListWidgetProvider : DataWidgetProvider() {

    override val function = TaskRows.FUNCTION
    override val layoutId = R.layout.widget_todo_list
    override val refreshAction = ACTION_REFRESH

    override fun push(context: Context, appWidgetIds: IntArray?, data: WidgetData) = TodoWidgetWorker.push(context, appWidgetIds, data)
    override fun refreshNow(context: Context) = TodoWidgetWorker.refreshNow(context)
    override fun schedulePeriodic(context: Context) = TodoWidgetWorker.schedulePeriodic(context)
    override fun cancelPeriodic(context: Context) = TodoWidgetWorker.cancelPeriodic(context)

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_TOGGLE) {
            val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
            PendingDone.toggle(context, taskId)
            TaskRows.pushAll(context, WidgetData.cached(context, TaskRows.FUNCTION))
            TodoToggleWorker.enqueue(context, taskId)
        }
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.todo.ACTION_REFRESH"
        const val ACTION_TOGGLE = "nl.oslife.widgets.widget.todo.ACTION_TOGGLE"
        const val EXTRA_TASK_ID = "task_id"
    }
}
