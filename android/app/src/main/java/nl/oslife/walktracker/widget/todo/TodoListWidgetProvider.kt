package nl.oslife.walktracker.widget.todo

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import nl.oslife.walktracker.MainActivity
import nl.oslife.walktracker.R

/**
 * Home-screen "To-do lijst" widget: a real scrollable list of open tasks
 * (widget-tasks edge function), one row per task with a tap-to-complete
 * checkbox. Unlike the flat glance widgets (priority/projects), this one
 * needs a RemoteViewsService/Factory collection — see TodoRemoteViewsService.
 */
class TodoListWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id -> updateOne(context, appWidgetManager, id) }
    }

    override fun onEnabled(context: Context) {
        TodoWidgetRefreshWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        TodoWidgetRefreshWorker.cancelPeriodic(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_REFRESH -> notifyListChanged(context)
            ACTION_TOGGLE -> {
                val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
                TodoToggleWorker.enqueue(context, taskId)
            }
        }
    }

    companion object {
        const val ACTION_REFRESH = "nl.oslife.walktracker.widget.todo.ACTION_REFRESH"
        const val ACTION_TOGGLE = "nl.oslife.walktracker.widget.todo.ACTION_TOGGLE"
        const val EXTRA_TASK_ID = "task_id"

        private fun updateOne(context: Context, manager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_todo_list)

            val serviceIntent = Intent(context, TodoRemoteViewsService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse("content://widget/todo/$appWidgetId")
            }
            views.setRemoteAdapter(R.id.todo_list, serviceIntent)
            views.setEmptyView(R.id.todo_list, R.id.empty_view)

            val toggleTemplate = Intent(context, TodoListWidgetProvider::class.java).apply { action = ACTION_TOGGLE }
            val togglePendingIntent = android.app.PendingIntent.getBroadcast(
                context, 0, toggleTemplate,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE,
            )
            views.setPendingIntentTemplate(R.id.todo_list, togglePendingIntent)

            val openAppIntent = android.app.PendingIntent.getActivity(
                context, 0, Intent(context, MainActivity::class.java),
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_root, openAppIntent)

            val refreshIntent = Intent(context, TodoListWidgetProvider::class.java).apply { action = ACTION_REFRESH }
            val refreshPendingIntent = android.app.PendingIntent.getBroadcast(
                context, 0, refreshIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)

            manager.updateAppWidget(appWidgetId, views)
        }

        fun notifyListChanged(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, TodoListWidgetProvider::class.java))
            manager.notifyAppWidgetViewDataChanged(ids, R.id.todo_list)
        }
    }
}
