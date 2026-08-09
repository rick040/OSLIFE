package nl.oslife.widgets.widget.todo

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/**
 * Home-screen "To-do lijst" widget: up to six open tasks (widget-tasks edge
 * function), one row per task with a tap-to-complete checkbox. Same
 * WorkManager-driven fixed-row push as every other widget here — see
 * TodoWidgetWorker's doc comment for why this replaced an earlier
 * RemoteViewsService/ListView collection.
 */
class TodoListWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        // The widget host aborts adding a widget entirely if onUpdate() throws — a
        // rendering bug in the eventual real-data path must never take down the
        // initial placeholder push.
        val views = try {
            TodoWidgetWorker.buildViews(context)
        } catch (e: Exception) {
            TodoWidgetWorker.buildViews(context, errorMessage = "Interne fout: ${e.message}")
        }
        appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, views) }
        TodoWidgetWorker.refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        TodoWidgetWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        TodoWidgetWorker.cancelPeriodic(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_REFRESH -> TodoWidgetWorker.refreshNow(context)
            ACTION_TOGGLE -> {
                val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
                TodoToggleWorker.enqueue(context, taskId)
            }
        }
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.widgets.widget.todo.ACTION_REFRESH"
        const val ACTION_TOGGLE = "nl.oslife.widgets.widget.todo.ACTION_TOGGLE"
        const val EXTRA_TASK_ID = "task_id"

        /** Kept for TodoToggleWorker's existing call site — just triggers a re-render now. */
        fun notifyListChanged(context: Context) = TodoWidgetWorker.refreshNow(context)
    }
}
